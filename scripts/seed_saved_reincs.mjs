#!/usr/bin/env node
// Seed a handful of prebuilt "funny" reincs into game_saved_reincs so
// the /builds page has content on day one. Idempotent on
// (is_featured=1, title) — running again skips anything already seeded.
//
// Each seed's race / guild / wish / boon references are looked up by
// name (case-insensitive) against the current game data. If any
// reference can't be resolved (race disabled, guild renamed, wish
// deleted) the seed is skipped with a warning instead of crashing, so
// this script is safe to run on a partially-populated database.
//
// The engine computation mirrors the browser planner: we import
// www/src/components/reinc/engine.js directly and feed it the same
// shapes Reinc.vue feeds its computed properties. This keeps the
// cached display metadata (total_exp, gold, hp, sp) honest without
// a parallel JS implementation.
//
// Usage:   node scripts/seed_saved_reincs.mjs
//          node scripts/seed_saved_reincs.mjs --force   # re-seed, overwrite state

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import {
    computeCharacter, computeLevelExp,
    buildSkillCostArray, skillExp, MAX_LEVEL,
} from '../www/src/components/reinc/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;

const FORCE = process.argv.includes('--force');

// -----------------------------------------------------------------
// SEEDS — each entry describes a reinc by human-readable names. The
// main() routine resolves them to ids against the live game data.
// -----------------------------------------------------------------
// Notes on shape:
//   race          — case-insensitive race name
//   guilds        — array of { name, level } OR { any: true } to let
//                   the script pick the first viable guild if the
//                   preferred names are missing
//   skills/spells — array of { name, percent } (0..100). Missing names
//                   are silently skipped.
//   wishes/boons  — array of names
//   extra_free    — additional free levels beyond guild levels
//   quest         — quest points to spend
//
const SEEDS = [
    {
        title: "Gimdori's Shameless Tank",
        author: 'Gimdori',
        description:
            'The platonic ideal of a melee dwarf: max Fighter, a helping '
            + 'of Barbarian, and just enough Berserker to sound scary. '
            + 'Zero spells. Absolutely zero. If you cast anything on this '
            + 'reinc the dwarf gets offended and rerolls.',
        race: 'Dwarf',
        // Berserker is a subguild of Barbarian — it is only legal if
        // Barbarian is sitting at max_level. Keep these in sync with
        // game_guilds.max_level if the importer ever re-levels them.
        guilds: [
            { name: 'Fighter',   level: 45 },
            { name: 'Barbarian', level: 45 },
            { name: 'Berserker', level: 15 },
        ],
        skills: [
            { name: 'attack',       percent: 100 },
            { name: 'dodge',        percent: 100 },
            { name: 'parry',        percent: 100 },
            { name: 'toughness',    percent: 100 },
        ],
        spells: [],
        wishes: ['Improved strength', 'Improved constitution', 'Thick skin'],
        boons: [],
        extra_free: 10,
        quest: 500,
    },
    {
        title: 'The Pacifist Healer (No Healing Spells)',
        author: 'Anonymous Coward',
        description:
            "It's a Human Healer who refuses to learn a single healing "
            + 'spell out of moral principle. Maxed out on stat wishes and '
            + 'a full set of boons, just waiting for someone to throw a '
            + 'bandage at them. 0 HP recovered, 100% vibes.',
        race: 'Human',
        guilds: [
            { name: 'Healer', level: 45 },
            { name: 'Cleric', level: 25 },
        ],
        skills: [],
        spells: [],
        wishes: ['Lesser stats wish', 'Lesser physical wish', 'Improved wisdom'],
        boons: [],
        extra_free: 50,
        quest: 800,
    },
    {
        title: 'Brain Bigger Than Body',
        author: 'Thinky McThinkface',
        description:
            'Mind Flayer stacking every spellcaster guild it can touch. '
            + 'The HP bar is a polite suggestion; the SP bar is the entire '
            + 'personality. Pick a spell — any spell — and it is probably '
            + 'trained on this build.',
        race: 'Mind Flayer',
        guilds: [
            { name: 'Mage',       level: 40 },
            { name: 'Sorcerers',  level: 30 },
            { name: 'Psionicist', level: 30 },
        ],
        skills: [],
        spells: [
            { name: 'magic missile',  percent: 100 },
            { name: 'fireball',       percent: 100 },
            { name: 'lightning bolt', percent: 100 },
        ],
        wishes: ['Improved intelligence', 'Improved wisdom', 'Lesser magical wish'],
        boons: [],
        extra_free: 20,
        quest: 300,
    },
];

// -----------------------------------------------------------------
// Catalog loaders — pull everything the engine needs out of the DB
// in the same shapes the reinc-bootstrap endpoint returns.
// -----------------------------------------------------------------
async function loadCatalog(db) {
    const [races] = await db.query(
        `SELECT * FROM game_races WHERE enabled = 1`);
    const [guilds] = await db.query(
        `SELECT id, name, file_name, parent_id, max_level FROM game_guilds`);
    const [skills] = await db.query(
        `SELECT id, name, start_cost FROM game_skills`);
    const [spells] = await db.query(
        `SELECT id, name, start_cost FROM game_spells`);
    const [wishes] = await db.query(
        `SELECT id, name, category, tp_cost, effect_key, effect_value FROM game_wishes`);
    const [boons] = await db.query(
        `SELECT id, name, category, pp_cost FROM game_boons`);
    const [levelCostRows] = await db.query(
        `SELECT kind, level, cost FROM game_level_costs ORDER BY kind, level`);
    const [ssCostsRows] = await db.query(
        `SELECT from_pct, multiplier FROM game_ss_costs ORDER BY from_pct`);
    const levelCostMap = { level: [], stat: [], quest: [] };
    for (const r of levelCostRows) {
        (levelCostMap[r.kind] ||= [])[r.level - 1] = Number(r.cost);
    }
    const ssCosts = ssCostsRows.map((r) => r.multiplier);
    return { races, guilds, skills, spells, wishes, boons, levelCostMap, ssCosts };
}

async function loadGuildData(db, id) {
    const [bonuses] = await db.query(
        `SELECT level, bonus_name, value FROM game_guild_bonuses
         WHERE guild_id = ? ORDER BY level, bonus_name`, [id]);
    const [skills] = await db.query(
        `SELECT level, skill_id, max_percent FROM game_guild_skills
         WHERE guild_id = ? ORDER BY level`, [id]);
    const [spells] = await db.query(
        `SELECT level, spell_id, max_percent FROM game_guild_spells
         WHERE guild_id = ? ORDER BY level`, [id]);
    return { bonuses, skills, spells };
}

function findByName(rows, name) {
    if (!name) return null;
    const n = name.toLowerCase();
    return rows.find((r) => (r.name || '').toLowerCase() === n) || null;
}

// -----------------------------------------------------------------
// Engine totals — mirror the two `*ExpTotal` computeds in Reinc.vue
// so seed metadata matches what the user would see after hitting
// "Open in planner".
// -----------------------------------------------------------------
function skillExpTotal(learned, skills, race, ssCosts) {
    if (!race) return 0;
    const maxcost = (race.skill_cost | 0) * 100000;
    let total = 0;
    for (const [idStr, pct] of Object.entries(learned)) {
        if (!pct) continue;
        const full = skills.find((s) => s.id === +idStr);
        if (!full) continue;
        const arr = buildSkillCostArray(full.start_cost, ssCosts, race.skill_cost);
        total += skillExp(pct, arr, maxcost);
    }
    return total;
}
function spellExpTotal(learned, spells, race, ssCosts) {
    if (!race) return 0;
    const maxcost = (race.spell_cost | 0) * 100000;
    let total = 0;
    for (const [idStr, pct] of Object.entries(learned)) {
        if (!pct) continue;
        const full = spells.find((s) => s.id === +idStr);
        if (!full) continue;
        const arr = buildSkillCostArray(full.start_cost, ssCosts, race.spell_cost);
        total += skillExp(pct, arr, maxcost);
    }
    return total;
}

// -----------------------------------------------------------------
async function resolveSeed(db, seed, cat) {
    const race = findByName(cat.races, seed.race);
    if (!race) return { ok: false, reason: `race "${seed.race}" not found` };

    const picks = [];
    for (const g of seed.guilds) {
        const guild = findByName(cat.guilds, g.name);
        if (!guild) return { ok: false, reason: `guild "${g.name}" not found` };
        const level = Math.max(1, Math.min(guild.max_level | 0, g.level | 0));
        picks.push({ guild, level });
    }
    // Enforce the 120-level cap — clamp the last pick if seeds are too
    // ambitious for the current data set.
    let sum = 0;
    for (const p of picks) {
        const room = Math.max(0, MAX_LEVEL - sum);
        p.level = Math.min(p.level, room);
        sum += p.level;
    }

    // Enforce the subguild rule: a subguild pick is only valid if its
    // parent guild is ALSO picked and sitting at the parent's full
    // max_level. Match the live `isLocked` check in Reinc.vue so a
    // seeded build can never produce a "subguild with unmaxed parent"
    // state the planner would reject when the user opens it.
    const parentLevel = new Map();
    for (const p of picks) if (!p.guild.parent_id) parentLevel.set(p.guild.id, p.level);
    for (const p of picks) {
        if (!p.guild.parent_id) continue;
        const parentId = p.guild.parent_id;
        const parent = cat.guilds.find((g) => g.id === parentId);
        const haveAtMax = parent && parentLevel.get(parentId) === (parent.max_level | 0);
        if (!haveAtMax) {
            return { ok: false, reason:
                `subguild "${p.guild.name}" requires its parent at max_level `
                + `(${parent ? parent.max_level : '?'}); add it to the seed` };
        }
    }

    for (const p of picks) p.data = await loadGuildData(db, p.guild.id);

    const skillLearned = {};
    for (const s of seed.skills || []) {
        const row = findByName(cat.skills, s.name);
        if (!row) continue;
        skillLearned[row.id] = s.percent | 0;
    }
    const spellLearned = {};
    for (const s of seed.spells || []) {
        const row = findByName(cat.spells, s.name);
        if (!row) continue;
        spellLearned[row.id] = s.percent | 0;
    }
    const wishIds = new Set();
    for (const n of seed.wishes || []) {
        const w = findByName(cat.wishes, n);
        if (w) wishIds.add(w.id);
    }
    const boonIds = new Set();
    for (const n of seed.boons || []) {
        const b = findByName(cat.boons, n);
        if (b) boonIds.add(b.id);
    }

    const guildLevelsSum = picks.reduce((a, p) => a + (p.level | 0), 0);
    const extraFree = seed.extra_free | 0;
    const freeLevels = Math.min(Math.max(0, extraFree), MAX_LEVEL - guildLevelsSum);
    const stats = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

    const character = computeCharacter({
        race,
        guildPicks: picks,
        stats,
        wishes: wishIds,
        boons: boonIds,
        wishCatalog: cat.wishes,
        boonCatalog: cat.boons,
    });

    const lx = computeLevelExp({
        guildLevels: guildLevelsSum,
        freeLevels,
        qps: seed.quest | 0,
        levelCosts: cat.levelCostMap.level,
        questCosts: cat.levelCostMap.quest,
    });

    const skillExp_ = skillExpTotal(skillLearned, cat.skills, race, cat.ssCosts);
    const spellExp_ = spellExpTotal(spellLearned, cat.spells, race, cat.ssCosts);
    const totalExp = skillExp_ + spellExp_ + lx.raceExp + lx.guildExp;
    const gold = Math.floor((skillExp_ + spellExp_) / 2250);

    const state = {
        v: 1,
        race_id: race.id,
        guild_picks: picks.map((p) => ({ guild_id: p.guild.id, level: p.level })),
        stat_train: stats,
        wishes: [...wishIds],
        boons: [...boonIds],
        skill_learned: skillLearned,
        spell_learned: spellLearned,
        extra_free: extraFree,
        quest: seed.quest | 0,
        tp: 1000,
    };

    return {
        ok: true,
        row: {
            title: seed.title,
            author: seed.author,
            description: seed.description,
            state: JSON.stringify(state),
            race_name: race.name,
            guild_summary: picks.map((p) => `${p.guild.name} ${p.level}`).join(' / '),
            total_levels: guildLevelsSum + freeLevels,
            total_exp: totalExp,
            gold,
            hp: character.hp,
            sp: character.sp,
        },
    };
}

// -----------------------------------------------------------------
async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database,
    });
    console.log(`[seed_saved_reincs] connected to ${CONFIG.database}@${CONFIG.host}`);

    const cat = await loadCatalog(db);
    console.log(`[seed_saved_reincs] catalog: ${cat.races.length} races, `
        + `${cat.guilds.length} guilds, ${cat.skills.length} skills, `
        + `${cat.spells.length} spells`);

    let inserted = 0, skipped = 0, overwritten = 0, failed = 0;
    for (const seed of SEEDS) {
        const [existing] = await db.query(
            `SELECT id FROM game_saved_reincs
             WHERE is_featured = 1 AND title = ?`, [seed.title]);
        if (existing.length && !FORCE) { skipped++; continue; }

        const result = await resolveSeed(db, seed, cat);
        if (!result.ok) {
            console.warn(`[seed_saved_reincs] skip "${seed.title}": ${result.reason}`);
            failed++;
            continue;
        }
        const row = result.row;
        if (existing.length) {
            await db.query(
                `UPDATE game_saved_reincs SET
                    author=?, description=?, state=?, race_name=?, guild_summary=?,
                    total_levels=?, total_exp=?, gold=?, hp=?, sp=?, is_featured=1
                 WHERE id=?`,
                [row.author, row.description, row.state, row.race_name, row.guild_summary,
                 row.total_levels, row.total_exp, row.gold, row.hp, row.sp, existing[0].id]);
            overwritten++;
        } else {
            await db.query(
                `INSERT INTO game_saved_reincs
                    (title, author, description, state, race_name, guild_summary,
                     total_levels, total_exp, gold, hp, sp, is_featured, created)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
                [row.title, row.author, row.description, row.state, row.race_name, row.guild_summary,
                 row.total_levels, row.total_exp, row.gold, row.hp, row.sp]);
            inserted++;
        }
    }
    console.log(`[seed_saved_reincs] inserted=${inserted} overwritten=${overwritten} `
        + `skipped=${skipped} failed=${failed}`);
    await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
