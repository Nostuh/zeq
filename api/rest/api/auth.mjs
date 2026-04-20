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
    // Load supplementary roles from user_roles table.
    const eqRows = await zeq.query(
        `SELECT role FROM user_roles WHERE user_id = @uid`,
        { uid: user.id });
    user.eqRoles = eqRows.map(r => r.role);
    return user;
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

// Any authenticated user (viewer, editor, admin)
export const requireAuth = requireRole('viewer', 'editor', 'admin');
export const requireEditor = requireRole('editor', 'admin');
export const requireAdmin = requireRole('admin');

// EQ Mob Knowledge Base roles — checked against user_roles table.
// Admins automatically have access to everything.
export function requireEqRole(...eqRoles) {
    return async function(req, res, next) {
        const u = await loadUser(req);
        if (!u) return res.status(401).json({ ok: false, error: 'not authenticated' });
        if (u.role === 'admin' || eqRoles.some(r => u.eqRoles.includes(r))) {
            req.user = u;
            return next();
        }
        return res.status(403).json({ ok: false, error: 'forbidden' });
    };
}
export const requireEqViewer = requireEqRole('eq_viewer', 'eq_editor');
export const requireEqEditor = requireEqRole('eq_editor');

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
        // Load eqRoles for the login response.
        const eqRows = await zeq.query(
            `SELECT role FROM user_roles WHERE user_id = @uid`, { uid: u.id });
        const eqRoles = eqRows.map(r => r.role);
        res.json({ ok: true, data: { id: u.id, name: u.name, role: u.role, eqRoles } });
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
    res.json({ ok: true, data: { id: u.id, name: u.name, role: u.role, eqRoles: u.eqRoles || [] } });
});

export const auth = router;
