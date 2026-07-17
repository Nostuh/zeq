# Cross-Linking Plan: Equipment ↔ EQ Mob KB ↔ KYA

**Status: IMPLEMENTED (July 2026) — collecting reviewer input; remaining
work tracked at the bottom.** Owner: Doug. The plain-language reviewer
version of this plan lives on a shared Artifact page; this document is
the engineering source of truth and is maintained by hand — keep it
current as decisions change.

## Goal

The three data areas describe the same world but were islands: an item
didn't know which mob drops it, a mob's loot list was free text, KYA sat
alone. This plan links them so any screen can jump to the others, and
adds an item detail view that shows the raw text every parse came from.

## Locked decisions

1. **Binding uses the Mob KB**: `mob_loot.equipment_id → eq_items.id`.
   The legacy `eqmobs` label picker is retired; legacy tables are frozen,
   never dropped. `eq_items.eqmob_id` stays as read-only provenance and
   renders as a "legacy:" fallback until items are properly linked.
2. **Cross-flag visibility**: linked info (mob names, drop lists, KYA
   counts) renders read-only for anyone who can see the current screen;
   the JUMP buttons are gated by the target area's flag. Concretely:
   `GET /api/equipment/items/:id` accepts any of
   `equipment|equipment_edit|eqmobs|eqmobs_edit`.
3. **Edit depth**: editors manage links, notes, ownership, and re-paste
   → re-parse. NO field-level stat editing — the parser + `raw_info`
   stay the source of truth.
4. **KYA correlation is name-string only** (`kya_info` is id+info; no
   FKs). KB `name` (with trailing ` NN%` stripped) and `short_name` are
   tried. No schema change to `kya_info`.
5. **No stub mobs**: the migration never auto-creates `mob_monsters`
   rows — a typo ("Alminah"/"Aliminah") and a new mob are
   indistinguishable; the KB stays curated. Unmatched legacy names are
   reported with near-miss suggestions and cleaned up by hand.
6. **One source mob per item** (game rule). Binding an item to a mob
   MOVES it: `unlinkItemElsewhere` in mob_kb.mjs nulls the link on every
   other mob (rows survive as free text, history + version bump each).
   Applies to both bind directions; the migration never steals — it
   skips and reports conflicts. Data cleanup 2026-07-16: 35 double-links
   against the "Wiki - eq page" pseudo-mob (id 841) were unlinked (real
   mob wins); one genuine double remains for a human call:
   "A funky-looking mushroom hat" (Myconid King vs Fearful myconid king).

## What shipped

### Schema ([schema/mobs.sql](../schema/mobs.sql))
- `ix_ml_item` index + FK `fk_ml_item`: `mob_loot.equipment_id` →
  `eq_items(id)` `ON DELETE SET NULL` (item deletion degrades the loot
  row to free text; `item_name` preserved). MariaDB syntax note: the
  clause is `ADD CONSTRAINT x FOREIGN KEY IF NOT EXISTS (…)`.

### Shared backend ([api/classes/](../api/classes/))
- **eq_match.mjs** — `looseKey` / `pasteLooseKey` (moved out of
  equipment.mjs) + `lootLooseKey` (also strips worn-location prefixes
  "Head: …" and `*glowing*`-style markers). One matching brain for
  /import, the binders, and the migration.
- **kya_extract.mjs** — `EXTRACT_SQL` (moved out of kya.mjs; ingest
  `POST /api/eq/kya` untouched) + `kyaCandidateName` + `kyaCountsByNames`.
- **mob_kb.mjs** — `recordMobHistory`, `bumpMobVersion`,
  `bindLootToItem` (reuse a loose-matching unlinked loot row, else
  insert; one history row `{linked: "Name (#id)"}` + version bump).
  Takes a `q` object with the `@name` shim semantics so the migration
  script can pass a mysql2 adapter — logic is single-sourced.

### API
- **equipment.mjs**: `GET /items/:id` (relaxed flag per decision 2) adds
  `covers`, `dropped_by` (+ per-mob `kya_count`/`kya_name`), `siblings`,
  `eqmob_name`; `GET /items` adds `?mob=` filter + `mob_names` column;
  new `POST /items/:id/note`, `POST /items/:id/mobs`,
  `DELETE /items/:id/mobs/:loot_id` (unlink only — loot row survives),
  `GET /mobs?q=` picker (equipment flag, so equipment editors without
  `eqmobs` can bind); `POST /add` takes optional `mob_id`, never writes
  `eqmob_id`; `GET/POST /eqmobs` removed.
- **mobs.mjs**: `GET /eq-items?q=` binder typeahead (registered ABOVE
  `GET /:id` — route-order matters); `GET /:id` loot LEFT JOINs
  `eq_items` (`eq_name`, `eq_wear_slot`) and adds `kya` summary; loot
  POSTs accept validated `equipment_id` (absent=keep, null=clear) with
  readable history diffs.

### Migration ([scripts/migrate_mob_links.mjs](../scripts/migrate_mob_links.mjs))
Idempotent, `--dry-run`. Pass A: `eqmob_id → eqmobs.name →
mob_monsters` (case-insensitive exact, `short_name` too). Pass B:
unlinked `mob_loot.item_name → eq_items` by loose key, only when the key
maps to exactly ONE item (ambiguous = reported, never guessed). One
`mob_history` row (user `init`) per touched mob per run. **First live
run: 36 (Pass A) + 111 (Pass B) linked, 35 mobs touched; re-run wrote 0.**
80 legacy eqmob names unmatched (many aren't mobs: "NA", "DK Masters") —
the report's "did you mean" suggestions guide manual cleanup.

### Frontend
- **[ItemDetailModal.vue](../www/src/components/ItemDetailModal.vue)** —
  the shared item panel: stats/bonuses/covers, `raw_info` in a `<pre>`,
  ownership toggle (icon-driven, no native checkbox), note editor,
  dropped-by (mob jump if `canEqmobs`, "KYA (N)" jump if `canLookups`,
  bind/unbind if `canEquipmentEdit`), sibling drops with in-modal
  navigation + back stack, collapsed re-paste panel. Unique `.itemdm-*`
  classes (never `.modal-backdrop`), z-index 2050, themed via
  `--bs-body-bg`/`--bs-body-color`.
- **Equipment.vue** — name column opens the modal (`zSimpleTable` gained
  `link` and `links` display types; `links` cells are `{label,id}[]`,
  sort/search array-safe); "Eq Mob" column links to the mob page when the
  user has `eqmobs` access (API `mob_links` = `name|id||…`), else plain
  `mob_names` / `legacy: <eqmob_name>`; `?mob=` deep-link filter with a
  dismissible chip; route watch widened to `$route.fullPath`
  (component-reuse gotcha).
- **EquipmentBuild.vue** — pick names open the modal.
- **MobDetail.vue** — linked loot rows render `bi-box-seam` + a link into
  the modal; editors get per-row link (`bi-link-45deg`) / unlink
  (`bi-x-diamond`, confirm dialog) with an inline typeahead over
  `GET /api/mobs/eq-items`; the `+` Add-loot form is a catalog typeahead
  (pick → adds linked + auto slot; no pick → explicit "plain text" note;
  no slot input); "Browse in Equipment →" (`/equipment-all?mob=`) and
  "KYA Lookup (N) →" (`/kya?name=`) jumps; header shows
  `aka <short_name>` (nickname = `short_name`, real name = `name`; both
  editable in the Edit Info form). All typeaheads carry an out-of-order
  response guard (latest keystroke wins).
- **EquipmentAdd.vue** — legacy eqmob Multiselect + "Add New Eq Mob"
  replaced by an optional Mob KB picker (`GET /api/equipment/mobs`);
  mob no longer required; eqmobs_edit users get a "create it in the
  Mob KB" link.
- **Kya.vue** — `?name=` deep-link (mounted + query watch), selection
  `router.replace`s the query so views are shareable.

Note: the SPA uses **hash routing** — deep links are
`/#/equipment-all?mob=…`, `/#/kya?name=…`.

## Verification done (2026-07-16)

- Migration dry-run → live → re-run (0 writes; idempotent).
- API: detail enrichment, `?mob=` filter, pickers, bind (`inserted`),
  unbind (loot row survives, history `linked`/`unlinked` diffs, version
  bumps), KYA counts (Azmog 36), FK `DELETE_RULE = SET NULL`.
- Flag matrix: eqmobs-only user reads item detail (200) but not the list
  (403) nor writes (403); flagless user gets 403 everywhere.
- Browser (puppeteer): modal renders in light AND dark; mob-filter chip;
  MobDetail loot links open the modal; KYA jump carries `?name=`;
  `/#/kya?name=Azmog` auto-selects.

## Remaining / follow-ups

- [ ] Manual cleanup of the 80 unmatched legacy eqmob names via the
      inline binders (report: `node scripts/migrate_mob_links.mjs --dry-run`).
- [ ] Incorporate reviewer input from the shared plan page.
- [ ] Consider surfacing `dropped_by` in the EQ Builder results.
- [ ] Mobile pass on the modal (~360px) next time the responsive
      harness runs.
