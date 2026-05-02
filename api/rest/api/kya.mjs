// KYA lookup API — read-only views over the kya_info table.
// Ingest still lives at POST /api/eq/kya for backward compat with the
// in-game trigger; everything new lives here. See docs/kya.md.
//
// All reads gated to any authenticated user (requireAuth) — same level
// as the legacy "My Equipment" page.

import express from 'express';
import dbs from '../../db.mjs';
import { requireAuth } from './auth.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

// SQL fragment that derives `pattern` (A/B/C/X) and `mob_name` from
// `info`. Three capture formats exist in kya_info — see docs/kya.md.
//   A: "<target> at <hp%>" (oldest, 5 rows). mob_name = first word.
//   B: "<Caster>'s\n<target> at <hp%>\n..." (the bulk).
//      mob_name = first line minus trailing 's.
//   C: "<Subject>'s gender is: ...|..." (consider output, pipe-joined).
//      mob_name = substring before "'s gender is:".
//   X: bad/incomplete row (id 405 only). mob_name = NULL, skipped.
const EXTRACT_SQL = `
  CASE
    WHEN info LIKE '%\\'s gender is:%' THEN 'C'
    WHEN info REGEXP '^[A-Z][^\\n]*\\'s\\n' THEN 'B'
    WHEN info REGEXP '^[a-zA-Z]+ at ' THEN 'A'
    ELSE 'X'
  END AS pattern,
  CASE
    WHEN info LIKE '%\\'s gender is:%' THEN SUBSTRING_INDEX(info, '\\'s gender is:', 1)
    WHEN info REGEXP '^[A-Z][^\\n]*\\'s\\n' THEN TRIM(TRAILING '\\'s' FROM SUBSTRING_INDEX(info, '\\n', 1))
    WHEN info REGEXP '^[a-zA-Z]+ at ' THEN LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(info, '\\n', 1), ' at ', 1))
    ELSE NULL
  END AS mob_name
`;

// Distinct mob names matching the search. Aggregates entry counts by
// pattern so the UI can show "Watcher — 12 kya, 8 consider" etc.
router.get('/mobs', requireAuth, async function(req, res) {
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
router.get('/by-mob', requireAuth, async function(req, res) {
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
