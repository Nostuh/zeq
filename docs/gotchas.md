# Gotchas learned the hard way

Things that bit us in past sessions and would bite future work if not
written down. Skim this before touching the corresponding subsystem.

## Frontend / Vue

### Don't combine `.tab-body` and a grid class on the same element
A layout class like `.general-grid` or `.skills-grid` must be on a
**child** of `.tab-body`, not the same DOM node. The mobile media
query sets `flex: 0 0 auto` on the grid classes so they take their
natural content height and `.tab-body` can scroll around them. If the
two classes share an element, the `flex: 0 0 auto` also applies to
`.tab-body` and the scroll container collapses into a 3000px+ block
that can't scroll. The planner was broken on mobile for exactly this
reason until we split the elements apart.

Correct structure:
```html
<div class="tab-body">
  <div class="general-grid">
    ...
  </div>
</div>
```

### `buildSkillCostArray` maxcost = race skillCost, NOT startCost
`maxcost = skillCost * 100000` — `skillCost` is the **race** multiplier
(`race.skill_cost` / `race.spell_cost`), **not** the per-skill
`startCost`. The earlier JS implementation in `engine.js` did
`const maxcost = startCost * 100000` and the per-bucket clamp
effectively never fired for skills with large `start_cost` (gestalt
conjuration is 10,000,000), so a maxed Devil build showed Total Exp of
158B where Zcreator desktop showed 3.3B (~48×). The sanity script in
[scripts/test/sanity_level_exp.mjs](../scripts/test/sanity_level_exp.mjs)
hand-ports `setCosts` against the engine module — keep it green.

### `(n | 0)` is signed 32-bit, not "integer cast"
`Math.floor(Number(n))` is the safe way to truncate numbers for
display. The planner's `nfmt()` started with `(n | 0).toLocaleString()`
and anyone with a Fighter L45 saw their Total XP render as a negative
2-billion-ish number because int32 wraps. See
[docs/reinc.md](reinc.md) `nfmt`/`sfmt`.

### Vue checkbox desync when a click handler declines the toggle
If `<input type="checkbox" :checked="..." @change="fn">` is wired up
and `fn` decides not to mutate the bound value, Vue does NOT re-render
the checkbox (bound value unchanged) but the browser already flipped
the DOM `.checked` property. Result: visually checked but state says
unchecked. Even `@click.prevent` on the `<input>` with `:checked` as
the sole source of truth can still desync across browsers — the DOM
`.checked` property drifts from the Vue-managed attribute. The only
reliable fix is to **not use a native checkbox at all**: replace it
with a Bootstrap icon (`bi-check-square-fill` / `bi-square`) driven
purely by reactive state. The reinc guild list (TabGeneral.vue) uses
this approach after bug #27 proved every native-checkbox pattern
eventually desyncs.

### Derived state vs. primary state for totalLevels
`totalLevels` in the reinc planner is a COMPUTED value derived from
`guildLevelsSum + freeLevels` where `extraFree` is the only primary
field. The earlier version had `totalLevels` as primary state and
derived `freeLevels` from it; that produced phantom free levels when
the user dropped a guild because `totalLevels` didn't follow. The rule
mirrors the Zcreator desktop convention: `totalLevels = 120 -
guildlevels + free`, with `free` as the setter.

### Lesser / greater wishes use a progressive cost, not the flat `tp_cost`
`game_wishes.tp_cost` is correct for **generic / resist / minor** rows
(40 for stats, 150 for resists, etc.), but **lesser** and **greater**
wishes ignore that field and use [data/wishcost.chr](../data/wishcost.chr)
(table `game_wish_costs`): the Nth lesser pick costs `lesser[N-1]`,
the Nth greater pick costs `greater[N-1]`. The first cut of the planner
just summed `tp_cost` for every selected wish, which under-counted the
in-game spend dramatically (a fully-stacked greater set was ~1700 in
the planner vs ~2300 in game). Fix lives in `sumWishEffects` in
[engine.js](../www/src/components/reinc/engine.js) and the matching
`wishTpUsed` computed in
[Reinc.vue](../www/src/components/Reinc.vue) — both must keep agreeing.
**Note:** there are 10 lesser and 10 greater wishes in the catalog but
`wishcost.chr` only defines 9 tiers; `progressiveTier()` clamps the
10th pick to the last tier so the planner stays defined either way.
Bug #32.

### Subguild levels are capped at 15 per primary guild
Every primary guild starts with 15 available subguild levels, and the
desktop client decrements that pool as the user picks subguild levels
under it. The web planner originally enforced *only* "subguild parent
must be at max level" plus the 120-level global cap, so a Bard 45 +
Actors/Gallants/Minstrels/Troubadours @5 each (20 sub-levels) was
accepted. Bug #21. Three places now clamp against `subRoomFor(g)` in
[Reinc.vue](../www/src/components/Reinc.vue): `toggleGuild` (initial
level on add), `setPickLevel` (in-place edits), and the saved-build
restore loop (so re-importing an old state cannot resurrect an illegal
build). See [reinc.md](reinc.md#guild-and-subguild-ordering-rules).

### `100vw` includes the vertical scrollbar
Any `max-width: 100vw` or similar on a page-level container overflows
horizontally as soon as the content generates a vertical scrollbar.
Use `width: 100%; max-width: 100%; box-sizing: border-box` instead.

### `html:has(body.reinc-active)` for page-level overflow
The reinc planner is locked to a single viewport. The rule to disable
page scrolling lives in App.vue and toggles a body class:
```css
html:has(body.reinc-active), body.reinc-active {
    overflow: hidden; height: 100vh; margin: 0;
}
```
Inner lists (`.guild-list`, `.skill-list`, `.cost-table-wrap`, the
wishes/boons grids, the mobile tab-body) handle their own overflow.
Do not add `overflow-y: auto` to anything that would compete with
`.tab-body` on mobile — it already scrolls there.

## API / backend

### Pool connection MUST force `charset: 'utf8mb4'`
The `mysql@2.18.1` package defaults to 3-byte `utf8` on new
connections, which cannot round-trip 4-byte UTF-8 codepoints (emoji,
astral-plane characters). Columns can be declared `utf8mb4` and
direct `mysql` CLI inserts of emoji work fine, but INSERTs from Node
fail with:
```
ER_TRUNCATED_WRONG_VALUE_FOR_FIELD: Incorrect string value:
  '\xF0\x9F\x94\x92</...' for column bug_reports.dom_snapshot
```
`\xF0\x9F\x94\x92` is 🔒, the lock emoji the planner uses as the
locked-subguild indicator, so every user captured it in their
`dom_snapshot` and every bug submission broke. The fix is a single
line in [api/classes/mysql.mjs](../api/classes/mysql.mjs) —
`config.charset = 'utf8mb4'` before `createPool`. Verify with
`SHOW VARIABLES WHERE variable_name IN ('character_set_client',
'character_set_connection', 'collation_connection')` through the
driver; all three should be `utf8mb4` / `utf8mb4_general_ci`.

### Don't record spam/rate-limit state until the work actually succeeded
The bug-reports spam filter originally bumped its counter on every
call, BEFORE the DB insert. If the insert failed (or any other later
step threw), the user's retry with the same body was silently dropped
as a duplicate — compounding any other backend bug into "the form is
completely broken." The correct pattern is:
1. Read-only check: has this key already been RECORDED?
2. If yes, drop silently.
3. Otherwise do the work.
4. **On success**, record the key.
5. On failure, leave the cache untouched so the user can retry.
See [bugs.mjs](../api/rest/api/bugs.mjs) `isSpamDuplicate` /
`recordSpamKey`. Apply the same principle to any future rate-limit or
dedup cache.

### mysql shim uses `@name` placeholders, never positional `?`
[api/classes/mysql.mjs](../api/classes/mysql.mjs) substitutes params
with a `sql.replaceAll('@name', escape(value))` loop. It knows nothing
about `?`. Queries that use `?` will fail with a cryptic syntax error.
Always build a params object and reference fields by `@key`.

The shim uses `replaceAll`, not `replace` — a past version used
non-global replace and silently broke any query that referenced the
same placeholder twice. Don't revert to `replace`.

**Param name collision:** Because the shim iterates params and calls
`sql.replaceAll('@' + key, ...)`, a param named `@dir` will match
inside `@dirback`, replacing the first part and leaving garbage like
`NULLback` in the SQL. This bit the mob API twice. **Rule: no param
name may be a substring of another param name in the same query.**
When a query has many columns, use short unique prefixed names like
`@vn`, `@vs`, `@vd`, `@vb` instead of descriptive names like
`@directions` / `@directions_back`.

### MySQL can't self-reference a table in an UPDATE subquery
The "last active admin" check in [users.mjs](../api/rest/api/users.mjs)
wraps its users subquery in a derived table so MySQL allows it:
```sql
UPDATE users SET role = @role
WHERE id = @id
  AND (
    @role = 'admin'
    OR (SELECT COUNT(*) FROM (SELECT id, role, active FROM users) _u
        WHERE _u.role = 'admin' AND _u.active = 1 AND _u.id <> @id) >= 1
  )
```
The `(SELECT ... FROM users) _u` derived table sidesteps MySQL's
"can't specify target table for update in FROM clause" rule. Check
`affectedRows` after the UPDATE to detect the conflict case.

### Legacy auth lives in two places
`/api/auth/login` (modern, bcrypt, session cookie) and `/api/eq/login`
(legacy, md5-with-bcrypt-fallback for the equipment pages). Both now
use the same transparent md5 → bcrypt upgrade pattern. Don't unify
them without testing the old Equipment.vue flow still works.

### Session cookie is `sameSite: 'strict'` + `secure: true`
After switching from `lax` → `strict`, a user following a link from an
external site back into Zorky's will land unauthenticated. This is
intentional (CSRF defense). Don't weaken it without a reason.

### Bug submissions carry captured context
Every POST to `/api/bugs` includes `app_state` (JSON), `dom_snapshot`
(truncated HTML), and `console_log` (NDJSON tail of the last ~100
entries plus unhandled errors). The client-side capture is installed
in [main.js](../www/src/main.js) BEFORE Vue boots so it catches early
errors. When triaging a bug, use the captured context instead of
guessing. See [bug-workflow.md](bug-workflow.md).

### `site_updates.created` is a naive Eastern wall-clock string, not UTC
The droplet's MySQL is `system_time_zone = UTC` and the `mysql@2.18.1`
driver returns `datetime` columns as JS `Date`s anchored to that
timezone. The first cut of `/api/updates/` exposed `created` as a
`...Z` ISO string, which then fanned out two ways:
1. The `Updates.vue` grouping built day headings via
   `new Date(iso).toISOString().slice(0,10)` — UTC date — and then
   re-parsed `"YYYY-MM-DD"` (UTC midnight) for the heading. Any
   viewer west of UTC saw every entry render as the previous day.
2. Seed strings like `'2026-04-11 23:00:00'` were authored as
   *Eastern* wall-clock but stored as if UTC, so they drifted 4–5
   hours from when the work actually shipped.

The fix avoids JS `Date` round-trips entirely. The GET handler in
[updates.mjs](../api/rest/api/updates.mjs) wraps the column in
`DATE_FORMAT(u.created, '%Y-%m-%dT%H:%i:%s')` so the API ships a
naive string with no `Z`. POST/UPDATE accept the same shape via
`naiveDatetime()`; new entries authored without an explicit
timestamp default to `nowNaiveEastern()` (`Intl.DateTimeFormat`
with `timeZone: 'America/New_York'`). The Vue side parses the
string by hand (`parseNaive` → local-component Date for formatting
only) and never calls `new Date(naive)`. Net effect: every viewer
sees the same Eastern wall-clock the entry was authored in,
regardless of their browser's TZ. **If you add another `datetime`
column whose semantics are "wall-clock the user typed" (rather
than "UTC moment something happened"), copy this pattern instead
of letting the driver's UTC default leak through.**

### Bug attachment pipeline
- Max 6 JPG/PNG files × 5MB each per report
- MIME validated by **sniffing the decoded buffer's first bytes**, not
  the client's claimed mime. See `sniffImageMime()` in
  [bugs.mjs](../api/rest/api/bugs.mjs).
- Stored path shape enforced by `STORED_PATH_RE` (`\d+/\d+_[0-9a-f]+.(jpg|png)`).
  The admin-only GET endpoint rejects anything else.
- Spam detection: in-memory 5-minute TTL cache keyed by IP + hash of
  title+description. Duplicates silently return `{ok:true, duplicate:true}`.
- Delete order: `rm` disk directory FIRST, then DELETE the DB row. If
  disk fails, we return 500 and leave the DB intact for retry.

## Testing

### Responsive harness uses `https://nostuh.com`, not localhost
After SSL setup, nginx's port-80 fallback returns 404 for any host
other than `nostuh.com`, and `/etc/hosts` already resolves
`nostuh.com → 127.0.0.1`. The [responsive harness](../scripts/test/responsive.mjs)
defaults to `https://nostuh.com` which hits the right vhost with a
valid cert without leaving the machine. Don't switch it back to
`http://localhost`.

### Puppeteer needs system libs on EL9
`dnf install -y nss atk at-spi2-atk cups-libs libdrm gtk3 libXcomposite
libXdamage libXfixes libXrandr alsa-lib pango cairo libxkbcommon
xdg-utils libgbm` — without these, Chromium fails to launch with a
`libnss3.so` error. Already installed on this droplet; re-install if
you recreate it.

### Running ad-hoc browser reproductions
`scripts/test/repro_*.mjs` files hold scripted repros for specific
bugs. Keep them around after fixing — they double as regression
tests. The harness at `responsive.mjs` is the gate; these are
investigation tools.
