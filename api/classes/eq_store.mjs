// Equipment catalog store. The single place that turns parsed identify
// text into an `eq_items` row (best-of merge) and keeps `eq_item_bonuses`
// in sync. Used by the live /api/equipment/add path; the migration
// (scripts/migrate_eq.mjs) implements the same merge rules in batch.
// See docs/equipment-redesign.md.
//
// NOTE: the catalog upsert builds SQL with zeq.escape() instead of the
// `@name` placeholder shim on purpose — the column set contains
// prefix-colliding names (hp/hpr, sp/spr, name/name_raw) that the shim's
// replaceAll() would corrupt (docs/gotchas.md). All values are escaped,
// so this is injection-safe; column names are fixed constants.

import dbs from '../db.mjs';
import { parseIdentify } from './eq_parse.mjs';

const zeq = dbs.get('zeq');

// Numeric columns merged by "keep the larger magnitude" (best-of).
const NUM_COLS = ['str', 'con', 'dex', 'int', 'wis', 'cha', 'hpr', 'spr',
    'hp', 'sp', 'rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire', 'rcold',
    'racid', 'rasphx', 'rshadow', 'ac', 'weapon_class_value', 'dmg_pct'];

// Every column we write (in a stable order). `int` is reserved → backtick.
const WRITE_COLS = ['name', 'name_raw', 'wear_slot', 'weapon_class',
    'is_shield', 'hands', 'slot_raw', 'bound', 'needs_review', ...NUM_COLS,
    'dmg_type', 'raw_info', 'eqmob_id'];

const ident = c => (c === 'int' ? '`int`' : c);
const mergeMag = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);

// Flatten a parseIdentify() result into a flat column→value record.
function flatten(p, rawInfo, eqmobId) {
    const r = {
        name: p.name, name_raw: p.name_raw, wear_slot: p.wear_slot,
        weapon_class: p.weapon_class, is_shield: p.is_shield ? 1 : 0,
        hands: p.hands, slot_raw: p.slot_raw, bound: p.bound ? 1 : 0,
        needs_review: p.needs_review ? 1 : 0,
        dmg_type: p.dmg_type, raw_info: rawInfo,
        eqmob_id: eqmobId ?? null,
        weapon_class_value: p.weapon_class_value, dmg_pct: p.dmg_pct,
    };
    for (const c of ['str', 'con', 'dex', 'int', 'wis', 'cha', 'hpr', 'spr',
        'hp', 'sp', 'rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire',
        'rcold', 'racid', 'rasphx', 'rshadow', 'ac']) r[c] = p.stats[c];
    return r;
}

// Best-of merge an incoming record over the existing DB row.
function mergeRecord(existing, incoming) {
    const m = { ...incoming };
    for (const c of NUM_COLS) m[c] = mergeMag(Number(existing[c]) || 0, Number(incoming[c]) || 0);
    m.dmg_type = existing.dmg_type || incoming.dmg_type || null;
    m.weapon_class = existing.weapon_class || incoming.weapon_class || null;
    m.is_shield = (existing.is_shield || incoming.is_shield) ? 1 : 0;
    m.bound = (existing.bound || incoming.bound) ? 1 : 0;
    m.hands = Math.max(Number(existing.hands) || 1, incoming.hands);
    m.needs_review = (existing.needs_review && incoming.needs_review) ? 1 : 0;
    m.eqmob_id = existing.eqmob_id ?? incoming.eqmob_id ?? null;
    m.name_raw = (incoming.name_raw || '').length > (existing.name_raw || '').length
        ? incoming.name_raw : existing.name_raw;
    m.raw_info = (incoming.raw_info || '').length > (existing.raw_info || '').length
        ? incoming.raw_info : existing.raw_info;
    return m;
}

// Parse `text` (tagged with `slotRaw`), upsert the catalog row with a
// best-of merge, sync bonuses, and return the item id. Throws if the
// text has no parseable name.
export async function upsertItemFromText(text, slotRaw = '', eqmobId = null) {
    const p = parseIdentify(text, slotRaw);
    if (!p.name) throw new Error('could not parse an item name from the identify text');

    const incoming = flatten(p, String(text || ''), eqmobId);

    const existingRows = await zeq.query(
        'SELECT * FROM eq_items WHERE name = @name AND wear_slot = @wear_slot',
        { name: incoming.name, wear_slot: incoming.wear_slot });

    let id;
    if (existingRows[0]) {
        const m = mergeRecord(existingRows[0], incoming);
        const sets = WRITE_COLS.map(c => `${ident(c)} = ${zeq.escape(m[c] ?? null)}`).join(', ');
        await zeq.query(
            `UPDATE eq_items SET ${sets}, version = version + 1, updated = NOW() WHERE id = ${zeq.escape(existingRows[0].id)}`);
        id = existingRows[0].id;
    } else {
        const cols = WRITE_COLS.map(ident).join(', ');
        const vals = WRITE_COLS.map(c => zeq.escape(incoming[c] ?? null)).join(', ');
        await zeq.query(
            `INSERT INTO eq_items (${cols}, version, created, updated) VALUES (${vals}, 1, NOW(), NOW())`);
        const idRow = await zeq.query(
            'SELECT id FROM eq_items WHERE name = @name AND wear_slot = @wear_slot',
            { name: incoming.name, wear_slot: incoming.wear_slot });
        id = idRow[0].id;
    }

    // Merge bonuses (keep the larger-MAGNITUDE amount per bonus name, sign
    // preserved — a penalty must not be lost to a 0/positive; matches stats).
    for (const b of p.bonuses) {
        await zeq.query(
            `INSERT INTO eq_item_bonuses (item_id, bonus_name, amount) VALUES (@iid, @bn, @amt)
             ON DUPLICATE KEY UPDATE amount = IF(ABS(VALUES(amount)) > ABS(amount), VALUES(amount), amount)`,
            { iid: id, bn: b.bonus_name, amt: b.amount });
    }

    return id;
}
