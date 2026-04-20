# EQ Mob Knowledge Base

Collaborative mob combat data tracker replacing a shared OneNote notebook.
Login-gated; access controlled by supplementary eq roles.

## Access control

Two supplementary roles stored in `user_roles` table (not the main
`users.role` column):

| Role | Access |
|---|---|
| `eq_viewer` | Read-only access to all mob data |
| `eq_editor` | Full CRUD (implies eq_viewer) |
| `admin` (main role) | Automatic full access — no user_roles entry needed |

Admins assign eq roles from the Users admin page (EQ Access column).
Middleware: `requireEqViewer`, `requireEqEditor` in
[auth.mjs](../api/rest/api/auth.mjs). The `/api/auth/me` response
includes `eqRoles: [...]` so the SPA can gate nav/controls.

## Tables (schema in [schema/mobs.sql](../schema/mobs.sql))

All prefixed `mob_` except `user_roles`.

- **`user_roles`** — `(user_id, role)` PK. Supplementary roles beyond
  `users.role`. Currently only `eq_viewer` and `eq_editor`.
- **`mob_monsters`** — core mob record. Has `version` column for
  optimistic locking. `notes` is the primary content field — the PDF
  importer puts ALL text here.
- **`mob_resistances`** — per-mob damage type values (1–8 kya scale).
  9 types: physical, magical, fire, cold, electric, poison, acid,
  asphyxiation, psionic.
- **`mob_prots`** — required/recommended protections for the party.
- **`mob_guilds`** — guilds needed for the kill (free text, not FK to
  game_guilds — mob knowledge is player-curated).
- **`mob_loot`** — equipment drops. `equipment_id` is a NULL placeholder
  for future FK to an equipment table.
- **`mob_images`** — photo attachments. Files stored at
  `/srv/zeq/api/uploads/mobs/{mob_id}/`. Same MIME-sniffing pattern as
  bug attachments (see [gotchas.md](gotchas.md)).
- **`mob_maps`** — ASCII maps. Content is strict 7-bit ASCII.
- **`mob_history`** — full edit history. `user_name = 'init'` for
  system imports. `diff_json` stores field-level diffs for updates;
  `snapshot` stores full state for creates.

## API ([api/rest/api/mobs.mjs](../api/rest/api/mobs.mjs))

Mounted at `/api/mobs`. All reads require `eq_viewer`; all writes
require `eq_editor`.

Key endpoints:
- `GET /` — list mobs, `?q=` search
- `GET /:id` — full mob detail with all sub-resources joined
- `POST /` — create mob
- `POST /:id` — update mob (**requires `version` for optimistic lock**)
- `DELETE /:id` — delete mob + cascade + disk cleanup
- `POST /:id/resistances` — bulk set all 9 damage types
- `POST /:id/prots`, `DELETE /:id/prots/:pid`
- `POST /:id/guilds`, `POST /:id/guilds/:gid`, `DELETE /:id/guilds/:gid`
- `POST /:id/loot`, `POST /:id/loot/:lid`, `DELETE /:id/loot/:lid`
- `POST /:id/images` — base64 upload, `GET /:id/images/:iid` — serve binary
- `POST /:id/maps`, `DELETE /:id/maps/:mid`
- `GET /:id/history` — paginated edit history

### Optimistic locking

Every mutation on `mob_monsters` requires `version` in the request body.
The server does `UPDATE ... WHERE id = @wh AND version = @wv`. If
`affectedRows === 0` → HTTP 409 with a "modified by another user" error.
The client must refresh and retry.

## Frontend

- [MobList.vue](../www/src/components/MobList.vue) — searchable table
  (desktop) / cards (mobile). Click row → detail.
- [MobDetail.vue](../www/src/components/MobDetail.vue) — two-column
  layout: main content left (~85%), sidebar right (~220px) with
  resistances, protections, guilds, loot. Edit forms hidden behind
  `+` buttons; show "Empty" when no data.
- [MobHistory.vue](../www/src/components/MobHistory.vue) — paginated
  edit history with expandable inline diffs. `init` entries styled
  as system imports.
- [MobAsciiEditor.vue](../www/src/components/MobAsciiEditor.vue) —
  split-pane textarea + `<pre>` preview. Auto-sanitizes non-7-bit
  ASCII on paste (curly quotes → straight, em dash → --).

Nav placement: sidebar "EQ Mobs" section between Equipment and Admin
(visible only with eq access). Routes: `/mobs`, `/mobs/:id`.

## PDF importer ([scripts/import_mobs.mjs](../scripts/import_mobs.mjs))

Parses `docs/Zombiemud.pdf` (OneNote export) via `pdftotext`.

**Mob detection:** Each OneNote page starts with title → `Day, Month DD, YYYY`
→ `HH:MM AM/PM`. The importer requires all three lines in sequence to
detect a new mob. Continuation pages (multi-page mobs) are merged into
the parent.

**Strategy:** ALL text goes into `notes`. Directions are extracted as a
bonus (lines with semicolons + compass patterns). Loot is extracted from
bullet-pointed items. Exp value, undead/aggro flags are detected from
content. Everything else stays in notes for manual cleanup.

**Images:** Extracted via `pdfimages -j`. Assigned to mobs by page
proximity (approximate — some mismatches expected).

**Kya results:** Parsed from the Quests section of the PDF. Pattern:
`Punkki [party]: Acid 7 Asph 7 Phys 7` → mapped to `mob_resistances`.

Usage: `node scripts/import_mobs.mjs [--force]`
- `--force` deletes all existing mob data and re-imports.
- Idempotent without `--force` (skips existing mobs by name).
- All imported records: `created_by = NULL`, history `user_name = 'init'`.

## Gotchas specific to this feature

### @name placeholder collisions in mob queries
The mysql shim's `replaceAll('@key', escape(val))` means param names
must NEVER be substrings of other param names in the same query. The
mob INSERT/UPDATE queries use short unique names (`@vn`, `@vs`, `@va`,
`@vd`, `@vb`, etc.) instead of descriptive names like `@directions` /
`@directions_back` because the latter collides (`@directions` matches
inside `@directions_back`, leaving `NULL_back` in the SQL). This bit
us twice — once in the importer, once in the API. See
[gotchas.md](gotchas.md) for the general rule.

### Future equipment link
`mob_loot.equipment_id` is a NULL placeholder FK. The current equipment
section (`eq`/`eqmobs` tables) is NOT compatible — do not wire it in.
The data model is ready to accept an equipment relationship later
without a rewrite.
