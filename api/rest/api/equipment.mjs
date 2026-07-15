// Equipment catalog API (the redesigned replacement for /api/eq).
// Items are stored structured in eq_items (parsed once at add time);
// "ownership" is a tag in eq_ownership, not a row copy. All endpoints
// require an authenticated session. See docs/equipment-redesign.md.

import express from 'express';
import dbs from '../../db.mjs';
import { requireFlag } from './auth.mjs';
import { upsertItemFromText } from '../../classes/eq_store.mjs';
import { normalizeName } from '../../classes/eq_parse.mjs';

// Loose matching for /import (mirrors the Chest Sorter's client grouping so a
// pasted STACK/plural form matches the catalog's singular name). We strip a
// leading count word, run the same name normalisation the catalog used at store
// time, then compute a "loose key": drop a leading article and de-pluralise
// every word (the game pluralises the head noun anywhere, sometimes doubled).
// Applied to BOTH the pasted name and the catalog name so they meet in the
// middle: "Two Bracerses of Wrath" and "Bracers of Wrath" → "bracer of wrath".
const IMPORT_NUMBER_RE = /^(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+/i;
function depluralWord(w) {
    let x = w;
    for (let i = 0; i < 3; i++) {
        if (x.length > 3 && /ies$/i.test(x)) { x = x.slice(0, -3) + 'y'; continue; }
        if (x.length > 3 && /(ses|xes|zes|ches|shes)$/i.test(x)) { x = x.slice(0, -2); continue; }
        if (x.length > 2 && /[^s]s$/i.test(x)) { x = x.slice(0, -1); continue; }
        break;
    }
    return x;
}
function looseKey(name) {
    return String(name).toLowerCase()
        .replace(/^(a|an|the)\s+/, '')
        .split(/\s+/).map(depluralWord).join(' ')
        .replace(/\s+/g, ' ').trim();
}
// Loose key for a raw pasted item name (strip count word, normalise, loosen).
function pasteLooseKey(raw) {
    return looseKey(normalizeName(String(raw || '').replace(IMPORT_NUMBER_RE, '')).name);
}

const router = express.Router();
const zeq = dbs.get('zeq');

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

// Reads require the `equipment` flag; catalog/ownership writes require
// `equipment_edit` (which implies `equipment`). Admins get both. The
// EQ Builder (/build) is compute-only, so it stays at view level.
const viewEq = requireFlag('equipment');
const editEq = requireFlag('equipment_edit');

// List catalog items. `?q=` filters by name, `?mine=1` restricts to the
// caller's owned items. Each row carries an `owned` flag for the caller.
router.get('/items', viewEq, async function(req, res) {
    try {
        const uid = req.user.id;
        const conds = [];
        const params = { uid };
        if (req.query.q) { conds.push('i.name LIKE @q'); params.q = '%' + req.query.q + '%'; }
        if (req.query.mine === '1') conds.push('EXISTS (SELECT 1 FROM eq_ownership o WHERE o.item_id = i.id AND o.user_id = @uid)');
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const rows = await zeq.query(
            `SELECT i.*,
                    EXISTS (SELECT 1 FROM eq_ownership o WHERE o.item_id = i.id AND o.user_id = @uid) AS owned,
                    em.name AS eqmob_name,
                    (SELECT GROUP_CONCAT(b.bonus_name SEPARATOR ', ')
                     FROM eq_item_bonuses b WHERE b.item_id = i.id) AS bonus_summary
             FROM eq_items i
             LEFT JOIN eqmobs em ON em.id = i.eqmob_id
             ${where} ORDER BY i.name`, params);
        ok(res, rows);
    } catch (e) { console.error('[equipment/items]', e); fail(res, 'list failed', 500); }
});

// Item detail incl. open-ended bonuses + the caller's ownership flag.
router.get('/items/:id', viewEq, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return fail(res, 'bad id');
        const rows = await zeq.query('SELECT * FROM eq_items WHERE id = @id', { id });
        if (!rows[0]) return fail(res, 'not found', 404);
        const item = rows[0];
        item.bonuses = await zeq.query(
            'SELECT bonus_name, amount FROM eq_item_bonuses WHERE item_id = @id ORDER BY amount DESC, bonus_name', { id });
        const own = await zeq.query(
            'SELECT note FROM eq_ownership WHERE item_id = @id AND user_id = @uid', { id, uid: req.user.id });
        item.owned = own.length > 0;
        item.own_note = own[0] ? own[0].note : null;
        ok(res, item);
    } catch (e) { console.error('[equipment/items/:id]', e); fail(res, 'detail failed', 500); }
});

// Paste identify text → parse + best-of-merge into the catalog, then tag
// the caller as an owner. Replaces the legacy /api/eq/add + copy_to_user.
router.post('/add', editEq, async function(req, res) {
    try {
        const body = req.body || {};
        // Trim first so a whitespace-only paste is rejected here with a clear
        // message rather than falling through to the parser. upsertItemFromText
        // additionally throws if the text yields no item name, so an "empty
        // item" cannot be created by either path.
        const info = (body.info || '').trim();
        const slot = (body.slot || '').trim();
        const { eqmob, note } = body;
        if (!info || !slot) return fail(res, 'info and slot are required');
        const id = await upsertItemFromText(info, slot, eqmob ?? null);
        await zeq.query(
            `INSERT IGNORE INTO eq_ownership (user_id, item_id, note, created)
             VALUES (@uid, @id, @note, NOW())`,
            { uid: req.user.id, id, note: (note || '').trim() || null });
        ok(res, { id });
    } catch (e) { console.error('[equipment/add]', e); fail(res, e.message || 'add failed'); }
});

// Bulk-own from pasted chest contents (Import Equipment page). Takes a list of
// item names, matches each against the catalog by normalised name, and tags the
// caller as an owner of every match. Requires VIEW access (equipment) — tagging
// what YOU have is a personal action, not a catalog edit. Returns which items
// were newly tagged, which were already owned, and which names weren't found.
router.post('/import', viewEq, async function(req, res) {
    try {
        const uid = req.user.id;
        const names = Array.isArray(req.body && req.body.names) ? req.body.names.slice(0, 5000) : [];
        if (!names.length) return fail(res, 'names is required');

        // Index the catalog by loose key (first row wins per key).
        const catalog = await zeq.query('SELECT id, name FROM eq_items');
        const byLoose = new Map();
        for (const row of catalog) { const k = looseKey(row.name); if (k && !byLoose.has(k)) byLoose.set(k, row); }

        // Resolve each unique pasted item to a catalog row (or not-found).
        const seen = new Set();
        const matches = [];
        const notFound = [];
        for (const raw of names) {
            const k = pasteLooseKey(raw);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            const row = byLoose.get(k);
            if (row) matches.push(row); else notFound.push(raw);
        }

        // Which of the matched item ids does the caller already own?
        let owned = new Set();
        if (matches.length) {
            const op = { uid };
            const oph = matches.map((r, i) => { const p = 'oid' + String(i).padStart(4, '0'); op[p] = r.id; return '@' + p; });
            const have = await zeq.query(
                `SELECT item_id FROM eq_ownership WHERE user_id = @uid AND item_id IN (${oph.join(',')})`, op);
            owned = new Set(have.map((h) => h.item_id));
        }

        const addedItems = [];
        const alreadyOwnedItems = [];
        for (const r of matches) {
            if (owned.has(r.id)) { alreadyOwnedItems.push(r.name); continue; }
            await zeq.query(
                `INSERT IGNORE INTO eq_ownership (user_id, item_id, note, created)
                 VALUES (@uid, @id, NULL, NOW())`, { uid, id: r.id });
            addedItems.push(r.name);
        }

        ok(res, {
            added: addedItems.length,
            addedItems: [...new Set(addedItems)].sort(),
            alreadyOwned: alreadyOwnedItems.length,
            alreadyOwnedItems: [...new Set(alreadyOwnedItems)].sort(),
            notFound: notFound.sort(),
        });
    } catch (e) { console.error('[equipment/import]', e); fail(res, 'import failed', 500); }
});

// Tag / untag ownership of an existing catalog item.
router.post('/items/:id/own', editEq, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return fail(res, 'bad id');
        const exists = await zeq.query('SELECT id FROM eq_items WHERE id = @id', { id });
        if (!exists[0]) return fail(res, 'not found', 404);
        await zeq.query(
            `INSERT INTO eq_ownership (user_id, item_id, note, created) VALUES (@uid, @id, @note, NOW())
             ON DUPLICATE KEY UPDATE note = VALUES(note)`,
            { uid: req.user.id, id, note: (req.body && req.body.note || '').trim() || null });
        ok(res, { owned: true });
    } catch (e) { console.error('[equipment/own]', e); fail(res, 'tag failed', 500); }
});

router.delete('/items/:id/own', editEq, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return fail(res, 'bad id');
        await zeq.query('DELETE FROM eq_ownership WHERE user_id = @uid AND item_id = @id',
            { uid: req.user.id, id });
        ok(res, { owned: false });
    } catch (e) { console.error('[equipment/unown]', e); fail(res, 'untag failed', 500); }
});

// Numeric columns a build can weight / total.
const NUM_COLS = ['str', 'con', 'dex', 'int', 'wis', 'cha', 'hpr', 'spr',
    'hp', 'sp', 'rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire', 'rcold',
    'racid', 'rasphx', 'rshadow', 'ac', 'weapon_class_value', 'dmg_pct'];

// One item per wear slot, except finger (2) and wield (2). A two-handed
// weapon is NOT assumed to fill both wield slots — slots are independent.
const SLOT_CAPACITY = {
    head: 1, neck: 1, cloak: 1, amulet: 1, torso: 1, arms: 1, hands: 1,
    belt: 1, legs: 1, feet: 1, held: 1, finger: 2, wield: 2,
};

const scoreItem = (item, weights) =>
    NUM_COLS.reduce((s, c) => s + (weights[c] || 0) * (Number(item[c]) || 0), 0);

// EQ Builder: pick the best gear set from the caller's OWNED items that
// maximizes a weighted sum of stats. Per-slot greedy (take the top-N by
// score for each slot's capacity) — optimal while slots are independent.
// Body: { weights: { str: 2, con: 1, ... } }. See docs/equipment-redesign.md.
router.post('/build', viewEq, async function(req, res) {
    try {
        const raw = (req.body && req.body.weights) || {};
        const weights = {};
        for (const c of NUM_COLS) if (raw[c] != null && !isNaN(Number(raw[c]))) weights[c] = Number(raw[c]);
        if (!Object.keys(weights).length) return fail(res, 'provide at least one stat weight');

        const items = await zeq.query(
            `SELECT i.* FROM eq_items i
             JOIN eq_ownership o ON o.item_id = i.id AND o.user_id = @uid`, { uid: req.user.id });

        const bySlot = new Map();
        const multiItems = [];   // cover multiple wear slots — not auto-placed
        let unplaced = 0;
        for (const it of items) {
            if (it.wear_slot === 'multi') { multiItems.push(it); continue; }
            if (!SLOT_CAPACITY[it.wear_slot]) { unplaced++; continue; }
            if (!bySlot.has(it.wear_slot)) bySlot.set(it.wear_slot, []);
            bySlot.get(it.wear_slot).push(it);
        }

        const picks = [];
        const totals = Object.fromEntries(NUM_COLS.map(c => [c, 0]));
        let score = 0;
        // Take the top `cap` of `list` for `slot`, appending after `startIdx`.
        const place = (slot, list, cap, startIdx = 0) => {
            (list || []).map(it => ({ it, s: scoreItem(it, weights) }))
                .sort((a, b) => b.s - a.s).slice(0, cap)
                .forEach((c, i) => {
                    picks.push({
                        wear_slot: slot, slot_index: startIdx + i + 1, item_score: c.s,
                        id: c.it.id, name: c.it.name, weapon_class: c.it.weapon_class,
                        is_shield: c.it.is_shield, hands: c.it.hands,
                        ...Object.fromEntries(NUM_COLS.map(k => [k, Number(c.it[k]) || 0])),
                    });
                    for (const k of NUM_COLS) totals[k] += Number(c.it[k]) || 0;
                    score += c.s;
                });
        };

        for (const [slot, cap] of Object.entries(SLOT_CAPACITY)) {
            if (slot === 'wield') continue; // handled below per wield mode
            place(slot, bySlot.get(slot), cap);
        }

        // Wield mode: 'dual' = two best weapons, 'shield' = best weapon +
        // best shield, 'shield_only' = best shield (no weapon), 'none' =
        // skip wield entirely (no weapons/shields — e.g. a caster build).
        const wieldMode = ['dual', 'shield', 'shield_only', 'none'].includes(req.body && req.body.wield)
            ? req.body.wield : 'dual';
        const wield = bySlot.get('wield') || [];
        const weapons = wield.filter(i => !i.is_shield);
        const shields = wield.filter(i => i.is_shield);
        if (wieldMode === 'dual') place('wield', weapons, 2);
        else if (wieldMode === 'shield') { place('wield', weapons, 1, 0); place('wield', shields, 1, 1); }
        else if (wieldMode === 'shield_only') place('wield', shields, 1);
        // 'none' → no wield picks

        // Multi-slot items (battlesuits, robes) are IGNORED for now: the
        // builder can't place them until we record which wear slots each one
        // occupies — the identify text doesn't say and we haven't collected
        // that data yet. Reported as a count only. See equipment-redesign.md.
        ok(res, { weights, wield: wieldMode, picks, totals, score, unplaced,
            owned: items.length, multiIgnored: multiItems.length });
    } catch (e) { console.error('[equipment/build]', e); fail(res, 'build failed', 500); }
});

// EQ mob lookup (still backed by the legacy `eqmobs` table; the catalog
// references it via eq_items.eqmob_id).
router.get('/eqmobs', viewEq, async function(req, res) {
    try {
        ok(res, await zeq.query('SELECT id, name FROM eqmobs ORDER BY name'));
    } catch (e) { console.error('[equipment/eqmobs]', e); fail(res, 'list failed', 500); }
});

router.post('/eqmobs', editEq, async function(req, res) {
    try {
        const name = (req.body && req.body.name || '').trim();
        if (!name) return fail(res, 'name is required');
        // Dedup without a schema change to the legacy MyISAM table.
        await zeq.query(
            `INSERT INTO eqmobs (name) SELECT @name FROM DUAL
             WHERE NOT EXISTS (SELECT 1 FROM eqmobs WHERE name = @name)`, { name });
        const row = await zeq.query('SELECT id, name FROM eqmobs WHERE name = @name', { name });
        ok(res, row[0]);
    } catch (e) { console.error('[equipment/eqmobs add]', e); fail(res, 'add failed', 500); }
});

export const equipment = router;
