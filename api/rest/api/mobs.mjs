// EQ Mob Knowledge Base API.
// All reads require eq_viewer (or eq_editor or admin).
// All writes require eq_editor (or admin).

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import dbs from '../../db.mjs';
import { requireEqViewer, requireEqEditor } from './auth.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const UPLOAD_ROOT = '/srv/zeq/api/uploads/mobs';
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png']);
const EXT_FOR_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const STORED_PATH_RE = /^\d+[/\\]\d+_[0-9a-f]+\.(jpg|png)$/;
const DAMAGE_TYPES = ['physical', 'magical', 'fire', 'cold', 'electric', 'poison', 'acid', 'asphyxiation', 'psionic'];

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

function sniffImageMime(buf) {
    if (!buf || buf.length < 4) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    return null;
}

function sanitizeFilename(name) {
    return String(name || 'image').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

// Compute a diff object between old and new values for history tracking.
function computeDiff(oldObj, newObj, fields) {
    const diff = {};
    for (const f of fields) {
        const o = oldObj[f] == null ? null : oldObj[f];
        const n = newObj[f] == null ? null : newObj[f];
        if (String(o ?? '') !== String(n ?? '')) {
            diff[f] = { old: o, new: n };
        }
    }
    return Object.keys(diff).length ? diff : null;
}

async function recordHistory(mobId, user, action, section, diffJson, snapshot) {
    const userName = user ? user.name : 'init';
    const userId = user ? user.id : null;
    await zeq.query(
        `INSERT INTO mob_history (mob_id, user_name, user_id, action, section, diff_json, snapshot, created)
         VALUES (@mob_id, @user_name, @user_id, @action, @section, @diff_json, @snapshot, NOW())`,
        {
            mob_id: mobId,
            user_name: userName,
            user_id: userId,
            action,
            section,
            diff_json: diffJson ? JSON.stringify(diffJson) : null,
            snapshot: snapshot ? JSON.stringify(snapshot) : null,
        });
}

// --- LIST ---
router.get('/', requireEqViewer, async function(req, res) {
    try {
        const q = (req.query.q || '').trim();
        let sql = `SELECT m.*,
                    (SELECT COUNT(*) FROM mob_loot WHERE mob_id = m.id) AS loot_count
                   FROM mob_monsters m`;
        const params = {};
        if (q) {
            sql += ` WHERE m.name LIKE @q OR m.short_name LIKE @q OR m.area LIKE @q`;
            params.q = `%${q}%`;
        }
        sql += ` ORDER BY m.name`;
        const rows = await zeq.query(sql, params);
        // Attach resist summary per mob
        if (rows.length) {
            const resists = await zeq.query(
                `SELECT mob_id, damage_type, value FROM mob_resistances ORDER BY mob_id`);
            const byMob = {};
            for (const r of resists) {
                (byMob[r.mob_id] ||= []).push({ type: r.damage_type, value: r.value });
            }
            for (const row of rows) row.resistances = byMob[row.id] || [];
        }
        ok(res, rows);
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- DETAIL ---
router.get('/:id', requireEqViewer, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const rows = await zeq.query(`SELECT * FROM mob_monsters WHERE id = @id`, { id });
        if (!rows.length) return fail(res, 'not found', 404);
        const mob = rows[0];
        const [resistances, prots, guilds, loot, images, maps] = await Promise.all([
            zeq.query(`SELECT * FROM mob_resistances WHERE mob_id = @id ORDER BY FIELD(damage_type, 'physical','magical','fire','cold','electric','poison','acid','asphyxiation','psionic')`, { id }),
            zeq.query(`SELECT * FROM mob_prots WHERE mob_id = @id ORDER BY priority, prot_type`, { id }),
            zeq.query(`SELECT * FROM mob_guilds WHERE mob_id = @id ORDER BY id`, { id }),
            zeq.query(`SELECT * FROM mob_loot WHERE mob_id = @id ORDER BY sort_order, id`, { id }),
            zeq.query(`SELECT id, mob_id, section, filename, mime_type, size_bytes, caption, sort_order, created FROM mob_images WHERE mob_id = @id ORDER BY sort_order, id`, { id }),
            zeq.query(`SELECT * FROM mob_maps WHERE mob_id = @id ORDER BY id`, { id }),
        ]);
        mob.resistances = resistances;
        mob.prots = prots;
        mob.guilds = guilds;
        mob.loot = loot;
        mob.images = images;
        mob.maps = maps;
        ok(res, mob);
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- CREATE MOB ---
router.post('/', requireEqEditor, async function(req, res) {
    try {
        const b = req.body || {};
        if (!b.name || !b.name.trim()) return fail(res, 'name required');
        // GOTCHA: @name placeholder shim uses replaceAll — param names
        // must not be substrings of each other (e.g. @dir vs @dirback).
        const r = await zeq.query(
            `INSERT INTO mob_monsters (name, short_name, area, exp_value, is_undead, is_aggro,
                directions, directions_back, kill_strategy, notes, version, created_by, updated_by, created, updated)
             VALUES (@vn, @vs, @va, @vx, @vu, @vg,
                @vd, @vb, @vk, @vo, 1, @vi, @vi, NOW(), NOW())`,
            {
                vn: b.name.trim(),
                vs: b.short_name || null,
                va: b.area || null,
                vx: b.exp_value || null,
                vu: b.is_undead ? 1 : 0,
                vg: b.is_aggro ? 1 : 0,
                vd: b.directions || null,
                vb: b.directions_back || null,
                vk: b.kill_strategy || null,
                vo: b.notes || null,
                vi: req.user.id,
            });
        const id = r.insertId;
        await recordHistory(id, req.user, 'create', 'info', null, { ...b, id });
        ok(res, { id });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return fail(res, 'a mob with this name already exists');
        console.error(e); fail(res, e.sqlMessage || String(e));
    }
});

// --- UPDATE MOB (with optimistic locking) ---
const MOB_FIELDS = ['name', 'short_name', 'area', 'exp_value', 'is_undead', 'is_aggro',
    'directions', 'directions_back', 'kill_strategy', 'notes'];

router.post('/:id', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const b = req.body || {};
        if (b.version == null) return fail(res, 'version required for optimistic locking');
        const version = parseInt(b.version, 10);

        // Fetch current state for diff
        const cur = await zeq.query(`SELECT * FROM mob_monsters WHERE id = @id`, { id });
        if (!cur.length) return fail(res, 'not found', 404);
        const old = cur[0];

        // GOTCHA: param names must not be substrings of each other.
        const r = await zeq.query(
            `UPDATE mob_monsters SET
                name = @vn, short_name = @vs, area = @va,
                exp_value = @vx, is_undead = @vu, is_aggro = @vg,
                directions = @vd, directions_back = @vb,
                kill_strategy = @vk, notes = @vo,
                version = version + 1, updated_by = @vi, updated = NOW()
             WHERE id = @wh AND version = @wv`,
            {
                wh: id,
                wv: version,
                vn: (b.name || old.name).trim(),
                vs: b.short_name !== undefined ? b.short_name : old.short_name,
                va: b.area !== undefined ? b.area : old.area,
                vx: b.exp_value !== undefined ? b.exp_value : old.exp_value,
                vu: b.is_undead !== undefined ? (b.is_undead ? 1 : 0) : old.is_undead,
                vg: b.is_aggro !== undefined ? (b.is_aggro ? 1 : 0) : old.is_aggro,
                vd: b.directions !== undefined ? b.directions : old.directions,
                vb: b.directions_back !== undefined ? b.directions_back : old.directions_back,
                vk: b.kill_strategy !== undefined ? b.kill_strategy : old.kill_strategy,
                vo: b.notes !== undefined ? b.notes : old.notes,
                vi: req.user.id,
            });
        if (!r.affectedRows) {
            return res.status(409).json({ ok: false, error: 'This record was modified by another user. Please refresh and try again.' });
        }
        // Record diff
        const newVals = {};
        for (const f of MOB_FIELDS) newVals[f] = b[f] !== undefined ? b[f] : old[f];
        const diff = computeDiff(old, newVals, MOB_FIELDS);
        if (diff) await recordHistory(id, req.user, 'update', 'info', diff, null);
        ok(res, { version: version + 1 });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return fail(res, 'a mob with this name already exists');
        console.error(e); fail(res, e.sqlMessage || String(e));
    }
});

// --- DELETE MOB ---
router.delete('/:id', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const cur = await zeq.query(`SELECT name FROM mob_monsters WHERE id = @id`, { id });
        if (!cur.length) return fail(res, 'not found', 404);
        // Remove image files from disk
        const imgDir = path.join(UPLOAD_ROOT, String(id));
        if (fs.existsSync(imgDir)) fs.rmSync(imgDir, { recursive: true, force: true });
        // History is cascaded by FK, but record a final delete entry in a separate table
        // (actually the cascade will delete it too, so we skip history for deletes)
        await zeq.query(`DELETE FROM mob_monsters WHERE id = @id`, { id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- RESISTANCES (bulk set) ---
router.post('/:id/resistances', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const mob = await zeq.query(`SELECT id FROM mob_monsters WHERE id = @id`, { id });
        if (!mob.length) return fail(res, 'not found', 404);
        const b = req.body || {};
        const resistances = b.resistances; // array of {damage_type, value, notes}
        if (!Array.isArray(resistances)) return fail(res, 'resistances array required');

        // Get old resistances for diff
        const oldResists = await zeq.query(
            `SELECT damage_type, value, notes FROM mob_resistances WHERE mob_id = @id`, { id });
        const oldMap = {};
        for (const r of oldResists) oldMap[r.damage_type] = r;

        // Delete existing and re-insert
        await zeq.query(`DELETE FROM mob_resistances WHERE mob_id = @id`, { id });
        for (const r of resistances) {
            if (!DAMAGE_TYPES.includes(r.damage_type)) continue;
            await zeq.query(
                `INSERT INTO mob_resistances (mob_id, damage_type, value, notes)
                 VALUES (@id, @dt, @val, @notes)`,
                { id, dt: r.damage_type, val: r.value != null ? parseInt(r.value, 10) : null, notes: r.notes || null });
        }

        // Compute diff
        const diff = {};
        for (const r of resistances) {
            const o = oldMap[r.damage_type];
            const oldVal = o ? o.value : null;
            const newVal = r.value != null ? parseInt(r.value, 10) : null;
            if (oldVal !== newVal) {
                diff[r.damage_type] = { old: oldVal, new: newVal };
            }
        }
        if (Object.keys(diff).length) {
            await recordHistory(id, req.user, 'update', 'resistances', diff, null);
        }
        // Bump version
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- PROTS ---
router.post('/:id/prots', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const b = req.body || {};
        if (!b.prot_type) return fail(res, 'prot_type required');
        // Upsert
        const existing = await zeq.query(
            `SELECT id FROM mob_prots WHERE mob_id = @id AND prot_type = @pt`,
            { id, pt: b.prot_type });
        if (existing.length) {
            await zeq.query(
                `UPDATE mob_prots SET priority = @pri, notes = @notes WHERE id = @pid`,
                { pid: existing[0].id, pri: b.priority || 'required', notes: b.notes || null });
        } else {
            await zeq.query(
                `INSERT INTO mob_prots (mob_id, prot_type, priority, notes)
                 VALUES (@id, @pt, @pri, @notes)`,
                { id, pt: b.prot_type, pri: b.priority || 'required', notes: b.notes || null });
        }
        await recordHistory(id, req.user, existing.length ? 'update' : 'create', 'prots',
            { [b.prot_type]: { priority: b.priority || 'required' } }, null);
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.delete('/:id/prots/:pid', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const pid = parseInt(req.params.pid, 10);
        const old = await zeq.query(`SELECT prot_type FROM mob_prots WHERE id = @pid AND mob_id = @id`, { pid, id });
        if (!old.length) return fail(res, 'not found', 404);
        await zeq.query(`DELETE FROM mob_prots WHERE id = @pid`, { pid });
        await recordHistory(id, req.user, 'delete', 'prots', { removed: old[0].prot_type }, null);
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- GUILDS ---
router.post('/:id/guilds', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const b = req.body || {};
        if (!b.guild_name) return fail(res, 'guild_name required');
        const r = await zeq.query(
            `INSERT INTO mob_guilds (mob_id, guild_name, role, notes)
             VALUES (@id, @gn, @role, @notes)`,
            { id, gn: b.guild_name, role: b.role || null, notes: b.notes || null });
        await recordHistory(id, req.user, 'create', 'guilds', null,
            { guild_name: b.guild_name, role: b.role });
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, { id: r.insertId });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.post('/:id/guilds/:gid', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const gid = parseInt(req.params.gid, 10);
        const b = req.body || {};
        await zeq.query(
            `UPDATE mob_guilds SET guild_name = @gn, role = @role, notes = @notes WHERE id = @gid AND mob_id = @id`,
            { gid, id, gn: b.guild_name, role: b.role || null, notes: b.notes || null });
        await recordHistory(id, req.user, 'update', 'guilds', { guild_name: b.guild_name, role: b.role }, null);
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.delete('/:id/guilds/:gid', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const gid = parseInt(req.params.gid, 10);
        const old = await zeq.query(`SELECT guild_name FROM mob_guilds WHERE id = @gid AND mob_id = @id`, { gid, id });
        if (!old.length) return fail(res, 'not found', 404);
        await zeq.query(`DELETE FROM mob_guilds WHERE id = @gid`, { gid });
        await recordHistory(id, req.user, 'delete', 'guilds', { removed: old[0].guild_name }, null);
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- LOOT ---
router.post('/:id/loot', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const b = req.body || {};
        if (!b.item_name) return fail(res, 'item_name required');
        const r = await zeq.query(
            `INSERT INTO mob_loot (mob_id, item_name, slot, sort_order)
             VALUES (@id, @item, @slot, @sort)`,
            { id, item: b.item_name, slot: b.slot || null, sort: b.sort_order || 0 });
        await recordHistory(id, req.user, 'create', 'loot', null,
            { item_name: b.item_name, slot: b.slot });
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, { id: r.insertId });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.post('/:id/loot/:lid', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const lid = parseInt(req.params.lid, 10);
        const b = req.body || {};
        await zeq.query(
            `UPDATE mob_loot SET item_name = @item, slot = @slot, sort_order = @sort
             WHERE id = @lid AND mob_id = @id`,
            { lid, id, item: b.item_name, slot: b.slot || null, sort: b.sort_order || 0 });
        await recordHistory(id, req.user, 'update', 'loot', { item_name: b.item_name, slot: b.slot }, null);
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.delete('/:id/loot/:lid', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const lid = parseInt(req.params.lid, 10);
        const old = await zeq.query(`SELECT item_name FROM mob_loot WHERE id = @lid AND mob_id = @id`, { lid, id });
        if (!old.length) return fail(res, 'not found', 404);
        await zeq.query(`DELETE FROM mob_loot WHERE id = @lid`, { lid });
        await recordHistory(id, req.user, 'delete', 'loot', { removed: old[0].item_name }, null);
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- IMAGES ---
router.post('/:id/images', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const mob = await zeq.query(`SELECT id FROM mob_monsters WHERE id = @id`, { id });
        if (!mob.length) return fail(res, 'not found', 404);
        const b = req.body || {};
        const atts = Array.isArray(b.images) ? b.images.slice(0, MAX_ATTACHMENTS) : [];
        if (!atts.length) return fail(res, 'no images provided');

        const dir = path.join(UPLOAD_ROOT, String(id));
        fs.mkdirSync(dir, { recursive: true });
        const inserted = [];
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
            const relPath = `${id}/${stored}`;
            const r = await zeq.query(
                `INSERT INTO mob_images (mob_id, section, filename, mime_type, size_bytes, path, caption, sort_order, created)
                 VALUES (@id, @section, @filename, @mime, @size, @path, @caption, @sort, NOW())`,
                {
                    id,
                    section: a.section || 'general',
                    filename: sanitizeFilename(a.filename),
                    mime: realMime,
                    size: buf.length,
                    path: relPath,
                    caption: a.caption || null,
                    sort: a.sort_order || 0,
                });
            inserted.push({ id: r.insertId, filename: sanitizeFilename(a.filename) });
        }
        if (inserted.length) {
            await recordHistory(id, req.user, 'create', 'images', null,
                { count: inserted.length, files: inserted.map(i => i.filename) });
            await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        }
        ok(res, inserted);
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.get('/:id/images/:iid', requireEqViewer, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const iid = parseInt(req.params.iid, 10);
        const rows = await zeq.query(
            `SELECT mime_type, path FROM mob_images WHERE id = @iid AND mob_id = @id`,
            { iid, id });
        if (!rows.length) return fail(res, 'not found', 404);
        const storedPath = String(rows[0].path || '');
        if (!STORED_PATH_RE.test(storedPath)) return fail(res, 'invalid stored path', 400);
        const abs = path.join(UPLOAD_ROOT, storedPath);
        const resolved = path.resolve(abs);
        if (!resolved.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return fail(res, 'bad path', 400);
        if (!fs.existsSync(resolved)) return fail(res, 'file missing', 404);
        res.setHeader('Content-Type', rows[0].mime_type);
        res.setHeader('Cache-Control', 'private, max-age=86400');
        fs.createReadStream(resolved).pipe(res);
    } catch (e) { console.error(e); fail(res, String(e)); }
});

router.delete('/:id/images/:iid', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const iid = parseInt(req.params.iid, 10);
        const rows = await zeq.query(
            `SELECT path, filename FROM mob_images WHERE id = @iid AND mob_id = @id`,
            { iid, id });
        if (!rows.length) return fail(res, 'not found', 404);
        // Remove file from disk
        const abs = path.join(UPLOAD_ROOT, String(rows[0].path));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
        await zeq.query(`DELETE FROM mob_images WHERE id = @iid`, { iid });
        await recordHistory(id, req.user, 'delete', 'images', { removed: rows[0].filename }, null);
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- MAPS ---
router.post('/:id/maps', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const b = req.body || {};
        if (!b.title || !b.ascii_content) return fail(res, 'title and ascii_content required');
        // Sanitize ASCII: strip non-7-bit chars
        const clean = b.ascii_content.replace(/[^\x20-\x7E\n\r\t]/g, '');
        if (b.map_id) {
            // Update existing
            const old = await zeq.query(`SELECT title, ascii_content FROM mob_maps WHERE id = @mid AND mob_id = @id`, { mid: b.map_id, id });
            if (!old.length) return fail(res, 'map not found', 404);
            await zeq.query(
                `UPDATE mob_maps SET title = @title, ascii_content = @content, notes = @notes, area_name = @area, updated = NOW()
                 WHERE id = @mid`,
                { mid: b.map_id, title: b.title, content: clean, notes: b.notes || null, area: b.area_name || null });
            const diff = computeDiff(old[0], { title: b.title, ascii_content: clean }, ['title', 'ascii_content']);
            if (diff) await recordHistory(id, req.user, 'update', 'maps', diff, null);
        } else {
            // Create new
            const r = await zeq.query(
                `INSERT INTO mob_maps (mob_id, area_name, title, ascii_content, notes, created_by, updated)
                 VALUES (@id, @area, @title, @content, @notes, @uid, NOW())`,
                { id, area: b.area_name || null, title: b.title, content: clean, notes: b.notes || null, uid: req.user.id });
            await recordHistory(id, req.user, 'create', 'maps', null, { title: b.title, id: r.insertId });
        }
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

router.delete('/:id/maps/:mid', requireEqEditor, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const mid = parseInt(req.params.mid, 10);
        const old = await zeq.query(`SELECT title FROM mob_maps WHERE id = @mid AND mob_id = @id`, { mid, id });
        if (!old.length) return fail(res, 'not found', 404);
        await zeq.query(`DELETE FROM mob_maps WHERE id = @mid`, { mid });
        await recordHistory(id, req.user, 'delete', 'maps', { removed: old[0].title }, null);
        await zeq.query(`UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`, { id, uid: req.user.id });
        ok(res, {});
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

// --- HISTORY ---
router.get('/:id/history', requireEqViewer, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = 50;
        const offset = (page - 1) * limit;
        const rows = await zeq.query(
            `SELECT * FROM mob_history WHERE mob_id = @id ORDER BY created DESC LIMIT ${limit} OFFSET ${offset}`,
            { id });
        const countR = await zeq.query(
            `SELECT COUNT(*) AS total FROM mob_history WHERE mob_id = @id`, { id });
        ok(res, { rows, total: countR[0].total, page, limit });
    } catch (e) { console.error(e); fail(res, e.sqlMessage || String(e)); }
});

export const mobs = router;
