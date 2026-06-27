// External equipment lookup for the in-game client (zmud), NOT the SPA.
//
// A player types something like `findme blue steel` in their MUD client,
// which POSTs here; we reply with PLAIN TEXT lines the client prints
// straight to its window. This is the ONE endpoint that deliberately
// breaks the {ok,data} JSON convention (docs/api.md) — its consumer is a
// terminal, not Vue. It is also the ONE equipment route that is NOT
// behind requireAuth, which is exactly why it is its own router file and
// not a route on the auth-gated /api/equipment router: instead of a
// session it takes a shared `secretpw`. A missing/wrong password returns
// a bare 404 so the endpoint is indistinguishable from one that does not
// exist (no "unauthorized" hint). See docs/eqlookup.md.

import express from 'express';
import dbs from '../../db.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

// Shared secret for the zmud client. Intentionally simple ("simple
// protect"); rotate by editing here. Not a user account — just a gate so
// the world can't scrape the catalog by hitting a public URL.
const SECRET = 'zorkrocks';

// Signed stat columns, in the same order/labels the Equipment page shows
// (Equipment.vue). WpnCls/Dmg are handled separately (they are magnitudes,
// not +/- bonuses). Zero/null values are omitted from the output.
const SIGNED_FIELDS = [
    ['Ac', 'ac'],
    ['Str', 'str'], ['Con', 'con'], ['Dex', 'dex'],
    ['Int', 'int'], ['Wis', 'wis'], ['Cha', 'cha'],
    ['Hpr', 'hpr'], ['Spr', 'spr'], ['Hp', 'hp'], ['Sp', 'sp'],
    ['Phys', 'rphys'], ['Psi', 'rpsi'], ['Elec', 'relec'], ['Mag', 'rmag'],
    ['Poi', 'rpoi'], ['Fire', 'rfire'], ['Cold', 'rcold'], ['Acid', 'racid'],
    ['Asph', 'rasphx'], ['Shdw', 'rshadow'],
];

const sgn = v => (v >= 0 ? '+' : '') + v;

// One clean, single-line summary of an item: "Name [slot]: <stats> | <bonuses>".
// Only non-zero stats and present bonuses appear.
function statLine(it, bonuses) {
    let slot = it.wear_slot || '?';
    if (it.weapon_class) slot += ` ${it.weapon_class}${it.hands == 2 ? ' 2h' : ''}`;
    else if (it.is_shield) slot += ' shield';
    else if (it.hands == 2) slot += ' 2h';

    const parts = [];
    if (it.weapon_class_value) parts.push(`WpnCls ${it.weapon_class_value}`);
    if (it.dmg_pct) parts.push(`Dmg ${it.dmg_pct}%${it.dmg_type ? ' ' + it.dmg_type : ''}`);
    for (const [label, key] of SIGNED_FIELDS) {
        const v = Number(it[key]) || 0;
        if (v) parts.push(`${label}${sgn(v)}`);
    }

    // Skill/spell bonuses: show the magnitude only when it is known
    // (amount 0 means "has a bonus, magnitude unrecorded" — name it but
    // don't print "+0", per the no-zero rule).
    const bon = (bonuses || []).map(b => b.amount ? `${b.bonus_name}${sgn(b.amount)}` : b.bonus_name);

    let detail = parts.join(' ');
    if (bon.length) detail += (detail ? '  |  ' : '') + bon.join(', ');
    return `${it.name} [${slot}]${detail ? ': ' + detail : ''}`;
}

// ----- query flags -----
// The typed line may carry filter flags; anything that is not a flag or a
// flag's value is the free-text name search. Flags:
//   -r <resist>   positive resistance (phys/psi/elec/...)
//   -p <player>   items that zeq user owns (eq_ownership)
//   -s <slot>     wear slot (hands, torso, wield, ...)

// Resist element -> column. Whitelist ONLY: the column name is never taken
// from user input directly, so it cannot be injected.
const RESIST_COLS = {
    phys: 'rphys', psi: 'rpsi', elec: 'relec', mag: 'rmag', poi: 'rpoi',
    fire: 'rfire', cold: 'rcold', acid: 'racid', asph: 'rasphx', shadow: 'rshadow',
};

// Valid wear slots (the catalog slot model — see eq_parse.mjs).
const SLOTS = ['head', 'neck', 'cloak', 'amulet', 'torso', 'arms', 'hands',
    'belt', 'legs', 'feet', 'held', 'finger', 'wield', 'multi'];

const USAGE = 'Usage: <name> and/or -r <resist> -p <player> -s <slot>';

// Split the typed line into { name, resist, player, slot }. A token starting
// with "-" is a flag and consumes the next token as its value; it is never
// treated as name text.
function parseQuery(raw) {
    const tokens = String(raw || '').trim().split(/\s+/).filter(Boolean);
    const out = { nameWords: [], resist: null, player: null, slot: null };
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.startsWith('-')) {
            const tl = t.toLowerCase();
            const val = tokens[i + 1];
            const hasVal = val && !val.startsWith('-');
            if ((tl === '-r' || tl === '-resist') && hasVal) { out.resist = val.toLowerCase(); i++; }
            else if ((tl === '-p' || tl === '-player') && hasVal) { out.player = val; i++; }
            else if ((tl === '-s' || tl === '-slot') && hasVal) { out.slot = val.toLowerCase(); i++; }
            // unknown / value-less flag: ignore
        } else {
            out.nameWords.push(t);
        }
    }
    out.name = out.nameWords.join(' ');
    return out;
}

// Short echo of what was searched, for the no-match / too-many lines.
function describe(f) {
    const bits = [];
    if (f.name) bits.push(`'${f.name}'`);
    if (f.resist) bits.push(`-r ${f.resist}`);
    if (f.slot) bits.push(`-s ${f.slot}`);
    if (f.player) bits.push(`-p ${f.player}`);
    return bits.join(' ') || 'your search';
}

// Accept POST (the documented call) and GET (some MUD clients can only do
// GET); params come from the body or the query string interchangeably.
async function lookup(req, res) {
    const p = { ...req.query, ...req.body };

    // Wrong/missing password → act like the route does not exist.
    if (p.secretpw !== SECRET) return res.sendStatus(404);

    res.type('text/plain');
    const raw = (p.q ?? p.name ?? p.lookup ?? '').toString().trim();
    if (!raw) return res.send(USAGE);

    const f = parseQuery(raw);

    // Validate flag values, each with a single-line hint of what's allowed.
    let resistCol = null;
    if (f.resist) {
        resistCol = RESIST_COLS[f.resist];
        if (!resistCol)
            return res.send(`Unknown resist '${f.resist}'. Valid: ${Object.keys(RESIST_COLS).join(' / ')}`);
    }
    if (f.slot && !SLOTS.includes(f.slot))
        return res.send(`Unknown slot '${f.slot}'. Valid: ${SLOTS.join(' / ')}`);

    if (!f.name && !resistCol && !f.player && !f.slot) return res.send(USAGE);

    try {
        // Build the filtered query. resistCol comes from the whitelist map
        // (never raw input), so interpolating it is injection-safe; every
        // user value goes through an @placeholder.
        const conds = [];
        const params = {};
        let orderBy = 'i.name';
        if (f.name) { conds.push('i.name LIKE @qname'); params.qname = '%' + f.name + '%'; }
        if (f.slot) { conds.push('i.wear_slot = @qslot'); params.qslot = f.slot; }
        if (resistCol) { conds.push(`i.${resistCol} > 0`); orderBy = `i.${resistCol} DESC, i.name`; }
        if (f.player) {
            conds.push(`EXISTS (SELECT 1 FROM eq_ownership o JOIN users u ON u.id = o.user_id
                                WHERE o.item_id = i.id AND u.name = @qplayer)`);
            params.qplayer = f.player;
        }
        const where = 'WHERE ' + conds.join(' AND ');
        const items = await zeq.query(
            `SELECT i.* FROM eq_items i ${where} ORDER BY ${orderBy}`, params);
        const n = items.length;
        const desc = describe(f);

        if (n === 0) return res.send(`No equipment matches ${desc}.`);

        // 7..20 matches: a single line of names so the caller can re-look
        // up something more specific (or an exact name). Plain ASCII, and
        // names are joined with " / " — NOT ";" — because the zmud client
        // sends this line as a `party say` command and zMUD splits a
        // command string on ";". Same reason the 21+ line below avoids ";".
        if (n > 6 && n < 21)
            return res.send(`${n} matches: ${items.map(i => i.name).join(' / ')}`);

        // 21+ matches: too many to be useful — report the count only.
        if (n >= 21)
            return res.send(`${n} matches for ${desc} - too many to list, narrow your search.`);

        // 1..6 matches: full stat/bonus line per item.
        const ids = items.map(i => i.id);
        const bonusRows = await zeq.query(
            `SELECT item_id, bonus_name, amount FROM eq_item_bonuses
             WHERE item_id IN (@ids) ORDER BY amount DESC, bonus_name`, { ids });
        const byItem = new Map();
        for (const b of bonusRows) {
            if (!byItem.has(b.item_id)) byItem.set(b.item_id, []);
            byItem.get(b.item_id).push(b);
        }
        return res.send(items.map(it => statLine(it, byItem.get(it.id))).join('\n'));
    } catch (e) {
        console.error('[eqlookup]', e);
        return res.send('Lookup failed.');
    }
}

router.post('/', lookup);
router.get('/', lookup);

export const eqlookup = router;
