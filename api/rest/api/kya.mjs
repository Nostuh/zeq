// KYA lookup API — read-only views over the kya_info table.
// Ingest still lives at POST /api/eq/kya for backward compat with the
// in-game trigger; everything new lives here. See docs/kya.md.
//
// All reads gated on the `lookups` capability flag (admins implicit).

import express from 'express';
import dbs from '../../db.mjs';
import { requireFlag } from './auth.mjs';
// The pattern/mob_name extraction SQL lives in kya_extract.mjs so the
// cross-linking summaries (mob detail, item detail) share it. See the
// format documentation there and in docs/kya.md.
import { EXTRACT_SQL } from '../../classes/kya_extract.mjs';

// KYA is read-only, so a single access flag covers the whole area.
const requireLookups = requireFlag('lookups');

const router = express.Router();
const zeq = dbs.get('zeq');

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

// Distinct mob names matching the search. Aggregates entry counts by
// pattern so the UI can show "Watcher — 12 kya, 8 consider" etc.
router.get('/mobs', requireLookups, async function(req, res) {
    try {
        const q = String(req.query.q || '').trim();
        const params = { q: `%${q}%` };
        const rows = await zeq.query(
            `SELECT mob_name,
                    SUM(pattern = 'A') AS a_count,
                    SUM(pattern = 'B') AS b_count,
                    SUM(pattern = 'C') AS c_count,
                    COUNT(*) AS total
               FROM (SELECT ${EXTRACT_SQL} FROM kya_info) t
              WHERE mob_name IS NOT NULL
                AND mob_name <> ''
                AND mob_name LIKE @q
              GROUP BY mob_name
              ORDER BY total DESC, mob_name ASC
              LIMIT 500`,
            params);
        ok(res, rows.map(r => ({
            mob_name: r.mob_name,
            a_count: Number(r.a_count) || 0,
            b_count: Number(r.b_count) || 0,
            c_count: Number(r.c_count) || 0,
            total: Number(r.total) || 0,
        })));
    } catch (e) { console.error('[kya/mobs]', e); fail(res, String(e)); }
});

// All raw entries for one mob (case-insensitive exact match on the
// extracted name). Returns id, pattern, info — the client parses
// buckets / consider phrases for display.
router.get('/by-mob', requireLookups, async function(req, res) {
    try {
        const name = String(req.query.name || '').trim();
        if (!name) return fail(res, 'name required');
        const rows = await zeq.query(
            `SELECT id, info, pattern, mob_name FROM (
                SELECT id, info, ${EXTRACT_SQL} FROM kya_info
             ) t
             WHERE mob_name IS NOT NULL
               AND LOWER(mob_name) = LOWER(@name)
             ORDER BY id ASC`,
            { name });
        ok(res, rows.map(r => ({
            id: r.id,
            pattern: r.pattern,
            mob_name: r.mob_name,
            info: r.info,
        })));
    } catch (e) { console.error('[kya/by-mob]', e); fail(res, String(e)); }
});

export const kya = router;
