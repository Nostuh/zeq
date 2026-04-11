# Updates feed

Public changelog at `/updates`. Stored in the `site_updates` table; the
page and the `/api/updates` endpoint render it dynamically so there is
nothing to redeploy when adding an entry.

## What to log

**User-visible changes only.** An entry earns a row if a planner visitor
would actually notice the difference the next time they open the page:

- Reinc engine math fixes (wrong totals, wrong unlocks, wrong costs).
- UI/UX changes (new tabs, new readouts, layout tweaks, label rewording).
- New features (export tab, unlock preview modal, etc.).
- Bug fixes to admin pages that admins use day-to-day.

**Do NOT log:**

- Refactors, file splits, code reorganisation.
- Test-harness work, CI, lint fixes, dependency bumps.
- Docs-only edits.
- Internal API shape changes that don't move anything on screen.

If you can't describe the change in one sentence a non-developer would
understand, it probably doesn't belong here.

## Fields

| Column    | Notes                                                           |
| --------- | --------------------------------------------------------------- |
| `kind`    | `fix`, `feature`, `tweak`, or `content`. Drives the badge color. |
| `title`   | One-line summary. Write it for the reader, not the commit log. |
| `body`    | Optional paragraph; plain text. Describe what users will see.  |
| `bug_id`  | Set when the change came from a report in `bug_reports`. The UI shows "(from bug #N)" to credit the reporter. |
| `created` | When the change shipped, as an **Eastern wall-clock** datetime. Stored as a naive `datetime` column and shipped to the client as a naive `YYYY-MM-DDTHH:MM:SS` string with no `Z`. See the timezone note below. |

## Authoring

- Sign in as admin, open `/updates`, click **+ New update**.
- Or `POST /api/updates` with `{kind, title, body, bug_id, created}`.
- Or append to [scripts/seed_updates.mjs](../scripts/seed_updates.mjs)
  and run `node scripts/seed_updates.mjs` — it's idempotent on
  `(created, title)`.

## Timezones

`created` is anchored to **America/New_York** wall-clock at every
layer (DB, API, client) — never UTC. The droplet's MySQL is in UTC,
so a naive `INSERT ... NOW()` would store a UTC moment that drifts
4–5 hours away from the time the work actually shipped (and
re-renders as "yesterday" for any viewer west of UTC). To stay
consistent:

- The API GET wraps the column in
  `DATE_FORMAT(u.created, '%Y-%m-%dT%H:%i:%s')` so the JSON value
  is a naive ISO-shaped string with no trailing `Z`.
- POST/UPDATE accept the same naive shape; `naiveDatetime()` in
  [updates.mjs](../api/rest/api/updates.mjs) is the canonical
  parser. Brand-new entries authored without an explicit value
  default to `nowNaiveEastern()` (`Intl.DateTimeFormat` with
  `timeZone: 'America/New_York'`).
- The Vue page parses the value by hand and **never** calls
  `new Date(naive)`, which would re-anchor the value to the
  viewer's local TZ and shift the displayed time.
- The seed file [scripts/seed_updates.mjs](../scripts/seed_updates.mjs)
  uses the same convention. Re-running the seed is idempotent on
  `(created, title)`, so don't change `created` for an existing
  row in the seed without updating the live row's `created` to
  match — otherwise the next run will insert a duplicate.

If you ever need to insert a row directly with raw SQL, generate
the value with `TZ=America/New_York date '+%Y-%m-%d %H:%M:%S'`
rather than relying on MySQL's `NOW()` (which gives UTC on the
production droplet). The original "subguild fix" / "race trim"
session-resolved rows were inserted via `NOW()` and had to be
shifted back by 4 hours after the fact — don't repeat that.

The full background lives in
[gotchas.md](gotchas.md#site_updatescreated-is-a-naive-eastern-wall-clock-string-not-utc).

## Workflow rule

When you resolve a bug report or ship a user-visible change, add an
entry in the same session. If the fix came from a `bug_reports` row,
set `bug_id` so the report cites it. The feed is the only place a user
can see that their report turned into a fix — leaving entries out
silently breaks that feedback loop.
