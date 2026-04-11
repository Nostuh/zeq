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
unchecked. Fix: use `@click.prevent` on both the label and the input
and handle the toggle in a regular method; `:checked` is now the only
source of truth. The reinc guild list uses this pattern — don't
revert it.

### Derived state vs. primary state for totalLevels
`totalLevels` in the reinc planner is a COMPUTED value derived from
`guildLevelsSum + freeLevels` where `extraFree` is the only primary
field. The earlier version had `totalLevels` as primary state and
derived `freeLevels` from it; that produced phantom free levels when
the user dropped a guild because `totalLevels` didn't follow. Match
the C# convention ([Character.cs:150](file:///tmp/Zcreator-Enhanced/decompiled_source/CharCreator/Character.cs)):
`totalLevels => 120 - guildlevels + free` with `free` as the setter.

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
external site back into Nostuh will land unauthenticated. This is
intentional (CSRF defense). Don't weaken it without a reason.

### Bug submissions carry captured context
Every POST to `/api/bugs` includes `app_state` (JSON), `dom_snapshot`
(truncated HTML), and `console_log` (NDJSON tail of the last ~100
entries plus unhandled errors). The client-side capture is installed
in [main.js](../www/src/main.js) BEFORE Vue boots so it catches early
errors. When triaging a bug, use the captured context instead of
guessing. See [bug-workflow.md](bug-workflow.md).

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
