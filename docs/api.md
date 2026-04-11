# JSON API

All endpoints mount under `/api/<router>` where `<router>` matches the
filename in `api/rest/api/`. They all speak JSON. The response
envelope is always `{ok: true, data}` or `{ok: false, error}`.

## Auth

Session-cookie-based. See [auth.md](auth.md) for the full model.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/login`  | public | `{name, password}` → sets `zeq_sid` cookie |
| POST | `/api/auth/logout` | public | clears session |
| GET  | `/api/auth/me`     | public | current user or `null` |

## Users (admin only)

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/users/`             | list users |
| POST   | `/api/users/`             | create `{name, password, role}` |
| POST   | `/api/users/:id/role`     | `{role}` — rejects self-modify & last-admin demote |
| POST   | `/api/users/:id/active`   | `{active: bool}` — rejects self-modify & last-admin disable |
| POST   | `/api/users/:id/password` | `{password}` — also invalidates the target's sessions |
| DELETE | `/api/users/:id`          | rejects self-delete & last-admin delete |

## Game data (**reads are public**, `editor` required for writes)

GET endpoints on `/api/game/*` are public — the reinc planner at `/`
is accessible without signing in. Mutations (POST/DELETE) still
require editor or admin.

### Races
| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/game/races?q=...` | list; `q` filters by name LIKE |
| GET    | `/api/game/races/:id`   | full row |
| POST   | `/api/game/races`       | create `{name, parent_id, max_*, size, exp_rate, ..., enabled, help_text}` |
| POST   | `/api/game/races/:id`   | update any of the race columns (incl. `enabled`) |
| DELETE | `/api/game/races/:id`   | delete (orphans subraces) |

### Skills / Spells (same shape)
| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/game/skills?q=...` | list |
| GET    | `/api/game/skills/:id`   | full row incl. `help_text` |
| POST   | `/api/game/skills/:id`   | `{name, start_cost, help_text}` |
| DELETE | `/api/game/skills/:id`   | delete |

Same four endpoints exist for `spells`.

### Guilds
| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/game/guilds`      | flat list (top-level + subguilds) |
| GET    | `/api/game/guilds/:id`  | detail: `{guild, bonuses, skills, spells, subguilds}` |
| POST   | `/api/game/guilds`      | create `{name, file_name, parent_id, max_level}` |
| POST   | `/api/game/guilds/:id`  | `{name, file_name, parent_id, max_level}` |
| DELETE | `/api/game/guilds/:id`  | orphans subguilds; cascades bonuses/unlocks |

Per-level sub-resources for inline editing in the guild detail view:

| Method | Path | Purpose |
|---|---|---|
| POST   | `/api/game/guilds/:id/bonuses`    | add `{level, bonus_name, value}` |
| POST   | `/api/game/guild-bonuses/:rowId`  | update bonus row |
| DELETE | `/api/game/guild-bonuses/:rowId`  | delete bonus row |
| POST   | `/api/game/guilds/:id/skills`     | add `{skill_id, level, max_percent}` |
| POST   | `/api/game/guild-skills/:rowId`   | update skill unlock row |
| DELETE | `/api/game/guild-skills/:rowId`   | delete skill unlock row |
| POST   | `/api/game/guilds/:id/spells`     | add `{spell_id, level, max_percent}` |
| POST   | `/api/game/guild-spells/:rowId`   | update spell unlock row |
| DELETE | `/api/game/guild-spells/:rowId`   | delete spell unlock row |

### Wishes / Boons
Admin-editable catalogs the reinc planner consumes. Same shape for both:

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/game/wishes`       | list all (public) |
| POST   | `/api/game/wishes`       | create `{name, category, tp_cost, effect_key, effect_value, sort_order}` |
| POST   | `/api/game/wishes/:id`   | update |
| DELETE | `/api/game/wishes/:id`   | delete |
| GET    | `/api/game/boons`        | same, with `pp_cost` instead of `tp_cost` |
| POST   | `/api/game/boons`        | |
| POST   | `/api/game/boons/:id`    | |
| DELETE | `/api/game/boons/:id`    | |

### Costs
| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/game/costs`               | `{level_costs, wish_costs, ss_costs}` |
| POST   | `/api/game/costs/level`         | upsert `{kind, level, cost}` (`kind` ∈ level/stat/quest) |
| DELETE | `/api/game/costs/level/:kind/:level` | delete a level-cost row |
| POST   | `/api/game/costs/wish`          | upsert `{kind, tier, cost}` (`kind` ∈ lesser/greater) |
| DELETE | `/api/game/costs/wish/:kind/:tier`   | |
| POST   | `/api/game/costs/ss`            | upsert `{from_pct, to_pct, multiplier}` |
| DELETE | `/api/game/costs/ss/:id`        | |

### Reinc bootstrap (public, fast-path for the planner)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/game/reinc-bootstrap`  | `{races, guilds, skills, spells, wishes, boons, level_costs, ss_costs}` — one call, returns enabled races only |
| GET | `/api/game/reinc-guild/:id`  | `{id, bonuses, skills, spells}` — lazy-loaded on first guild pick |

## Bug reports & ideas (`/api/bugs`)

Submissions are public; admin endpoints require `admin`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST   | `/api/bugs`                          | public | submit `{title, description, page_url, user_agent, screen_size, reporter_name?, app_state?, dom_snapshot?, console_log?, attachments?}` |
| GET    | `/api/bugs/?status=...`              | admin | list reports; each row includes an `attachments[]` array of `{id, filename, mime_type, size_bytes}` |
| GET    | `/api/bugs/:id/attachments/:attId`   | admin | stream the image binary with stored mime type |
| POST   | `/api/bugs/:id/status`               | admin | `{status}` ∈ open / in_progress / resolved / wontfix |
| DELETE | `/api/bugs/:id`                      | admin | rm disk dir first, then delete DB row (cascades attachments) |

Submission rules:
- **Attachments** — optional array of `{filename, mime, data_base64}`,
  max 6 files × 5 MB each, JPG and PNG only. The server sniffs the
  decoded buffer's magic bytes and rejects anything that isn't a real
  PNG or JPEG, regardless of the claimed mime. The client modal
  ([BugReportModal.vue](../www/src/components/BugReportModal.vue))
  accepts files from the file picker, drag-and-drop, AND **clipboard
  paste** (Ctrl+V / ⌘V) — the modal installs a `window`-level paste
  listener on mount that routes any `clipboardData.items[*].kind ===
  'file'` through the same base64 pipeline as picked files.
- **Spam detection** — duplicates of `(IP, sha1(title+description))`
  within a 5-minute window return `{ok:true, data:{id:null, duplicate:true}}`
  without storing. Intentional: the client sees success and moves on.
- **Captured context** — `app_state` is a JSON string built by
  `$root.collectBugContext()` on the client, `dom_snapshot` is the
  `<main>` outerHTML with `<script>` stripped and capped at 40KB,
  `console_log` is an NDJSON tail of the last ~100 console entries.
  All three are optional but strongly recommended — they are how a
  future triage session will reproduce the bug.

## Conventions

- All SQL goes through the `@name` placeholder shim in
  [api/classes/mysql.mjs](../api/classes/mysql.mjs). Never interpolate
  user input by hand; always pass values via the params object.
- One router module per top-level resource. The file must `export`
  a router named the same as the filename (e.g.
  `export const users = router`) because `api.mjs` dynamically mounts
  `rest/api/<name>.mjs` under `/api/<name>` using that export.
- All mutation handlers wrap their body in try/catch and return
  `{ok:false, error}` on any exception — never leak stack traces.
- Errors use HTTP status 400 for input/business errors, 401 for
  missing session, 403 for wrong role, 404 for missing resources.
