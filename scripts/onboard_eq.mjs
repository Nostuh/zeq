#!/usr/bin/env node
// Manual equipment onboarding: fold the in-game Trader's Library `lookup`
// captures dropped under manual_onboard/ into the global catalog
// (eq_items + eq_item_bonuses + eq_item_covers). Catalog enrichment ONLY —
// never writes ownership. See manual_onboard/README.md and
// docs/manual-onboard.md.
//
// Uses the SAME parser as the live add path and the legacy migration
// (api/classes/eq_parse.mjs); splitLibraryBlocks() carves each drop file's
// pasted blocks into one item each. Dedup + best-of merge match
// scripts/migrate_eq.mjs exactly: per stat, the larger magnitude wins, so
// a partial identify never overwrites a fuller one.
//
//   node onboard_eq.mjs                 # DRY-RUN: report, write nothing (default)
//   node onboard_eq.mjs --apply         # apply inserts + best-of merges
//   node onboard_eq.mjs --file <path>   # restrict to one drop file
//
// Requires schema/equipment.sql applied (for eq_item_covers).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { parseIdentify, splitLibraryBlocks, classifySlot, normalizeName } from '../api/classes/eq_parse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ONBOARD = path.join(ROOT, 'manual_onboard');
const LISTS = path.join(ONBOARD, 'lists');
const COMMANDS = path.join(ONBOARD, 'commands');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const fileArgIdx = process.argv.indexOf('--file');
const ONLY_FILE = fileArgIdx !== -1 ? process.argv[fileArgIdx + 1] : null;

const STAT_COLS = ['str', 'con', 'dex', 'int', 'wis', 'cha', 'hpr', 'spr',
    'hp', 'sp', 'rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire', 'rcold',
    'racid', 'rasphx', 'rshadow', 'ac'];
const NUM_COLS = [...STAT_COLS, 'weapon_class_value', 'dmg_pct'];
const WRITE_COLS = ['name', 'name_raw', 'wear_slot', 'weapon_class', 'is_shield',
    'hands', 'slot_raw', 'bound', 'needs_review', ...NUM_COLS, 'dmg_type',
    'raw_info', 'eqmob_id'];
const col = c => (c === 'int' ? '`int`' : c);

// Best-of: keep the larger-magnitude value (preserve sign); 0 always loses.
const mergeMag = (a, b) => (Math.abs(Number(b) || 0) > Math.abs(Number(a) || 0) ? (Number(b) || 0) : (Number(a) || 0));

// ---- drop-file → slot tag --------------------------------------------
// Keyed on the BASENAME so it works for both the subfoldered drop files
// (armour/amulet.txt, weapons/1h_sword.txt) and the flat list files
// (lists/amulet.txt, lists/1h_sword.txt). A `1h_`/`2h_` prefix means a
// weapon: slotRaw = <class>, hands from the prefix. No armour slot starts
// with that prefix, so the test is unambiguous.
function fileToSlot(filePath) {
    const base = path.basename(filePath, '.txt');
    if (/^[12]h_/.test(base)) {
        const [hands, ...rest] = base.split('_');
        return { slotRaw: rest.join('_'), hands: hands === '2h' ? 2 : 1 };
    }
    return { slotRaw: base, hands: null };
}

function listDropFiles() {
    if (ONLY_FILE) return [path.resolve(ONLY_FILE)];
    const out = [];
    for (const sub of ['armour', 'weapons']) {
        const dir = path.join(ONBOARD, sub);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) if (f.endsWith('.txt')) out.push(path.join(dir, f));
    }
    return out.sort();
}

function loadIgnore() {
    const f = path.join(ONBOARD, 'ignore.txt');
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, 'utf8').split('\n')
        .map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.toLowerCase());
}

// A line that is a `list <slot>` header/title, not an item: "Armour slot -
// Amulet", "Weapon type - 1h sword". ANCHORED to the real title shape so a
// mid-name "slot-"/"type-" substring in a genuine item name is never dropped.
// Skips the title row and guards against a `list` paste dropped into a detail
// file. (parseSlotList also excludes the title structurally via ruleCount<2.)
const LIST_TITLE_RE = /^(?:armour slot|weapon type)\s*-\s/i;

// Parse a `list <slot>` capture (one box: rule / title / rule, then one
// `| name |` row per item, then a closing `'----'` line) into item names.
function parseSlotList(text) {
    const lines = String(text || '').split('\n').map(l => l.trim());
    const names = [];
    let ruleCount = 0;
    for (const line of lines) {
        if (/^\*-{2,}\*$/.test(line)) { ruleCount++; continue; }   // box rule
        if (/^'-{2,}'$/.test(line)) break;                          // closing line
        if (ruleCount < 2) continue;                                // still in the header (title between rules 1 & 2)
        if (!(line.startsWith('|') && line.endsWith('|'))) continue;
        const n = line.slice(1, -1).trim();
        if (n) names.push(n);   // the title row is already excluded by ruleCount<2
    }
    return names;
}

// `--commands`: read manual_onboard/lists/*.txt, and for each emit
// `lookup <name>` lines (to manual_onboard/commands/<slot>.txt) for items
// NOT already in the catalog — so you only look up what's new. `--all`
// emits every listed item. Items dedup at ingest regardless, so this is a
// copy-paste optimization, not a correctness gate.
async function genCommands() {
    if (!fs.existsSync(LISTS)) { console.error(`No lists dir: ${path.relative(ROOT, LISTS)}`); return; }
    const files = (ONLY_FILE ? [path.resolve(ONLY_FILE)]
        : fs.readdirSync(LISTS).filter(f => f.endsWith('.txt')).map(f => path.join(LISTS, f))).sort();

    let db = null;
    try {
        db = await mysql.createConnection({ host: CONFIG.host, user: CONFIG.user, password: CONFIG.password, database: CONFIG.database });
    } catch (e) {
        console.warn(`⚠  No DB (${e.code || e.message}) — emitting ALL listed items (can't tell what's already in the catalog).`);
    }

    fs.mkdirSync(COMMANDS, { recursive: true });
    console.log(`\n=== onboard_eq --commands${ALL ? ' --all' : ''} — generating lookup commands ===`);

    for (const file of files) {
        const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        const raw = parseSlotList(text);
        if (!raw.length) continue;
        const { slotRaw } = fileToSlot(file);
        const cls = classifySlot(slotRaw);

        // Collapse to one entry per NORMALIZED name (the catalog's identity):
        // decay/variant spellings ("...(dusty)", "<dark>", "<tm>") share a
        // row, so looking up more than one is wasted. Emit the NORMALIZED
        // (un-decorated) name as the lookup string — those <...>/(...) tokens
        // are transient state, not the name, and a decorated lookup can miss
        // in-game (the library searches by base name).
        const byKey = new Map();   // normalizedLower -> clean normalized name
        for (const r of raw) {
            const norm = normalizeName(r).name;
            const key = norm.toLowerCase();
            if (!byKey.has(key)) byKey.set(key, norm);
        }

        // Names already in the catalog for this wear slot (normalized, ci).
        let known = new Set();
        if (db && !ALL) {
            const params = [cls.wear_slot];
            let sql = 'SELECT name FROM eq_items WHERE wear_slot = ?';
            // Scope the known-set to the SAME kind, so weapons don't pollute
            // the shield set (both live in wear_slot='wield') and vice-versa.
            if (cls.weapon_class) { sql += ' AND weapon_class = ?'; params.push(cls.weapon_class); }
            else if (cls.is_shield) { sql += ' AND is_shield = 1'; }
            else if (cls.wear_slot === 'wield') { sql += ' AND is_shield = 0 AND weapon_class IS NULL'; }
            const [rows] = await db.query(sql, params);
            known = new Set(rows.map(r => String(r.name).toLowerCase()));
        }

        const emit = [...byKey.entries()].filter(([key]) => ALL || !known.has(key)).map(([, name]) => name);
        const skipped = ALL ? [] : [...byKey.entries()].filter(([key]) => known.has(key)).map(([, name]) => name);
        const out = path.join(COMMANDS, path.basename(file));
        fs.writeFileSync(out, emit.map(n => `lookup ${n}`).join('\n') + (emit.length ? '\n' : ''));
        console.log(`  ${path.basename(file, '.txt')}: ${raw.length} listed, ${byKey.size} distinct, ${skipped.length} known, ${emit.length} to look up → ${path.relative(ROOT, out)}`);
        // Transparency: name what was skipped as already-in-catalog, so a
        // missing item is a visible choice, not a silent drop (use --all to
        // re-look-up everything for best-of enrichment).
        if (skipped.length) console.log(`     already in catalog (skipped): ${skipped.slice(0, 40).join('; ')}${skipped.length > 40 ? ` … +${skipped.length - 40} more` : ''}`);
    }
    console.log(`\nPaste each commands/<slot>.txt block into the MUD, then drop the lookup output into the matching armour/ or weapons/ file.`);
    if (db) await db.end();
}

// Flatten a parseIdentify() result into a flat column→value record.
function recordOf(p, rawInfo) {
    const r = {
        name: p.name, name_raw: p.name_raw, wear_slot: p.wear_slot,
        weapon_class: p.weapon_class, is_shield: p.is_shield ? 1 : 0,
        hands: p.hands, slot_raw: p.slot_raw || '', bound: p.bound ? 1 : 0,
        needs_review: p.needs_review ? 1 : 0,
        dmg_type: p.dmg_type, raw_info: rawInfo, eqmob_id: null,
        weapon_class_value: p.weapon_class_value, dmg_pct: p.dmg_pct,
    };
    for (const c of STAT_COLS) r[c] = p.stats[c];
    return r;
}

// Best-of merge an incoming record over the existing DB row (or another
// in-file record). Mirrors api/classes/eq_store.mjs::mergeRecord.
function mergeRecord(existing, incoming) {
    const m = { ...incoming };
    for (const c of NUM_COLS) m[c] = mergeMag(existing[c], incoming[c]);
    m.dmg_type = existing.dmg_type || incoming.dmg_type || null;
    m.weapon_class = existing.weapon_class || incoming.weapon_class || null;
    m.is_shield = (existing.is_shield || incoming.is_shield) ? 1 : 0;
    m.bound = (existing.bound || incoming.bound) ? 1 : 0;
    m.hands = Math.max(Number(existing.hands) || 1, Number(incoming.hands) || 1);
    m.needs_review = (existing.needs_review && incoming.needs_review) ? 1 : 0;
    m.eqmob_id = existing.eqmob_id ?? incoming.eqmob_id ?? null;
    // slot_raw: keep incoming (the `{...incoming}` spread already does), matching
    // eq_store.mjs::mergeRecord and migrate_eq.mjs (slot_raw=VALUES(slot_raw)).
    // It's audit-only with no readers, so all three writers stay consistent.
    m.name_raw = (incoming.name_raw || '').length > (existing.name_raw || '').length ? incoming.name_raw : existing.name_raw;
    m.raw_info = (incoming.raw_info || '').length > (existing.raw_info || '').length ? incoming.raw_info : existing.raw_info;
    return m;
}

const statSummary = r => NUM_COLS.map(c => [c, r[c]]).filter(([, v]) => v).map(([c, v]) => `${c}=${v}`).join(' ') || '(no stats)';

async function main() {
    if (process.argv.includes('--commands')) return genCommands();

    const ignore = loadIgnore();
    const isIgnored = line => ignore.some(p => line.toLowerCase().includes(p));

    const files = listDropFiles();
    const catalog = new Map();          // key -> { record, bonuses:Map, covers:Set, sources:[] }
    const callouts = new Map();         // unparsed line -> { count, example }
    const perFile = [];                 // { name, blocks, keys:Set }

    for (const file of files) {
        const rel = path.relative(ROOT, file);
        const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        const blocks = splitLibraryBlocks(text);
        const { slotRaw, hands } = fileToSlot(file);
        const fileKeys = new Set();

        for (const block of blocks) {
            const p = parseIdentify(block, slotRaw);
            if (!p.name) continue;
            if (LIST_TITLE_RE.test(p.name)) continue;   // a `list` paste landed here, not item detail
            if (hands !== null && p.wear_slot === 'wield') p.hands = hands;

            const rec = recordOf(p, block);
            const key = `${rec.name}␟${rec.wear_slot}`;
            fileKeys.add(key);

            if (!catalog.has(key)) {
                catalog.set(key, {
                    record: rec,
                    bonuses: new Map(p.bonuses.map(b => [b.bonus_name, b.amount])),
                    covers: new Set(p.covers || []),
                    sources: [rel],
                });
            } else {
                const e = catalog.get(key);
                e.record = mergeRecord(e.record, rec);   // merge same item seen twice in files
                for (const b of p.bonuses) e.bonuses.set(b.bonus_name, mergeMag(e.bonuses.get(b.bonus_name) || 0, b.amount));
                for (const c of (p.covers || [])) e.covers.add(c);
                e.sources.push(rel);
            }

            for (const u of p.unparsed) {
                if (isIgnored(u)) continue;
                const hit = callouts.get(u) || { count: 0, example: p.name };
                hit.count++;
                callouts.set(u, hit);
            }
        }
        perFile.push({ rel, blocks: blocks.length, keys: fileKeys });
    }

    // ---- diff against the catalog (read-only; needs DB) ----
    let db = null;
    try {
        db = await mysql.createConnection({ host: CONFIG.host, user: CONFIG.user, password: CONFIG.password, database: CONFIG.database });
    } catch (e) {
        console.warn(`\n⚠  Cannot reach the DB (${e.code || e.message}). Parse-only: no new/changed diff, cannot --apply.\n`);
    }

    for (const entry of catalog.values()) {
        entry.status = 'NEW'; entry.diff = []; entry.existingId = null;
        if (!db) { entry.status = '?'; continue; }
        const [rows] = await db.query('SELECT * FROM eq_items WHERE name = ? AND wear_slot = ?', [entry.record.name, entry.record.wear_slot]);
        if (!rows[0]) { entry.final = entry.record; continue; }
        entry.existingId = rows[0].id;
        const merged = mergeRecord(rows[0], entry.record);
        entry.final = merged;
        const changed = [];
        for (const c of NUM_COLS) if ((Number(rows[0][c]) || 0) !== (Number(merged[c]) || 0)) changed.push(`${c} ${rows[0][c]}→${merged[c]}`);
        for (const c of ['weapon_class', 'dmg_type', 'hands', 'is_shield', 'bound']) if (String(rows[0][c] ?? '') !== String(merged[c] ?? '')) changed.push(`${c} ${rows[0][c] ?? '∅'}→${merged[c] ?? '∅'}`);
        // Bonuses + covers are written by --apply too (GREATEST upsert /
        // INSERT IGNORE), so a bonus/cover-only delta is a REAL change. The
        // library is the only source of skill/spell bonuses, so existing
        // catalog rows routinely gain them — compare so the dry-run is honest.
        const [bRows] = await db.query('SELECT bonus_name, amount FROM eq_item_bonuses WHERE item_id = ?', [entry.existingId]);
        const haveB = new Map(bRows.map(r => [r.bonus_name, Number(r.amount)]));
        for (const [name, amt] of entry.bonuses) {
            const cur = haveB.get(name);
            if (cur === undefined) changed.push(`+bonus ${name}=${amt}`);
            else if (Math.abs(Number(amt) || 0) > Math.abs(cur)) changed.push(`bonus ${name} ${cur}→${amt}`);
        }
        const [cRows] = await db.query('SELECT wear_slot FROM eq_item_covers WHERE item_id = ?', [entry.existingId]);
        const haveC = new Set(cRows.map(r => r.wear_slot));
        for (const slot of entry.covers) if (!haveC.has(slot)) changed.push(`+cover ${slot}`);
        entry.diff = changed;
        entry.status = changed.length ? 'CHANGED' : 'SAME';
    }

    // ---- report ----
    console.log(`\n=== onboard_eq ${APPLY ? '(APPLY)' : '(dry-run)'} — ${catalog.size} distinct items across ${files.length} files ===`);
    const entries = [...catalog.values()];
    const byKind = s => entries.filter(e => e.status === s);
    for (const pf of perFile) {
        if (!pf.blocks) continue;
        const ents = entries.filter(e => e.sources.includes(pf.rel));
        const n = ents.filter(e => pf.keys.has(`${e.record.name}␟${e.record.wear_slot}`));
        const cnt = s => n.filter(e => e.status === s).length;
        console.log(`\n## ${pf.rel} — ${pf.blocks} blocks → ${pf.keys.size} items  (new ${cnt('NEW')}, changed ${cnt('CHANGED')}, same ${cnt('SAME')})`);
        for (const e of n.filter(e => e.status === 'NEW')) {
            console.log(`  + ${e.record.name} [${e.record.wear_slot}] ${statSummary(e.record)}`
                + (e.covers.size ? `  covers:${[...e.covers].join('/')}` : '')
                + (e.bonuses.size ? `  bonus:${[...e.bonuses.keys()].join(',')}` : ''));
        }
        for (const e of n.filter(e => e.status === 'CHANGED')) {
            console.log(`  ~ ${e.record.name} [${e.record.wear_slot}]: ${e.diff.join(', ')}`
                + (e.covers.size ? `  covers:${[...e.covers].join('/')}` : ''));
        }
    }

    if (callouts.size) {
        console.log(`\n=== CALLOUTS — ${callouts.size} line(s) no rule recognized (decide: ignore.txt vs a parse rule) ===`);
        for (const [line, info] of [...callouts.entries()].sort((a, b) => b[1].count - a[1].count)) {
            console.log(`  (${info.count}×) ${line}      e.g. "${info.example}"`);
        }
    } else {
        console.log(`\n=== CALLOUTS — none (every line was recognized or ignored) ===`);
    }
    console.log(`\nsummary: NEW ${byKind('NEW').length}, CHANGED ${byKind('CHANGED').length}, SAME ${byKind('SAME').length}`
        + (db ? '' : ', diff skipped (no DB)'));

    if (!APPLY) {
        console.log(`\n(dry-run — nothing written. Re-run with --apply once the callouts are resolved.)`);
        if (db) await db.end();
        return;
    }
    if (!db) { console.error('\nCannot --apply without a DB connection.'); process.exit(1); }

    // ---- apply ----
    // eq_item_covers must exist (schema/equipment.sql).
    const [haveCovers] = await db.query("SHOW TABLES LIKE 'eq_item_covers'");
    if (!haveCovers.length) { console.error('\nMissing table eq_item_covers — apply `schema/equipment.sql` first.'); process.exit(1); }

    const placeholders = WRITE_COLS.map(() => '?').join(', ');
    const updates = WRITE_COLS.filter(c => c !== 'name' && c !== 'wear_slot').map(c => `${col(c)}=VALUES(${col(c)})`).join(', ');
    const insertSql = `INSERT INTO eq_items (${WRITE_COLS.map(col).join(', ')}, version, created, updated) `
        + `VALUES (${placeholders}, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE ${updates}, version = version + 1, updated = NOW()`;

    let ins = 0, upd = 0, bonusRows = 0, coverRows = 0;
    for (const e of entries) {
        const r = e.final;
        await db.query(insertSql, WRITE_COLS.map(c => r[c] ?? null));
        const [sel] = await db.query('SELECT id FROM eq_items WHERE name = ? AND wear_slot = ?', [r.name, r.wear_slot]);
        const id = sel[0].id;
        if (e.existingId) upd++; else ins++;

        for (const [bonus_name, amount] of e.bonuses) {
            // Larger-MAGNITUDE wins (sign preserved) so a penalty isn't lost to
            // a 0/positive on re-merge — matches mergeMag for numeric stats.
            await db.query('INSERT INTO eq_item_bonuses (item_id, bonus_name, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = IF(ABS(VALUES(amount)) > ABS(amount), VALUES(amount), amount)', [id, bonus_name, amount]);
            bonusRows++;
        }
        for (const slot of e.covers) {
            await db.query('INSERT IGNORE INTO eq_item_covers (item_id, wear_slot) VALUES (?, ?)', [id, slot]);
            coverRows++;
        }
    }
    console.log(`\napplied: ${ins} inserted, ${upd} merged, ${bonusRows} bonus upserts, ${coverRows} cover rows`);
    await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
