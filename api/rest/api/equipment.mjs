// Equipment catalog API (the redesigned replacement for /api/eq).
// Items are stored structured in eq_items (parsed once at add time);
// "ownership" is a tag in eq_ownership, not a row copy. All endpoints
// require an authenticated session. See docs/equipment-redesign.md.

import express from 'express';
import dbs from '../../db.mjs';
import { requireFlag } from './auth.mjs';
import { upsertItemFromText } from '../../classes/eq_store.mjs';
// Loose matching for /import (chest pastes) + the mob-loot linker; shared
// with scripts/migrate_mob_links.mjs. See eq_match.mjs for the rules.
import { looseKey, pasteLooseKey } from '../../classes/eq_match.mjs';
import { bindLootToItem, recordMobHistory, bumpMobVersion } from '../../classes/mob_kb.mjs';
import { kyaCountsByNames, kyaCandidateName } from '../../classes/kya_extract.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

// Reads require the `equipment` flag; catalog/ownership writes require
// `equipment_edit` (which implies `equipment`). Admins get both. The
// EQ Builder (/build) is compute-only, so it stays at view level.
const viewEq = requireFlag('equipment');
const editEq = requireFlag('equipment_edit');
// Item DETAIL is the shared payload behind the cross-link modal: a Mob KB
// viewer clicking a linked loot item must be able to read it. Flags gate
// the SCREENS and jump buttons, not the read-only context inside the
// modal — so detail accepts any equipment OR eqmobs flag.
const viewAny = requireFlag('equipment', 'equipment_edit', 'eqmobs', 'eqmobs_edit');

// List catalog items. `?q=` filters by name, `?mine=1` restricts to the
// caller's owned items, `?mob=<mob_monsters.id>` to items that mob drops.
// Each row carries an `owned` flag for the caller.
router.get('/items', viewEq, async function(req, res) {
    try {
        const uid = req.user.id;
        const conds = [];
        const params = { uid };
        if (req.query.q) { conds.push('i.name LIKE @q'); params.q = '%' + req.query.q + '%'; }
        if (req.query.mine === '1') conds.push('EXISTS (SELECT 1 FROM eq_ownership o WHERE o.item_id = i.id AND o.user_id = @uid)');
        const mobId = parseInt(req.query.mob, 10);
        if (mobId) { conds.push('EXISTS (SELECT 1 FROM mob_loot l WHERE l.equipment_id = i.id AND l.mob_id = @mob)'); params.mob = mobId; }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const rows = await zeq.query(
            `SELECT i.*,
                    EXISTS (SELECT 1 FROM eq_ownership o WHERE o.item_id = i.id AND o.user_id = @uid) AS owned,
                    em.name AS eqmob_name,
                    (SELECT GROUP_CONCAT(DISTINCT m2.name ORDER BY m2.name SEPARATOR ', ')
                     FROM mob_loot l2 JOIN mob_monsters m2 ON m2.id = l2.mob_id
                     WHERE l2.equipment_id = i.id) AS mob_names,
                    (SELECT GROUP_CONCAT(b.bonus_name SEPARATOR ', ')
                     FROM eq_item_bonuses b WHERE b.item_id = i.id) AS bonus_summary
             FROM eq_items i
             LEFT JOIN eqmobs em ON em.id = i.eqmob_id
             ${where} ORDER BY i.name`, params);
        ok(res, rows);
    } catch (e) { console.error('[equipment/items]', e); fail(res, 'list failed', 500); }
});

// Item detail — the single payload behind the item modal. Bonuses, covers,
// the caller's ownership, PLUS cross-link context: which Mob KB mobs drop
// this item (dropped_by), everything else those mobs drop (siblings), and
// per-mob KYA capture counts so the UI can offer a KYA jump.
router.get('/items/:id', viewAny, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return fail(res, 'bad id');
        const rows = await zeq.query('SELECT * FROM eq_items WHERE id = @id', { id });
        if (!rows[0]) return fail(res, 'not found', 404);
        const item = rows[0];
        item.bonuses = await zeq.query(
            'SELECT bonus_name, amount FROM eq_item_bonuses WHERE item_id = @id ORDER BY amount DESC, bonus_name', { id });
        item.covers = (await zeq.query(
            'SELECT wear_slot FROM eq_item_covers WHERE item_id = @id ORDER BY wear_slot', { id }))
            .map(r => r.wear_slot);
        const own = await zeq.query(
            'SELECT note FROM eq_ownership WHERE item_id = @id AND user_id = @uid', { id, uid: req.user.id });
        item.owned = own.length > 0;
        item.own_note = own[0] ? own[0].note : null;

        // Legacy source-mob label (eq_items.eqmob_id → eqmobs) — display
        // fallback until every item is linked through mob_loot.
        item.eqmob_name = null;
        if (item.eqmob_id) {
            const em = await zeq.query('SELECT name FROM eqmobs WHERE id = @id', { id: item.eqmob_id });
            item.eqmob_name = em[0] ? em[0].name : null;
        }

        // Mob KB links.
        item.dropped_by = await zeq.query(
            `SELECT l.id AS loot_id, l.slot AS loot_slot,
                    m.id AS mob_id, m.name AS mob_name, m.short_name, m.area
             FROM mob_loot l JOIN mob_monsters m ON m.id = l.mob_id
             WHERE l.equipment_id = @id ORDER BY m.name`, { id });

        item.siblings = [];
        if (item.dropped_by.length) {
            const sp = {};
            const sph = item.dropped_by.map((d, i) => {
                const p = 'sm' + String(i).padStart(4, '0');
                sp[p] = d.mob_id;
                return '@' + p;
            });
            item.siblings = await zeq.query(
                `SELECT l.mob_id, l.id AS loot_id, l.item_name, l.slot, l.equipment_id
                 FROM mob_loot l WHERE l.mob_id IN (${sph.join(',')})
                 ORDER BY l.mob_id, l.sort_order, l.id`, sp);

            // KYA availability per dropping mob (name-string correlation).
            const kyaCounts = await kyaCountsByNames(zeq,
                item.dropped_by.flatMap(d => [d.mob_name, d.short_name].filter(Boolean)));
            for (const d of item.dropped_by) {
                const nameKey = kyaCandidateName(d.mob_name).toLowerCase();
                const shortKey = d.short_name ? kyaCandidateName(d.short_name).toLowerCase() : null;
                if (kyaCounts.get(nameKey)) {
                    d.kya_count = kyaCounts.get(nameKey);
                    d.kya_name = kyaCandidateName(d.mob_name);
                } else if (shortKey && kyaCounts.get(shortKey)) {
                    d.kya_count = kyaCounts.get(shortKey);
                    d.kya_name = kyaCandidateName(d.short_name);
                } else {
                    d.kya_count = 0;
                    d.kya_name = null;
                }
            }
        }
        ok(res, item);
    } catch (e) { console.error('[equipment/items/:id]', e); fail(res, 'detail failed', 500); }
});

// Update an item's note. Notes and links are the only editable fields —
// parsed stats stay parser-owned (raw_info is the source of truth).
router.post('/items/:id/note', editEq, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return fail(res, 'bad id');
        const r = await zeq.query(
            `UPDATE eq_items SET note = @vn, version = version + 1, updated = NOW() WHERE id = @vh`,
            { vn: (req.body && req.body.note || '').trim() || null, vh: id });
        if (!r.affectedRows) return fail(res, 'not found', 404);
        ok(res, {});
    } catch (e) { console.error('[equipment/note]', e); fail(res, 'note failed', 500); }
});

// Bind this item into a mob's loot list (the item-side quick-link).
router.post('/items/:id/mobs', editEq, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const mobId = parseInt(req.body && req.body.mob_id, 10);
        if (!id || !mobId) return fail(res, 'id and mob_id are required');
        const items = await zeq.query('SELECT id, name, wear_slot FROM eq_items WHERE id = @id', { id });
        if (!items[0]) return fail(res, 'item not found', 404);
        const mobsR = await zeq.query('SELECT id FROM mob_monsters WHERE id = @id', { id: mobId });
        if (!mobsR[0]) return fail(res, 'mob not found', 404);
        const result = await bindLootToItem(zeq, {
            mobId, item: items[0],
            slot: (req.body && req.body.slot || '').trim() || null,
            user: req.user,
        });
        ok(res, result);
    } catch (e) { console.error('[equipment/items/mobs]', e); fail(res, 'link failed', 500); }
});

// Unbind from the item side: null the loot row's equipment_id but KEEP the
// row as free text — the Mob KB owns the loot list; the item side only
// manages the link.
router.delete('/items/:id/mobs/:loot_id', editEq, async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const lootId = parseInt(req.params.loot_id, 10);
        if (!id || !lootId) return fail(res, 'bad id');
        const rows = await zeq.query(
            `SELECT l.mob_id, l.item_name, i.name AS eq_name
             FROM mob_loot l JOIN eq_items i ON i.id = l.equipment_id
             WHERE l.id = @vl AND l.equipment_id = @vi`, { vl: lootId, vi: id });
        if (!rows[0]) return fail(res, 'link not found', 404);
        await zeq.query(
            `UPDATE mob_loot SET equipment_id = NULL WHERE id = @vl AND equipment_id = @vi`,
            { vl: lootId, vi: id });
        await recordMobHistory(zeq, rows[0].mob_id, req.user, 'update', 'loot',
            { unlinked: `${rows[0].eq_name} (#${id})` }, null);
        await bumpMobVersion(zeq, rows[0].mob_id, req.user.id);
        ok(res, {});
    } catch (e) { console.error('[equipment/items/unlink]', e); fail(res, 'unlink failed', 500); }
});

// Mob KB picker feed for the item-side binder + Add Equipment. Lives HERE
// (not /api/mobs) so it's gated by the SOURCE screen's flag — an equipment
// editor without `eqmobs` can still pick a mob to bind against.
router.get('/mobs', viewEq, async function(req, res) {
    try {
        const q = (req.query.q || '').trim();
        const params = {};
        let where = '';
        if (q) { where = 'WHERE name LIKE @q OR short_name LIKE @q'; params.q = '%' + q + '%'; }
        ok(res, await zeq.query(
            `SELECT id, name, area FROM mob_monsters ${where} ORDER BY name LIMIT 50`, params));
    } catch (e) { console.error('[equipment/mobs]', e); fail(res, 'list failed', 500); }
});

// Paste identify text → parse + best-of-merge into the catalog, then tag
// the caller as an owner. Replaces the legacy /api/eq/add + copy_to_user.
// Optional `mob_id` (Mob KB) binds the item into that mob's loot list;
// the legacy `eqmob` label is retired — new adds never write eqmob_id
// (existing rows keep theirs through the merge).
router.post('/add', editEq, async function(req, res) {
    try {
        const body = req.body || {};
        // Trim first so a whitespace-only paste is rejected here with a clear
        // message rather than falling through to the parser. upsertItemFromText
        // additionally throws if the text yields no item name, so an "empty
        // item" cannot be created by either path.
        const info = (body.info || '').trim();
        const slot = (body.slot || '').trim();
        const { note } = body;
        if (!info || !slot) return fail(res, 'info and slot are required');
        const id = await upsertItemFromText(info, slot, null);
        await zeq.query(
            `INSERT IGNORE INTO eq_ownership (user_id, item_id, note, created)
             VALUES (@uid, @id, @note, NOW())`,
            { uid: req.user.id, id, note: (note || '').trim() || null });
        const mobId = parseInt(body.mob_id, 10);
        if (mobId) {
            const mobsR = await zeq.query('SELECT id FROM mob_monsters WHERE id = @id', { id: mobId });
            if (mobsR[0]) {
                const items = await zeq.query('SELECT id, name, wear_slot FROM eq_items WHERE id = @id', { id });
                await bindLootToItem(zeq, { mobId, item: items[0], user: req.user });
            }
        }
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

// The legacy /eqmobs picker endpoints are retired — source mobs now come
// from the Mob KB via GET /mobs above. The legacy `eqmobs` table itself is
// untouched (no-drop rule); eq_items.eqmob_id remains as frozen provenance.

export const equipment = router;
