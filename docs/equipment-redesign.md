# Equipment redesign — design of record

Status: **in progress.** Supersedes the parse-on-every-load model in
[equipment.md](equipment.md). Goal: store items *structured* (parse
once at add time), make "ownership" a tag instead of a row copy,
eliminate duplicates, and unlock an **EQ Builder** that picks the best
gear set from the items a player owns.

The legacy `eq`/`eqmobs` tables and `/api/eq` router stay live and
untouched until cutover (no-drop rule, [schema.md](schema.md)). New
tables use the `eq_` prefix and InnoDB.

## Why the current design is flawed

`eq.info` holds the raw in-game identify text; both
[Equipment.vue](../www/src/components/Equipment.vue) and
[EquipmentAll.vue](../www/src/components/EquipmentAll.vue) re-run ~250
lines of `get_stat`/`get_amt`/`get_ac` on every page load. "Ownership"
is a full row copy (`copy_to_user`), so the same item exists many times
with no link between copies (529 rows / 476 distinct texts; *Amulet of
flame* appears 9×). No stat is a column, so you cannot query "most str"
— which the builder needs.

## Bugs found in the legacy parser (fixed in the new module)

1. **Max-HP is dead code.** `get_stat` tests `user's hitpoint` before
   `user's hitpoints`; since `"hitpoints".includes("hitpoint")`, every
   max-HP item is mis-bucketed as **hpr** and the `hp` branch never
   runs (11 real items affected). Same latent trap for spellpoints.
2. **Ownership = duplication** (`copy_to_user` inserts a new row).
3. **No add-time dedup** — `/add` and `/add-mob` blindly `INSERT`.
4. **Fragile name extraction** — only `" seems to vibrate rapidly."`
   stripped; `<Bound>`, `<tm>`, decay states `(glowing)/(dusty)`, and
   weapon-hand `(1h)/(2h)` markers all leak into the "name".
5. **Weapon class discarded** — `dmg-phys` hard-coded to 40 regardless
   of the real "(low/superb in general)" tier.
6. **Incoherent slot model** — the radio list mixes wear locations with
   weapon *classes*; DB has `slot='sword'`, `slot=''`, `slot='wand'`.
7. **Two near-identical files drift** (Equipment.vue / EquipmentAll.vue).
8. **Endpoints unauthenticated** — redesign puts writes behind session
   auth.

## Target data model (`schema/equipment.sql`)

### `eq_items` — the catalog (one row per distinct item)
Wide numeric columns so the builder is a plain `SELECT`. Identity is
`UNIQUE(name, wear_slot)` on the **normalized** name (noise stripped),
which is what kills duplicates.

- Identity: `name` (normalized), `name_raw`, `wear_slot`,
  `weapon_class` (NULL unless a weapon), `is_shield`, `hands` (1|2),
  `slot_raw` (original legacy slot, for audit), `bound`.
- Stats: `str con dex int wis cha` `hpr spr hp sp`, resistances
  `rphys rpsi relec rmag rpoi rfire rcold racid rasphx`, `ac`,
  `weapon_class_value` (replaces the hard-coded 40), `dmg_pct` +
  `dmg_type`.
- Provenance: `raw_info` (full identify text, kept for audit + future
  re-parse), `eqmob_id`, `version`, `created`, `updated`.

### `eq_item_bonuses` — open-ended skill/spell bonuses
The "gives tiny bonus to triple thrust" lines don't fit fixed columns:
`(item_id, bonus_name, amount)`, `UNIQUE(item_id, bonus_name)`,
`ON DELETE CASCADE`.

### `eq_ownership` — the "I have this" tag (replaces copy_to_user)
`(user_id, item_id)`, `UNIQUE(user_id, item_id)`, `ON DELETE CASCADE`.
Many-to-many: one catalog item, many owners.

## Slot model (decided)

Wear slots, one item each unless noted: `head neck cloak amulet torso
arms hands belt legs feet held`, `finger` (**2** slots), `wield`
(**2** slots). **Weapons and shields both occupy a `wield` slot.** A
two-handed weapon is recorded with `hands = 2`; **how many wield slots it
occupies is the builder's decision, not a stored assumption.**
`weapon_class`
(sword/dagger/axe/bow/polearm/bludgeon/staff/ancient) is an
*attribute* of a wield item, never a slot.

**`multi` is its own `wear_slot`, not a weapon class.** A `multi` item
covers *several* wear slots at once (battlesuits, robes). We don't know
*which* slots from the identify text, and the parser can't infer it, so
multi items are stored under `wear_slot = 'multi'` and the builder
**ignores** them for now (see Open follow-ups).

Migration reclassifies the legacy `slot` values into `wear_slot` +
`weapon_class` + `hands` + `is_shield`, preserving the original in
`slot_raw`; ambiguous/empty slots are flagged for manual review, not
guessed.

## Dedup / merge (decided: best-of merge)

One catalog row per normalized `(name, wear_slot)`. When the same item
is identified by multiple players (decay states, partial identifies),
take the **most-complete value per stat** across all identifies; retain
every raw text. Re-adding an existing item just ensures an
`eq_ownership` tag — never a new catalog row.

## Server-side parser (`api/classes/eq_parse.mjs`)

Single source of truth. `parseIdentify(text)` →
`{ name, name_raw, bound, slot_hint, weapon_class, hands, stats,
bonuses, dmg, weapon_class_value }` with all 8 bugs above fixed. Used by
both the live add path and the migration so they cannot diverge. The
Vue pages lose all parsing logic.

## Migration (`scripts/migrate_eq.mjs`, idempotent)

Parse every `eq.info` row → upsert into `eq_items` by normalized
`(name, wear_slot)` with best-of merge → record each source row's
`user_id` as an `eq_ownership` tag. Re-runnable; legacy tables stay
read-only until cutover.

## EQ Builder (the payoff)

Per-slot optimization over the caller's owned items only.

- **Single objective** ("most str"): per independent wear slot pick the
  max; `finger` picks top-2.
- **Two wield slots**: enumerate the small combo set — best two 1h
  weapons (dual wield), best 1h + best shield, or a 2h weapon — and take
  the max. Whether a 2h weapon leaves the second wield slot free is a
  builder rule (driven by `hands`/guild), not baked into the data.
- **Weighted multi-stat**: `score = Σ wₛ·statₛ`; same per-slot greedy,
  one pass. Provably optimal while slots are independent; set bonuses /
  cross-slot constraints would later make it a small ILP.

## Phases

1. **Schema + parser module** (bug fixes) — no UI change. ✅ **done**
   (`schema/equipment.sql` applied; `api/classes/eq_parse.mjs`). Dry-run
   over the 529 legacy rows: 427 distinct items, all 11 max-HP items now
   parse, 36 ambiguous slots flagged `needs_review`.
2. **Migration script** — populate `eq_items`/`eq_ownership`. ✅ **done**
   (`scripts/migrate_eq.mjs`, `--dry-run` supported, idempotent). Result:
   **426 catalog items**, 159 bonus rows, **505 ownership tags** (529
   legacy rows → 24 same-user re-identifies deduped). 27 items flagged
   `needs_review`. Known edge cases left for a human pass:
   - The `UNIQUE(name, wear_slot)` index uses `utf8mb4_unicode_ci`
     (case/accent-insensitive), so names differing only by case collapse
     to one row (427 JS keys → 426 DB rows). For such a pair the second
     write wins via `ON DUPLICATE KEY UPDATE` rather than best-of merge —
     affects ~1 item today, acceptable.
   - `normalizeName()` now strips the wielded-location prefix
     (`Wielded in right hand:/left hand:/both hands: <name>`, the last
     also implying a two-hander) so those dedup against the plain
     identify. The worn-armour variants (`Worn on head:` etc.) are not
     stripped yet — none have surfaced in the data; extend the same regex
     if they ever do.
3. **Repoint API** — new `/api/equipment` router. ✅ **done**
   ([api/rest/api/equipment.mjs](../api/rest/api/equipment.mjs),
   [api/classes/eq_store.mjs](../api/classes/eq_store.mjs)). Server-side
   parse + best-of-merge on `/add`, structured list/detail with an
   `owned` flag, ownership tag/untag (replaces `copy_to_user`), deduped
   eqmob add — all behind `requireAuth`. Smoke-tested: add→merge (str
   8→14, version bump), idempotent upsert, own/unown toggle, eqmob
   dedup. Built as a **new** router so the legacy `/api/eq` + old Vue
   pages keep working until the Phase 4 cutover.
4. **Slim the Vue pages** — ✅ **done**. All client-side parsing deleted;
   `Equipment.vue` now reads structured columns from `/api/equipment` and
   serves both the `equipment` (mine) and `equipment-all` routes by route
   name — `EquipmentAll.vue` is **removed** (drift bug gone).
   `EquipmentAdd.vue` posts pasted text to `/api/equipment/add`
   (paste-to-parse is the only add path). Ownership is an **icon toggle**
   (`bi-check-square-fill`/`bi-square`), never a native checkbox —
   per the desync gotcha. Frontend rebuilt.
5. **EQ Builder** — ✅ **done**. `POST /api/equipment/build`
   ([equipment.mjs](../api/rest/api/equipment.mjs)) + the
   [EquipmentBuild.vue](../www/src/components/EquipmentBuild.vue) page at
   `/equipment-build` (presets + per-stat weights). Per-slot greedy over
   `SLOT_CAPACITY` (`finger`/`wield` = 2, everything else 1); a 2h weapon
   is **not** assumed to fill both wield slots — slots are independent, so
   the greedy is optimal. Verified: max-Str total 181 across 15 picks;
   `str*2+con*1` rebalances (score 448 = 2·148 + 1·152). The page
   ([EquipmentBuild.vue](../www/src/components/EquipmentBuild.vue)) has an
   in-page how-it-works explainer, presets, and a **wield-mode** control:
   `dual` (two weapons), `shield` (best weapon + best shield), or `none`
   (skip weapons — caster). Multi-slot items are reported only as a count
   (`multiIgnored`).

## Open follow-ups

- **Multi-slot items: covered slots now collectible (builder TODO).** The
  identify text never says which slots a `multi` item covers, but the
  in-game Trader's Library `lookup` does (`covers multiple slots: a/b/c`).
  The manual-onboard path now parses that note into `eq_item_covers`
  (`schema/equipment.sql`); see [manual-onboard.md](manual-onboard.md). What
  remains: (2) let the builder weigh a multi item against the *sum* of the
  single-slot picks it would displace (turns greedy into a comparison/ILP),
  and surface `covers` in `Equipment.vue`. Until then the builder still
  returns `multiIgnored` only.
- Slot independence is the v1 assumption. Set bonuses, dual-wield/guild
  rules, or "a 2h weapon frees the second wield slot" would also push
  this toward a small ILP — revisit when those rules are pinned down.
- The 27 `needs_review` items (generic `wield`, empty/`wand` slots) won't
  place in the builder until a human assigns a concrete `wear_slot` /
  `weapon_class`; the builder reports them as `unplaced`.
