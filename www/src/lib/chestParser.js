// Shared chest-contents parser for the ZombieMUD "look in chest" output.
//
// Used by the public Chest Sorter (components/ChestSorter.vue) and the
// authed Import Equipment page (components/ImportEquipment.vue) so both share
// EXACTLY the same parsing/normalisation logic. Pure functions, no DOM/Vue.
//
// See docs — the tricky bits are: quantity stacks ("Two Maces…" = 2), item
// names that contain commas ("Willbreaker, the whip of submission"), lists
// that wrap across lines / lack a trailing period, and the game's inconsistent
// pluralisation (head noun anywhere, sometimes doubled: "protectorses").

// N identical items render as ONE pluralised entry ("Two Maces of Misfortune",
// "Ten large quiver (100/100)s"). The chest's declared count counts each
// physical item, so we recover the quantity from the leading number word. A
// hyphen after it ("Two-handed") is NOT a count, so we require whitespace.
export const NUMBER_WORDS = {
    two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

export function stackQty(entry) {
    const m = /^([A-Za-z]+)\s/.exec(entry);
    return (m && NUMBER_WORDS[m[1].toLowerCase()]) || 1;
}

const NUMBER_RE = new RegExp('^(' + Object.keys(NUMBER_WORDS).join('|') + ')\\s+', 'i');

// Item name with the leading count word removed ("Two Bracerses" -> "Bracerses").
export function stripQty(entry) {
    return entry.replace(NUMBER_RE, '').trim() || entry;
}

// Peel plural endings (s / es / ies) off a single word until stable. "ss"
// (glass, kiss) is preserved. Handles the game's double-plurals: "protectorses"
// -> "protector", "leggingses" -> "legging", "bracerses" -> "bracer".
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

// Remove ONE plural level from a word, for DISPLAY. The game double-pluralises
// ("Bracers"->"Bracerses", "boots"->"bootses", "ring made"->"ring mades"), so a
// single removal recovers the real singular/catalog form. (depluralWord/groupKey
// LOOP to fully flatten — right for MATCHING, but would turn "Bracers" into
// "Bracer" for display.)
export function depluralOnce(w) {
    if (w.length > 3 && /ies$/i.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 3 && /(ses|xes|zes|ches|shes)$/i.test(w)) return w.slice(0, -2);
    if (w.length > 2 && /[^s]s$/i.test(w)) return w.slice(0, -1);
    return w;
}
// De-pluralise an item name once per word — used to show a STACK-only item under
// its singular name ("Two ring mades of black mithril" -> "ring made of black
// mithril") when no genuine single form was seen to prefer instead.
export function singularizeDisplay(name) {
    return String(name).split(/\s+/).map(depluralOnce).join(' ');
}

// Grouping key so a STACK form and its SINGLE form collapse together: drop the
// leading article and de-pluralise EVERY word (the pluralised head noun can be
// anywhere). The rest of the name is identical between the two forms, so
// de-pluralising it too is harmless.
export function groupKey(name) {
    return String(name).toLowerCase()
        .replace(/^(a|an|the)\s+/, '')
        .split(/\s+/).map(depluralWord).join(' ')
        .replace(/\s+/g, ' ').trim();
}

// Split one chest's item list into entries, using the declared count as an
// oracle to resolve genuinely-ambiguous commas. Comments in ChestSorter.vue
// history explain the classification (sep / ambiguous / internal), the forward
// promotion (recover lowercase-led items) and the reverse merge (rejoin items
// named with an embedded ", ProperName").
export function splitItems(listStr, declared) {
    const s = String(listStr || '').trim().replace(/\s+/g, ' ').replace(/\.\s*$/, '');
    if (!s) return [];

    const cuts = [];
    const re = /,\s+/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        const word = (s.slice(re.lastIndex).match(/^(\S+)/) || ['', ''])[1];
        const alpha = word.replace(/[^a-z]/gi, '').toLowerCase();
        let kind;
        if (/^[A-Z0-9'"]/.test(word)) kind = 'sep';
        else if (alpha === 'the' || alpha === 'a' || alpha === 'an') kind = 'amb';
        else kind = 'internal';
        cuts.push({ index: m.index, end: re.lastIndex, kind });
    }
    const lastAnd = s.lastIndexOf(' and ');
    if (lastAnd !== -1) cuts.push({ index: lastAnd, end: lastAnd + 5, kind: 'sep' });
    cuts.sort((a, b) => a.index - b.index);

    const segments = (chosen) => {
        const parts = [];
        let prev = 0;
        for (const c of cuts) {
            if (!chosen.has(c)) continue;
            parts.push(s.slice(prev, c.index));
            prev = c.end;
        }
        parts.push(s.slice(prev));
        return parts.map((x) => x.trim()).filter(Boolean);
    };
    const sumQty = (entries) => entries.reduce((n, e) => n + stackQty(e), 0);

    const chosen = new Set(cuts.filter((c) => c.kind === 'sep'));
    if (declared == null) {
        for (const c of cuts) if (c.kind === 'amb') chosen.add(c);
        return segments(chosen);
    }
    const promote = [...cuts.filter((c) => c.kind === 'amb'),
                     ...cuts.filter((c) => c.kind === 'internal')];
    let i = 0;
    while (sumQty(segments(chosen)) < declared && i < promote.length) {
        chosen.add(promote[i]); i += 1;
    }

    // Reverse pass — over-split. Undo separator cuts whose trailing piece is the
    // tail of a NAMED item split at an embedded comma: either a lone proper noun
    // ("The Broadsword, Sunbringer", "witch goddess, Rangda") OR a quoted name
    // ("The longbow, 'Quarter of Midnight' (2h)", "…, 'the Sentinel' (2h)"),
    // each optionally followed by a hand marker. Only consulted when we
    // over-split, so standalone quoted-name items (e.g. "'Jawellyn' the bow of
    // deadly accuracy") in correctly-counted chests are never touched.
    const LONE_NAME = /^(?:[A-Z][\w'’-]*|['"][^'"]*['"])(?:\s*\((?:1h|2h)\))?$/;
    const nextChosenAfter = (idx) => {
        let best = null;
        for (const c of cuts) if (chosen.has(c) && c.index > idx && (!best || c.index < best.index)) best = c;
        return best;
    };
    for (const c of cuts) {
        if (sumQty(segments(chosen)) <= declared) break;
        if (c.kind !== 'sep' || !chosen.has(c)) continue;
        const nxt = nextChosenAfter(c.index);
        const piece = s.slice(c.end, nxt ? nxt.index : s.length).trim();
        if (LONE_NAME.test(piece)) chosen.delete(c);
    }
    return segments(chosen);
}

// Lines that are part of a chest's fixed structure (never item-list content).
const STRUCTURAL = /^(A chest that seems to be of a high value|There is an? |It has a label on it saying|It is (open|closed|locked)|It contains\s+\d+\s+items?:|You see nothing special)/i;

// Parse the full paste into an ordered array of chest objects:
//   { label, lock, declared, items: [entry strings], count: physical total }
export function parseChests(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const chests = [];
    let pending = { label: null, lock: null };
    let cur = null;
    let collecting = false;
    let buf = [];

    const finishItems = () => {
        if (cur) {
            cur.items = splitItems(buf.join(' '), cur.declared);
            cur.count = cur.items.reduce((n, e) => n + stackQty(e), 0);
        }
        cur = null;
        collecting = false;
        buf = [];
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (collecting) {
            if (STRUCTURAL.test(line)) {
                finishItems();
            } else {
                buf.push(line);
                if (/\.\s*$/.test(line)) finishItems();
                continue;
            }
        }
        let m;
        if (/^A chest that seems to be of a high value\.?$/i.test(line)) {
            pending = { label: null, lock: null };
        } else if ((m = line.match(/label on it saying\s*'([^']*)'/i))) {
            pending.label = m[1];
        } else if ((m = line.match(/large lock on it, set to:\s*(-?\d+)/i))) {
            pending.lock = parseInt(m[1], 10);
        } else if ((m = line.match(/^It contains\s+(\d+)\s+items?:/i))) {
            cur = { label: pending.label, lock: pending.lock,
                    declared: parseInt(m[1], 10), items: [] };
            chests.push(cur);
            collecting = true;
            buf = [];
            pending = { label: null, lock: null };
        }
    }
    if (collecting) finishItems();
    return chests;
}
