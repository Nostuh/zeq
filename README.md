# zeq

**ZombieMUD Zcreator Data Manager** — a public reinc planner and admin
console for [ZombieMUD](http://zombiemud.org/), built on top of the
data files shipped with the Zcreator Enhanced desktop client.

Live at **[nostuh.com](https://nostuh.com)**.

## What it does

- **Reinc Planner** ([www/src/components/Reinc.vue](www/src/components/Reinc.vue))
  — public, no-login character planner at `/`. A faithful in-browser
  port of the Zcreator desktop tool's math: races, guilds + subguilds
  (with the 15-level subguild budget), wishes, boons, stat training,
  skill/spell training cost tables, and the experience / gold / QP
  totals that fall out of them. Constants and formulas documented in
  [docs/reinc.md](docs/reinc.md).
- **Saved reincs gallery** at `/builds` — share-a-build with up/downvote.
  See [docs/saved-reincs.md](docs/saved-reincs.md).
- **EQ Mob Knowledge Base** at `/mobs` — collaborative mob-combat
  tracker (resistances on the 1–8 kya scale, required prots, party
  guilds, loot, ASCII maps, photos, full edit history). Login-gated.
  See [docs/mobs.md](docs/mobs.md).
- **KYA Lookup** at `/kya` — read-only browser over the legacy
  `kya_info` table with three capture-format parsers and an
  encounter-aware aggregate heatmap. See [docs/kya.md](docs/kya.md).
- **Admin** for the underlying game data (races, guilds, skills,
  spells, wishes, boons, level/stat/quest cost tables) plus user
  management and bug-report triage.

## Layout

| Path | What lives there |
|---|---|
| [api/](api/) | Node 22 + Express ESM API. [api.mjs](api/api.mjs) globs `rest/*/*.mjs` and auto-mounts each under `/api/<filename>`. DB shim in [api/classes/mysql.mjs](api/classes/mysql.mjs) (use `@name` placeholders, never hand-interpolate). Config in gitignored `api/classes/config.json`. |
| [www/](www/) | Vue 3 + Vite + Bootstrap 5 SPA. Entry [main.js](www/src/main.js); root [App.vue](www/src/App.vue); routes [routes.js](www/src/routes.js); pages in [www/src/components/](www/src/components/). |
| [data/](data/) | Original Zcreator `.chr` / `.txt` source files — the importer's input. |
| [schema/](schema/) | Idempotent DDL: [zeq.sql](schema/zeq.sql) (game data + bug reports + saved reincs), [auth.sql](schema/auth.sql) (users + sessions), [mobs.sql](schema/mobs.sql) (EQ Mob KB). All scripts use `IF NOT EXISTS` and are safe to re-apply. |
| [scripts/](scripts/) | [import_zcreator.mjs](scripts/import_zcreator.mjs), [seed_wishes_boons.mjs](scripts/seed_wishes_boons.mjs), responsive test harness. |
| [docs/](docs/) | Subsystem documentation — see below. |

## Docs

The terse [CLAUDE.md](CLAUDE.md) at the root is the working agreement;
deeper detail spills into `docs/`:

- [reinc.md](docs/reinc.md) — planner formulas, the `extraFree` ↔
  `totalLevels` state model, wish/boon semantics
- [schema.md](docs/schema.md) — every table, column intent, FK behavior
- [auth.md](docs/auth.md) — three-role session model + supplementary
  `eq_viewer`/`eq_editor` roles + last-admin lockout protection
- [api.md](docs/api.md) — full endpoint reference
- [ui.md](docs/ui.md) — UI conventions: data-dense Bootstrap tables,
  responsive via CSS grid, light + dark theme rules
- [mobs.md](docs/mobs.md), [kya.md](docs/kya.md),
  [saved-reincs.md](docs/saved-reincs.md), [updates.md](docs/updates.md),
  [seo.md](docs/seo.md), [bug-workflow.md](docs/bug-workflow.md),
  [data-import.md](docs/data-import.md), [testing.md](docs/testing.md),
  [deployment.md](docs/deployment.md)
- [gotchas.md](docs/gotchas.md) — **read first** if you're touching
  code: every bug that bit us (Vue checkbox desync, int32 wrap on big
  exp totals, `.tab-body` + grid trap, `totalLevels` direction, `@name`
  placeholder collisions, …)

## Database

MariaDB, database `zeq`. Game data lives in `game_*` tables; the
EQ Mob KB lives in `mob_*` tables; auth is layered onto the legacy
`users` table with new columns plus a `sessions` table. The legacy
tables (`eq`, `eqmobs`, `kya_info`, `users`) are preserved and must
not be dropped — `--force` reimports only truncate `game_*`. Full
schema in [docs/schema.md](docs/schema.md).

## Running

```bash
# API (pm2-managed in prod, port 50000 by default)
pm2 restart api --update-env

# Frontend build
cd www/src && npx vite build

# (Re-)import Zcreator data
cd scripts && node import_zcreator.mjs           # skip if data present
cd scripts && node import_zcreator.mjs --force   # truncate game_* and re-import
```

Deployment notes (nginx, Let's Encrypt, pm2, the DigitalOcean droplet,
firewalld, certbot renewals) live in [docs/deployment.md](docs/deployment.md).

## Conventions worth knowing before you commit

- **API shape** is always `{ok: true, data}` or `{ok: false, error}`.
- **New endpoint** = one file in `api/rest/api/`, `export const <name>`
  matching the filename — it'll be auto-mounted at `/api/<filename>`.
- **SQL** must go through [api/classes/mysql.mjs](api/classes/mysql.mjs)
  with `@name` placeholders. Never interpolate user input by hand.
- **Roles** — `viewer` / `editor` / `admin` for game data, plus
  supplementary `eq_viewer` / `eq_editor` for the mob KB. The server
  enforces; the UI just hides controls.
- **UI** — dense Bootstrap tables, responsive via CSS grid + `@media`
  (no fixed px on page containers), every new style must work in BOTH
  light and dark themes (`data-bs-theme` on `<html>`).
- **Reinc planner** is locked to `100vh` — never add page-level scroll.
- **Updates feed** (`site_updates`) is for **public reinc-planner
  changes only**. Internal/admin features (KYA, Mob KB, equipment) do
  not get rows. See [docs/updates.md](docs/updates.md).
- **Bug workflow** — every reported bug is a hypothesis to be
  confirmed or denied with evidence (`app_state` / `dom_snapshot` /
  `console_log` are captured on every report). Never auto-apply
  fixes. See [docs/bug-workflow.md](docs/bug-workflow.md).

## License

Personal project for the ZombieMUD community. The Zcreator data files
in [data/](data/) are the work of ZombieMUD's developers; everything
else here is by Doug Hutson.
