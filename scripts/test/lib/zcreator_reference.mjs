// Hand-ported reference implementation of CharCreator/Character.cs.
//
// This is a verbatim port of the Zcreator Enhanced desktop client's
// computation logic. It exists as the source-of-truth oracle for the
// audit harness in scripts/test/audit_engine.mjs — the planner's engine
// (www/src/components/reinc/engine.js) is asserted to match this byte
// for byte across hundreds of randomized character builds and a handful
// of anchor cases captured from the Zcreator binary itself.
//
// Method names and the order of operations match Character.cs / SkillSpell.cs
// so a reader can hold the C# open in one window and this file in another
// and step through line by line. Line refs in comments point at the C#.
//
// All inputs are plain JS objects shaped like the rows in our DB. Every
// numeric output is an exact integer where the C# returns int, and a
// double where the C# returns double. Floor / mod-100 / mod-5 rounding is
// preserved exactly.

const STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// SkillSpell.setCosts(int skillCost, int[] costs) at SkillSpell.cs:225.
// `startCost` is per-skill; `skillCost` is the race's skill_cost (or
// spell_cost). Returns a length-20 cost-per-5%-bucket array.
export function setCosts(startCost, costs, skillCost) {
    const num = skillCost * 100000; // maxcost
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

// SkillSpell.updateExp() at SkillSpell.cs:245. Returns the cumulative
// exp to reach `learnedPercent` (clamped to scaledPercent) given the
// length-20 cost array from setCosts(). The tail clause for `n > 20`
// uses the C# `maxcost` field, which is the same skillCost*100000
// value setCosts computes — pass it explicitly here so this function
// is correct for the >100% case as well.
export function skillExp(learnedPercent, scaledPercent, costs, maxcost) {
    const learned = Math.min(learnedPercent | 0, scaledPercent | 0);
    const n = Math.floor(learned / 5);
    let exp = 0;
    if (n > 0) {
        for (let i = 0; i < n && i < costs.length; i++) {
            exp += costs[i] - (costs[i] % 100);
        }
    }
    if (n > costs.length && maxcost) {
        const num2 = n - costs.length;
        for (let j = 0; j < num2; j++) exp += maxcost;
    }
    return exp;
}

// Character.updateStatExp() at Character.cs:1121. Cumulative `statCosts`
// array indexed [0..N-1] for "the cost of training the Nth point".
export function statExp(trained, statCosts) {
    let total = 0;
    for (const s of STATS) {
        const limit = Math.min(trained[s] | 0, statCosts.length);
        for (let i = 0; i < limit; i++) total += statCosts[i] | 0;
    }
    return total;
}

// Character.qpsneeded at Character.cs:978. Sum of qpCosts[0..total-1]
// where total = sum(guild levels) + freelevels.
export function qpsneeded(guildLevels, freelevels, qpCosts) {
    const total = guildLevels + freelevels;
    let num2 = 0;
    for (let j = 0; j < total && j < qpCosts.length; j++) num2 += qpCosts[j];
    return num2;
}

// Character.updateExperience() at Character.cs:1046. Returns
// { raceExp, guildExp, qpsLeft } — the same buckets the C# stores
// in experience["Race"] and experience["Guild"], plus remaining QPs.
export function updateExperience(guildLevels, freelevels, qps, lvlCosts, qpCosts) {
    const num = guildLevels;
    const num2 = freelevels + num;
    let num3 = 0; // Race bucket
    let num4 = 0; // Guild bucket
    let num5 = qps;
    let num6 = num2;
    if (qpCosts != null && num2 > qpCosts.length) num6 = qpCosts.length;
    if (lvlCosts != null && num2 > lvlCosts.length) num6 = Math.min(num6, lvlCosts.length);
    for (let j = 0; j < num6; j++) {
        if (qpCosts != null && j < qpCosts.length && qpCosts[j] <= num5) {
            num5 -= qpCosts[j];
            if (lvlCosts != null && j < lvlCosts.length) {
                num3 += lvlCosts[j] * 0.75 - (lvlCosts[j] * 0.75) % 100;
            }
        } else if (lvlCosts != null && j < lvlCosts.length) {
            num3 += lvlCosts[j];
        }
        if (j < num && lvlCosts != null && j < lvlCosts.length) {
            num4 += lvlCosts[j] * 0.4 - (lvlCosts[j] * 0.4) % 100;
        }
    }
    return { raceExp: Math.floor(num3), guildExp: Math.floor(num4), qpsLeft: num5 };
}

// Character.charInfo() at Character.cs:1333. Returns a 10-element int
// array per the C#:
//   [0]=hp [1]=sp [2]=hpr [3]=spr
//   [4]=str [5]=int [6]=con [7]=wis [8]=dex [9]=cha
// We return a named object instead because addressing by index is a
// readability trap. The math is otherwise unchanged.
//
// `flags` carries the C# wish-derived state: integer counters
// (statWish, skillWish, spellWish, magWish, physWish, battleRegenWishes)
// and booleans (improvedStr/Dex/Con/Int/Wis/Cha, lesserStatsWish,
// superiorStatsWish). Pass {} for "no wishes selected".
//
// `guildBonusSums` is the per-stat / per-resource sum across every guild
// at its picked level. The caller must aggregate it from the GuildLevel
// rows the same way Character.cs:1337-1353 does.
export function charInfo({ race, training, guildBonusSums, flags = {} }) {
    const r = race;
    const t = training;
    const gb = guildBonusSums;
    const f = flags;
    const arr = {
        hp: gb.hp | 0,
        sp: gb.sp | 0,
        hpr: gb.hpr | 0,
        spr: gb.spr | 0,
        str: gb.str | 0,
        int: gb.int | 0,
        con: gb.con | 0,
        wis: gb.wis | 0,
        dex: gb.dex | 0,
        cha: gb.cha | 0,
    };
    arr.hpr += r.hp_regen | 0;
    arr.spr += r.sp_regen | 0;

    const num = f.improvedStr ? Math.trunc(r.max_str / 10) : 0;
    const num2 = f.improvedInt ? Math.trunc(r.max_int / 10) : 0;
    const num3 = f.improvedCon ? Math.trunc(r.max_con / 10) : 0;
    const num4 = f.improvedWis ? Math.trunc(r.max_wis / 10) : 0;
    const num5 = f.improvedDex ? Math.trunc(r.max_dex / 10) : 0;
    const num6 = f.improvedCha ? Math.trunc(r.max_cha / 10) : 0;

    const lessStr = f.lesserStatsWish ? Math.floor(r.max_str * 0.05) : 0;
    const lessInt = f.lesserStatsWish ? Math.floor(r.max_int * 0.05) : 0;
    const lessCon = f.lesserStatsWish ? Math.floor(r.max_con * 0.05) : 0;
    const lessWis = f.lesserStatsWish ? Math.floor(r.max_wis * 0.05) : 0;
    const lessDex = f.lesserStatsWish ? Math.floor(r.max_dex * 0.05) : 0;
    const lessCha = f.lesserStatsWish ? Math.floor(r.max_cha * 0.05) : 0;

    const supStr = f.superiorStatsWish ? Math.floor(r.max_str * 0.10) : 0;
    const supInt = f.superiorStatsWish ? Math.floor(r.max_int * 0.10) : 0;
    const supCon = f.superiorStatsWish ? Math.floor(r.max_con * 0.10) : 0;
    const supWis = f.superiorStatsWish ? Math.floor(r.max_wis * 0.10) : 0;
    const supDex = f.superiorStatsWish ? Math.floor(r.max_dex * 0.10) : 0;
    const supCha = f.superiorStatsWish ? Math.floor(r.max_cha * 0.10) : 0;

    const lessBump = f.lesserStatsWish ? 5 : 0;
    const supBump = f.superiorStatsWish ? 10 : 0;
    const ePctStr = r.max_str + lessBump + supBump;
    const ePctInt = r.max_int + lessBump + supBump;
    const ePctCon = r.max_con + lessBump + supBump;
    const ePctWis = r.max_wis + lessBump + supBump;
    const ePctDex = r.max_dex + lessBump + supBump;
    const ePctCha = r.max_cha + lessBump + supBump;

    arr.str = r.max_str + Math.floor((ePctStr / 100.0) * arr.str) + (t.str | 0) + num + lessStr + supStr;
    arr.int = r.max_int + Math.floor((ePctInt / 100.0) * arr.int) + (t.int | 0) + num2 + lessInt + supInt;
    arr.con = r.max_con + Math.floor((ePctCon / 100.0) * arr.con) + (t.con | 0) + num3 + lessCon + supCon;
    arr.wis = r.max_wis + Math.floor((ePctWis / 100.0) * arr.wis) + (t.wis | 0) + num4 + lessWis + supWis;
    arr.dex = r.max_dex + Math.floor((ePctDex / 100.0) * arr.dex) + (t.dex | 0) + num5 + lessDex + supDex;
    arr.cha = r.max_cha + Math.floor((ePctCha / 100.0) * arr.cha) + (t.cha | 0) + num6 + lessCha + supCha;

    const statWish = f.statWish | 0;
    arr.hp += 3 * arr.con + 2 * (r.size + Math.trunc(statWish / 15));
    arr.sp += 4 * arr.int + 3 * arr.wis;

    const physWish = f.physWish | 0;
    const magWish = f.magWish | 0;
    const battleRegen = f.battleRegenWishes | 0;
    if (physWish % 2 === 1) arr.hp += Math.floor(0.5 * (1.5 * r.max_con + r.size + 50));
    if (physWish > 1) arr.hp += Math.floor(1.5 * r.max_con + r.size + 50);
    if (magWish % 2 === 1) arr.sp += Math.floor(0.75 * r.max_int + 0.5 * r.max_wis + 50);
    if (magWish > 1) arr.sp += Math.floor(1.5 * r.max_int + r.max_wis + 100);
    if (battleRegen % 2 === 1) arr.spr += 1;
    if (battleRegen > 1) arr.spr += 2;

    // Derived values the planner shows alongside the array.
    const skillMax = (r.skill_max | 0) + (f.skillWish | 0);
    const spellMax = (r.spell_max | 0) + (f.spellWish | 0);
    const size = (r.size | 0) + Math.trunc(statWish / 15);

    return {
        hp: arr.hp,
        sp: arr.sp,
        hpr: arr.hpr,
        spr: arr.spr,
        finalStats: { str: arr.str, dex: arr.dex, con: arr.con, int: arr.int, wis: arr.wis, cha: arr.cha },
        size,
        skillMax,
        spellMax,
    };
}

// Helper used by both the audit driver and the random-build generator:
// aggregate game_guild_bonuses rows into the per-stat / per-resource map
// the C# `array` starts with at Character.cs:1337-1353.
export function sumGuildBonusesRef(guildPicks, bonusesByGuild) {
    const out = { hp: 0, sp: 0, hpr: 0, spr: 0, str: 0, int: 0, con: 0, wis: 0, dex: 0, cha: 0 };
    for (const p of guildPicks) {
        const rows = bonusesByGuild[p.guild_id] || [];
        for (const b of rows) {
            if (b.level > p.level) continue;
            const k = canonBonusKey(b.bonus_name);
            if (k && k in out) out[k] += b.value | 0;
        }
    }
    return out;
}

// Same canonicalization the engine uses, copied here so the reference is
// self-contained. Drift between this function and engine.js's canonBonus
// would mean the audit isn't actually comparing apples to apples — keep
// them in sync if you change either.
export function canonBonusKey(name) {
    const n = (name || '').toLowerCase();
    if (/^hit point/.test(n) || n === 'hp' || n === 'hitpoints') return 'hp';
    if (/^hit.*regen/.test(n) || n === 'hp_regen' || n === 'hpr') return 'hpr';
    if (/^spell point$/.test(n) || /^spell points/.test(n) || n === 'sp') return 'sp';
    if (/^spell.*regen/.test(n) || n === 'sp_regen' || n === 'spr') return 'spr';
    if (/^strength/.test(n) || n === 'str') return 'str';
    if (/^constitution/.test(n) || n === 'con') return 'con';
    if (/^dexterity/.test(n) || n === 'dex') return 'dex';
    if (/^intelligence/.test(n) || n === 'int') return 'int';
    if (/^wisdom/.test(n) || n === 'wis') return 'wis';
    if (/^charisma/.test(n) || n === 'cha') return 'cha';
    return null;
}

// Character.gold => (int)((skillsExp + spellsExp) / 2250.0); — Character.cs:346.
export function gold(skillsExp, spellsExp) {
    return Math.trunc((skillsExp + spellsExp) / 2250);
}
