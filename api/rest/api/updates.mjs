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

// `created` is stored as a naive datetime in Eastern wall-clock — see
// the GET handler. Coerce client input to the same naive `YYYY-MM-DD HH:MM:SS`
// shape so the round trip stays in the same timezone (no JS Date in
// the middle, which would re-anchor to UTC).
function naiveDatetime(v) {
    if (!v) return null;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
}
function nowNaiveEastern() {
    // Use Intl to get the current wall-clock time in America/New_York,
    // matching how seed entries are authored.
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day} ${hh}:${parts.minute}:${parts.second}`;
}

router.get('/', async function(req, res) {
    try {
        // DATE_FORMAT returns a naive string (no TZ), so the mysql driver
        // doesn't coerce it through a JS Date in UTC. The client treats
        // the value as Eastern wall-clock and renders it as-is — every
        // viewer sees the same time the entry was authored in.
        const rows = await zeq.query(
            `SELECT u.id, u.kind, u.title, u.body, u.bug_id,
                    DATE_FORMAT(u.created, '%Y-%m-%dT%H:%i:%s') AS created,
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
    const created = naiveDatetime(b.created) || nowNaiveEastern();
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
                  : f === 'created' && b[f] ? (naiveDatetime(b[f]) || b[f])
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
