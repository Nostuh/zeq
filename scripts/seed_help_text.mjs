#!/usr/bin/env node
// Seed game_skills.help_text / game_spells.help_text from a raw in-game
// `help skill <x>` / `help spell <x>` capture (zmud / tintin / any client).
//
// Usage:
//   node scripts/seed_help_text.mjs <capture.txt> [more.txt ...] [flags]
// The canonical captures live in data/help_captures/{skills,spells}.txt:
//   node scripts/seed_help_text.mjs data/help_captures/skills.txt data/help_captures/spells.txt
// Flags:
//   --dry-run     parse + report, write nothing
//   --overwrite   replace help_text even if a row already has one
//                 (default: only fill rows whose help_text is NULL/empty)
//
// Full process (find missing -> capture in-game -> seed): docs/help-text.md
//
// Why a bespoke parser instead of reusing import_zcreator's splitHelpBlocks:
// the .chr files separate entries with `-----` rules, but a LIVE client
// capture has none. Instead each response is a `Help on skill:/spell:/song:`
// header followed by metadata + prose, and the stream is polluted with the
// client's prompt lines (`q: ...`, `p: Not in battle ...`) and — when the
// user types the commands ahead of the output — echoed `help skill <x>`
// lines interleaved mid-block. We key off the authoritative `Help on …:`
// header (so order doesn't matter), end each block at the next header or a
// failure marker, and scrub the known noise lines out of the body.
//
// Bard "songs" report as `Help on song: <name>.` but live in game_spells,
// so song blocks are matched there. Storage format mirrors the importer:
// everything AFTER the header line (metadata + body), header stripped, name
// lowercased.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const OVERWRITE = args.includes('--overwrite');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
    console.error('usage: node scripts/seed_help_text.mjs <capture.txt> [...] [--dry-run] [--overwrite]');
    process.exit(1);
}

const HEADER_RE = /^Help on (skill|spell|song):\s*(.*)$/i;
const FAIL_RE = /^(No such known (skill|spell)|Dark powers cloud your mind\.|The information about this (skill|spell) is classified\.)/i;
const META_RE = /^\s*(Usage duration|Usage|Casting time|Singing time|Spell cost|Song cost|Spell type|Song type|Skill type|Damage type|Spell words|Spell damage|Maximum damage|Affecting stat|Affecting stats|Mental Cost|Fatigue|Last line)\b/i;
// Noise lines to drop from inside a block body.
const NOISE_RE = [
    /^q:\s/,                       // client prompt: "q: You feel fully rested."
    /^p:\s/,                       // client prompt: "p: Not in battle ..."
    /^help (skill|spell|song)\s/i, // typed-ahead command echo
    /^\s*\d+\s*$/,                 // stray casting-output number (e.g. a lone "0")
];

function isNoise(line) { return NOISE_RE.some((re) => re.test(line)); }

// When the user types every `help …` command ahead of the output, the client
// echoes each queued command back into the stream, splicing it mid-line —
// even mid-word ("protection o" + "help spell summon orb of reflection" + "f
// the barrier") and mid-header ("Hel" + echoes + "p on song: Bitter apathy.").
// Each echo is the EXACT command text (optionally followed by its own
// newline), so removing "<cmd>\n" then bare "<cmd>" — longest command first —
// rejoins the surrounding text cleanly. `commands` are built from the live
// catalog, which is the only thing that can say where the echoed name ends
// and the prose resumes.
function stripEchoes(text, commands) {
    for (const c of commands) {
        text = text.split(c + '\n').join('');
        text = text.split(c).join('');
    }
    return text;
}

function cleanBody(lines) {
    const kept = lines.filter((l) => !isNoise(l));
    // Trim leading/trailing blank lines and collapse runs of 2+ blanks to one.
    const out = [];
    for (const l of kept) {
        if (l.trim() === '' && (out.length === 0 || out[out.length - 1].trim() === '')) continue;
        out.push(l);
    }
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    return out.join('\n').trim();
}

function parse(text) {
    const lines = text.split(/\r?\n/);
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const m = lines[i].match(HEADER_RE);
        if (!m) { i++; continue; }
        const type = m[1].toLowerCase();
        let name = m[2].trim();
        i++;
        // Wrapped header name: an indented, non-metadata continuation line
        // immediately after the header (the two joke skills do this).
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !META_RE.test(lines[i])
               && !HEADER_RE.test(lines[i]) && !FAIL_RE.test(lines[i]) && lines[i].trim() !== '') {
            name += ' ' + lines[i].trim();
            i++;
        }
        const body = [];
        while (i < lines.length && !HEADER_RE.test(lines[i]) && !FAIL_RE.test(lines[i])) {
            body.push(lines[i]);
            i++;
        }
        name = name.replace(/\.$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (name) blocks.push({ table: type === 'skill' ? 'game_skills' : 'game_spells', name, body: cleanBody(body) });
    }
    return blocks;
}

async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password, database: CONFIG.database,
    });

    // Build the echo-command list from the live catalog (longest first) so we
    // can scrub typed-ahead command echoes out of the raw capture before parse.
    const [skn] = await db.query('SELECT LOWER(name) AS n FROM game_skills');
    const [spn] = await db.query('SELECT LOWER(name) AS n FROM game_spells');
    const commands = [
        ...skn.map((r) => 'help skill ' + r.n),
        ...spn.map((r) => 'help spell ' + r.n),
    ].sort((a, b) => b.length - a.length);

    // Normalise CRLF/CR -> LF up front. The echo scrub matches "<cmd>\n", so a
    // capture saved with Windows line endings (these are) would otherwise leave
    // every echo's terminator behind, stranding split headers/words apart.
    const raw = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n').replace(/\r\n?/g, '\n');
    const text = stripEchoes(raw, commands);
    const blocks = parse(text);
    // De-dup by table+name (a capture can repeat a command); keep the longest body.
    const byKey = new Map();
    for (const b of blocks) {
        const k = b.table + '|' + b.name;
        const prev = byKey.get(k);
        if (!prev || b.body.length > prev.body.length) byKey.set(k, b);
    }
    const uniq = [...byKey.values()];
    console.log(`[seed] parsed ${blocks.length} help blocks (${uniq.length} unique) from ${files.length} file(s)`);

    let filled = 0, already = 0, nomatch = 0, empty = 0;
    const unmatched = [];
    for (const b of uniq) {
        if (!b.body) { empty++; continue; }
        const where = OVERWRITE ? '' : " AND (help_text IS NULL OR help_text = '')";
        const [exists] = await db.query(`SELECT id, help_text FROM ${b.table} WHERE LOWER(name) = ?`, [b.name]);
        if (!exists.length) { nomatch++; unmatched.push(`${b.table}: ${b.name}`); continue; }
        const hasText = exists.some((r) => r.help_text && r.help_text.trim());
        if (hasText && !OVERWRITE) { already++; continue; }
        if (!DRY) {
            const [r] = await db.query(`UPDATE ${b.table} SET help_text = ? WHERE LOWER(name) = ?${where}`, [b.body, b.name]);
            if (r.affectedRows > 0) filled++; else already++;
        } else { filled++; }
    }
    await db.end();
    console.log(`[seed] ${DRY ? '(dry-run) would fill' : 'filled'}: ${filled}, already had text: ${already}, empty body skipped: ${empty}, no DB row: ${nomatch}`);
    if (unmatched.length) {
        console.log(`[seed] ${unmatched.length} capture names had no matching DB row (name mismatch / not in catalog):`);
        for (const u of unmatched) console.log('  - ' + u);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
