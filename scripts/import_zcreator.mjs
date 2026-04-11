#!/usr/bin/env node
// Import Zcreator Enhanced data files into the zeq DB.
// Usage: node scripts/import_zcreator.mjs [--force]
// Idempotent: skips if data already present unless --force is given.
// --force truncates only game_* tables. Never touches users/auth/eq/eqmobs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;

const FORCE = process.argv.includes('--force');

function log(msg) { console.log(`[import] ${msg}`); }

async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database, multipleStatements: true,
    });
    log(`connected to ${CONFIG.database}@${CONFIG.host}`);

    const [[{ cnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM game_races');
    if (cnt > 0 && !FORCE) {
        log(`game_races already has ${cnt} rows — skipping. Use --force to re-import.`);
        await db.end(); return;
    }
    if (FORCE) {
        log('--force: truncating game_* tables');
        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of ['game_guild_bonuses','game_guild_skills','game_guild_spells',
                         'game_guilds','game_races','game_skills','game_spells',
                         'game_level_costs','game_wish_costs','game_ss_costs']) {
            await db.query(`TRUNCATE TABLE ${t}`);
        }
        await db.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    const files = fs.readdirSync(DATA);
    const lc = (f) => f.toLowerCase();
    const find = (name) => files.find((f) => lc(f) === lc(name));

    // ---- SKILLS / SPELLS ----
    log('importing skills.chr');
    const skillMap = await importSimpleList(db, path.join(DATA, find('skills.chr')), 'game_skills');
    log(`  ${skillMap.size} skills`);
    log('importing spells.chr');
    const spellMap = await importSimpleList(db, path.join(DATA, find('spells.chr')), 'game_spells');
    log(`  ${spellMap.size} spells`);

    // ---- RACES ----
    log('importing races.chr');
    const raceCount = await importRaces(db, path.join(DATA, find('races.chr')));
    log(`  ${raceCount} races (incl. subraces)`);

    // ---- HELP TEXTS ----
    log('importing help_races.chr');
    await importHelp(db, path.join(DATA, find('help_races.chr')), 'game_races', 'Help race');
    log('importing help_skill.chr');
    await importHelp(db, path.join(DATA, find('help_skill.chr')), 'game_skills', 'Help on skill');
    log('importing help_spell.chr');
    await importHelp(db, path.join(DATA, find('help_spell.chr')), 'game_spells', 'Help on spell');

    // ---- GUILDS ----
    log('importing guilds.chr (guild registry)');
    const topGuilds = parseGuildRegistry(path.join(DATA, find('guilds.chr')));
    log(`  ${topGuilds.length} top-level guilds`);

    const importedGuilds = new Set();
    for (const g of topGuilds) {
        await importGuildFile(db, g.fileName, g.displayName, null, g.maxLevel, skillMap, spellMap, importedGuilds, files);
    }
    log(`  total guild files imported: ${importedGuilds.size}`);

    // ---- COST TABLES ----
    log('importing level/stat/quest cost tables');
    await importFlatCosts(db, path.join(DATA, find('levelcosts.chr')), 'level');
    await importFlatCosts(db, path.join(DATA, find('statcost.chr')), 'stat');
    await importFlatCosts(db, path.join(DATA, find('questpoints.chr')), 'quest');

    log('importing wishcost.chr');
    await importWishCosts(db, path.join(DATA, find('wishcost.chr')));

    log('importing costs.txt');
    await importSSCosts(db, path.join(DATA, find('costs.txt')));

    log('done');
    await db.end();
}

// --- helpers ---

function readLines(file) {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

async function importSimpleList(db, file, table) {
    const map = new Map();
    const rows = [];
    for (const line of readLines(file)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const idx = line.indexOf(':');
        if (idx < 0) continue;
        const name = line.slice(0, idx).trim().toLowerCase();
        const costStr = line.slice(idx + 1).trim();
        if (!name) continue;
        const cost = parseInt(costStr, 10);
        rows.push([name, isNaN(cost) ? 0 : cost]);
    }
    for (const [name, cost] of rows) {
        const [r] = await db.query(
            `INSERT INTO ${table} (name, start_cost) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE start_cost = VALUES(start_cost)`,
            [name, cost]);
        let id = r.insertId;
        if (!id) {
            const [[row]] = await db.query(`SELECT id FROM ${table} WHERE name = ?`, [name]);
            id = row.id;
        }
        map.set(name, id);
    }
    return map;
}

async function importRaces(db, file) {
    let lastParentId = null;
    let count = 0;
    for (const raw of readLines(file)) {
        if (!raw.trim() || raw.trim().startsWith('#')) continue;
        const parts = raw.split(':').map((s) => s.trim());
        if (parts.length < 15) continue;
        let name = parts[0];
        const isSub = name.startsWith('-');
        if (isSub) name = name.slice(1).trim();
        if (!name) continue;
        const nums = parts.slice(1, 15).map((v) => parseInt(v, 10) || 0);
        const [
            max_str, max_dex, max_con, max_int, max_wis, max_cha,
            size, exp_rate, sp_regen, hp_regen,
            skill_max, spell_max, skill_cost, spell_cost
        ] = nums;
        const parent_id = isSub ? lastParentId : null;
        const [r] = await db.query(
            `INSERT INTO game_races
             (name, parent_id, max_str, max_dex, max_con, max_int, max_wis, max_cha,
              size, exp_rate, sp_regen, hp_regen, skill_max, spell_max, skill_cost, spell_cost)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               parent_id=VALUES(parent_id),
               max_str=VALUES(max_str), max_dex=VALUES(max_dex), max_con=VALUES(max_con),
               max_int=VALUES(max_int), max_wis=VALUES(max_wis), max_cha=VALUES(max_cha),
               size=VALUES(size), exp_rate=VALUES(exp_rate),
               sp_regen=VALUES(sp_regen), hp_regen=VALUES(hp_regen),
               skill_max=VALUES(skill_max), spell_max=VALUES(spell_max),
               skill_cost=VALUES(skill_cost), spell_cost=VALUES(spell_cost)`,
            [name, parent_id, max_str, max_dex, max_con, max_int, max_wis, max_cha,
             size, exp_rate, sp_regen, hp_regen, skill_max, spell_max, skill_cost, spell_cost]);
        let id = r.insertId;
        if (!id) {
            const [[row]] = await db.query('SELECT id FROM game_races WHERE name = ?', [name]);
            id = row.id;
        }
        if (!isSub) lastParentId = id;
        count++;
    }
    return count;
}

function splitHelpBlocks(text, header) {
    // Split on lines of 5+ dashes. Each block may start with `header <name>`.
    const raw = text.split(/^-{5,}.*$/m);
    const blocks = [];
    for (const b of raw) {
        const trimmed = b.trim();
        if (!trimmed) continue;
        const lines = trimmed.split(/\r?\n/);
        let nameLine = lines[0];
        const rest = [];
        let name = null;
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (!name && l.toLowerCase().startsWith(header.toLowerCase())) {
                // "Help on skill:     Foo" or "Help on race Foo"
                let tail = l.slice(header.length);
                tail = tail.replace(/^[:\s]+/, '').trim();
                // help_skill.chr and help_spell.chr have "Usage:" etc. lines after;
                // the name is on this line.
                name = tail.replace(/\.$/, '').trim();
                continue;
            }
            rest.push(l);
        }
        if (name) blocks.push({ name: name.toLowerCase(), body: rest.join('\n').trim() });
    }
    return blocks;
}

async function importHelp(db, file, table, header) {
    const text = fs.readFileSync(file, 'utf8');
    const blocks = splitHelpBlocks(text, header);
    let matched = 0;
    for (const { name, body } of blocks) {
        const [r] = await db.query(
            `UPDATE ${table} SET help_text = ? WHERE LOWER(name) = ?`,
            [body, name]);
        if (r.affectedRows > 0) matched++;
    }
    log(`  ${matched}/${blocks.length} help blocks matched into ${table}`);
}

function parseGuildRegistry(file) {
    const out = [];
    for (const line of readLines(file)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const m = t.match(/^(\S+)\s+(\d+)\s*$/);
        if (!m) continue;
        const fileName = m[1];
        out.push({
            fileName,
            displayName: fileName.replace(/_/g, ' '),
            maxLevel: parseInt(m[2], 10),
        });
    }
    return out;
}

async function upsertGuild(db, displayName, fileName, parentId, maxLevel) {
    const [r] = await db.query(
        `INSERT INTO game_guilds (name, file_name, parent_id, max_level)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE
           file_name=VALUES(file_name),
           parent_id=VALUES(parent_id),
           max_level=VALUES(max_level)`,
        [displayName, fileName, parentId, maxLevel]);
    if (r.insertId) return r.insertId;
    const [[row]] = await db.query('SELECT id FROM game_guilds WHERE name = ?', [displayName]);
    return row.id;
}

async function importGuildFile(db, fileName, displayName, parentId, maxLevel,
                               skillMap, spellMap, seen, files) {
    if (seen.has(displayName.toLowerCase())) return;
    seen.add(displayName.toLowerCase());

    // Case-insensitive match for .chr/.CHR
    const wanted = `${fileName}.chr`;
    const actual = files.find((f) => f.toLowerCase() === wanted.toLowerCase());
    if (!actual) {
        log(`  ! missing guild file: ${wanted}`);
        return;
    }

    const guildId = await upsertGuild(db, displayName, fileName, parentId, maxLevel);
    const text = fs.readFileSync(path.join(DATA, actual), 'utf8');

    // Phase 1: bonus box
    const bonuses = parseBonusBox(text);
    for (const [level, list] of bonuses) {
        for (const { name, value } of list) {
            await db.query(
                `INSERT INTO game_guild_bonuses (guild_id, level, bonus_name, value)
                 VALUES (?,?,?,?)`,
                [guildId, level, name, value]);
        }
    }

    // Phase 2: ability blocks
    const abilities = parseAbilityBlocks(text);
    for (const { level, kind, name, percent } of abilities) {
        const lookup = kind === 'skill' ? skillMap : spellMap;
        let targetId = lookup.get(name);
        if (!targetId) {
            // Create a placeholder so referenced skills/spells always resolve.
            const table = kind === 'skill' ? 'game_skills' : 'game_spells';
            const [r] = await db.query(
                `INSERT INTO ${table} (name, start_cost) VALUES (?, 0)
                 ON DUPLICATE KEY UPDATE start_cost = start_cost`, [name]);
            targetId = r.insertId;
            if (!targetId) {
                const [[row]] = await db.query(`SELECT id FROM ${table} WHERE name = ?`, [name]);
                targetId = row.id;
            }
            lookup.set(name, targetId);
        }
        const table = kind === 'skill' ? 'game_guild_skills' : 'game_guild_spells';
        const col = kind === 'skill' ? 'skill_id' : 'spell_id';
        await db.query(
            `INSERT INTO ${table} (guild_id, ${col}, level, max_percent)
             VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE max_percent = VALUES(max_percent)`,
            [guildId, targetId, level, percent]);
    }

    // Phase 3: subguilds section
    const subguilds = parseSubguildsSection(text);
    for (const sg of subguilds) {
        await importGuildFile(db, sg.fileName, sg.displayName, guildId, sg.maxLevel,
            skillMap, spellMap, seen, files);
    }
}

function parseBonusBox(text) {
    const lines = text.split(/\r?\n/);
    const results = new Map(); // level -> [{name,value}]
    let i = 0;
    // Locate header row
    while (i < lines.length && !/^\s*\|\s*Lvl\s*\|/.test(lines[i])) i++;
    if (i >= lines.length) return results;
    i++;
    // Skip separator
    while (i < lines.length && /^\s*\|=+\|=+\|/.test(lines[i])) i++;

    let currentLevel = null;
    let buffer = '';
    const flush = () => {
        if (currentLevel == null || !buffer.trim()) { buffer = ''; return; }
        const list = [];
        const re = /([A-Za-z][A-Za-z _-]*?)\s*\((-?\d+)\)/g;
        let m;
        while ((m = re.exec(buffer)) !== null) {
            list.push({ name: m[1].trim().toLowerCase(), value: parseInt(m[2], 10) });
        }
        if (list.length) results.set(currentLevel, list);
        buffer = '';
    };

    for (; i < lines.length; i++) {
        const line = lines[i];
        if (/^[`'].*[`'-]+[`'-]$/.test(line.trim()) || /^`[-]+`?$/.test(line.trim())) break;
        if (!line.startsWith('|')) break;
        // Strip leading/trailing pipes
        const inner = line.replace(/^\|/, '').replace(/\|\s*$/, '');
        // Split level | rest
        const pipeIdx = inner.indexOf('|');
        if (pipeIdx < 0) continue;
        const lvlCell = inner.slice(0, pipeIdx).trim();
        const rest = inner.slice(pipeIdx + 1);
        if (lvlCell !== '') {
            flush();
            const lvl = parseInt(lvlCell, 10);
            if (isNaN(lvl)) continue;
            currentLevel = lvl;
            buffer = rest;
        } else {
            buffer += ' ' + rest;
        }
    }
    flush();
    return results;
}

function parseAbilityBlocks(text) {
    const lines = text.split(/\r?\n/);
    const results = [];
    let level = null;
    let pending = '';
    for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        // Stop when we hit the Subguilds section.
        if (/^Subguilds:/i.test(line.trim())) break;
        const lvlMatch = line.match(/^Level\s+(\d+)\s+abilities\s*:/i);
        if (lvlMatch) { level = parseInt(lvlMatch[1], 10); pending = ''; continue; }
        if (level == null) continue;
        if (!line.trim() || /^-{3,}/.test(line.trim())) continue;
        pending = (pending ? pending + ' ' : '') + line.trim();
        if (!pending.includes('%')) continue;
        const m = pending.match(/^May\s+(train\s+skill|study\s+spell)\s+(.+?)\s+to\s+(\d+)\s*%/i);
        if (m) {
            const kind = /train\s+skill/i.test(m[1]) ? 'skill' : 'spell';
            results.push({
                level, kind,
                name: m[2].trim().toLowerCase(),
                percent: parseInt(m[3], 10),
            });
        }
        pending = '';
    }
    return results;
}

function parseSubguildsSection(text) {
    const lines = text.split(/\r?\n/);
    const out = [];
    let inSection = false;
    for (const line of lines) {
        const t = line.trim();
        if (/^Subguilds:/i.test(t)) { inSection = true; continue; }
        if (!inSection) continue;
        if (!t) continue;
        if (/^Not\s+/i.test(t)) break;
        const m = t.match(/^(\S+)\s+(\d+)\s*$/);
        if (!m) continue;
        out.push({
            fileName: m[1],
            displayName: m[1].replace(/_/g, ' '),
            maxLevel: parseInt(m[2], 10),
        });
    }
    return out;
}

async function importFlatCosts(db, file, kind) {
    const lines = readLines(file).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    let level = 1;
    for (const l of lines) {
        const n = parseInt(l, 10);
        if (isNaN(n)) continue;
        await db.query(
            `INSERT INTO game_level_costs (kind, level, cost) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE cost = VALUES(cost)`,
            [kind, level, n]);
        level++;
    }
}

async function importWishCosts(db, file) {
    const nums = readLines(file).map((l) => parseInt(l.trim(), 10)).filter((n) => !isNaN(n));
    const lesser = nums.slice(0, 9);
    const greater = nums.slice(9, 18);
    for (let i = 0; i < lesser.length; i++) {
        await db.query(`INSERT INTO game_wish_costs (kind, tier, cost) VALUES ('lesser', ?, ?)
                        ON DUPLICATE KEY UPDATE cost = VALUES(cost)`, [i + 1, lesser[i]]);
    }
    for (let i = 0; i < greater.length; i++) {
        await db.query(`INSERT INTO game_wish_costs (kind, tier, cost) VALUES ('greater', ?, ?)
                        ON DUPLICATE KEY UPDATE cost = VALUES(cost)`, [i + 1, greater[i]]);
    }
}

async function importSSCosts(db, file) {
    for (const line of readLines(file)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const parts = t.split(/\s+/).map((s) => parseInt(s, 10));
        if (parts.length < 3 || parts.some((n) => isNaN(n))) continue;
        const [from, to, mul] = parts;
        await db.query(
            `INSERT INTO game_ss_costs (from_pct, to_pct, multiplier) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE multiplier = VALUES(multiplier)`,
            [from, to, mul]);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
