# Reinc Planner

Public, no-login required character planner at `/` and `/#/reinc`. Emulates
the Zcreator Enhanced desktop app (ZombieMUD character creator) against
the data we imported into `game_*` tables. All formulas here are copied
from the decompiled C# at
`/tmp/Zcreator-Enhanced/decompiled_source/CharCreator/`; the C# source is
the authoritative reference and must be consulted for every future change
to the computation engine.

## Files

- [www/src/components/Reinc.vue](../www/src/components/Reinc.vue) — single
  tabbed page. No sidebar; uses the full viewport via `App.vue`'s `onReinc`
  check.
- [www/src/components/reinc/engine.js](../www/src/components/reinc/engine.js)
  — stateless computation module. Every exported function mirrors a method
  in `Character.cs` or `SkillSpell.cs`; line references below.
- [api/rest/api/game.mjs](../api/rest/api/game.mjs) — `GET /api/game/reinc-bootstrap`
  returns races (enabled only), guilds, skills, spells, wishes, boons,
  level/stat/quest cost tables, and the ss-costs array in one call.
  `GET /api/game/reinc-guild/:id` lazy-loads per-guild bonuses/skill/spell
  unlocks the first time the user picks a guild.

## Constants

- **`MAX_LEVEL = 120`** — from [Character.cs:150](file:///tmp/Zcreator-Enhanced/decompiled_source/CharCreator/Character.cs)
  `totalLevels => 120 - guildlevels + free`. The setter at lines 361–378
  clamps `free <= remaining budget`, so total character level can never
  exceed 120. The planner enforces this in four places:
  1. Typing `totalLevels` above 120 is clamped by `setTotalLevels`.
  2. Adding a guild whose `max_level` would push the sum over 120 starts
     it at the remaining budget instead of its max.
  3. Raising an existing pick's level is clamped to `(120 - otherGuildSum)`.
  4. Free levels are computed as `min(extraFree, 120 - guildSum)`.

## State model: `extraFree` is primary, `totalLevels` is derived

[Reinc.vue](../www/src/components/Reinc.vue) tracks `extraFree` as the
only primary level-related state. Both `totalLevels` and `freeLevels`
are computed from it:

```
freeLevels  = min(max(0, extraFree), MAX_LEVEL - guildLevelsSum)
totalLevels = guildLevelsSum + freeLevels
```

This mirrors the Zcreator C# convention where `free` is the independent
setter and `totalLevels` is the getter. Earlier versions inverted this
(`totalLevels` primary, `freeLevels` derived from `totalLevels - guildSum`)
which produced phantom free levels when the user dropped a guild — see
the [gotchas.md](gotchas.md) "Derived state vs. primary state" entry.
The "Total Levels" input writes through to `extraFree`:
```
setTotalLevels(v) {
    const target = clamp(0, v, MAX_LEVEL);
    this.extraFree = max(0, target - this.guildLevelsSum);
}
```

- **Cost tables are all sized 120** — `levelcosts.chr`, `statcost.chr`,
  `questpoints.chr` each contain 120 integers indexed by level-1.
  `wishcost.chr` is 2 × 9 (lesser, greater tiers).

## Character computation — `Character.charInfo()`

Implemented by `computeCharacter()` in `engine.js`. Input: race row,
resolved guild picks, stat training points, selected wishes, selected
boons, wish catalog, boon catalog.

1. **Guild bonuses** — sum every `game_guild_bonuses` row whose
   `level <= picked level`, keyed by `canonBonus(bonus_name)`.
   `canonBonus` normalizes label variants (`"Hit points"` → `hp`,
   `"Physical resistance"` → `resist_phys`, etc.) because different guild
   files use slightly different spellings.

2. **Effective base percentage per stat** — `basePct[s] = race.max_{s} + wish_stat_pct[s]`.
   `Lesser stats` adds +5% to all, `Superior stats` adds +10% to all,
   `Improved strength` etc. add +10% to a specific stat.

3. **Final stats** (per `s in str,dex,con,int,wis,cha`):
   ```
   final[s] = race.max_{s}
            + floor((basePct[s] / 100) * sum(guild_bonus_for_{s}))
            + trained[s]
   ```
   The `floor()` round matches C#'s `Math.Floor(r.maxStr / 100.0 * sum)`.

4. **HP / SP / regen**:
   ```
   hp  = sum(guild_hp)  + 3 * final.con + 2 * race.size
   sp  = sum(guild_sp)  + 4 * final.int + 3 * final.wis
   hpr = sum(guild_hpr) + race.hp_regen
   spr = sum(guild_spr) + race.sp_regen
   ```

5. **Wish HP/SP bonuses** (the `physWish` / `magWish` counters accumulate
   the number of phys/mag-improvement wishes selected across lesser and
   greater categories):
   ```
   if (phys_wish % 2 === 1) hp += floor(0.5 * (1.5*race.max_con + size + 50))
   if (phys_wish  >  1)     hp += floor(       1.5*race.max_con + size + 50 )
   if (mag_wish  % 2 === 1) sp += floor(0.75*race.max_int + 0.5*race.max_wis + 50)
   if (mag_wish   >  1)     sp += floor(1.5 *race.max_int +      race.max_wis + 100)
   if (battle_regen % 2 === 1) spr += 1
   if (battle_regen  >  1)     spr += 2
   ```

6. **Skill max / spell max / size**:
   ```
   skillMax = race.skill_max + wish_skill_max
   spellMax = race.spell_max + wish_spell_max
   size     = race.size
   ```

## Experience breakdown — `Character.updateExperience()`

Implemented by `computeLevelExp()`. Inputs: `guildLevels` (sum of picked
guild levels), `freeLevels`, `qps`, `levelCosts[]`, `questCosts[]`.

```
// Race and guild exp are IDENTICAL formulas in C#:
for j in 0..guildLevels-1:
    raceExp  += floor(levelCosts[j] * 0.4 / 100) * 100   // round down to 100
    guildExp += floor(levelCosts[j] * 0.4 / 100) * 100

// Free-level exp: first try to spend QPs at a 25% discount, then
// fall back to full cost.
qpsLeft = qps
for j in guildLevels .. guildLevels+freeLevels-1:
    if questCosts[j] <= qpsLeft:
        qpsLeft -= questCosts[j]
        levelExp += floor(levelCosts[j] * 0.75 / 100) * 100
    else:
        levelExp += levelCosts[j]       // full cost, no discount
```

**Gold** = `floor((skillExp + spellExp) / 2250)` — no rounding is applied
in the C# formula, this is the raw quotient.

**QPs needed** = sum of `questCosts[j]` for every free-level slot. Shown
alongside the current `quest` input so the user knows the target.

## Stat training — `Character.updateStatExp()`

```
for s in str,int,wis,con,dex,cha:
    for i in 0..trained[s]-1:
        statExp += statCosts[i]
```

Cumulative (the cost of training the Nth point is `statCosts[N-1]`), per
stat independently. Not race-modified.

## Skill/spell cost table — `SkillSpell.setCosts(skillCost, costs[])`

`buildSkillCostArray(startCost, costs[], charSkillCost)` returns a
length-20 array mapping 5% → `costArray[0]`, 10% → `costArray[1]`, ..,
100% → `costArray[19]`:

```
maxcost = startCost * 100000
for i in 0..19:
    n = startCost * costs[i]
    if n >= 100: n -= n % 100              // floor to nearest 100
    n2 = n * (charSkillCost / 100)
    if n2 > maxcost or n2 < 0: n2 = maxcost
    if n2 < 100: n2 = 100
    if n2 % 5 != 0: n2 += 5 - (n2 % 5)     // round UP to nearest 5
    costArray[i] = floor(n2)
```

`costs[]` is the per-5% multiplier array from `costs.txt` (our
`game_ss_costs` table). `charSkillCost` is `race.skill_cost` or
`race.spell_cost` respectively.

**Exp for a skill learned to P percent**:
```
n = floor(P / 5)
exp = sum of (costArray[i] - costArray[i] % 100) for i in 0..n-1
```
Matches `SkillSpell.updateExp()`.

## Skill / spell effective max per guild pick

```
scale = min(1, (skillMax + wishSkill) / 100)
for each skill unlock row the character has access to:
    if row.maxPerGuild == 100:
        row.scaled = skillMax
    else:
        row.scaled = 5 * floor(scale * row.maxPerGuild / 5)
```
Mirrors `Character.availableSkills` getter. A skill that is unlocked by
multiple picked guilds takes the highest `maxPerGuild`.

## Guild and subguild ordering rules

Per the C# client and the guild file structure (subguilds listed in a
parent's `Subguilds:` section):

- A **subguild** is only selectable after its parent guild is picked AND
  sitting at `parent.max_level`. The planner greys out locked subguilds
  and shows 🔒.
- Deselecting the parent or lowering its level below `max_level`
  automatically drops every dependent subguild from the current picks
  (`dropDependentsOf`).
- Subguild levels **stack on top** of the parent's full level track; they
  are not a replacement. The summed `guildLevelsSum` feeds both the 120-cap
  check and the level-cost formula.

## Wishes and boons

Seeded by [scripts/seed_wishes_boons.mjs](../scripts/seed_wishes_boons.mjs).

- `game_wishes` — categories `generic`, `lesser`, `greater`, `resist`,
  `other`. `effect_key` is interpreted by `sumWishEffects()` in the
  engine:
  - `stat_pct_all` / `stat_pct_{str,dex,con,int,wis,cha}` — % bonus to max
    stat (fed into `basePct` above).
  - `skill_max` / `spell_max` — flat additions to the caps.
  - `phys_wish` / `mag_wish` / `battle_regen` — counters read by the HP/
    SP/SPR wish bonus block above.
  - `resist` — informational badge list (numeric effect lives in the game
    engine, not the planner).
  - `flag` — cosmetic only; contributes TP cost but no computation.

- `game_boons` — categories `racial`, `minor`, `preference`, `knowledge`,
  `weapon`, `lesser`, `greater`. Only PP cost is modelled today; detailed
  effects require a separate pass once the desktop effects are known.

Admins edit both via the existing JSON API
(`POST/DELETE /api/game/wishes[/id]`, `POST/DELETE /api/game/boons[/id]`)
or by re-running the seed script with edits.

## Race `enabled` flag

`game_races.enabled` (default 1) was added so admins can hide races that
exist in the data files but are not currently available in the live game.
The bootstrap endpoint filters to `enabled = 1`; the Races admin page
shows everything with a per-row toggle.

## Formatting helpers in `Reinc.vue`

- `nfmt(n)` — full precision, comma grouping, safe against NaN. Uses
  `Math.floor(Number(n))` instead of `n | 0` because the latter truncates
  to signed 32-bit and wraps values above ~2.1B into negatives (this was
  an early bug that showed up the moment the user picked a 45-level guild).
- `sfmt(n)` — short form for the summary bar. Values ≥ 1B render as
  `"6B 827M"` (integer billions + rounded millions remainder); values
  ≥ 1M render as `"17.1M"`; values ≥ 10K render as `"17.1K"`; smaller
  values stay literal. Tooltip (`title`) on each summary cell shows the
  full `nfmt` value on hover.
