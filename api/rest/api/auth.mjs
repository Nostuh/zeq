// Auth + session + role middleware for zeq.
// Session-cookie-based: `zeq_sid` cookie keyed to `sessions` table.
// Roles: admin > editor > viewer.

import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import cookie from 'cookie';
import dbs from '../../db.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const SESSION_COOKIE = 'zeq_sid';
const SESSION_DAYS = 14;

// --- bootstrap first admin from env if no users exist ---
export async function bootstrapFirstAdmin() {
    try {
        const rows = await zeq.query(`SELECT COUNT(*) AS c FROM users WHERE active = 1 AND role = 'admin'`);
        if (rows[0].c > 0) return;
        const name = process.env.ZEQ_ADMIN_USER;
        const pass = process.env.ZEQ_ADMIN_PASS;
        if (!name || !pass) {
            console.log('[auth] no active admin and ZEQ_ADMIN_USER/ZEQ_ADMIN_PASS not set — skipping bootstrap');
            return;
        }
        const existing = await zeq.query(`SELECT id FROM users WHERE name = @name`, { name });
        const hash = await bcrypt.hash(pass, 10);
        if (existing.length > 0) {
            await zeq.query(
                `UPDATE users SET password_hash = @hash, role = 'admin', active = 1 WHERE id = @id`,
                { hash, id: existing[0].id });
            console.log(`[auth] promoted existing user '${name}' to admin`);
        } else {
            await zeq.query(
                `INSERT INTO users (name, password, password_hash, role, active, last_login, created)
                 VALUES (@name, '', @hash, 'admin', 1, NOW(), NOW())`,
                { name, hash });
            console.log(`[auth] created bootstrap admin '${name}'`);
        }
    } catch (e) {
        console.error('[auth] bootstrap error', e);
    }
}

// --- helpers ---
function parseCookies(req) {
    return cookie.parse(req.headers.cookie || '');
}

export async function loadUser(req) {
    const cookies = parseCookies(req);
    const sid = cookies[SESSION_COOKIE];
    if (!sid) return null;
    const rows = await zeq.query(
        `SELECT u.id, u.name, u.role, u.active
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = @sid AND s.expires > NOW() AND u.active = 1`,
        { sid });
    if (!rows[0]) return null;
    const user = rows[0];
    // Capability flags live in the user_roles table (supplementary to
    // users.role). See FLAGS below and docs/auth.md.
    const flagRows = await zeq.query(
        `SELECT role FROM user_roles WHERE user_id = @uid`,
        { uid: user.id });
    user.flags = flagRows.map(r => r.role);
    return user;
}

// ---- Capability flags (access control) ----------------------------------
// Access is flag-based. `users.role = 'admin'` is the master switch and
// implies every flag. Each area has a view flag and, where useful, a
// companion `*_edit` flag that implies its view flag. Flags are stored as
// rows in user_roles. See docs/auth.md.
export const FLAGS = [
    'equipment', 'equipment_edit',   // Equipment catalog + EQ Builder
    'lookups',                       // KYA lookup (read-only)
    'eqmobs', 'eqmobs_edit',         // EQ Mob Knowledge Base
    'planner_admin',                 // Races/Guilds/Skills/Spells/Costs admin
];
const FLAG_IMPLIES = {
    equipment_edit: ['equipment'],
    eqmobs_edit: ['eqmobs'],
};

// Expand a user's raw user_roles into the effective flag set, honouring
// admin-implies-all and edit-implies-view.
export function effectiveFlags(user) {
    if (user && user.role === 'admin') return new Set(FLAGS);
    const s = new Set();
    for (const f of (user && user.flags) || []) {
        s.add(f);
        for (const imp of (FLAG_IMPLIES[f] || [])) s.add(imp);
    }
    return s;
}

export function requireRole(...roles) {
    return async function(req, res, next) {
        const u = await loadUser(req);
        if (!u) return res.status(401).json({ ok: false, error: 'not authenticated' });
        if (roles.length && !roles.includes(u.role)) {
            return res.status(403).json({ ok: false, error: 'forbidden' });
        }
        req.user = u;
        next();
    };
}

// Any authenticated active user, regardless of flags.
export const requireAuth = requireRole('viewer', 'editor', 'admin');
export const requireAdmin = requireRole('admin');

// Gate a route on one or more capability flags. Passes if the user is an
// admin (implicit all) or holds any of the named flags (edit implies view).
export function requireFlag(...need) {
    return async function(req, res, next) {
        const u = await loadUser(req);
        if (!u) return res.status(401).json({ ok: false, error: 'not authenticated' });
        const eff = effectiveFlags(u);
        if (u.role === 'admin' || need.some(f => eff.has(f))) {
            req.user = u;
            return next();
        }
        return res.status(403).json({ ok: false, error: 'forbidden' });
    };
}

// Back-compat aliases used by the EQ Mob KB router (mobs.mjs); the KB is
// now gated on the eqmobs / eqmobs_edit flags.
export const requireEqViewer = requireFlag('eqmobs', 'eqmobs_edit');
export const requireEqEditor = requireFlag('eqmobs_edit');

// --- routes ---
router.post('/login', async function(req, res) {
    try {
        const { name, password } = req.body || {};
        if (!name || !password) return res.json({ ok: false, error: 'missing credentials' });
        const rows = await zeq.query(
            `SELECT id, name, role, active, password_hash, password FROM users WHERE name = @name`,
            { name });
        if (!rows.length) return res.json({ ok: false, error: 'invalid credentials' });
        const u = rows[0];
        if (!u.active) return res.json({ ok: false, error: 'account disabled' });

        let ok = false;
        if (u.password_hash) {
            ok = await bcrypt.compare(password, u.password_hash);
        } else if (u.password) {
            // Legacy md5 fallback; upgrade on successful login.
            const md5 = crypto.createHash('md5').update(password).digest('hex');
            if (md5 === u.password) {
                ok = true;
                const newHash = await bcrypt.hash(password, 10);
                await zeq.query(
                    `UPDATE users SET password_hash = @h WHERE id = @id`,
                    { h: newHash, id: u.id });
            }
        }
        if (!ok) return res.json({ ok: false, error: 'invalid credentials' });

        const sid = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
        await zeq.query(
            `INSERT INTO sessions (id, user_id, created, expires)
             VALUES (@sid, @uid, NOW(), @exp)`,
            { sid, uid: u.id, exp: expires.toISOString().slice(0, 19).replace('T', ' ') });
        await zeq.query(`UPDATE users SET last_login = NOW() WHERE id = @id`, { id: u.id });

        res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE, sid, {
            httpOnly: true,
            // Strict (rather than Lax) — the session cookie will not
            // accompany ANY cross-site navigation. Users following a link
            // from an external site back to Zorky's will land unauthenticated
            // and must re-log in. No real UX loss since admin pages aren't
            // linked from elsewhere. Blocks all cross-site state-changing
            // requests at the cookie layer.
            sameSite: 'strict',
            secure: true,
            path: '/',
            maxAge: SESSION_DAYS * 86400,
        }));
        // Capability flags for the SPA to gate nav/controls.
        const flagRows = await zeq.query(
            `SELECT role FROM user_roles WHERE user_id = @uid`, { uid: u.id });
        const flags = flagRows.map(r => r.role);
        res.json({ ok: true, data: { id: u.id, name: u.name, role: u.role, flags } });
    } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: 'server error' });
    }
});

router.post('/logout', async function(req, res) {
    const cookies = parseCookies(req);
    const sid = cookies[SESSION_COOKIE];
    if (sid) await zeq.query(`DELETE FROM sessions WHERE id = @sid`, { sid });
    res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE, '', {
        httpOnly: true, path: '/', maxAge: 0,
    }));
    res.json({ ok: true });
});

router.get('/me', async function(req, res) {
    const u = await loadUser(req);
    if (!u) return res.json({ ok: true, data: null });
    res.json({ ok: true, data: { id: u.id, name: u.name, role: u.role, flags: u.flags || [] } });
});

export const auth = router;
