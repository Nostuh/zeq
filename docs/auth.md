# Auth and role system

zeq uses a server-side session model. Access is **capability-flag based**:
`users.role = 'admin'` is a master switch that implies every flag; every
other account is a plain `viewer` whose access is granted through flags in
the `user_roles` table. All middleware lives in
[api/rest/api/auth.mjs](../api/rest/api/auth.mjs); all user-management
endpoints live in [api/rest/api/users.mjs](../api/rest/api/users.mjs).

## Capability flags

Each functional area has a **view** flag and, where it makes sense, a
companion **`_edit`** flag that implies its view flag. Flags are rows in
`user_roles (user_id, role)` — the same table the old eq roles used.

| Flag | Grants | Nav section | Endpoints |
|---|---|---|---|
| `equipment` | view catalog / My & All Equipment / EQ Builder | Equipment | `/api/equipment` GET + `/build` |
| `equipment_edit` | add/edit items, tag ownership (implies `equipment`) | Equipment (Add) | `/api/equipment` POST/DELETE |
| `lookups` | KYA lookup (read-only) | Lookups | `/api/kya` |
| `eqmobs` | view the EQ Mob KB | EQ Mobs | `/api/mobs` GET |
| `eqmobs_edit` | edit the EQ Mob KB (implies `eqmobs`) | EQ Mobs | `/api/mobs` POST/DELETE |
| `planner_admin` | view + edit Races/Guilds/Skills/Spells/Costs | Planner Admin | `/api/game/*` mutations |
| `admin` (role) | everything above **plus** Users + Bug Reports | Admin | `/api/users`, `/api/bugs`, `/api/updates` |

Notes:
- **admin implies all** — an admin needs no `user_roles` rows.
- `planner_admin` and `lookups` are single flags (no view/edit split):
  game data is already public in the planner so a read-only admin view is
  pointless, and KYA has no edit UI.
- Reads of `/api/game/*` are **public** (the reinc planner is anonymous);
  only mutations require `planner_admin`.

`FLAGS` (the canonical list) and `FLAG_IMPLIES` live in auth.mjs.
`effectiveFlags(user)` expands a user's raw `user_roles` into the full set
(admin → all, `*_edit` → its view flag). `loadUser()` returns `flags: [...]`
on the user object; `/api/auth/me` and the login response both include it.

## Middleware

- `requireAuth` — any authenticated active user, regardless of flags.
- `requireAdmin` — `role === 'admin'`.
- `requireFlag(...names)` — passes if the user is an admin **or** holds any
  of the named flags (edit implies view via `effectiveFlags`). This is the
  workhorse: `requireFlag('equipment')`, `requireFlag('equipment_edit')`,
  `requireFlag('planner_admin')`, etc.
- `requireEqViewer` / `requireEqEditor` — thin aliases kept for the EQ Mob
  KB router: `requireFlag('eqmobs','eqmobs_edit')` / `requireFlag('eqmobs_edit')`.

`game.mjs` defines a local `const requireEditor = requireFlag('planner_admin')`
so its many call sites did not have to change.

## Users admin UI

The Users page ([Users.vue](../www/src/components/Users.vue)) renders a
matrix: an **Admin** checkbox (role admin↔viewer) plus a checkbox per
view/edit flag. Toggling posts the full desired set to
`POST /api/users/:id/flags` (validated against `FLAGS`); ticking an `_edit`
box auto-ticks its view box and vice-versa. Admin rows show every box
ticked+disabled (implicit all). `GET /api/users/` returns `flags: [...]`
per user.

## Migration from the old role model

The legacy model was `users.role ∈ {viewer,editor,admin}` +
`user_roles ∈ {eq_viewer,eq_editor}`. [scripts/migrate_roles.mjs](../scripts/migrate_roles.mjs)
(idempotent, dry-run by default, `--apply` to write, snapshots pristine
state into `*_premigration` tables first) maps, preserving access:
`editor → planner_admin` (role downgraded to viewer), `eq_viewer → eqmobs`,
`eq_editor → eqmobs + eqmobs_edit`, and grants `equipment + equipment_edit +
lookups` to every active non-admin (anyone who could already reach those
areas). Admins are untouched.

## Sessions

- Login at `POST /api/auth/login` with `{name, password}`. On success
  the server creates a random 64-hex session id, writes it to the
  `sessions` table with a 14-day expiry, and returns it in an HttpOnly
  `zeq_sid` cookie. The response body is `{ok: true, data: {id, name, role}}`.
- Cookie attributes: **`HttpOnly`**, **`SameSite=Strict`**, **`Secure`**,
  `Path=/`, `Max-Age=14d`. Strict sameSite means the cookie never
  accompanies cross-site navigation — users following an external link
  into Zorky's land unauthenticated and must re-log in. This is the
  hardening pass from the bug-check punch list item #11; intentional
  CSRF defence, small UX cost.
- `GET /api/auth/me` returns `{ok: true, data: user|null}`. The SPA
  calls this on mount and on every route change.
- `POST /api/auth/logout` deletes the session row and clears the cookie.
- Expired sessions are rejected at the middleware layer (`expires > NOW()`).
  There is no background cleanup job; expired rows are ignored.

## Passwords

New accounts are stored with bcrypt in `users.password_hash`. The
legacy `users.password` column (md5) is preserved for backwards
compatibility: if a user has no `password_hash` but a legacy md5
password, the login handler verifies the md5 and then transparently
upgrades the row to bcrypt. Admin password resets always write to
`password_hash` and blank the legacy column. Any password reset also
deletes all active sessions for that user, forcing re-login.

## Bootstrap admin

On API startup, `bootstrapFirstAdmin()` runs: if there is no active
admin in `users`, it looks for `ZEQ_ADMIN_USER` and `ZEQ_ADMIN_PASS`
environment variables and either creates a new admin with those
credentials or promotes an existing matching user to admin. If the env
vars are missing, the step is a no-op (a log line is emitted). Once
any active admin exists, this step is skipped on subsequent boots.

To rotate the bootstrap admin: disable or delete the current admin row
(from another admin session) and restart the API with new env vars.

## Enforcement rules (server-side, not just UI)

These live in [users.mjs](../api/rest/api/users.mjs) and are enforced
regardless of what the UI allows:

1. You cannot modify or delete **your own** account (`id === req.user.id`).
   Role, active state, and deletion all reject with HTTP 400.
2. You cannot demote or disable the **last active admin**. The role
   and active-state endpoints use a conditional `UPDATE ... WHERE` with
   a self-referencing derived-table subquery:
   ```sql
   UPDATE users SET role = @role
   WHERE id = @id
     AND (
       @role = 'admin'
       OR (SELECT COUNT(*) FROM (SELECT id, role, active FROM users) _u
           WHERE _u.role = 'admin' AND _u.active = 1 AND _u.id <> @id) >= 1
     )
   ```
   The derived-table wrapper sidesteps MySQL's "can't specify target
   table for update in FROM clause" rule. The whole check runs
   atomically inside the single UPDATE statement, so two admins can no
   longer race each other into a zero-admin state. Affected-row count
   of 0 → `cannot demote/disable the last active admin`.
3. You cannot delete the **last admin** at all — regardless of active
   state. This closes the self-lockout path where every admin is
   disabled and then the last active one is deleted. (See bug-check
   punch list item #10.)
4. Password reset also invalidates every outstanding session for the
   reset user, forcing re-login.

## Error shape

All auth/users endpoints return `{ok: true, ...}` on success and
`{ok: false, error: "message"}` on failure. HTTP status is 401 for
missing session, 403 for insufficient role, 400 for input/business
errors, 404 for missing resources.
