// Site updates feed: public changelog shown at /updates.
// - GET    /api/updates      — public list, newest first
// - POST   /api/updates      — admin only, create
// - POST   /api/updates/:id  — admin only, update fields
// - DELETE /api/updates/:id  — admin only
//
// Entries should describe USER-VISIBLE changes only (bug fixes, UI
// tweaks, new planner features). Skip refactors / code reorgs — if it
// doesn't change what a reinc planner visitor sees, it doesn't belong
// in this feed. See docs/updates.md.

import express from 'express';
import dbs from '../../db.mjs';
import { requireAdmin } from './auth.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

const KINDS = ['fix', 'feature', 'tweak', 'content'];

router.get('/', async function(req, res) {
    try {
        const rows = await zeq.query(
            `SELECT u.id, u.kind, u.title, u.body, u.bug_id, u.created,
                    b.title AS bug_title, b.status AS bug_status
               FROM site_updates u
               LEFT JOIN bug_reports b ON b.id = u.bug_id
              ORDER BY u.created DESC, u.id DESC`);
        ok(res, rows);
    } catch (e) { console.error(e); fail(res, String(e)); }
});

router.post('/', requireAdmin, async function(req, res) {
    const b = req.body || {};
    if (!b.title) return fail(res, 'title required');
    const kind = KINDS.includes(b.kind) ? b.kind : 'fix';
    const bug_id = b.bug_id ? parseInt(b.bug_id, 10) : null;
    const created = b.created ? new Date(b.created) : new Date();
    try {
        const r = await zeq.query(
            `INSERT INTO site_updates (kind, title, body, bug_id, created)
             VALUES (@kind, @title, @body, @bug_id, @created)`,
            {
                kind,
                title: String(b.title).slice(0, 255),
                body: b.body || null,
                bug_id,
                created,
            });
        ok(res, { id: r.insertId });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});

router.post('/:id', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const sets = [];
    const params = { id };
    for (const f of ['kind', 'title', 'body', 'bug_id', 'created']) {
        if (!(f in b)) continue;
        if (f === 'kind' && !KINDS.includes(b.kind)) return fail(res, 'bad kind');
        sets.push(`${f} = @${f}`);
        params[f] = f === 'bug_id' && b[f] ? parseInt(b[f], 10)
                  : f === 'created' && b[f] ? new Date(b[f])
                  : b[f];
    }
    if (!sets.length) return ok(res, {});
    try {
        await zeq.query(
            `UPDATE site_updates SET ${sets.join(', ')} WHERE id = @id`, params);
        ok(res, {});
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});

router.delete('/:id', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    await zeq.query(`DELETE FROM site_updates WHERE id = @id`, { id });
    ok(res, {});
});

export const updates = router;
