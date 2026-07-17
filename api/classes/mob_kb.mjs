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

// Bind a catalog item to a mob's loot list. Reuse-or-insert:
//   a) already linked on this mob → no-op;
//   b) an UNLINKED loot row loose-matches the item name → set its
//      equipment_id (preserves the editor's original free text + slot);
//   c) otherwise insert a fresh loot row named after the catalog item.
// `item` = { id, name, wear_slot }. Records one loot history entry and
// bumps the mob version unless opts.history === false (the migration
// batches its own single history row per mob).
// Returns { action: 'exists'|'reused'|'inserted', loot_id }.
export async function bindLootToItem(q, { mobId, item, slot = null, user = null }, opts = {}) {
    const withHistory = opts.history !== false;

    const linked = await q.query(
        `SELECT id FROM mob_loot WHERE mob_id = @vm AND equipment_id = @vi`,
        { vm: mobId, vi: item.id });
    if (linked[0]) return { action: 'exists', loot_id: linked[0].id };

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
    return { action, loot_id: lootId };
}
