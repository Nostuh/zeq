// Engine audit harness — compares www/src/components/reinc/engine.js
// against a hand-port of the Zcreator C# (in lib/zcreator_reference.mjs)
// across hundreds of randomly-generated character builds plus a small
// set of anchor builds captured by hand from the Zcreator desktop app.
//
// Run:
//   node audit_engine.mjs                  # 500 random builds, default seed
//   node audit_engine.mjs --n 2000         # more builds
//   node audit_engine.mjs --seed 42        # deterministic seed override
//   node audit_engine.mjs --verbose        # print every diff field
//
// The audit pulls every game_* table once and runs both implementations
// fully in-process; no HTTP, no browser. It exits non-zero on the first
// build that fails so CI can gate on it.

import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { argv } from 'node:process';

import {
    sumGuildBonuses, computeCharacter,
    buildSkillCostArray, skillExp,
    computeLevelExp, computeStatExp,
} from '../../www/src/components/reinc/engine.js';

import {
    setCosts as refSetCosts,
    skillExp as refSkillExp,
    statExp as refStatExp,
    qpsneeded as refQpsNeeded,
    updateExperience as refUpdateExperience,
    charInfo as refCharInfo,
    sumGuildBonusesRef,
    gold as refGold,
} from './lib/zcreator_reference.mjs';

// ----- argv -----
const args = parseArgs(argv.slice(2));
const N = args.n || 500;
const SEED = args.seed || 0xc0ffee;
const VERBOSE = !!args.verbose;
const STOP_ON_FIRST = !args['no-stop'];

function parseArgs(a) {
    const out = {};
    for (let i = 0; i < a.length; i++) {
        const k = a[i];
        if (k.startsWith('--')) {
            const next = a[i + 1];
            if (next != null && !next.startsWith('--')) { out[k.slice(2)] = isNaN(+next) ? next : +next; i++; }
            else { out[k.slice(2)] = true; }
        }
    }
    return out;
}

// ----- mulberry32 PRNG (deterministic so failures reproduce) -----
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ----- DB load -----
const cfg = JSON.parse(await readFile(new URL('../../api/classes/config.json', import.meta.url))).zeq;
const conn = await mysql.createConnection({ host: cfg.host, user: cfg.user, password: cfg.password, database: cfg.database });

const [races] = await conn.execute(`SELECT * FROM game_races WHERE enabled = 1`);
const [guilds] = await conn.execute(`SELECT id, name, parent_id, max_level FROM game_guilds`);
const [bonuses] = await conn.execute(`SELECT guild_id, level, bonus_name, value FROM game_guild_bonuses`);
const [guildSkills] = await conn.execute(`SELECT guild_id, skill_id, level, max_percent FROM game_guild_skills`);
const [guildSpells] = await conn.execute(`SELECT guild_id, spell_id, level, max_percent FROM game_guild_spells`);
const [skills] = await conn.execute(`SELECT id, name, start_cost FROM game_skills`);
const [spells] = await conn.execute(`SELECT id, name, start_cost FROM game_spells`);
const [levelCostRows] = await conn.execute(`SELECT kind, level, cost FROM game_level_costs`);
const [ssCostRows] = await conn.execute(`SELECT from_pct, multiplier FROM game_ss_costs ORDER BY from_pct`);
await conn.end();

// Index everything for cheap lookup.
const racesById = new Map(races.map((r) => [r.id, r]));
const guildsById = new Map(guilds.map((g) => [g.id, g]));
const subguildsByParent = new Map();
for (const g of guilds) {
    if (g.parent_id) (subguildsByParent.get(g.parent_id) || subguildsByParent.set(g.parent_id, []).get(g.parent_id)).push(g);
}
const bonusesByGuild = {};
for (const b of bonuses) (bonusesByGuild[b.guild_id] ||= []).push(b);
const guildSkillsByGuild = {};
for (const r of guildSkills) (guildSkillsByGuild[r.guild_id] ||= []).push(r);
const guildSpellsByGuild = {};
for (const r of guildSpells) (guildSpellsByGuild[r.guild_id] ||= []).push(r);
const skillById = new Map(skills.map((s) => [s.id, s]));
const spellById = new Map(spells.map((s) => [s.id, s]));

const levelCosts = [];
const statCosts = [];
const questCosts = [];
for (const r of levelCostRows) {
    const arr = r.kind === 'level' ? levelCosts : r.kind === 'stat' ? statCosts : questCosts;
    arr[r.level - 1] = Number(r.cost);
}
const ssCosts = ssCostRows.map((r) => Number(r.multiplier));

console.log(`loaded ${races.length} races, ${guilds.length} guilds, ${bonuses.length} bonus rows, ${skills.length} skills, ${spells.length} spells`);

// ----- random valid build generator -----
function makeRandomBuild(rng) {
    const race = races[Math.floor(rng() * races.length)];
    const parents = guilds.filter((g) => !g.parent_id);

    const picks = []; // [{ guild_id, level }]
    const pickedIds = new Set();
    let total = 0;
    const MAX = 120;
    const targetGuilds = 1 + Math.floor(rng() * 5);

    // Phase 1: pick parent guilds.
    const parentPool = [...parents];
    while (picks.length < targetGuilds && parentPool.length && total < MAX) {
        const idx = Math.floor(rng() * parentPool.length);
        const g = parentPool.splice(idx, 1)[0];
        if (pickedIds.has(g.id)) continue;
        const room = MAX - total;
        if (room <= 0) break;
        const lvl = 1 + Math.floor(rng() * Math.min(g.max_level, room));
        picks.push({ guild_id: g.id, level: lvl });
        pickedIds.add(g.id);
        total += lvl;
    }

    // Phase 2: maybe add subguilds for any parent that landed at max_level.
    for (const p of [...picks]) {
        const g = guildsById.get(p.guild_id);
        if (p.level !== g.max_level) continue; // subguilds locked
        const subs = subguildsByParent.get(g.id) || [];
        for (const s of subs) {
            if (rng() < 0.4 && total < MAX && !pickedIds.has(s.id)) {
                const room = MAX - total;
                const lvl = 1 + Math.floor(rng() * Math.min(s.max_level, room));
                if (lvl <= 0) break;
                picks.push({ guild_id: s.id, level: lvl });
                pickedIds.add(s.id);
                total += lvl;
            }
        }
    }

    const guildLevelsSum = picks.reduce((a, p) => a + p.level, 0);
    const freeBudget = MAX - guildLevelsSum;
    const extraFree = Math.floor(rng() * (freeBudget + 1));

    // Stat training: each up to ~30 points (statCosts.length is the cap).
    const stats = {};
    for (const s of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
        stats[s] = Math.floor(rng() * Math.min(31, statCosts.length));
    }

    // Random skill/spell percentages — only for skills/spells the picks
    // unlock, and clamped to the actual scaled cap the UI would allow
    // (Character.availableSkills at Character.cs:164). With no wishes
    // in the audit, scale = race.skill_max / 100 ≤ 1, so a per-guild
    // max of 95 caps at 5*floor(scale*95/5) just like the planner.
    const skillLearned = {};
    const spellLearned = {};
    const scaleSk = Math.min(1, race.skill_max / 100);
    const scaleSp = Math.min(1, race.spell_max / 100);
    const collect = (rowsByGuild, idKey) => {
        const byId = new Map();
        for (const p of picks) {
            for (const r of (rowsByGuild[p.guild_id] || [])) {
                if (r.level > p.level) continue;
                const prev = byId.get(r[idKey]);
                if (!prev || r.max_percent > prev) byId.set(r[idKey], r.max_percent);
            }
        }
        return byId;
    };
    const sks = collect(guildSkillsByGuild, 'skill_id');
    for (const [id, maxPerGuild] of sks) {
        if (rng() >= 0.5) continue;
        const cap = maxPerGuild === 100 ? race.skill_max : 5 * Math.floor(scaleSk * maxPerGuild / 5);
        if (cap <= 0) continue;
        skillLearned[id] = 5 * Math.floor(rng() * (cap / 5 + 1));
    }
    const sps = collect(guildSpellsByGuild, 'spell_id');
    for (const [id, maxPerGuild] of sps) {
        if (rng() >= 0.5) continue;
        const cap = maxPerGuild === 100 ? race.spell_max : 5 * Math.floor(scaleSp * maxPerGuild / 5);
        if (cap <= 0) continue;
        spellLearned[id] = 5 * Math.floor(rng() * (cap / 5 + 1));
    }

    // QPs: occasionally generous, occasionally tiny, occasionally zero.
    const qpRoll = rng();
    const qps = qpRoll < 0.2 ? 0 : qpRoll < 0.7 ? Math.floor(rng() * 9000) : Math.floor(rng() * 100000);

    return { race, picks, extraFree, stats, skillLearned, spellLearned, qps, guildLevelsSum, freeBudget };
}

// ----- engine + reference runners -----

// Resolve picks into the shape engine.computeCharacter expects.
function buildEnginePicks(picks) {
    return picks.map((p) => {
        const guild = guildsById.get(p.guild_id);
        const data = {
            bonuses: (bonusesByGuild[p.guild_id] || []).map((b) => ({ level: b.level, bonus_name: b.bonus_name, value: b.value })),
            skills: (guildSkillsByGuild[p.guild_id] || []).map((r) => ({ skill_id: r.skill_id, level: r.level, max_percent: r.max_percent })),
            spells: (guildSpellsByGuild[p.guild_id] || []).map((r) => ({ spell_id: r.spell_id, level: r.level, max_percent: r.max_percent })),
        };
        return { guild, level: p.level, data };
    });
}

function runEngine(b) {
    const enginePicks = buildEnginePicks(b.picks);
    const character = computeCharacter({
        race: b.race,
        guildPicks: enginePicks,
        stats: b.stats,
        wishes: new Set(),
        boons: new Set(),
        wishCatalog: [],
        boonCatalog: [],
    });
    const freeLevels = Math.min(Math.max(0, b.extraFree), b.freeBudget);
    const lvl = computeLevelExp({
        guildLevels: b.guildLevelsSum,
        freeLevels,
        qps: b.qps,
        levelCosts, questCosts,
    });

    // Skill / spell exp totals using the engine's cost-array helper.
    // Per-skill detail is stashed on the result so the audit can identify
    // which entry diverges when a sweep fails.
    const skillMaxcost = (b.race.skill_cost | 0) * 100000;
    const spellMaxcost = (b.race.spell_cost | 0) * 100000;
    const skillBreak = [];
    let skillExpTotal = 0;
    for (const [sid, learned] of Object.entries(b.skillLearned)) {
        if (!learned) continue;
        const sk = skillById.get(Number(sid));
        if (!sk) continue;
        const arr = buildSkillCostArray(sk.start_cost, ssCosts, b.race.skill_cost);
        const exp = skillExp(learned, arr, skillMaxcost);
        skillExpTotal += exp;
        skillBreak.push({ id: Number(sid), name: sk.name, learned, exp });
    }
    const spellBreak = [];
    let spellExpTotal = 0;
    for (const [spid, learned] of Object.entries(b.spellLearned)) {
        if (!learned) continue;
        const sp = spellById.get(Number(spid));
        if (!sp) continue;
        const arr = buildSkillCostArray(sp.start_cost, ssCosts, b.race.spell_cost);
        const exp = skillExp(learned, arr, spellMaxcost);
        spellExpTotal += exp;
        spellBreak.push({ id: Number(spid), name: sp.name, learned, exp });
    }
    const statExpTotal = computeStatExp(b.stats, statCosts);
    const total = skillExpTotal + spellExpTotal + statExpTotal + lvl.raceExp + lvl.guildExp;
    const goldReq = Math.floor((skillExpTotal + spellExpTotal) / 2250);

    return { character, lvl, skillExpTotal, spellExpTotal, statExpTotal, total, gold: goldReq, skillBreak, spellBreak };
}

function runReference(b) {
    const guildBonusSums = sumGuildBonusesRef(b.picks, bonusesByGuild);
    const character = refCharInfo({ race: b.race, training: b.stats, guildBonusSums, flags: {} });
    const freeLevels = Math.min(Math.max(0, b.extraFree), b.freeBudget);
    const lvl = refUpdateExperience(b.guildLevelsSum, freeLevels, b.qps, levelCosts, questCosts);
    const skillMaxcost = (b.race.skill_cost | 0) * 100000;
    const spellMaxcost = (b.race.spell_cost | 0) * 100000;
    const skillBreak = [];
    let skillExpTotal = 0;
    for (const [sid, learned] of Object.entries(b.skillLearned)) {
        if (!learned) continue;
        const sk = skillById.get(Number(sid));
        if (!sk) continue;
        const costs = refSetCosts(sk.start_cost, ssCosts, b.race.skill_cost);
        // Reference's skillExp clamps learned to scaledPercent. The caller
        // already clamps in our random generator (we never set learned
        // above the per-skill max), so pass `learned` as both arguments.
        const exp = refSkillExp(learned, learned, costs, skillMaxcost);
        skillExpTotal += exp;
        skillBreak.push({ id: Number(sid), name: sk.name, learned, exp });
    }
    const spellBreak = [];
    let spellExpTotal = 0;
    for (const [spid, learned] of Object.entries(b.spellLearned)) {
        if (!learned) continue;
        const sp = spellById.get(Number(spid));
        if (!sp) continue;
        const costs = refSetCosts(sp.start_cost, ssCosts, b.race.spell_cost);
        const exp = refSkillExp(learned, learned, costs, spellMaxcost);
        spellExpTotal += exp;
        spellBreak.push({ id: Number(spid), name: sp.name, learned, exp });
    }
    const statExpTotal = refStatExp(b.stats, statCosts);
    const total = skillExpTotal + spellExpTotal + statExpTotal + lvl.raceExp + lvl.guildExp;
    const goldReq = refGold(skillExpTotal, spellExpTotal);
    const qpsN = refQpsNeeded(b.guildLevelsSum, freeLevels, questCosts);
    return { character, lvl, skillExpTotal, spellExpTotal, statExpTotal, total, gold: goldReq, qpsNeeded: qpsN, skillBreak, spellBreak };
}

// ----- field-by-field comparison -----

function compare(b, e, r) {
    const diffs = [];
    const fields = [
        ['hp', e.character.hp, r.character.hp],
        ['sp', e.character.sp, r.character.sp],
        ['hpr', e.character.hpr, r.character.hpr],
        ['spr', e.character.spr, r.character.spr],
        ['size', e.character.size, r.character.size],
        ['skillMax', e.character.skillMax, r.character.skillMax],
        ['spellMax', e.character.spellMax, r.character.spellMax],
        ['stat.str', e.character.finalStats.str, r.character.finalStats.str],
        ['stat.dex', e.character.finalStats.dex, r.character.finalStats.dex],
        ['stat.con', e.character.finalStats.con, r.character.finalStats.con],
        ['stat.int', e.character.finalStats.int, r.character.finalStats.int],
        ['stat.wis', e.character.finalStats.wis, r.character.finalStats.wis],
        ['stat.cha', e.character.finalStats.cha, r.character.finalStats.cha],
        ['raceExp', e.lvl.raceExp, r.lvl.raceExp],
        ['guildExp', e.lvl.guildExp, r.lvl.guildExp],
        ['qpsLeft', e.lvl.qpsLeft, r.lvl.qpsLeft],
        ['skillExpTotal', e.skillExpTotal, r.skillExpTotal],
        ['spellExpTotal', e.spellExpTotal, r.spellExpTotal],
        ['statExpTotal', e.statExpTotal, r.statExpTotal],
        ['totalExp', e.total, r.total],
        ['gold', e.gold, r.gold],
    ];
    for (const [name, eng, ref] of fields) {
        if (eng !== ref) diffs.push({ field: name, engine: eng, reference: ref });
    }
    return diffs;
}

function describeBuild(b) {
    const guildList = b.picks.map((p) => `${guildsById.get(p.guild_id).name}/${p.level}`).join(', ');
    return `race=${b.race.name} guilds=[${guildList}] guildSum=${b.guildLevelsSum} extraFree=${b.extraFree} qps=${b.qps}`;
}

// ----- run -----

const rng = mulberry32(SEED);
let pass = 0, fail = 0;
const failures = [];

console.log(`\nrunning ${N} random builds (seed=${SEED})…\n`);

for (let i = 0; i < N; i++) {
    const b = makeRandomBuild(rng);
    let e, r;
    try {
        e = runEngine(b);
        r = runReference(b);
    } catch (err) {
        console.error(`[crash] build #${i}: ${err.message}`);
        console.error(`  ${describeBuild(b)}`);
        fail++;
        if (STOP_ON_FIRST) process.exit(1);
        continue;
    }
    const diffs = compare(b, e, r);
    if (diffs.length === 0) { pass++; continue; }
    fail++;
    failures.push({ i, build: b, diffs });
    if (VERBOSE || failures.length <= 3) {
        console.log(`[FAIL] build #${i}`);
        console.log(`  ${describeBuild(b)}`);
        for (const d of diffs) console.log(`    ${d.field}: engine=${d.engine} reference=${d.reference}  delta=${d.engine - d.reference}`);
        // For skill/spell exp drift, surface the per-row entries that
        // diverge so the reader can see exactly which skill mismatched.
        for (const which of ['skillBreak', 'spellBreak']) {
            const eMap = new Map(e[which].map((x) => [x.id, x]));
            const rMap = new Map(r[which].map((x) => [x.id, x]));
            for (const [id, eb] of eMap) {
                const rb = rMap.get(id);
                if (rb && eb.exp !== rb.exp) {
                    console.log(`      ${which}: ${eb.name} (id=${id}) learned=${eb.learned} engine=${eb.exp} ref=${rb.exp}`);
                }
            }
        }
    }
    if (STOP_ON_FIRST) break;
}

console.log(`\nrandom builds: ${pass} pass / ${fail} fail (out of ${pass + fail})`);

// ----- anchor cases -----
// Each anchor is a hand-recorded build with the values the Zcreator
// desktop client produced for it. The audit asserts that BOTH the engine
// AND the reference match those numbers. If only the engine is wrong,
// the random sweep would've already found it; if both diverge from the
// anchor, we have a port mistake in lib/zcreator_reference.mjs.

const anchors = [
    {
        // Recorded from the Zcreator desktop screenshot in bug #14.
        // Devil race, seven guilds maxed, every skill maxed, no wishes.
        name: 'Devil — 7 guilds maxed (#14 anchor)',
        raceName: 'Devil',
        picks: [
            ['Abjurer', 45], ['Masters of magic', 8], ['Masters of the elements', 7],
            ['Bard', 45], ['Actors', 5], ['Gallants', 5], ['Minstrels', 5],
        ],
        extraFree: 0,
        qps: 0,
        statTrain: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        maxAllSkills: true,
        maxAllSpells: false,
        expect: {
            skillExpTotal: 3_312_752_900,
        },
    },
];

console.log(`\nrunning ${anchors.length} anchor case(s)…\n`);
let anchorFails = 0;
for (const a of anchors) {
    const race = races.find((r) => r.name === a.raceName);
    if (!race) { console.error(`anchor "${a.name}": race ${a.raceName} not found`); anchorFails++; continue; }
    const picks = a.picks.map(([gname, lvl]) => {
        const g = guilds.find((g) => g.name === gname);
        if (!g) throw new Error(`anchor "${a.name}": guild ${gname} not found`);
        return { guild_id: g.id, level: lvl };
    });
    const guildLevelsSum = picks.reduce((s, p) => s + p.level, 0);
    const freeBudget = 120 - guildLevelsSum;

    // Build skillLearned/spellLearned the same way the planner's "Max All"
    // buttons do: collapse multiple guild unlocks for the same skill to
    // the highest maxPerGuild, then scale to the race's skillMax/spellMax
    // exactly per Character.availableSkills (Character.cs:164). A skill
    // with maxPerGuild==100 caps at race.skill_max; otherwise the cap is
    // `5 * floor(scale * maxPerGuild / 5)` where scale = skill_max / 100.
    const buildLearnedMap = (rowsByGuild, idKey, capRaw) => {
        const byId = new Map();
        for (const p of picks) {
            for (const r of (rowsByGuild[p.guild_id] || [])) {
                if (r.level > p.level) continue;
                const prev = byId.get(r[idKey]);
                if (!prev || r.max_percent > prev) byId.set(r[idKey], r.max_percent);
            }
        }
        const cap = capRaw | 0;
        const scale = Math.min(1, cap / 100);
        const out = {};
        for (const [id, maxPerGuild] of byId) {
            const scaled = maxPerGuild === 100 ? cap : 5 * Math.floor(scale * maxPerGuild / 5);
            if (scaled > 0) out[id] = scaled;
        }
        return out;
    };
    const skillLearned = a.maxAllSkills ? buildLearnedMap(guildSkillsByGuild, 'skill_id', race.skill_max) : {};
    const spellLearned = a.maxAllSpells ? buildLearnedMap(guildSpellsByGuild, 'spell_id', race.spell_max) : {};
    const b = {
        race, picks, extraFree: a.extraFree, stats: a.statTrain,
        skillLearned, spellLearned, qps: a.qps,
        guildLevelsSum, freeBudget,
    };

    const e = runEngine(b);
    const r = runReference(b);
    const diffs = compare(b, e, r);
    let ok = diffs.length === 0;
    if (!ok) {
        console.log(`[FAIL] anchor "${a.name}" — engine ≠ reference`);
        for (const d of diffs) console.log(`    ${d.field}: engine=${d.engine} reference=${d.reference}`);
        anchorFails++;
    } else if (a.expect) {
        for (const [k, want] of Object.entries(a.expect)) {
            const got = e[k];
            if (got !== want) {
                console.log(`[FAIL] anchor "${a.name}" — ${k}: got ${got}, want ${want} (zcreator desktop)`);
                anchorFails++;
                ok = false;
            }
        }
    }
    if (ok) console.log(`[OK] anchor "${a.name}"`);
}

if (fail || anchorFails) {
    console.error(`\nFAILED: ${fail} random + ${anchorFails} anchor mismatches`);
    process.exit(1);
}
console.log(`\nALL CLEAR: ${pass} random builds + ${anchors.length} anchor cases all match.`);
