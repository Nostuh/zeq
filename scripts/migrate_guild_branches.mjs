// Apply guild BRANCH POINTS to an existing database (idempotent).
//
// A guild whose .chr file lists itself in its own `Subguilds:` section is a
// branch point, not a cycle — today only faction_of_balance.chr:
//   Faction_of_Chaos 10 / Faction_of_Order 10 / Faction_of_Balance 10
// At its base max (5, from sorcerers.chr) a sorcerer either branches into
// Chaos/Order or continues Balance for 10 more levels (its bonus, skill and
// spell tables already run to 15 in the DB). The importer now records this
// as `max_level = base + N`, `sub_unlock_level = base`; this script brings
// an already-imported database to the same state without a full re-import
// (a re-import can also overwrite admin edits).
//
//   node scripts/migrate_guild_branches.mjs --dry-run
//   node scripts/migrate_guild_branches.mjs
//
// Steps: ensure the `game_guilds.sub_unlock_level` column (same DDL as
// schema/zeq.sql), then for each branch point set the two columns. The
// base level is `sub_unlock_level ?? max_level`, so re-running is a no-op.
// See docs/reinc.md "Branch points".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;
const DRY = process.argv.includes('--dry-run');

// Same rule as parseSubguildsSection() in import_zcreator.mjs (which runs
// on import, so it can't be imported here).
function parseSubguilds(text) {
    const out = [];
    let inSection = false;
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (/^Subguilds:/i.test(t)) { inSection = true; continue; }
        if (!inSection || !t) continue;
        if (/^Not\s+/i.test(t)) break;
        const m = t.match(/^(\S+)\s+(\d+)\s*$/);
        if (m) out.push({ fileName: m[1], levels: parseInt(m[2], 10) });
    }
    return out;
}

async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database, charset: 'utf8mb4',
    });
    console.log(DRY ? '== DRY RUN — nothing will be written ==' : '== LIVE RUN ==');

    const [cols] = await db.query("SHOW COLUMNS FROM game_guilds LIKE 'sub_unlock_level'");
    if (!cols.length) {
        console.log(`${DRY ? '[dry] ' : ''}add column game_guilds.sub_unlock_level`);
        if (!DRY) await db.query('ALTER TABLE game_guilds ADD COLUMN IF NOT EXISTS sub_unlock_level INT NULL AFTER max_level');
    } else {
        console.log('column game_guilds.sub_unlock_level already present');
    }

    const files = fs.readdirSync(DATA);
    const [guilds] = await db.query(
        cols.length ? 'SELECT id, name, file_name, max_level, sub_unlock_level FROM game_guilds'
                    : 'SELECT id, name, file_name, max_level, NULL AS sub_unlock_level FROM game_guilds');
    let found = 0;
    for (const g of guilds) {
        const actual = files.find((f) => f.toLowerCase() === `${g.file_name}.chr`.toLowerCase());
        if (!actual) continue;
        const self = parseSubguilds(fs.readFileSync(path.join(DATA, actual), 'utf8'))
            .find((sg) => sg.fileName.toLowerCase() === g.file_name.toLowerCase());
        if (!self) continue;
        found++;
        const base = g.sub_unlock_level ?? g.max_level;
        const max = base + self.levels;
        if (g.sub_unlock_level === base && g.max_level === max) {
            console.log(`#${g.id} ${g.name}: already a branch point (subguilds at ${base}, max ${max})`);
            continue;
        }
        console.log(`${DRY ? '[dry] ' : ''}#${g.id} ${g.name}: max_level ${g.max_level} → ${max}, sub_unlock_level ${g.sub_unlock_level ?? 'NULL'} → ${base}`);
        if (!DRY) {
            await db.query('UPDATE game_guilds SET max_level = ?, sub_unlock_level = ? WHERE id = ?', [max, base, g.id]);
        }
    }
    console.log(`${found} branch point(s) in the .chr data`);
    await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
