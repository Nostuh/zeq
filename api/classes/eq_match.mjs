// Loose name matching for the equipment catalog. One shared home for the
// "meet in the middle" key logic used by /api/equipment/import (chest
// pastes), the mob-loot linker (mob_loot.item_name → eq_items), and the
// one-time migration script. See docs/chest-sorter.md for the import
// matching rules and docs/equipment-redesign.md for the linking rules.

import { normalizeName } from './eq_parse.mjs';

// Strip a leading count word from a pasted STACK name ("Two Bracerses...").
export const IMPORT_NUMBER_RE = /^(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+/i;

// De-pluralise one word (the game pluralises the head noun anywhere,
// sometimes doubled: "Bracerses").
export function depluralWord(w) {
    let x = w;
    for (let i = 0; i < 3; i++) {
        if (x.length > 3 && /ies$/i.test(x)) { x = x.slice(0, -3) + 'y'; continue; }
        if (x.length > 3 && /(ses|xes|zes|ches|shes)$/i.test(x)) { x = x.slice(0, -2); continue; }
        if (x.length > 2 && /[^s]s$/i.test(x)) { x = x.slice(0, -1); continue; }
        break;
    }
    return x;
}

// "Loose key": lowercase, drop a leading article, de-pluralise every word.
// Applied to BOTH sides of a comparison so they meet in the middle:
// "Two Bracerses of Wrath" and "Bracers of Wrath" → "bracer of wrath".
export function looseKey(name) {
    return String(name).toLowerCase()
        .replace(/^(a|an|the)\s+/, '')
        .split(/\s+/).map(depluralWord).join(' ')
        .replace(/\s+/g, ' ').trim();
}

// Loose key for a raw pasted item name (strip count word, normalise, loosen).
export function pasteLooseKey(raw) {
    return looseKey(normalizeName(String(raw || '').replace(IMPORT_NUMBER_RE, '')).name);
}

// Loose key for a mob_loot.item_name. Loot lists carry noise the other
// sources don't: a worn-location prefix ("Head: A funky-looking mushroom
// hat" — normalizeName only strips the "Wielded in ..." form) and decay
// markers in *asterisks* ("*glowing*" — normalizeName only strips the
// trailing "(glowing)" form). Strip those, then reuse pasteLooseKey so
// everything downstream matches the catalog the same way.
const LOOT_PREFIX_RE = /^\s*(?:worn on\s+)?(?:head|neck|amulet|cloak|torso|arms|hands|belt|legs|feet|held|right finger|left finger|finger|shield)\s*:\s*/i;
const LOOT_STAR_RE = /\s*\*[a-z][a-z ]{0,24}\*\s*/gi;

export function lootLooseKey(raw) {
    const cleaned = String(raw || '')
        .replace(LOOT_PREFIX_RE, '')
        .replace(LOOT_STAR_RE, ' ');
    return pasteLooseKey(cleaned);
}
