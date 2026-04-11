// Parses the output of the in-game `info short` (ASCII stat table) and
// `info full` (per-level skill/spell unlock list) commands for a guild.
// Used by POST /api/game/guilds/:id/import-text so an admin can paste
// what they see in-game and have the planner's guild rows overwritten
// to match, rather than hand-editing 50 rows through the admin UI.
//
// The two blobs can be concatenated in either order (and may include
// extra surrounding text from the help screen); the parser extracts
// the pieces it recognizes and ignores the rest.

// Short header column → DB bonus_name. Long names match what the
// importer and engine.js emit, so existing rows line up after reimport.
const SHORT_COLS = {
    str: 'strength',
    dex: 'dexterity',
    con: 'constitution',
    int: 'intelligence',
    wis: 'wisdom',
    cha: 'charisma',
    hp:  'hit points',
    sp:  'spell points',
    hpr: 'hit point regeneration',
    spr: 'spell point regeneration',
};

// Returns { bonuses, skills, spells } where each entry is a row ready
// to insert (skill/spell rows hold a `name` that the caller resolves
// to game_skills.id / game_spells.id). Missing sections resolve to
// empty arrays so the caller can detect a partial paste.
export function parseGuildInfo(text) {
    const src = String(text || '');
    return {
        bonuses: parseInfoShort(src),
        skills: parseAbilities(src, 'skill'),
        spells: parseAbilities(src, 'spell'),
    };
}

// `info short` renders an ASCII box. A header row names the columns
// (Lvl | Str | Dex | ... | Spr) and each data row fills in numeric
// bonuses; blank cells mean no bonus for that stat at that level.
// We locate the header line by looking for `| Lvl |` (case-insensitive),
// then walk subsequent rows that start with `|` and an integer.
function parseInfoShort(src) {
    const lines = src.split(/\r?\n/);
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*\|\s*Lvl\s*\|/i.test(lines[i])) { headerIdx = i; break; }
    }
    if (headerIdx < 0) return [];
    const headerCells = splitRow(lines[headerIdx]);
    if (!headerCells.length || headerCells[0].toLowerCase() !== 'lvl') return [];
    const cols = headerCells.slice(1).map((h) => SHORT_COLS[h.toLowerCase()] || null);

    const out = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        // Stop at the footer separator row (`|===` or `'---`) or any
        // line that doesn't look like a table row.
        if (!/^\s*\|/.test(line)) break;
        if (/^\s*\|[=_-]+/.test(line)) continue;
        const cells = splitRow(line);
        if (cells.length < 2) continue;
        const lvlRaw = cells[0];
        if (!/^\d+$/.test(lvlRaw)) {
            // Repeat of the header means the table closes after this.
            if (lvlRaw.toLowerCase() === 'lvl') break;
            continue;
        }
        const level = parseInt(lvlRaw, 10);
        for (let c = 0; c < cols.length && c < cells.length - 1; c++) {
            const name = cols[c];
            if (!name) continue;
            const raw = cells[c + 1].trim();
            if (!raw) continue;
            const val = parseInt(raw, 10);
            if (!Number.isFinite(val) || val === 0) continue;
            out.push({ level, bonus_name: name, value: val });
        }
    }
    return out;
}

// Split a `| a | b | c |` row into its cell strings, trimmed, leading
// and trailing pipes dropped. Empty cells come back as ''.
function splitRow(line) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((c) => c.trim());
}

// `info full` emits blocks like:
//     Level 3 abilities:
//     May study spell improved identify to 75%
//     May train skill bargain to 30%
// We scan for the "Level N abilities:" header and attribute every
// subsequent May-study/May-train line to that level until the next
// header (or a separator / blank-ish line).
function parseAbilities(src, kind) {
    const lines = src.split(/\r?\n/);
    const wantVerb = kind === 'skill' ? 'train skill' : 'study spell';
    const out = [];
    let level = null;
    for (const rawLine of lines) {
        const line = rawLine.trim();
        const lvlMatch = line.match(/^level\s+(\d+)\s+abilities?:/i);
        if (lvlMatch) { level = parseInt(lvlMatch[1], 10); continue; }
        if (level == null) continue;
        // "May study spell <name> to <pct>%" or
        // "May train skill <name> to <pct>%"
        const re = new RegExp('^may\\s+' + wantVerb + '\\s+(.+?)\\s+to\\s+(\\d+)\\s*%', 'i');
        const m = line.match(re);
        if (!m) continue;
        const name = m[1].trim().toLowerCase();
        const pct = parseInt(m[2], 10);
        if (!name || !Number.isFinite(pct)) continue;
        out.push({ level, name, max_percent: pct });
    }
    return out;
}
