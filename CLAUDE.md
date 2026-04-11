# zeq — ZombieMUD Zcreator Data Manager

Public reinc planner + admin for [ZombieMUD](http://zombiemud.org/).
Planner at `/`; admin behind roles. **Keep this file ≤61 lines —
spill detail to `docs/*.md`.**

## Layout

- `api/` — Node + Express ESM; [api.mjs](api/api.mjs) globs `rest/*/*.mjs`;
  DB via [db.mjs](api/db.mjs); gitignored config `api/classes/config.json`.
- `www/` — Vue 3 + Vite + Bootstrap 5 SPA. [main.js](www/src/main.js),
  [App.vue](www/src/App.vue), [routes.js](www/src/routes.js).
- `data/` — Zcreator `.chr`/`.txt` source for the importer.
- `schema/` — Idempotent DDL: [zeq.sql](schema/zeq.sql), [auth.sql](schema/auth.sql).
- `scripts/` — [import_zcreator.mjs](scripts/import_zcreator.mjs),
  [test/responsive.mjs](scripts/test/responsive.mjs).
- `docs/` — Everything bigger than this file.

## DB

MariaDB, database `zeq`, connection in `api/classes/config.json`. Legacy
tables `eq`, `eqmobs`, `kya_info`, `users` exist and must not be destroyed.
New game-data tables are prefixed `game_`; users get extra columns + roles.
See [docs/schema.md](docs/schema.md).

## Conventions

- SQL: `@name` placeholders via [api/classes/mysql.mjs](api/classes/mysql.mjs);
  never hand-interpolate user input.
- New endpoints: one file in `api/rest/api/*.mjs`, `export const <name>`
  matching the filename; auto-mounted at `/api/<filename>`.
- Auth: session cookie + roles `admin`/`editor`/`viewer`; see [docs/auth.md](docs/auth.md).
- Vue: components in `www/src/components/`; ignore `old_components/`.
- UI: dense Bootstrap tables; viewers see data, no edit controls. Every
  change must work desktop/tablet/mobile — CSS grid + `@media`, no fixed
  px widths. Gate on `cd scripts/test && node responsive.mjs` (headless
  Chromium, 6 viewports). See [docs/ui.md](docs/ui.md), [docs/testing.md](docs/testing.md).
- API shape: `{ok:true,data}` / `{ok:false,error}`; see [docs/api.md](docs/api.md).
- Reinc planner: public at `/`, targets ZombieMUD. Math changes MUST cite
  `/tmp/Zcreator-Enhanced/decompiled_source/CharCreator/`. Page locked to
  `100vh` — never add page-level scroll. See [docs/reinc.md](docs/reinc.md), [docs/seo.md](docs/seo.md).

## Running

`pm2 restart api`; `cd www/src && npx vite build`; `cd scripts && node import_zcreator.mjs [--force]`. Deployment/SSL/pm2: [docs/deployment.md](docs/deployment.md).

## "resolve all bugs"

Follow [docs/bug-workflow.md](docs/bug-workflow.md). Every report is a
hypothesis that must be **confirmed or denied** with evidence. Re-read
this CLAUDE.md and the subsystem's source of truth (C# decompile /
`.chr` / `schema/*.sql` / responsive harness). Each bug captures
`app_state` / `dom_snapshot` / `console_log` — use them. NEVER auto-apply.

## Before touching code

**Read [docs/gotchas.md](docs/gotchas.md) first** — every bug that bit
us in past sessions (Vue checkbox desync, int32 wrap, `.tab-body`+grid
class trap, `totalLevels` state direction, mysql shim `@name`-only).
Then [docs/schema.md](docs/schema.md), [docs/data-import.md](docs/data-import.md),
and for planner math [docs/reinc.md](docs/reinc.md).
