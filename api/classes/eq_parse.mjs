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
    ['astoundingly', 19], ['unbelievably much', 20],
    // Superlatives ABOVE the /20 band — surfaced by library armour/jewellery
    // data, printed with NO "(n/20)" annotation, so their exact magnitude is
    // unknown. Values are ESTIMATES (ascending, slotted into the 20..30 gap)
    // flagged for review, same convention as the AC_SCALE weapon-tier
    // estimates above. Correct the integers if the real ladder surfaces.
    // See docs/manual-onboard.md "Open follow-ups".
    ['monumentally', 22], ['colossally', 24], ['unearthly', 26], ['divinely', 28],
    ['impossibly much', 30],
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
    // Tiers surfaced by real WEAPON data (the armour-only scale above never
    // saw them). Values are ESTIMATES — flagged for review; the exact game
    // numbers are unknown, these only need to rank weapon_class_value
    // sensibly. weak≈low end; great/tremendous≈high end (great from the
    // top "incredible" per-type rating). Correct the integers if the real
    // scale surfaces. See docs/manual-onboard.md "Open follow-ups".
    ['weak in general', 5], ['great in general', 14], ['tremendous in general', 15],
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
    ["user's magic resistance", 'rmag'],   // game prints both phrasings
    ["user's acid resistance", 'racid'],
    ["user's poison resistance", 'rpoi'],
    ["user's fire resistance", 'rfire'],
    ["user's cold resistance", 'rcold'],
    ["user's asphyxiation resistance", 'rasphx'],
    ["user's shadow resistance", 'rshadow'],  // shadow is a known damage element (DMG_TYPES)
];

const DMG_TYPES = [
    ['psionic', 'psi'], ['electric', 'elec'], ['acid', 'acid'],
    ['cold', 'cold'], ['fire', 'fire'], ['poison', 'poi'],
    ['asphyxiation', 'asph'], ['magical', 'mag'], ['shadow', 'shadow'],
];

// Skill/spell bonus magnitude in the library "lookup" format
// ("It gives <quality> bonus to the skill 'X'."). The in-game scale is a
// 6-step quality ladder (see docs/manual-onboard.md) — DISTINCT from the
// stat adverbs above and shown with no number. Stored ordinally 1..6;
// order is all the builder ranks on, so swap in real values if they
// ever surface. Identify text uses the older "bonus to user's X" line,
// still handled separately below.
const SKILL_MAP = { tiny: 1, small: 2, decent: 3, nice: 4, great: 5, awesome: 6 };

// A library "lookup" box rule line: `*-----...-----*`.
const RULE_RE = /^\*-{2,}\*$/;

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
    'polearm', 'bludgeon', 'staff', 'instrument']);

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

    // Equip-location prefix: pasting a worn/wielded item (e.g. straight from
    // the in-game equipment screen) prefixes the name with where it sits,
    // "Wielded in right hand: <name>" / "Wielded in both hands: <name>". Strip
    // it so the item dedups against its plain identify instead of spawning a
    // second catalog row; "both hands" also implies a two-hander. (Bug: these
    // leaked through, see docs/equipment-redesign.md "Phase 2" known edge.)
    const wield = n.match(/^\s*Wielded in (right hand|left hand|both hands)\s*:\s*/i);
    if (wield) n = n.slice(wield[0].length);

    n = n.replace(/\s*seems to vibrate rapidly\.?\s*$/i, '');

    const bound = /<bound>/i.test(n) ? 1 : 0;
    const hands = (/\(2h\)/i.test(n) || (wield && /both/i.test(wield[1]))) ? 2 : 1;

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

// Split a "lookup" capture that holds MANY items (one `manual_onboard`
// drop file = a pile of pasted `lookup <name>` blocks) into one text per
// item. A block is the box header `*--*` / `| name |` / `*--*` plus the
// body up to the next header. Anything before the first header (command
// echoes, blank lines) is discarded. Each returned chunk starts at its
// rule line, so parseIdentify() lifts the name from the box. A single
// identify paste (no box) yields []; feed those straight to parseIdentify.
export function splitLibraryBlocks(text) {
    const src = String(text || '');
    const headerRe = /(^|\n)[ \t]*\*-{2,}\*[ \t]*\n[ \t]*\|[^\n]*\|[ \t]*\n[ \t]*\*-{2,}\*[ \t]*(?=\n|$)/g;
    const starts = [];
    let m;
    while ((m = headerRe.exec(src)) !== null) starts.push(m.index + (m[1] ? 1 : 0));
    if (!starts.length) return [];
    const blocks = [];
    for (let i = 0; i < starts.length; i++) {
        const end = i + 1 < starts.length ? starts[i + 1] : src.length;
        const block = src.slice(starts[i], end).trim();
        if (block) blocks.push(block);
    }
    return blocks;
}

// Parse one full item block — either a paste-in identify (name = first
// line) OR a single library "lookup" box (name in the `| ... |` header).
// `slotRaw` is the slot the block was tagged with (radio button for live
// add; drop-file name for the onboard); the text itself names the slot
// only for multi items (the "covers multiple slots" note).
export function parseIdentify(text, slotRaw = '') {
    const lines = String(text || '').split('\n').map(l => l.trim());

    // Name: a library box puts the name in the `| ... |` line after the
    // first rule; a plain identify uses the first non-empty line.
    let first = '';
    const idx0 = lines.findIndex(l => l.length);
    if (idx0 !== -1 && RULE_RE.test(lines[idx0])) {
        const nameLine = lines.slice(idx0 + 1).find(l => l.length) || '';
        first = nameLine.replace(/^\|/, '').replace(/\|$/, '').trim();
    } else {
        first = lines.find(l => l.length) || '';
    }
    const { name, name_raw, bound, hands } = normalizeName(first);
    const slot = classifySlot(slotRaw);

    const stats = {
        str: 0, con: 0, dex: 0, int: 0, wis: 0, cha: 0,
        hpr: 0, spr: 0, hp: 0, sp: 0,
        rphys: 0, rpsi: 0, relec: 0, rmag: 0, rpoi: 0,
        rfire: 0, rcold: 0, racid: 0, rasphx: 0, rshadow: 0,
        ac: 0,
    };
    let weapon_class_value = 0;
    let dmg_pct = 0;
    let dmg_type = null;
    let covers = null;
    const bonuses = [];
    const unparsed = [];      // body lines no rule consumed (onboard callouts)
    let inExtra = false;      // inside the freeform "- Extra -" description

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (i === idx0 && !RULE_RE.test(line)) continue;           // identify name line
        if (RULE_RE.test(line)) continue;                          // box rule
        if (line.startsWith('|') && line.endsWith('|')) continue;  // box name line

        // Multi-slot coverage note — the ONLY signal for which wear slots a
        // multi item occupies. Checked BEFORE the Extra block because the
        // game prints it AFTER "- Extra -".
        const cov = line.match(/covers multiple slots:\s*([a-z/ ]+)\)/i);
        if (cov) {
            covers = cov[1].split('/').map(s => s.trim().toLowerCase()).filter(Boolean);
            continue;
        }

        if (/^-{1,}\s*extra\s*-{1,}$/i.test(line)) { inExtra = true; continue; }
        if (inExtra) continue;                                     // freeform description

        // Decay rate ("loses its magical powers ...") — no stat, ignored.
        if (/loses its magical powers/i.test(line)) continue;

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

        // Skill/spell bonus OR penalty, library format: "gives <quality>
        // bonus/penalty to the skill 'X'." / "the spell 'X'." (quality ladder,
        // no number). A penalty is the negative twin of a bonus — same ladder,
        // stored as a negative amount (SMALLINT, sign preserved).
        const sb = line.match(/gives\s+(\w+)\s+(bonus|penalty) to the (skill|spell)\s+'([^']+)'/i);
        if (sb) {
            const mag = SKILL_MAP[sb[1].toLowerCase()] ?? 0;
            // Normalize the skill/spell name: some lookup text has an underscore
            // typo ('quick_chant' vs 'quick chant') — fold to spaces so it can't
            // become a duplicate bonus row.
            const bonus_name = sb[4].trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
            bonuses.push({ bonus_name, kind: sb[3].toLowerCase(),
                amount: sb[2].toLowerCase() === 'penalty' ? -mag : mag });
            continue;
        }

        // Open-ended skill/spell bonus, identify format: "bonus to user's X".
        if (line.includes("bonus to user's")) {
            const m = line.match(/bonus to user's\s+(.+?)\.?\s*$/i);
            if (m) bonuses.push({ bonus_name: m[1].trim(), amount: scaleLookup(AMOUNT_SCALE, line) || 0 });
            continue;
        }

        // Fixed stat columns. Library text says "the users X" (no
        // apostrophe); normalize so one STAT_PATTERNS table serves both
        // formats. The trailing "(n/20)" is the user's client annotation,
        // not game data — left untouched; magnitude comes from the adverb.
        const nline = line.replace(/\bthe users\b/gi, "the user's");
        const stat = scaleLookup(STAT_PATTERNS, nline);
        if (!stat) { unparsed.push(line); continue; }
        let amt = scaleLookup(AMOUNT_SCALE, nline);
        if (amt === null) { unparsed.push(line); continue; }
        if (stat === 'hp' || stat === 'sp') amt *= 10; // scale is in tens
        stats[stat] = neg ? -amt : amt;
    }

    // A covered-slots note makes this a multi item regardless of which
    // drop file it came from: wear_slot becomes 'multi', weapon_class drops.
    let wear_slot = slot.wear_slot;
    let weapon_class = slot.weapon_class;
    let is_shield = slot.is_shield;
    let needs_review = slot.needs_review;
    if (covers && covers.length) {
        wear_slot = 'multi'; weapon_class = null; is_shield = 0; needs_review = 0;
    }

    return {
        name, name_raw, bound,
        wear_slot, weapon_class, is_shield,
        hands,
        slot_raw: slotRaw,
        needs_review,
        stats,
        weapon_class_value,
        dmg_pct,
        dmg_type,
        bonuses,
        covers,
        unparsed,
    };
}

export const _scales = { AMOUNT_SCALE, AC_SCALE, STAT_PATTERNS };
