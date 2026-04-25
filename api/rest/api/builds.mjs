// Saved reincs ("builds"): public share page at /builds. Users save a
// reinc plan with a title, author, optional description, and a JSON
// blob of the planner state; other visitors browse the list, open a
// build in the planner, or upvote / downvote it.
//
// - POST   /api/builds          public, create. No auth.
// - GET    /api/builds          public list, with per-viewer vote marks.
// - GET    /api/builds/:id      public detail incl. the full state JSON.
// - POST   /api/builds/:id/vote public, body {value:1|-1|0}. 0 clears.
//
// Vote abuse: one row per (reinc_id, sha1(ip+salt)). Not airtight —
// anyone with a rotating IP can stuff a ballot — but the user asked
// for a lightweight approach that doesn't require login. See
// docs/saved-reincs.md for the full threat model and data-drift notes.

import express from 'express';
import crypto from 'crypto';
import dbs from '../../db.mjs';
import { requireAdmin } from './auth.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

// Per-instance salt — changing it effectively resets the "one vote per
// IP" ledger. Not a secret; it just keeps the ip_hash column from being
// a trivial rainbow-table lookup against a /24.
const IP_SALT = 'zeq-builds-vote-salt-v1';

function clientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
        .toString().split(',')[0].trim();
}
function ipHash(req) {
    return crypto.createHash('sha1').update(clientIp(req) + '|' + IP_SALT).digest('hex');
}

function truncate(v, n) {
    if (v == null) return null;
    const s = String(v);
    return s.length > n ? s.slice(0, n) : s;
}
// Strip HTML-ish content from user-submitted strings so the list page
// doesn't render entries like "<script>alert('oh noes')</script>" as
// their literal text (Vue's `{{ }}` already escapes, so this is an
// aesthetics / garbage filter, not XSS defence). Drops everything
// between `<` and `>` plus any stray angle brackets, then collapses
// whitespace. Bug #31.
function stripHtml(v) {
    if (v == null) return '';
    return String(v)
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function toInt(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
}
// Total exp and gold can land in the tens-of-billions; stored in BIGINT
// columns. JS Number is exact up to 2^53 (~9e15), so a plain floor is
// safe — we're three orders of magnitude below that.
function toBigIntish(v) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

const LIST_COLS = `
    id, title, author, description, race_name, guild_summary,
    total_levels, total_exp, gold, hp, sp, upvotes, downvotes,
    is_featured, created`;

// GET /api/builds?sort=top|new&q=keyword
router.get('/', async function(req, res) {
    try {
        const sort = req.query.sort === 'new' ? 'new' : 'top';
        const qRaw = (req.query.q || '').trim();
        let sql = `SELECT ${LIST_COLS} FROM game_saved_reincs`;
        const params = {};
        if (qRaw) {
            sql += ` WHERE title LIKE @like OR author LIKE @like
                     OR race_name LIKE @like OR guild_summary LIKE @like`;
            params.like = `%${qRaw}%`;
        }
        // "Top" = net score (up - down) desc. Net score wins outright;
        // the old `is_featured` pin has been retired — bug #31, users
        // expected rank 1 to mean literally rank 1.
        if (sort === 'new') {
            sql += ` ORDER BY created DESC, id DESC`;
        } else {
            sql += ` ORDER BY (upvotes - downvotes) DESC,
                     upvotes DESC, created DESC, id DESC`;
        }
        sql += ` LIMIT 200`;
        const rows = await zeq.query(sql, params);
        const myVotes = {};
        if (rows.length) {
            const hash = ipHash(req);
            const voteRows = await zeq.query(
                `SELECT reinc_id, vote FROM game_saved_reinc_votes WHERE ip_hash = @hash`,
                { hash });
            for (const v of voteRows) myVotes[v.reinc_id] = v.vote;
        }
        ok(res, { rows, myVotes });
    } catch (e) { console.error(e); fail(res, String(e)); }
});

// GET /api/builds/:id — full detail including state JSON
router.get('/:id', async function(req, res) {
    try {
        const id = toInt(req.params.id);
        const rows = await zeq.query(
            `SELECT ${LIST_COLS}, state FROM game_saved_reincs WHERE id = @id`, { id });
        if (!rows.length) return fail(res, 'not found', 404);
        const row = rows[0];
        try { row.state = JSON.parse(row.state); }
        catch { row.state = null; }
        const hash = ipHash(req);
        const voteRows = await zeq.query(
            `SELECT vote FROM game_saved_reinc_votes
             WHERE reinc_id = @id AND ip_hash = @hash`,
            { id, hash });
        row.myVote = voteRows.length ? voteRows[0].vote : 0;
        ok(res, row);
    } catch (e) { console.error(e); fail(res, String(e)); }
});

// POST /api/builds — create. Client provides the planner state plus
// cached display metadata so the list view doesn't have to run the
// engine on every request. Display metadata is TRUSTED (used only for
// the list row); the `state` JSON is the real source of truth that
// gets re-run by the planner the moment a user opens the build.
router.post('/', async function(req, res) {
    try {
        const b = req.body || {};
        const title = stripHtml(b.title);
        const author = stripHtml(b.author);
        if (!title) return fail(res, 'title required');
        if (!author) return fail(res, 'author required');
        if (!b.state) return fail(res, 'state required');
        const state = typeof b.state === 'string' ? b.state : JSON.stringify(b.state);
        if (state.length > 200 * 1024) return fail(res, 'state too large');
        try { JSON.parse(state); }
        catch { return fail(res, 'state is not valid JSON'); }
        const row = {
            title: truncate(title, 128),
            author: truncate(author, 64),
            description: truncate(stripHtml(b.description), 1024),
            state,
            race_name: truncate(b.race_name || '', 64),
            guild_summary: truncate(b.guild_summary || '', 255),
            total_levels: toInt(b.total_levels),
            total_exp: toBigIntish(b.total_exp),
            gold: toBigIntish(b.gold),
            hp: toInt(b.hp),
            sp: toInt(b.sp),
        };
        const r = await zeq.query(
            `INSERT INTO game_saved_reincs
             (title, author, description, state, race_name, guild_summary,
              total_levels, total_exp, gold, hp, sp, created)
             VALUES
             (@title, @author, @description, @state, @race_name, @guild_summary,
              @total_levels, @total_exp, @gold, @hp, @sp, NOW())`,
            row);
        ok(res, { id: r.insertId });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// POST /api/builds/:id/vote  { value: 1 | -1 | 0 }
// `value: 0` clears the viewer's existing vote.
router.post('/:id/vote', async function(req, res) {
    try {
        const id = toInt(req.params.id);
        const raw = parseInt((req.body || {}).value, 10);
        const value = raw === 1 ? 1 : raw === -1 ? -1 : 0;
        const hash = ipHash(req);
        const existing = await zeq.query(
            `SELECT id AS row_id, vote FROM game_saved_reinc_votes
             WHERE reinc_id = @id AND ip_hash = @hash`,
            { id, hash });
        if (existing.length && existing[0].vote === value) {
            // No-op — still report current totals for the client.
            return ok(res, await voteResult(id, value));
        }
        if (value === 0 && existing.length) {
            await zeq.query(
                `DELETE FROM game_saved_reinc_votes WHERE id = @rowid`,
                { rowid: existing[0].row_id });
        } else if (existing.length) {
            await zeq.query(
                `UPDATE game_saved_reinc_votes SET vote = @value WHERE id = @rowid`,
                { value, rowid: existing[0].row_id });
        } else if (value !== 0) {
            await zeq.query(
                `INSERT INTO game_saved_reinc_votes (reinc_id, ip_hash, vote, created)
                 VALUES (@id, @hash, @value, NOW())`,
                { id, hash, value });
        }
        const counts = await zeq.query(
            `SELECT
                COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) AS up,
                COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) AS down
             FROM game_saved_reinc_votes WHERE reinc_id = @id`, { id });
        const up = toInt(counts[0] && counts[0].up);
        const down = toInt(counts[0] && counts[0].down);
        await zeq.query(
            `UPDATE game_saved_reincs
             SET upvotes = @up, downvotes = @down WHERE id = @id`,
            { id, up, down });
        ok(res, { id, upvotes: up, downvotes: down, myVote: value });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

async function voteResult(id, myVote) {
    const rows = await zeq.query(
        `SELECT upvotes, downvotes FROM game_saved_reincs WHERE id = @id`, { id });
    const r = rows[0] || { upvotes: 0, downvotes: 0 };
    return { id, upvotes: r.upvotes, downvotes: r.downvotes, myVote };
}

// DELETE /api/builds/:id — admin-only. Cascades to vote rows. Used to
// nuke spam / garbage entries that the stripHtml filter missed (or
// that predate it). Bug #31.
router.delete('/:id', requireAdmin, async function(req, res) {
    try {
        const id = toInt(req.params.id);
        await zeq.query(
            `DELETE FROM game_saved_reinc_votes WHERE reinc_id = @id`, { id });
        const r = await zeq.query(
            `DELETE FROM game_saved_reincs WHERE id = @id`, { id });
        if (!r.affectedRows) return fail(res, 'not found', 404);
        ok(res, { id });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

export const builds = router;
