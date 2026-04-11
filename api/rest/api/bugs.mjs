// Bug-reporter API.
// - POST /api/bugs  — anyone (even anonymous) can submit a report
// - GET /api/bugs   — admins only, lists reports
// - POST /api/bugs/:id/status — admins only, updates status / marks resolved
// - DELETE /api/bugs/:id — admins only

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import dbs from '../../db.mjs';
import { loadUser, requireAdmin } from './auth.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const UPLOAD_ROOT = '/srv/zeq/api/uploads/bugs';
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;    // 5 MB per file
const MAX_ATTACHMENTS = 6;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png']);
const EXT_FOR_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png' };

// Path guard for the admin binary-fetch endpoint. Stored `path` column
// MUST match this shape — prevents a corrupted or maliciously-inserted
// row from escaping UPLOAD_ROOT even if path.resolve() somehow failed.
const STORED_PATH_RE = /^\d+[/\\]\d+_[0-9a-f]+\.(jpg|png)$/;

function sanitizeFilename(name) {
    return String(name || 'screenshot').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

// In-memory spam detector. Tracks recent (ip, title+desc hash) tuples
// and silently drops duplicates for SPAM_WINDOW_MS without rejecting so
// the client sees no negative feedback. The cache is capped so a
// flood of different bodies can't consume unbounded memory. This is
// intentionally lightweight — no Redis, no DB persistence. Restart
// clears the cache.
const SPAM_WINDOW_MS = 5 * 60 * 1000;     // 5 minutes
const SPAM_CACHE_MAX = 500;
const spamCache = new Map();              // key -> { ts, count }

function spamKey(req, title, description) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
        .toString().split(',')[0].trim();
    const content = (title || '') + '\u0000' + (description || '');
    const hash = crypto.createHash('sha1').update(content).digest('hex').slice(0, 16);
    return `${ip}::${hash}`;
}

// Evict expired entries + hard-cap at SPAM_CACHE_MAX.
function evictSpamCache() {
    const now = Date.now();
    if (spamCache.size <= SPAM_CACHE_MAX) return;
    for (const [k, v] of spamCache) {
        if (now - v.ts > SPAM_WINDOW_MS) spamCache.delete(k);
        if (spamCache.size <= SPAM_CACHE_MAX * 0.8) break;
    }
    if (spamCache.size > SPAM_CACHE_MAX) {
        const cutoff = [...spamCache.entries()]
            .sort((a, b) => a[1].ts - b[1].ts)
            .slice(0, Math.floor(SPAM_CACHE_MAX / 2));
        for (const [k] of cutoff) spamCache.delete(k);
    }
}

// READ-ONLY check. Returns true if the same (ip, title+desc hash) has
// already been RECORDED (via recordSpamKey) within SPAM_WINDOW_MS.
// Critically, this does NOT increment any counter — recording happens
// only after a successful DB insert, so a failed attempt can be retried
// without being silently swallowed by the spam filter.
function isSpamDuplicate(key) {
    evictSpamCache();
    const prev = spamCache.get(key);
    if (!prev) return false;
    if (Date.now() - prev.ts >= SPAM_WINDOW_MS) {
        spamCache.delete(key);
        return false;
    }
    return true;
}

// Record AFTER the insert succeeds. Only successful submissions count
// toward the rate limit.
function recordSpamKey(key) {
    spamCache.set(key, { ts: Date.now() });
}

// Magic-byte sniff. We only accept JPG/PNG; the claimed `mime` is
// untrusted. Validates the first 8 bytes of the decoded buffer.
function sniffImageMime(buf) {
    if (!buf || buf.length < 4) return null;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
    // JPEG: FF D8 FF (and typically FF D9 at the end, not checked)
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    return null;
}

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

function truncate(v, n) {
    if (v == null) return null;
    const s = String(v);
    return s.length > n ? s.slice(0, n) : s;
}

// MEDIUMTEXT can hold 16MB but we cap at ~256KB per field to stay sane
// and avoid runaway payloads from runaway pages.
const CTX_LIMIT = 256 * 1024;

router.post('/', async function(req, res) {
    try {
        const b = req.body || {};
        if (!b.title || !b.description) return fail(res, 'title and description required');
        // Silent duplicate detection. Only counts SUCCESSFULLY STORED
        // submissions — a failed attempt can be retried without being
        // silently swallowed. Spammers still see "success" on repeats
        // and go away; legitimate users who mis-click submit twice are
        // protected from double posts.
        const key = spamKey(req, b.title, b.description);
        if (isSpamDuplicate(key)) {
            console.log(`[bugs] dropped spam duplicate from ${req.socket.remoteAddress}`);
            return ok(res, { id: null, duplicate: true });
        }
        const user = await loadUser(req);
        const insertResult = await zeq.query(
            `INSERT INTO bug_reports
             (title, description, severity, page_url, user_agent, screen_size,
              reporter_name, reporter_contact, user_id, status,
              app_state, dom_snapshot, console_log, created)
             VALUES
             (@title, @description, @severity, @page_url, @user_agent, @screen_size,
              @reporter_name, @reporter_contact, @user_id, 'open',
              @app_state, @dom_snapshot, @console_log, NOW())`,
            {
                title: truncate(b.title, 255),
                description: b.description,
                severity: ['low','normal','high','critical'].includes(b.severity) ? b.severity : 'normal',
                page_url: truncate(b.page_url, 512),
                user_agent: truncate(b.user_agent || req.headers['user-agent'], 512),
                screen_size: truncate(b.screen_size, 32),
                reporter_name: truncate(b.reporter_name, 128),
                reporter_contact: truncate(b.reporter_contact, 255),
                user_id: user ? user.id : null,
                app_state: truncate(b.app_state, CTX_LIMIT),
                dom_snapshot: truncate(b.dom_snapshot, CTX_LIMIT),
                console_log: truncate(b.console_log, CTX_LIMIT),
            });
        const bugId = insertResult.insertId;

        // Handle image attachments. Each is {filename, mime, data_base64}.
        // Base64 is a 33% overhead but avoids a multer dependency and keeps
        // the whole submission in a single JSON POST.
        //
        // MIME is validated by sniffing the decoded buffer's first bytes
        // (PNG header or JPEG SOI). The client's claimed `mime` is ignored
        // for type checking and only used to map to a file extension —
        // anything other than real PNG/JPEG bytes is rejected.
        const atts = Array.isArray(b.attachments) ? b.attachments.slice(0, MAX_ATTACHMENTS) : [];
        if (atts.length > 0) {
            const dir = path.join(UPLOAD_ROOT, String(bugId));
            fs.mkdirSync(dir, { recursive: true });
            let idx = 0;
            for (const a of atts) {
                if (!a || !a.data_base64) continue;
                let buf;
                try { buf = Buffer.from(a.data_base64, 'base64'); } catch { continue; }
                if (!buf.length || buf.length > MAX_ATTACHMENT_BYTES) continue;
                const realMime = sniffImageMime(buf);
                if (!realMime || !ALLOWED_MIMES.has(realMime)) continue;
                idx++;
                const ext = EXT_FOR_MIME[realMime];
                const stored = `${idx}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
                const absPath = path.join(dir, stored);
                fs.writeFileSync(absPath, buf);
                const relPath = `${bugId}/${stored}`;
                await zeq.query(
                    `INSERT INTO bug_attachments (bug_id, filename, mime_type, size_bytes, path, created)
                     VALUES (@bug_id, @filename, @mime_type, @size_bytes, @path, NOW())`,
                    { bug_id: bugId, filename: sanitizeFilename(a.filename),
                      mime_type: realMime, size_bytes: buf.length, path: relPath });
            }
        }

        // Only record in the spam cache once everything above succeeded.
        recordSpamKey(key);
        ok(res, { id: bugId });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.get('/', requireAdmin, async function(req, res) {
    const status = (req.query.status || '').trim();
    let sql = `SELECT b.*, u.name AS user_name FROM bug_reports b
               LEFT JOIN users u ON u.id = b.user_id`;
    const params = {};
    if (status) { sql += ` WHERE b.status = @status`; params.status = status; }
    sql += ` ORDER BY b.created DESC`;
    const rows = await zeq.query(sql, params);
    // Attach the attachment metadata per row. The project's mysql shim
    // only understands `@name` placeholders (no positional `?`), so we
    // build named holes. IDs are trusted integers from our own DB so
    // there is no injection risk either way.
    if (rows.length) {
        const ids = rows.map((r) => r.id | 0);
        const attParams = {};
        const attHoles = ids.map((v, i) => { const k = `id${i}`; attParams[k] = v; return '@' + k; });
        const atts = await zeq.query(
            `SELECT id, bug_id, filename, mime_type, size_bytes FROM bug_attachments
             WHERE bug_id IN (${attHoles.join(',')}) ORDER BY id`, attParams);
        const byBug = {};
        for (const a of atts) (byBug[a.bug_id] ||= []).push(a);
        for (const r of rows) r.attachments = byBug[r.id] || [];
    }
    ok(res, rows);
});

// Admin-only binary fetch. Streams the file from disk with the stored
// mime type; no direct nginx alias so auth is always enforced.
//
// Defence in depth: the stored `path` column must match STORED_PATH_RE
// (shape: `{bug_id}/{idx}_{hex}.{jpg|png}`) AND the resolved absolute
// path must stay under UPLOAD_ROOT. Either check alone would suffice
// against a normal path-traversal attempt; having both means a single
// code or data bug can't escape the sandbox.
router.get('/:id/attachments/:attId', requireAdmin, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const attId = parseInt(req.params.attId, 10);
        const rows = await zeq.query(
            `SELECT mime_type, path FROM bug_attachments WHERE id = @id AND bug_id = @bug`,
            { id: attId, bug: id });
        if (!rows.length) return fail(res, 'not found', 404);
        const storedPath = String(rows[0].path || '');
        if (!STORED_PATH_RE.test(storedPath)) return fail(res, 'invalid stored path', 400);
        const abs = path.join(UPLOAD_ROOT, storedPath);
        const resolved = path.resolve(abs);
        if (!resolved.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return fail(res, 'bad path', 400);
        if (!fs.existsSync(resolved)) return fail(res, 'file missing', 404);
        res.setHeader('Content-Type', rows[0].mime_type);
        res.setHeader('Cache-Control', 'private, max-age=0');
        fs.createReadStream(resolved).pipe(res);
    } catch (e) { console.error(e); fail(res, String(e)); }
});

router.post('/:id/status', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body || {};
    if (!['open','in_progress','resolved','wontfix'].includes(status)) return fail(res, 'bad status');
    const resolved = (status === 'resolved' || status === 'wontfix') ? 'NOW()' : 'NULL';
    await zeq.query(
        `UPDATE bug_reports SET status = @status, resolved = ${resolved} WHERE id = @id`,
        { id, status });
    ok(res, {});
});

router.delete('/:id', requireAdmin, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    // Order: remove files on disk FIRST, then delete the DB row. If the
    // disk removal fails we return an error and leave the DB intact so
    // the admin can retry. If disk succeeds but the DB delete then fails,
    // the worst case is broken thumbnails on next load — cheaper to fix
    // than orphaned files the admin has no UI to clean up.
    try {
        const dir = path.join(UPLOAD_ROOT, String(id));
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
        console.error('[bugs] failed to rm upload dir', e);
        return fail(res, 'failed to remove attachment files', 500);
    }
    await zeq.query(`DELETE FROM bug_reports WHERE id = @id`, { id });
    ok(res, {});
});

export const bugs = router;
