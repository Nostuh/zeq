// Equipment catalog merge policy — single source of truth.
//
// "Best-of merge" (docs/equipment-redesign.md): one catalog row per
// normalised (name, wear_slot); when the same item is identified more than
// once, take the most-complete value per stat and RETAIN EVERY RAW TEXT.
//
// Pure (no DB), so every writer shares it: the API (eq_store.mjs),
// scripts/onboard_eq.mjs, and one-off cleanups such as
// scripts/fix_unslotted_items.mjs. onboard_eq used to carry a hand-mirrored
// copy because eq_store opens the API's DB pool on import.

export const STAT_COLS = ['str', 'con', 'dex', 'int', 'wis', 'cha', 'hpr', 'spr',
    'hp', 'sp', 'rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire', 'rcold',
    'racid', 'rasphx', 'rshadow', 'ac'];

// Numeric columns merged by "keep the larger magnitude" (best-of).
export const NUM_COLS = [...STAT_COLS, 'weapon_class_value', 'dmg_pct'];

// Every column a writer stores (in a stable order). `int` is reserved →
// callers backtick it.
export const WRITE_COLS = ['name', 'name_raw', 'wear_slot', 'weapon_class',
    'is_shield', 'hands', 'slot_raw', 'bound', 'needs_review', ...NUM_COLS,
    'dmg_type', 'raw_info', 'eqmob_id'];

// Larger magnitude wins, sign preserved — a penalty must not be lost to a
// 0/positive. Ties keep the existing value.
export function mergeMag(a, b) {
    const x = Number(a) || 0;
    const y = Number(b) || 0;
    return Math.abs(y) > Math.abs(x) ? y : x;
}

// Retain every distinct raw text. The old rule kept only the LONGER text,
// so a longer re-paste silently threw away e.g. the library `lookup` box
// an item was onboarded from — contradicting the design of record.
// Containment is tested on whitespace-collapsed text, so re-pasting the
// same capture (or a subset of what's stored) never duplicates it.
// Distinct texts are joined with a blank line; nothing re-parses raw_info
// (it is display/audit only — the item modal shows it in a <pre>).
export function mergeRawInfo(existing, incoming) {
    const e = String(existing || '');
    const i = String(incoming || '');
    const flat = (t) => t.replace(/\s+/g, ' ').trim();
    const fe = flat(e);
    const fi = flat(i);
    if (!fi || fe.includes(fi)) return e || null;
    if (!fe || fi.includes(fe)) return i;
    return `${e.replace(/\s+$/, '')}\n\n${i.replace(/^\s+/, '')}`;
}

// Best-of merge an incoming record over the existing DB row (or another
// in-memory record). Fields not merged below take the incoming value.
export function mergeRecord(existing, incoming) {
    const m = { ...incoming };
    for (const c of NUM_COLS) m[c] = mergeMag(existing[c], incoming[c]);
    m.dmg_type = existing.dmg_type || incoming.dmg_type || null;
    m.weapon_class = existing.weapon_class || incoming.weapon_class || null;
    m.is_shield = (existing.is_shield || incoming.is_shield) ? 1 : 0;
    m.bound = (existing.bound || incoming.bound) ? 1 : 0;
    m.hands = Math.max(Number(existing.hands) || 1, Number(incoming.hands) || 1);
    m.needs_review = (existing.needs_review && incoming.needs_review) ? 1 : 0;
    m.eqmob_id = existing.eqmob_id ?? incoming.eqmob_id ?? null;
    // slot_raw: keep incoming (the spread above) — audit-only, no readers.
    m.name_raw = (incoming.name_raw || '').length > (existing.name_raw || '').length
        ? incoming.name_raw : existing.name_raw;
    m.raw_info = mergeRawInfo(existing.raw_info, incoming.raw_info);
    return m;
}
