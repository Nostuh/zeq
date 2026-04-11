// Reinc planner computation engine.
//
// Mirrors the formulas in the decompiled Zcreator Character.charInfo(),
// updateExperience(), updateStatExp(), and SkillSpell.updateExp() methods.
// See docs/reinc.md (if it exists) or /tmp/Zcreator-Enhanced/decompiled_source/
// for the canonical reference.
//
// Shapes (all live on the caller; this module has no state):
//   race   = game_races row   (max_str..spell_cost, size, exp_rate, sp_regen, hp_regen)
//   guildPicks = [{ guild, level, data:{ bonuses, skills, spells } }]
//       where data is the result of /api/game/reinc-guild/:id
//   stats  = { str, con, dex, int: intt, wis, cha } — training points
//   wishes = Set<number> (selected wish ids)
//   boons  = Set<number>
//   wishCatalog = rows from /api/game/wishes
//   boonCatalog = rows from /api/game/boons
//   levelCosts = { level:[...], stat:[...], quest:[...] }  (1-based lookup)
//   skillSelections = Map<skillId, percentLearned>
//   spellSelections = Map<spellId, percentLearned>
//   skillStart = Map<id, start_cost>
//   spellStart = Map<id, start_cost>
//   ssCosts = [{from_pct,to_pct,multiplier}, ...] (costs.txt)

// Hard cap from Zcreator Character.cs:150 — `totalLevels = 120 - guildlevels + free`
// and the setter at line 361 clamps `free <= remaining budget`, so the max
// character level is always 120 (guild_chosen + free ≤ 120).
export const MAX_LEVEL = 120;

const STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function sumGuildBonuses(guildPicks) {
    // Returns a map of bonus_name (lowercase) -> numeric total across all
    // selected guilds and levels <= their selected level.
    const out = {};
    for (const p of guildPicks) {
        if (!p || !p.data) continue;
        const lvl = p.level;
        for (const b of p.data.bonuses) {
            if (b.level > lvl) continue;
            const key = canonBonus(b.bonus_name);
            out[key] = (out[key] || 0) + (b.value | 0);
        }
    }
    return out;
}

// Normalize the many bonus label variants into a consistent key set.
function canonBonus(name) {
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
    if (/^physical.*resist/.test(n)) return 'resist_phys';
    if (/^magical.*resist/.test(n)) return 'resist_mag';
    if (/^fire.*resist/.test(n)) return 'resist_fire';
    if (/^cold.*resist/.test(n)) return 'resist_cold';
    if (/^acid.*resist/.test(n)) return 'resist_acid';
    if (/^poison.*resist/.test(n)) return 'resist_pois';
    if (/^electric.*resist/.test(n)) return 'resist_elec';
    if (/^psi.*resist/.test(n)) return 'resist_psi';
    if (/^asphyx.*resist/.test(n)) return 'resist_asph';
    return n.replace(/\s+/g, '_');
}

function sumWishEffects(wishes, wishCatalog) {
    const acc = {
        stat_pct: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        skill_max: 0, spell_max: 0,
        phys_wish: 0, mag_wish: 0, battle_regen: 0,
        // Mirror of Character.cs:42 `statWish` counter. Lesser stats wish
        // bumps this by 15, Superior stats by 30; Character.cs:1387 then
        // folds `statWish / 15` into size for HP calculation (C# lines
        // 1387 and 3624). We derive it from the summed stat_pct_all
        // contribution: 5% → +15, 10% → +30 (i.e. pct * 3).
        stat_wish: 0,
        resistances: [],
        tp_cost: 0,
    };
    for (const w of wishCatalog) {
        if (!wishes.has(w.id)) continue;
        acc.tp_cost += w.tp_cost | 0;
        const k = w.effect_key, v = w.effect_value | 0;
        if (k === 'stat_pct_all') {
            for (const s of STATS) acc.stat_pct[s] += v;
            acc.stat_wish += v * 3;
        }
        else if (k && k.startsWith('stat_pct_')) acc.stat_pct[k.slice(9)] = (acc.stat_pct[k.slice(9)] || 0) + v;
        else if (k === 'skill_max') acc.skill_max += v;
        else if (k === 'spell_max') acc.spell_max += v;
        else if (k === 'phys_wish') acc.phys_wish += v;
        else if (k === 'mag_wish') acc.mag_wish += v;
        else if (k === 'battle_regen') acc.battle_regen += v;
        else if (k === 'resist') acc.resistances.push(w.name);
    }
    return acc;
}

function sumBoonCost(boons, boonCatalog) {
    let total = 0;
    for (const b of boonCatalog) if (boons.has(b.id)) total += b.pp_cost | 0;
    return total;
}

export function computeCharacter({
    race, guildPicks, stats, wishes, boons,
    wishCatalog, boonCatalog,
}) {
    if (!race) return null;
    const guildSum = sumGuildBonuses(guildPicks);
    const wishFx = sumWishEffects(wishes, wishCatalog);
    const boonPP = sumBoonCost(boons, boonCatalog);

    // effective base % per stat with wish modifiers
    const basePct = {};
    for (const s of STATS) {
        const rMax = race[`max_${s === 'int' ? 'int' : s}`];
        basePct[s] = rMax + (wishFx.stat_pct[s] || 0);
    }

    const out = { finalStats: {}, resistances: {}, tpCost: wishFx.tp_cost, ppCost: boonPP };

    for (const s of STATS) {
        const rMax = race[`max_${s}`];
        const guildContribution = guildSum[s] || 0;
        const trained = stats[s] | 0;
        // final = race.max + floor(effectivePct/100 * guild_sum) + trained
        const floorBonus = Math.floor((basePct[s] / 100) * guildContribution);
        out.finalStats[s] = rMax + floorBonus + trained;
    }

    // HP / SP
    let hp = guildSum.hp || 0;
    let sp = guildSum.sp || 0;
    let hpr = (guildSum.hpr || 0) + (race.hp_regen | 0);
    let spr = (guildSum.spr || 0) + (race.sp_regen | 0);

    // Size + skill/spell max. C# Character.cs:3624 displays
    //   size = race.size + statWish/15
    // and Character.cs:1387 folds the same term into the HP formula.
    const rawSize = (race.size | 0);
    const size = rawSize + Math.floor(wishFx.stat_wish / 15);
    const skillMax = (race.skill_max | 0) + wishFx.skill_max;
    const spellMax = (race.spell_max | 0) + wishFx.spell_max;

    // HP += 3*Con + 2*(race.size + statWish/15) ; SP += 4*Int + 3*Wis
    // (Character.cs:1387–1388.)
    hp += 3 * out.finalStats.con + 2 * size;
    sp += 4 * out.finalStats.int + 3 * out.finalStats.wis;

    // Physical wish bonuses. C# Character.cs:1391,1395 uses raw race.size
    // here, NOT the wish-adjusted size we computed above.
    if (wishFx.phys_wish % 2 === 1) hp += Math.floor(0.5 * (1.5 * race.max_con + rawSize + 50));
    if (wishFx.phys_wish > 1) hp += Math.floor(1.5 * race.max_con + rawSize + 50);
    // Magical wish bonuses
    if (wishFx.mag_wish % 2 === 1) sp += Math.floor(0.75 * race.max_int + 0.5 * race.max_wis + 50);
    if (wishFx.mag_wish > 1) sp += Math.floor(1.5 * race.max_int + race.max_wis + 100);
    // Battle regen
    if (wishFx.battle_regen % 2 === 1) spr += 1;
    if (wishFx.battle_regen > 1) spr += 2;

    // Resistances from guild bonuses
    for (const k of Object.keys(guildSum)) {
        if (k.startsWith('resist_')) out.resistances[k.slice(7)] = guildSum[k];
    }
    out.wishResistances = wishFx.resistances;

    out.hp = hp;
    out.sp = sp;
    out.hpr = hpr;
    out.spr = spr;
    out.size = size;
    out.skillMax = skillMax;
    out.spellMax = spellMax;
    out.basePct = basePct;

    return out;
}

// ----- Experience -----

// Build a length-20 "costs" array mirroring setCosts(skillCost, costs[]).
// costs[] here is the per-5% multiplier from costs.txt (20 entries).
export function buildSkillCostArray(startCost, costs, charSkillCost) {
    const out = new Array(20).fill(0);
    const maxcost = startCost * 100000;
    for (let i = 0; i < 20; i++) {
        let n = startCost * costs[i];
        if (n >= 100) n -= n % 100;
        let n2 = n * (charSkillCost / 100);
        if (n2 > maxcost || n2 < 0) n2 = maxcost;
        if (n2 < 100) n2 = 100;
        if (n2 % 5 !== 0) n2 += 5 - (n2 % 5);
        out[i] = Math.floor(n2);
    }
    return out;
}

// Experience spent to reach `percent` on a skill with the given cost array.
// Mirrors SkillSpell.updateExp() in Character.cs. When `percent > 100`
// (i.e. training past the 20-bucket table — possible for buffs/boons in
// future features), C# adds `(n - costs.Length) * maxcost` as a tail.
// `maxcost` is `startCost * 100000`; pass it in when you know it, else
// the tail is skipped and callers that clamp to ≤100 get the old answer.
export function skillExp(percent, costArray, maxcost = 0) {
    const n = Math.floor(percent / 5);
    let exp = 0;
    for (let i = 0; i < n && i < costArray.length; i++) {
        exp += costArray[i] - (costArray[i] % 100);
    }
    if (n > costArray.length && maxcost > 0) {
        exp += (n - costArray.length) * maxcost;
    }
    return exp;
}

// Level/guild/free-level experience from the C# updateExperience().
// guildLevels = integer, freeLevels = integer, qps = integer
// levelCosts is an array indexed by level-1 (length ~120).
export function computeLevelExp({ guildLevels, freeLevels, qps, levelCosts, questCosts }) {
    let raceExp = 0, guildExp = 0, levelExp = 0;
    for (let j = 0; j < guildLevels && j < levelCosts.length; j++) {
        raceExp += levelCosts[j] * 0.4 - ((levelCosts[j] * 0.4) % 100);
        guildExp += levelCosts[j] * 0.4 - ((levelCosts[j] * 0.4) % 100);
    }
    let qpsLeft = qps | 0;
    const totalExtras = freeLevels | 0;
    for (let j = 0; j < totalExtras; j++) {
        const idx = guildLevels + j;
        if (idx >= levelCosts.length) break;
        const qpNeeded = questCosts[idx] | 0;
        if (qpNeeded <= qpsLeft) {
            qpsLeft -= qpNeeded;
            levelExp += levelCosts[idx] * 0.75 - ((levelCosts[idx] * 0.75) % 100);
        } else {
            levelExp += levelCosts[idx];
        }
    }
    return { raceExp: Math.floor(raceExp), guildExp: Math.floor(guildExp), levelExp: Math.floor(levelExp), qpsLeft };
}

export function computeStatExp(stats, statCosts) {
    let total = 0;
    for (const s of STATS) {
        const limit = Math.min(stats[s] | 0, statCosts.length);
        for (let i = 0; i < limit; i++) total += statCosts[i] | 0;
    }
    return total;
}
