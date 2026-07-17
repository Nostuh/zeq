// Mob KB shared primitives: edit-history rows, optimistic-lock version
// bumps, and the loot↔equipment bind logic used by BOTH sides of the
// link (POST /api/mobs/:id/loot*, POST /api/equipment/items/:id/mobs)
// and by scripts/migrate_mob_links.mjs. Every function takes a `q`
// object with the @name-placeholder query semantics of api/db.mjs
// (`q.query(sql, params)`); the migration script passes a thin adapter
// over its own mysql2 connection so the logic stays single-sourced.

import { looseKey, lootLooseKey } from './eq_match.mjs';

export async function recordMobHistory(q, mobId, user, action, section, diffJson, snapshot) {
    await q.query(
        `INSERT INTO mob_history (mob_id, user_name, user_id, action, section, diff_json, snapshot, created)
         VALUES (@mob_id, @user_name, @user_id, @action, @section, @diff_json, @snapshot, NOW())`,
        {
            mob_id: mobId,
            user_name: user ? user.name : 'init',
            user_id: user ? user.id : null,
            action,
            section,
            diff_json: diffJson ? JSON.stringify(diffJson) : null,
            snapshot: snapshot ? JSON.stringify(snapshot) : null,
        });
}

export async function bumpMobVersion(q, mobId, userId) {
    await q.query(
        `UPDATE mob_monsters SET version = version + 1, updated_by = @uid, updated = NOW() WHERE id = @id`,
        { id: mobId, uid: userId ?? null });
}

// GAME RULE: an item is dropped by exactly ONE mob. Null the item's link
// on every OTHER mob's loot list (rows survive as free text), with a
// history entry + version bump per affected mob. Returns the affected
// rows so callers can report the move.
export async function unlinkItemElsewhere(q, item, exceptMobId, user = null) {
    const rows = await q.query(
        `SELECT l.id, l.mob_id, m.name AS mob_name
         FROM mob_loot l JOIN mob_monsters m ON m.id = l.mob_id
         WHERE l.equipment_id = @vi AND l.mob_id <> @vm`,
        { vi: item.id, vm: exceptMobId });
    for (const r of rows) {
        await q.query(`UPDATE mob_loot SET equipment_id = NULL WHERE id = @vl`, { vl: r.id });
        await recordMobHistory(q, r.mob_id, user, 'update', 'loot',
            { unlinked: `${item.name} (#${item.id}) — source mob moved` }, null);
        await bumpMobVersion(q, r.mob_id, user ? user.id : null);
    }
    return rows;
}

// Bind a catalog item to a mob's loot list. Reuse-or-insert:
//   a) already linked on this mob → no-op;
//   b) an UNLINKED loot row loose-matches the item name → set its
//      equipment_id (preserves the editor's original free text + slot);
//   c) otherwise insert a fresh loot row named after the catalog item.
// `item` = { id, name, wear_slot }. Records one loot history entry and
// bumps the mob version unless opts.history === false (the migration
// batches its own single history row per mob).
// Single-source rule: if the item is linked to ANOTHER mob,
// opts.onConflict decides — 'move' (default; unlink there, bind here)
// or 'skip' (return {action:'conflict'} — the migration never steals).
// Returns { action: 'exists'|'reused'|'inserted'|'conflict', loot_id?, moved_from? }.
export async function bindLootToItem(q, { mobId, item, slot = null, user = null }, opts = {}) {
    const withHistory = opts.history !== false;

    const linked = await q.query(
        `SELECT id FROM mob_loot WHERE mob_id = @vm AND equipment_id = @vi`,
        { vm: mobId, vi: item.id });
    if (linked[0]) return { action: 'exists', loot_id: linked[0].id };

    let movedFrom = [];
    if (opts.onConflict === 'skip') {
        const elsewhere = await q.query(
            `SELECT m.name FROM mob_loot l JOIN mob_monsters m ON m.id = l.mob_id
             WHERE l.equipment_id = @vi LIMIT 1`, { vi: item.id });
        if (elsewhere[0]) return { action: 'conflict', linked_mob: elsewhere[0].name };
    } else {
        movedFrom = await unlinkItemElsewhere(q, item, mobId, user);
    }

    const itemKey = looseKey(item.name);
    const unlinked = await q.query(
        `SELECT id, item_name FROM mob_loot WHERE mob_id = @vm AND equipment_id IS NULL ORDER BY sort_order, id`,
        { vm: mobId });
    const match = unlinked.find(r => lootLooseKey(r.item_name) === itemKey);

    let action, lootId;
    if (match) {
        await q.query(
            `UPDATE mob_loot SET equipment_id = @vi WHERE id = @vl`,
            { vi: item.id, vl: match.id });
        action = 'reused';
        lootId = match.id;
    } else {
        const r = await q.query(
            `INSERT INTO mob_loot (mob_id, item_name, slot, equipment_id, sort_order)
             VALUES (@vm, @vn, @vs, @vi, 0)`,
            { vm: mobId, vn: item.name, vs: slot || item.wear_slot || null, vi: item.id });
        action = 'inserted';
        lootId = r.insertId;
    }

    if (withHistory) {
        await recordMobHistory(q, mobId, user, 'update', 'loot',
            { linked: `${item.name} (#${item.id})` }, null);
        await bumpMobVersion(q, mobId, user ? user.id : null);
    }
    return { action, loot_id: lootId, moved_from: movedFrom.map(r => r.mob_name) };
}
