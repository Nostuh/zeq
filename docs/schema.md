# Database schema

MariaDB database `zeq` (connection in `api/classes/config.json`).
Game-data tables are prefixed `game_`. The legacy tables (`eq`, `eqmobs`,
`kya_info`, `users`) are preserved; auth is layered onto `users` with
new columns plus a new `sessions` table.

DDL lives in [schema/zeq.sql](../schema/zeq.sql) (game data) and
[schema/auth.sql](../schema/auth.sql) (users/sessions). Both scripts use
`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` and are safe to
re-apply at any time. Neither drops anything.

## Game-data tables

### `game_races`
One row per race. Subraces are rows whose `parent_id` points at the
parent race. Fields match the 14 numeric columns of `races.chr`
(`max_str` .. `spell_cost`) plus `size`, `exp_rate`, `sp_regen`, `hp_regen`.
`help_text` is populated from `help_races.chr` blocks keyed by name.
Subraces intentionally have no help text — they inherit from the parent
(the original Zcreator tool has no per-subrace help).

`enabled` (tinyint, default 1) is an admin-only flag that hides a race
from the public reinc-planner without removing it from the table. The
admin Races page shows a per-row toggle; the planner's
`/api/game/reinc-bootstrap` filters to `enabled = 1` only.

### `game_skills` / `game_spells`
One row per skill/spell. `name` is lowercased (matches the source
files). `start_cost` is the value after the colon in `skills.chr` /
`spells.chr`; `0` is a legitimate value. `help_text` is populated from
`help_skill.chr` / `help_spell.chr`.

### `game_guilds`
One row per guild or subguild. `parent_id` is set on subguilds. `name`
is the display name (underscores replaced by spaces); `file_name` is the
original filename stem (underscored). `max_level` is the trailing
number from `guilds.chr` for top-level guilds, or from a `Subguilds:`
section inside a parent guild's `.chr` file for subguilds.

### `game_guild_bonuses`
Per-level stat bonuses parsed from the ASCII box at the top of each
guild file. Each row is `(guild_id, level, bonus_name, value)`.
`bonus_name` is the lowercased bonus label as it appears in the file
(`hp`, `con`, `hp_regen`, `physical resistance`, etc.). Wrapped rows
(rows whose bonus list continues on the next line because of a trailing
comma) are concatenated before parsing.

### `game_guild_skills` / `game_guild_spells`
Per-level unlocks. One row per `(guild_id, target_id, level)` tuple.
`max_percent` is the training cap at that level (the percentage after
`to` in `May train skill X to N%` lines). If the importer encounters a
skill or spell name that isn't already in `game_skills`/`game_spells`,
it inserts a placeholder row with `start_cost = 0` so the FK always
resolves.

### `game_level_costs`
Flat per-level cost arrays for three flavors, discriminated by `kind`:
`level` (XP cost per character level, `levelcosts.chr`), `stat`
(`statcost.chr`), and `quest` (`questpoints.chr`). Row index is 1-based
(`level` column).

### `game_wish_costs`
Parsed from `wishcost.chr`: nine `lesser` tiers followed by nine
`greater` tiers. Stored with `kind` + `tier` + `cost`.

### `game_ss_costs`
Parsed from `costs.txt`: skill/spell training cost multipliers by
percent range (`from_pct`, `to_pct`, `multiplier`).

## Auth tables

### `users` (legacy + extensions)
The legacy `users` table is preserved byte-for-byte. Added columns:
`role` (`admin`/`editor`/`viewer`, default `viewer`), `active`
(tinyint, default 1), `password_hash` (bcrypt), `created`. The legacy
md5 `password` column is left in place; on successful login against the
legacy column, the password is re-hashed into `password_hash`
transparently and the legacy column is blanked on any admin-initiated
password reset.

### `sessions`
Bearer-style session rows keyed by a random 64-hex-char id stored in
the `zeq_sid` HttpOnly cookie (`sameSite: strict`, `secure: true`).
`user_id` references the authenticated user; `expires` is enforced on
every request.

## Planner catalogs (admin-editable)

### `game_wishes`
One row per wish the reinc planner offers. Columns: `name`,
`category` (`generic` / `lesser` / `greater` / `resist` / `other`),
`tp_cost`, `effect_key`, `effect_value`, `sort_order`. `effect_key`
is interpreted by `sumWishEffects()` in
[www/src/components/reinc/engine.js](../www/src/components/reinc/engine.js)
— `stat_pct_all`, `stat_pct_{str,dex,con,int,wis,cha}`, `skill_max`,
`spell_max`, `phys_wish`, `mag_wish`, `battle_regen`, `resist`, `flag`.
Note: a `stat_pct_all` wish also increments the C# `statWish` counter
(derived as `3 * value`) which affects size and HP — see
[reinc.md](reinc.md). Seeded from
[scripts/seed_wishes_boons.mjs](../scripts/seed_wishes_boons.mjs).

### `game_boons`
Same shape as `game_wishes` but with `pp_cost` instead of `tp_cost`.
Categories: `racial` / `minor` / `preference` / `lesser` / `knowledge`
/ `weapon` / `greater`. Effect semantics are simpler — most boons
today are `flag` only and contribute PP cost without affecting math.

## Saved reincs (`game_saved_reincs` + `game_saved_reinc_votes`)

Public share-a-reinc gallery at `/builds`. One row per user-saved
build. `state` is a JSON blob (MEDIUMTEXT) versioned with `v: 1`
containing race_id, guild_picks, stat_train, wishes, boons, learned
skill/spell percents, extra_free, and quest. The surrounding row
caches display metadata (`race_name`, `guild_summary`, `total_levels`,
`total_exp`, `gold`, `hp`, `sp`) so the list view doesn't need the
engine. `is_featured` pins the curated seeds above tied scores.

Votes live in `game_saved_reinc_votes`, one row per
`(reinc_id, sha1(ip+salt))`. A unique index enforces one vote per
viewer; clearing a vote deletes the row. Cached `upvotes`/`downvotes`
on `game_saved_reincs` are refreshed on every vote.

**Data drift warning:** the `state` JSON references `game_*` IDs.
Renames are safe (id-stable); deletes leak through as missing
guilds/skills/wishes when the planner rehydrates. See
[saved-reincs.md](saved-reincs.md) for the full drift-handling
rules — they matter for any future game-data migration.

## Bug reports

### `bug_reports`
One row per submitted bug or idea. Columns:
- `title`, `description`, `severity` (legacy; new submissions no longer
  set it), `status` (`open` / `in_progress` / `resolved` / `wontfix`)
- `page_url`, `user_agent`, `screen_size` — automatic browser context
- `reporter_name` (optional), `user_id` (set if the submitter was logged in)
- `app_state` (MEDIUMTEXT JSON) — captured from
  `$root.collectBugContext()` on submit: route, user, viewport, and
  page-specific state (e.g. full reinc planner selections).
- `dom_snapshot` (MEDIUMTEXT) — `<main>` outerHTML with inline
  `<script>` content stripped, capped at 40KB.
- `console_log` (MEDIUMTEXT NDJSON) — tail of the last ~100 console
  entries from the client's rolling buffer, plus `window.onerror`
  and `unhandledrejection` events.
- `created`, `resolved`

### `bug_attachments`
Metadata for JPG/PNG uploads attached to a `bug_reports` row. Files
live on disk at `/srv/zeq/api/uploads/bugs/{bug_id}/{idx}_{hex}.{ext}`;
this table stores `filename`, `mime_type`, `size_bytes`, and the
relative `path`. `ON DELETE CASCADE` on `bug_id` so cleanup is
automatic. MIME is validated by **sniffing the decoded buffer's first
bytes**, not the client's claimed mime. See [bugs.mjs](../api/rest/api/bugs.mjs).

## Referential integrity

`game_guild_bonuses`, `game_guild_skills`, `game_guild_spells` all have
`ON DELETE CASCADE` foreign keys to their owners. Deleting a guild
cleans up all its level data automatically. Deleting a skill or spell
cleans up its guild-unlock rows. Deleting a parent guild does **not**
cascade to its subguilds — subguilds become top-level guilds (the FK
on `game_guilds.parent_id` is intentionally omitted so deletions don't
chain unexpectedly); the UI warns before deletes.
