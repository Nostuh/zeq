# Manual equipment onboarding (Trader's Library bulk-load)

How the in-game **Trader's Library** (`lookup` command) is harvested into
the global catalog (`eq_items`). Operator steps live in
[manual_onboard/README.md](../manual_onboard/README.md); this file is the
design/maintenance source of truth. Builds on
[equipment-redesign.md](equipment-redesign.md) — same tables, same parser,
same best-of merge.

## Why a second path at all

The redesign's add path takes the **identify** text a player pastes. The
Trader's Library prints a *different* text format for the same items, and
it's the only place that:

- holds **every** item in the game, not just what players have pasted, and
- states a **multi** item's covered wear slots (`covers multiple slots:`).

So this path is bulk catalog enrichment. It writes `eq_items`,
`eq_item_bonuses`, `eq_item_covers` — **never** `eq_ownership` (the library
is "the game's gear," not "mine").

## One parser, two formats

[api/classes/eq_parse.mjs](../api/classes/eq_parse.mjs) is still the single
source of truth — extended (additively) to read the library format so the
two can't drift:

| Aspect | Identify (paste) | Library (`lookup`) | Handling |
|---|---|---|---|
| Item name | first line | centered `\| name \|` in a `*--*` box | box detected; name lifted from the header |
| Stat phrasing | `the user's strength` | `the users strength` (no apostrophe) | normalized `the users`→`the user's`; one `STAT_PATTERNS` table |
| Magnitude | adverb only | adverb **+** a client-added `(n/20)` | adverb is authoritative (`AMOUNT_SCALE`); the `(n/20)` is the operator's MUD client annotation, **ignored** |
| Skill/spell | `bonus to user's X` | `gives <quality> bonus to the skill 'X'` | new pattern; quality ladder `tiny..awesome` → `SKILL_MAP` 1..6 |
| Skill/spell **penalty** | — | `gives <quality> penalty to the skill 'X'` | same rule, stored as a **negative** `eq_item_bonuses.amount` (sign-preserving merge) |
| Vision flags | — | `allows the user to see in darkness / magical auras / invisible` | ignored (non-numeric, no column) — `ignore.txt` |
| Decay | — | `loses its magical powers ...` | ignored (no stat) |
| Flavor | — | `- Extra -` block | ignored (everything under it) |
| Multi | — | `(Note: ... covers multiple slots: a/b/c)` | parsed → `wear_slot='multi'` + `covers[]` (checked *before* the Extra block, since the game prints it after) |

`splitLibraryBlocks(text)` carves a drop file's many pasted blocks into one
text per item (split on box headers; pre-header command echoes discarded).
`parseIdentify()` also returns `covers` (array | null) and `unparsed`
(body lines no rule consumed — the callout feed). Both fields are additive;
the live add path and `migrate_eq.mjs` ignore them.

> **Assumption to revisit:** the skill/spell quality ladder is stored
> ordinally (`tiny`=1 … `awesome`=6). Only the *order* matters to the
> builder's ranking; swap in real magnitudes in `SKILL_MAP` if they surface.

## Slot model — slot comes from the drop file

Library text never names the wear slot (except multi). So the slot is taken
from **where you dropped the block**:

- `manual_onboard/armour/<slot>.txt` → `wear_slot = <slot>` (`shield.txt`
  → `is_shield`, `wield`; `multi.txt` → just a convenient bucket).
- `manual_onboard/weapons/<hands>_<class>.txt` → `wear_slot='wield'`,
  `weapon_class=<class>`, `hands` from `1h`/`2h`. (`instrument` was added to
  the weapon-class set for `1h_instrument`.)

A block carrying the `covers multiple slots` note becomes `wear_slot='multi'`
**no matter which file it's in**, so you can paste it wherever you found it.

## Multi-slot coverage (`eq_item_covers`)

`schema/equipment.sql` adds `eq_item_covers(item_id, wear_slot)`,
`UNIQUE(item_id, wear_slot)`, `ON DELETE CASCADE`. The onboard `--apply`
`INSERT IGNORE`s one row per covered slot. This is the data the EQ Builder
needs to weigh a multi item against the sum of the single-slot picks it
displaces (still a follow-up; see below).

## Dedup & merge

Identical to `migrate_eq.mjs` / `eq_store.mjs`: catalog identity is the
normalized `(name, wear_slot)`; every numeric stat keeps the **larger
magnitude** (sign preserved, 0 always loses), bonuses keep the larger
amount, covers union. Re-pasting overlapping captures is therefore safe and
idempotent — a partial/decayed identify never clobbers a fuller one. The
merge runs against existing DB rows too, so library data folds into the 426
items the migration already produced rather than overwriting them.

## Command generator (`--commands`)

`lookup <word>` is a name *substring* search, so to capture a whole slot you
must `lookup` each item by its exact name. `list <slot>` prints that name
list (a box: rule / `| Slot - X |` title / rule, then one `| name |` row per
item, then a closing `'----'` line). Drop it in `manual_onboard/lists/<slot>.txt`
and `node onboard_eq.mjs --commands` writes `manual_onboard/commands/<slot>.txt`
— a paste-ready block of `lookup <name>` lines.

`parseSlotList()` lifts the names (skips the title row via `LIST_TITLE_RE`,
stops at the closing line). Names are collapsed by **normalized** identity
(the catalog's key) keeping the shortest/cleanest spelling — so `X (dusty)`
and `X` emit one `lookup`, since they'd merge into one catalog row anyway.
By default only items **absent from the catalog** for that slot are emitted
(a `SELECT name FROM eq_items` known-set scoped to the same kind —
`weapon_class` for weapons, `is_shield=1` for shields, `is_shield=0 AND
weapon_class IS NULL` for plain held/wield, else `wear_slot` — normalized +
lowercased); `--all` emits every listed item. With no DB it emits all and
warns. `commands/` is generated output (gitignored).

The known-set check is an optimization, not a gate — duplicates merge at
ingest regardless. (A `multi` item that the game lists under a single slot
is stored as `wear_slot='multi'`, so it won't match the single-slot known-set
and will be re-emitted; harmless, it just re-merges.)

## Callouts & the ignore list

Any body line no rule recognized (and not matched by
[manual_onboard/ignore.txt](../manual_onboard/ignore.txt)) is reported as a
**CALLOUT** with an occurrence count and an example item. For each, the
operator decides:

- **not a stat** → add a substring to `ignore.txt` (e.g. glow/aura flavor).
- **a real stat we don't parse** → add a rule to `eq_parse.mjs` (and a row
  to the format table above).

Structural noise (box rules, the name line, decay, the `- Extra -` block,
the covers note) is handled in the parser and never reaches callouts.

## Running

```bash
mysql zeq < schema/equipment.sql        # once: create eq_item_covers
cd scripts
node onboard_eq.mjs --commands           # lists/*.txt → commands/*.txt (lookup lines, missing only)
node onboard_eq.mjs --commands --all     # ...every listed item instead of just the missing
node onboard_eq.mjs                      # dry-run: new / changed / callouts (default)
node onboard_eq.mjs --apply              # write inserts + best-of merges
node onboard_eq.mjs --file ../manual_onboard/armour/amulet.txt
```

Dry-run never writes. `--apply` refuses to run if `eq_item_covers` is
missing. With no DB reachable it degrades to parse-only (callouts still
shown; no new/changed diff, no apply).

## Open follow-ups

- **Weapon combat stats not stored (hit / damage / critical chance).** Real
  weapon `lookup` text carries `It increases hit chance ...`, `It increases
  damage ...`, `It increases critical chance ...` (the game's `hit`/`dmg`/
  `crit` filters). `eq_items` — built for armour — has no column for these,
  so they are currently in [ignore.txt](../manual_onboard/ignore.txt) (a
  decision, not a limitation). **TODO if this data becomes relevant:** add
  `hit`/`dmg`/`crit` SMALLINT columns + parse rules (same adverb scale,
  sign from increases/decreases) and remove the ignore lines. This is
  distinct from elemental `does <type> damage`, which IS stored
  (`dmg_pct`/`dmg_type`).
- **Estimated AC/WC tier values.** `weak`/`great`/`tremendous` `in general`
  appeared only in weapon data; their `AC_SCALE` values are interpolated
  estimates (flagged in [eq_parse.mjs](../api/classes/eq_parse.mjs)) so
  `weapon_class_value` stops silently being 0. Correct the
  integers if the real scale surfaces.
- **Estimated top-end stat adverbs.** `monumentally`/`colossally`/`unearthly`/
  `divinely` surface on real stats (str/int/regen/resistances) in the library
  data, printed with **no** `(n/20)`, so they sit above the /20 band and their
  exact magnitude is unknown. `AMOUNT_SCALE` carries them as ascending
  ESTIMATES in the 20..30 gap (flagged in `eq_parse.mjs`). Correct if the real
  ladder surfaces.
- **`rshadow` (shadow resistance) — fully wired.** Parses into the new
  `eq_items.rshadow` column (`gives ... shadow resistance`; `shadow` was already
  a `DMG_TYPES` element), served via `SELECT *`, shown as the "Shdw" column in
  `Equipment.vue`, and weightable in `EquipmentBuild.vue` + the `/api/equipment`
  build endpoint. (The dead, unrouted `EquipmentAll.vue` was intentionally left
  alone.)
- **`--commands` skips items already in the catalog** (by normalized name +
  slot) and now prints what it skipped. It never re-captures existing rows;
  run `--commands --all` to re-look-up everything (best-of merge only adds).

- **Builder doesn't use `eq_item_covers` yet.** `EquipmentBuild.vue` still
  reports multi items as a count only. Wiring covered-slots in turns the
  per-slot greedy into a comparison/ILP (the multi item vs the sum of the
  single-slot picks it would displace) — see the multi follow-up in
  [equipment-redesign.md](equipment-redesign.md).
- **Equipment table doesn't surface covered slots.** `Equipment.vue` shows
  `multi` as a slot; it should list `covers` (arms/legs/torso) for those rows.
- **No `kind` (skill vs spell) column** on `eq_item_bonuses`; the parser
  distinguishes them but storage flattens to `(name, amount)`. Add a column
  if the UI ever needs to separate them.
