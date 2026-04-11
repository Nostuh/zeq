// Sanity test for computeLevelExp / qpsNeeded against the C# reference.
//
// Mirrors Character.cs:1046 (updateExperience) and Character.cs:978
// (qpsneeded) by hand and compares against the engine module. Run with:
//   node sanity_level_exp.mjs
// Exits non-zero on the first divergence.

import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { computeLevelExp, buildSkillCostArray, skillExp } from '../../www/src/components/reinc/engine.js';

const cfg = JSON.parse(await readFile(new URL('../../api/classes/config.json', import.meta.url))).zeq;

const conn = await mysql.createConnection({
    host: cfg.host, user: cfg.user, password: cfg.password, database: cfg.database,
});
const [rows] = await conn.execute(
    `SELECT kind, level, cost FROM game_level_costs WHERE kind IN ('level','quest') ORDER BY level`,
);
await conn.end();

const levelCosts = [];
const questCosts = [];
for (const r of rows) {
    const arr = r.kind === 'level' ? levelCosts : questCosts;
    arr[r.level - 1] = Number(r.cost);
}

// Hand-port of Character.cs updateExperience() — verbatim arithmetic.
function refExp({ guildLevels, freeLevels, qps }) {
    const num = guildLevels;
    const num2 = freeLevels + num;
    let num3 = 0, num4 = 0;
    let num5 = qps;
    let num6 = num2;
    if (num2 > questCosts.length) num6 = questCosts.length;
    if (num2 > levelCosts.length) num6 = Math.min(num6, levelCosts.length);
    for (let j = 0; j < num6; j++) {
        if (questCosts[j] != null && questCosts[j] <= num5) {
            num5 -= questCosts[j];
            num3 += levelCosts[j] * 0.75 - (levelCosts[j] * 0.75) % 100;
        } else {
            num3 += levelCosts[j];
        }
        if (j < num) {
            num4 += levelCosts[j] * 0.4 - (levelCosts[j] * 0.4) % 100;
        }
    }
    return { raceExp: Math.floor(num3), guildExp: Math.floor(num4), qpsLeft: num5 };
}

// Hand-port of Character.cs qpsneeded.
function refQpsNeeded({ guildLevels, freeLevels }) {
    const total = guildLevels + freeLevels;
    let num2 = 0;
    for (let j = 0; j < total && j < questCosts.length; j++) num2 += questCosts[j];
    return num2;
}

const cases = [
    { name: 'reporter zorky build (115g/0f/9000q)', guildLevels: 115, freeLevels: 0, qps: 9000 },
    { name: 'maxed (120g/0f/0q)', guildLevels: 120, freeLevels: 0, qps: 0 },
    { name: 'all free (0g/120f/0q)', guildLevels: 0, freeLevels: 120, qps: 0 },
    { name: 'mixed (60g/60f/100000q)', guildLevels: 60, freeLevels: 60, qps: 100000 },
    { name: '0/0/0 edge', guildLevels: 0, freeLevels: 0, qps: 0 },
    { name: 'huge qps clamp (45g/0f/9999999q)', guildLevels: 45, freeLevels: 0, qps: 9999999 },
];

let failures = 0;
for (const c of cases) {
    const got = computeLevelExp({ ...c, levelCosts, questCosts });
    const want = refExp(c);
    const ok = got.raceExp === want.raceExp
        && got.guildExp === want.guildExp
        && got.qpsLeft === want.qpsLeft;
    const tag = ok ? 'OK' : 'FAIL';
    console.log(`[${tag}] ${c.name}`);
    console.log(`  computeLevelExp: race=${got.raceExp} guild=${got.guildExp} qpsLeft=${got.qpsLeft}`);
    console.log(`  reference (C#) : race=${want.raceExp} guild=${want.guildExp} qpsLeft=${want.qpsLeft}`);
    console.log(`  qpsNeeded(ref)  = ${refQpsNeeded(c)}`);
    if (!ok) failures++;
}

// ----- Skill cost array (SkillSpell.setCosts) -----

// Hand-port of SkillSpell.setCosts(skillCost, costs[]). `startCost` is the
// per-skill base, `skillCost` is the race's skill_cost / spell_cost.
function refSetCosts(startCost, costs, skillCost) {
    const num = skillCost * 100000;
    const out = new Array(20);
    for (let i = 0; i < 20; i++) {
        let num2 = startCost * costs[i];
        if (num2 >= 100) num2 = num2 - (num2 % 100);
        const num3 = (num2 * skillCost) / 100;
        num2 = (num3 > num || 0 > num2) ? num : num3;
        if (num2 < 100) num2 = 100;
        if (num2 % 5 !== 0) num2 += 5 - (num2 % 5);
        out[i] = Math.floor(num2);
    }
    return out;
}

// Hand-port of SkillSpell.updateExp() for a given learned percent.
function refSkillExp(percent, costsArr) {
    let exp = 0;
    const n = Math.floor(percent / 5);
    for (let i = 0; i < n && i < costsArr.length; i++) {
        exp += costsArr[i] - (costsArr[i] % 100);
    }
    return exp;
}

// Pull a few real (startCost, skill name) pairs and the ss-costs multiplier
// table; verify build + skillExp match the reference for several races.
const conn2 = await mysql.createConnection({
    host: cfg.host, user: cfg.user, password: cfg.password, database: cfg.database,
});
const [skillRows] = await conn2.execute(
    `(SELECT name, start_cost FROM game_skills WHERE start_cost > 0 ORDER BY start_cost LIMIT 5)
     UNION ALL
     (SELECT name, start_cost FROM game_skills WHERE start_cost > 0 ORDER BY start_cost DESC LIMIT 5)`,
);
const [ssRows] = await conn2.execute(`SELECT from_pct, multiplier FROM game_ss_costs ORDER BY from_pct`);
const [raceRows] = await conn2.execute(
    `SELECT name, skill_cost, spell_cost FROM game_races WHERE name IN ('Devil','Aeuri','Human') ORDER BY name`,
);
await conn2.end();

const ssCosts = ssRows.map((r) => Number(r.multiplier));

let skillFailures = 0;
for (const race of raceRows) {
    for (const sk of skillRows) {
        const got = buildSkillCostArray(sk.start_cost, ssCosts, race.skill_cost);
        const want = refSetCosts(sk.start_cost, ssCosts, race.skill_cost);
        const ok = got.length === want.length && got.every((v, i) => v === want[i]);
        if (!ok) {
            skillFailures++;
            console.log(`[FAIL] race=${race.name} skill=${sk.name} startCost=${sk.start_cost}`);
            console.log(`  got : ${got.join(',')}`);
            console.log(`  want: ${want.join(',')}`);
        }
        // Spot-check exp at 100% matches the C# reference.
        const gotExp = skillExp(100, got);
        const wantExp = refSkillExp(100, want);
        if (gotExp !== wantExp) {
            skillFailures++;
            console.log(`[FAIL exp] race=${race.name} skill=${sk.name} got=${gotExp} want=${wantExp}`);
        }
    }
}
if (skillFailures === 0) {
    console.log(`\nbuildSkillCostArray matches C# for ${raceRows.length}×${skillRows.length} race/skill combos.`);
}

if (failures || skillFailures) {
    console.error(`\n${failures + skillFailures} divergence(s)`);
    process.exit(1);
}
console.log('\nAll cases match the C# reference.');
