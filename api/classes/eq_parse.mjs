// Equipment identify-text parser — single source of truth.
//
// Turns the raw in-game "identify" text (what players paste into the
// Equipment Add form) into a structured item record. Used by BOTH the
// live add endpoint and scripts/migrate_eq.mjs, so the two can never
// diverge (the old design re-implemented this in two Vue files that
// drifted). See docs/equipment-redesign.md.
//
// Fixes carried over from the legacy Equipment.vue parser:
//  - max-HP no longer shadowed by hpr ("hitpoints" matched "hitpoint")
//  - weapon class keeps its real tier instead of a hard-coded 40
//  - name normalization strips <Bound>/<tm>/decay states and extracts
//    the (1h)/(2h) hand marker, so dedup by name actually works.

// Adverb → magnitude (the in-game stat scale). 0..20 linear, then the
// non-linear top end. A miss returns null (line carries no magnitude).
const AMOUNT_SCALE = [
    ['non-existently', 0], ['unnoticably', 1], ['pathetically', 2],
    ['pitifully', 3], ['a tiny bit', 4], ['poorly', 5], ['a bit', 6],
    ['slightly', 7], ['somewhat', 8], ['noticably', 9], ['adequately', 10],
    ['an average amount', 11], ['a good amount', 12], ['nicely', 13],
    ['strongly', 14], ['impressively', 15], ['superbly', 16],
    ['tremendously', 17], ['magnificantly', 18], ['magnificently', 18],
    ['astoundingly', 19], ['unbelievably much', 20], ['impossibly much', 30],
    ['immensely', 31], ['phenomenally', 33], ['ILLEGALLY', 50],
];

// "<adjective> in general" → armour-class / weapon-class tier.
const AC_SCALE = [
    ['negative in general', -1], ['almost non-existent in general', 1],
    ['non-existent in general', 0], ['pathetic in general', 2],
    ['tiny in general', 3], ['feeble in general', 4], ['little in general', 5],
    ['poor in general', 6], ['low in general', 7], ['mediocre in general', 8],
    ['decent in general', 9], ['adequate in general', 10],
    ['average in general', 11], ['good in general', 12], ['nice in general', 13],
    ['excellent in general', 14], ['superb in general', 15],
    ['unbelievable in general', 16],
];

// Substring → stat column. ORDER MATTERS: longer/more-specific phrases
// first so "hitpoints" (max HP) is not eaten by "hitpoint" (regen).
const STAT_PATTERNS = [
    ["user's strength", 'str'], ["user's constitution", 'con'],
    ["user's dexterity", 'dex'], ["user's intelligence", 'int'],
    ["user's wisdom", 'wis'], ["user's charisma", 'cha'],
    ["user's hitpoint regeneration", 'hpr'],
    ["user's spellpoint regeneration", 'spr'],
    ["user's hitpoints", 'hp'], ["user's spellpoints", 'sp'],
    ["user's physical resistance", 'rphys'],
    ["user's electric resistance", 'relec'],
    ["user's psionic resistance", 'rpsi'],
    ["user's magical resistance", 'rmag'],
    ["user's acid resistance", 'racid'],
    ["user's poison resistance", 'rpoi'],
    ["user's fire resistance", 'rfire'],
    ["user's cold resistance", 'rcold'],
    ["user's asphyxiation resistance", 'rasphx'],
];

const DMG_TYPES = [
    ['psionic', 'psi'], ['electric', 'elec'], ['acid', 'acid'],
    ['cold', 'cold'], ['fire', 'fire'], ['poison', 'poi'],
    ['asphyxiation', 'asph'], ['magical', 'mag'],
];

function scaleLookup(table, line) {
    for (const [needle, val] of table) {
        if (line.includes(needle)) return val;
    }
    return null;
}

// Map a legacy `slot` value to the redesigned wear-slot model.
// Weapons AND shields live in the `wield` slot (two wield slots exist);
// weapon class is an attribute, not a slot. `multi` is NOT a weapon —
// it's an item that covers MULTIPLE wear slots (battlesuits, robes), so
// it gets its own `multi` wear_slot. Ambiguous values flag for human
// review rather than guess.
const BODY_SLOTS = new Set(['head', 'neck', 'cloak', 'amulet', 'torso',
    'arms', 'hands', 'belt', 'legs', 'feet', 'held', 'finger']);
const WEAPON_CLASSES = new Set(['axe', 'sword', 'dagger', 'bow', 'ancient',
    'polearm', 'bludgeon', 'staff']);

export function classifySlot(slotRaw) {
    const s = (slotRaw || '').trim().toLowerCase();
    if (BODY_SLOTS.has(s)) return { wear_slot: s, weapon_class: null, is_shield: 0, needs_review: 0 };
    if (s === 'multi') return { wear_slot: 'multi', weapon_class: null, is_shield: 0, needs_review: 0 };
    if (s === 'wield') return { wear_slot: 'wield', weapon_class: null, is_shield: 0, needs_review: 1 };
    if (s === 'shield') return { wear_slot: 'wield', weapon_class: null, is_shield: 1, needs_review: 0 };
    if (WEAPON_CLASSES.has(s)) return { wear_slot: 'wield', weapon_class: s, is_shield: 0, needs_review: 0 };
    if (s === 'wand') return { wear_slot: 'held', weapon_class: null, is_shield: 0, needs_review: 1 };
    // empty / unknown — cannot classify
    return { wear_slot: s, weapon_class: null, is_shield: 0, needs_review: 1 };
}

// Strip noise from the first identify line so dedup-by-name works.
// Returns { name, name_raw, bound, hands }.
export function normalizeName(firstLine) {
    const name_raw = (firstLine || '').trim();
    let n = name_raw;

    // Timur lookup wrapper: Timur tells you 'This is all I can find on "X".'
    const timur = n.match(/can find on\s+"(.+?)"/i);
    if (timur) n = timur[1];

    n = n.replace(/\s*seems to vibrate rapidly\.?\s*$/i, '');

    const bound = /<bound>/i.test(n) ? 1 : 0;
    const hands = /\(2h\)/i.test(n) ? 2 : 1;

    // Remove angle-bracket tags (<Bound>, <tm>, ...).
    n = n.replace(/<[^>]*>/g, ' ');
    // Remove the hand markers and trailing lowercase decay states
    // ((1h), (2h), (dusty), (glowing), (humming) ...). Item names rarely
    // end in a lowercase parenthetical, so this is safe in practice.
    n = n.replace(/\((?:1h|2h)\)/gi, ' ');
    n = n.replace(/\s*\([a-z][a-z ]{0,24}\)\s*$/i, ' ');

    n = n.replace(/\s+/g, ' ').trim();
    return { name: n, name_raw, bound, hands };
}

// Parse one full identify block. `slotRaw` is the slot the user tagged
// it with (radio button); the text itself does not name the slot.
export function parseIdentify(text, slotRaw = '') {
    const lines = String(text || '').split('\n').map(l => l.trim());
    const first = lines.find(l => l.length) || '';
    const { name, name_raw, bound, hands } = normalizeName(first);
    const slot = classifySlot(slotRaw);

    const stats = {
        str: 0, con: 0, dex: 0, int: 0, wis: 0, cha: 0,
        hpr: 0, spr: 0, hp: 0, sp: 0,
        rphys: 0, rpsi: 0, relec: 0, rmag: 0, rpoi: 0,
        rfire: 0, rcold: 0, racid: 0, rasphx: 0,
        ac: 0,
    };
    let weapon_class_value = 0;
    let dmg_pct = 0;
    let dmg_type = null;
    const bonuses = [];

    for (const line of lines) {
        if (!line) continue;
        const neg = /\bdecreases\b/.test(line);

        // Elemental damage: "It does fire damage." + magnitude elsewhere.
        let matchedDmg = false;
        for (const [word, code] of DMG_TYPES) {
            if (line.includes(`does ${word} damage`)) {
                dmg_type = code;
                const a = scaleLookup(AMOUNT_SCALE, line);
                if (a !== null) dmg_pct = Math.round(a * 2.5);
                matchedDmg = true;
                break;
            }
        }
        if (matchedDmg) continue;

        // Physical weapon class: keep the real tier (was hard-coded 40).
        if (line.includes('weapon class')) {
            const wc = scaleLookup(AC_SCALE, line);
            if (wc !== null) weapon_class_value = wc;
            continue;
        }

        // Armour class: "It has <adj> armour class for its type (<tier> in general)."
        if (line.includes('armour class for')) {
            const ac = scaleLookup(AC_SCALE, line);
            if (ac !== null) stats.ac = ac;
            continue;
        }

        // Open-ended skill/spell bonus lines.
        if (line.includes("bonus to user's")) {
            const m = line.match(/bonus to user's\s+(.+?)\.?\s*$/i);
            if (m) bonuses.push({ bonus_name: m[1].trim(), amount: scaleLookup(AMOUNT_SCALE, line) || 0 });
            continue;
        }

        // Fixed stat columns.
        const stat = scaleLookup(STAT_PATTERNS, line);
        if (!stat) continue;
        let amt = scaleLookup(AMOUNT_SCALE, line);
        if (amt === null) continue;
        if (stat === 'hp' || stat === 'sp') amt *= 10; // scale is in tens
        stats[stat] = neg ? -amt : amt;
    }

    return {
        name, name_raw, bound,
        wear_slot: slot.wear_slot,
        weapon_class: slot.weapon_class,
        is_shield: slot.is_shield,
        hands,
        slot_raw: slotRaw,
        needs_review: slot.needs_review,
        stats,
        weapon_class_value,
        dmg_pct,
        dmg_type,
        bonuses,
    };
}

export const _scales = { AMOUNT_SCALE, AC_SCALE, STAT_PATTERNS };
