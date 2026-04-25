# Data import / parser logic

The importer lives at [scripts/import_zcreator.mjs](../scripts/import_zcreator.mjs).
It reads every file under [data/](../data/) and populates the `game_*`
tables. The `data/` directory in this repo is a copy of the
`Zcreator Updated/data/` directory from the Zcreator-Enhanced
distribution.

## Running it

```
cd scripts && node import_zcreator.mjs          # safe — skips if already populated
cd scripts && node import_zcreator.mjs --force  # truncates game_* and re-imports
```

`--force` only truncates `game_*` tables. It never touches `users`,
`sessions`, `eq`, `eqmobs`, or `kya_info`. Foreign key checks are
briefly disabled during the truncate so the cascade tables can be
cleared in any order, then re-enabled before import.

The importer logs one line per file and a final `done`. An absent
input file or a malformed line logs a warning but does not abort the
run.

## File formats and parsing rules

Every rule below mirrors the format of the corresponding `.chr` /
`.txt` file in [data/](../data/). When a parsing question arises,
re-read the raw file — the leading non-comment lines usually document
the field order.

### `races.chr` — `Race(string, StringTokenizer)`
- Colon-separated, 15 fields: `name : maxStr : maxDex : maxCon : maxInt
  : maxWis : maxCha : size : expRate : spregen : hpregen : skillMax :
  spellMax : skillCost : spellCost`.
- Lines beginning with `#` are comments; empty lines are skipped.
- A leading `-` on the name marks a **subrace** — `parent_id` is the
  last non-dashed race seen. The dash is stripped.
- `races OLD.chr` is legacy and ignored.

### `skills.chr` / `spells.chr` — `loadSkillsSpells()`
- One line per entry: `name:cost`. Lowercase the name for storage (the
  original uses a case-insensitive match). `cost == 0` is a legitimate
  value (many skills have no starting cost). Missing colon = skip.

### `help_races.chr` / `help_skill.chr` / `help_spell.chr`
- Multi-block files separated by lines of 5+ `-` characters.
- Each block starts with a header line that identifies the entity:
  - Races: `Help race <name>` (no colon, no "on").
  - Skills: `Help on skill:    <name>`
  - Spells: `Help on spell:   <name>`
- The rest of the block (everything after the header line, up to but
  not including the next dash line) is the help text.
- Matching is case-insensitive; unmatched blocks are logged.
- Subraces are intentionally not matched — only top-level race names
  appear in `help_races.chr`.

### `guilds.chr` — `loadGuilds()`
- One line per top-level guild: `GuildName maxLevel`. Guild names use
  underscores in the file; the display name replaces underscores with
  spaces. Example: `Death_Knight 45` → display name `Death Knight`,
  `file_name` `Death_Knight`, `max_level` 45.
- **Subguilds are not listed here**. They are discovered inside their
  parent guild's `.chr` file (see below).

### A guild `.chr` file — `Guild.loadLevels()`
Three sections, in order:

1. **Bonus box** — an ASCII box drawn with `|` and starting with a
   `| Lvl | Guild bonuses |` header row. Each content row has a
   level in the first column and a comma-separated list of
   `BonusName(value)` pairs in the second. A row whose bonus list
   continues on the next line is marked by a trailing comma; the
   parser concatenates buffered lines until a new level cell appears.
   The box ends on a line like `` `-----' ``. Bonus names are stored
   lowercased.
2. **Ability blocks** — zero or more blocks prefixed with
   `Level N abilities:`, each containing lines of the form
   `May train skill <name> to <N>%` or `May study spell <name> to <N>%`.
   If the percent sign is missing, the parser buffers the current
   line and appends the next one until `%` appears. Skill lines
   create rows in `game_guild_skills`; spell lines create rows in
   `game_guild_spells`. If a skill/spell referenced here is not in
   `game_skills`/`game_spells`, a placeholder row with `start_cost = 0`
   is auto-inserted.
3. **`Subguilds:` section** (optional, near the end of the file). A
   list of `SubguildName maxLevel` pairs. For each pair the importer
   recursively imports the `<SubguildName>.chr` file — the subguild
   has the same bonus-box + ability-block structure as a main guild.
   Subguilds never have their own `Subguilds:` section.

### `costs.txt` — `loadSSCosts()`
- Three whitespace-separated columns per line: `from_pct`, `to_pct`,
  `multiplier`. Tabs and spaces are both accepted. Stored in
  `game_ss_costs`.

### `levelcosts.chr`, `statcost.chr`, `questpoints.chr` — `loadCosts()`
- Flat list of integers, one per line. Row `N` represents level `N`
  (1-based). Stored in `game_level_costs` with `kind = 'level'`,
  `'stat'`, or `'quest'`.

### `wishcost.chr` — two `loadCosts(..., 9)` calls
- 18 integers total: first 9 are lesser-wish tiers 1..9, next 9 are
  greater-wish tiers 1..9. Stored in `game_wish_costs` keyed by
  `kind` + `tier`.

## Gotchas the importer handles

- **Wrapped bonus rows** — `parseBonusBox` splits each line on the
  leading `|`, buffers rows whose level cell is empty, and flushes
  when a new level cell appears.
- **Wrapped ability lines** — `parseAbilityBlocks` buffers lines that
  don't yet contain `%` and matches the regex against the joined
  string.
- **Underscored filenames vs. spaced display names** — every guild
  row stores both, so UI uses `name` and the importer uses `file_name`
  to resolve files case-insensitively (`Golden_company.CHR` vs.
  `golden_company.chr`).
- **Subguild discovery** — only guild files' `Subguilds:` sections
  name subguilds; the importer loops into the subguild file once per
  reference and uses a `seen` set to avoid reprocessing.
- **Zero costs** — explicitly preserved; not treated as "missing".
- **Placeholder skills/spells** — if a guild file references a skill
  that isn't in `skills.chr` (rare but it happens for newly-added
  skills), a stub row is created so FKs always resolve.
- **Help text for subraces** — absent in `help_races.chr` and
  deliberately left NULL. The UI can fall back to the parent race's
  help if needed; none is done today.
