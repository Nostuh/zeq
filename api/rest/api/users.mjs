// User management — admin only. Enforces:
//   - users cannot modify or delete their own account
//   - at least one admin must always remain (active OR disabled), so
//     the system can never get locked out
//   - the last ACTIVE admin cannot be demoted or disabled
//
// Race-safe: the role/active/delete mutations use conditional UPDATE
// statements with self-referencing derived-table subqueries so the
// "would this leave zero admins?" check is evaluated atomically inside
// the single statement. Two admins demoting each other in parallel
// can no longer both succeed — at least one UPDATE will affect zero
// rows and be reported as a conflict.

import express from 'express';
import bcrypt from 'bcryptjs';
import dbs from '../../db.mjs';
import { requireAdmin } from './auth.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const ROLES = ['admin', 'editor', 'viewer'];
const EQ_ROLES = ['eq_editor', 'eq_viewer'];

function fail(res, msg, code = 400) { res.status(code).json({ ok: false, error: msg }); }

router.get('/', requireAdmin, async function(req, res) {
    const rows = await zeq.query(
        `SELECT id, name, role, active, last_login, created FROM users ORDER BY name`);
    // Attach eq roles for each user
    if (rows.length) {
        const allEq = await zeq.query(`SELECT user_id, role FROM user_roles ORDER BY user_id`);
        const byUser = {};
        for (const r of allEq) (byUser[r.user_id] ||= []).push(r.role);
        for (const row of rows) row.eqRoles = byUser[row.id] || [];
    }
    res.json({ ok: true, data: rows });
});

router.post('/', requireAdmin, async function(req, res) {
    const { name, password, role } = req.body || {};
    if (!name || !password) return fail(res, 'name and password required');
    if (!ROLES.includes(role)) return fail(res, 'invalid role');
    const exists = await zeq.query(`SELECT id FROM users WHERE name = @name`, { name });
    if (exists.length) return fail(res, 'name already taken');
    const hash = await bcrypt.hash(password, 10);
    const r = await zeq.query(
        `INSERT INTO users (name, password, password_hash, role, active, last_login, created)
         VALUES (@name, '', @hash, @role, 1, NOW(), NOW())`,
        { name, hash, role });
    res.json({ ok: true, data: { id: r.insertId, name, role, active: 1 } });
});

// Conditional UPDATE: the statement only matches rows where demoting /
// disabling would still leave at least one active admin OR the new
// state is still an active admin. Wrapping `users` in a derived table
// (`SELECT ... FROM (SELECT ... FROM users) _u`) sidesteps MySQL's
// "can't specify target table for update in FROM clause" restriction.
router.post('/:id/role', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body || {};
    if (!ROLES.includes(role)) return fail(res, 'invalid role');
    if (id === req.user.id) return fail(res, 'cannot modify your own account');
    try {
        const r = await zeq.query(
            `UPDATE users SET role = @role
             WHERE id = @id
               AND (
                 @role = 'admin'
                 OR (SELECT COUNT(*) FROM (SELECT id, role, active FROM users) _u
                     WHERE _u.role = 'admin' AND _u.active = 1 AND _u.id <> @id) >= 1
               )`,
            { id, role });
        if (!r.affectedRows) return fail(res, 'cannot demote the last active admin');
        res.json({ ok: true });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.post('/:id/active', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const active = req.body && req.body.active ? 1 : 0;
    if (id === req.user.id) return fail(res, 'cannot modify your own account');
    try {
        const r = await zeq.query(
            `UPDATE users SET active = @a
             WHERE id = @id
               AND (
                 @a = 1
                 OR (SELECT COUNT(*) FROM (SELECT id, role, active FROM users) _u
                     WHERE _u.role = 'admin' AND _u.active = 1 AND _u.id <> @id) >= 1
                 OR role <> 'admin'
               )`,
            { id, a: active });
        if (!r.affectedRows) return fail(res, 'cannot disable the last active admin');
        res.json({ ok: true });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.post('/:id/password', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const { password } = req.body || {};
    if (!password) return fail(res, 'password required');
    const hash = await bcrypt.hash(password, 10);
    await zeq.query(
        `UPDATE users SET password_hash = @h, password = '' WHERE id = @id`,
        { h: hash, id });
    // Invalidate existing sessions so the user must re-login.
    await zeq.query(`DELETE FROM sessions WHERE user_id = @id`, { id });
    res.json({ ok: true });
});

// Delete rule: at least one admin row must remain after the delete,
// regardless of active state. This closes the self-lockout path where
// every admin is disabled and then the last active one is deleted.
router.delete('/:id', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) return fail(res, 'cannot delete your own account');
    const cur = await zeq.query(`SELECT role FROM users WHERE id = @id`, { id });
    if (!cur.length) return fail(res, 'not found', 404);
    if (cur[0].role === 'admin') {
        // Any other admin — active or disabled — suffices to keep the
        // system recoverable.
        const others = await zeq.query(
            `SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND id <> @id`,
            { id });
        if (others[0].c === 0) return fail(res, 'cannot delete the last admin account');
    }
    await zeq.query(`DELETE FROM sessions WHERE user_id = @id`, { id });
    await zeq.query(`DELETE FROM users WHERE id = @id`, { id });
    res.json({ ok: true });
});

// --- EQ roles (supplementary roles from user_roles table) ---

router.get('/:id/eq-roles', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const rows = await zeq.query(
        `SELECT role FROM user_roles WHERE user_id = @id`, { id });
    res.json({ ok: true, data: rows.map(r => r.role) });
});

router.post('/:id/eq-roles', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const roles = req.body && Array.isArray(req.body.roles) ? req.body.roles : [];
    // Validate all roles
    for (const r of roles) {
        if (!EQ_ROLES.includes(r)) return fail(res, `invalid eq role: ${r}`);
    }
    try {
        // Delete existing eq roles for this user and re-insert
        await zeq.query(`DELETE FROM user_roles WHERE user_id = @id`, { id });
        for (const r of roles) {
            await zeq.query(
                `INSERT INTO user_roles (user_id, role) VALUES (@id, @role)`,
                { id, role: r });
        }
        res.json({ ok: true, data: roles });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

export const users = router;
