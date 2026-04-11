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
| `created` | When the change shipped. Used for the date-grouped headings.   |

## Authoring

- Sign in as admin, open `/updates`, click **+ New update**.
- Or `POST /api/updates` with `{kind, title, body, bug_id, created}`.
- Or append to [scripts/seed_updates.mjs](../scripts/seed_updates.mjs)
  and run `node scripts/seed_updates.mjs` — it's idempotent on
  `(created, title)`.

## Workflow rule

When you resolve a bug report or ship a user-visible change, add an
entry in the same session. If the fix came from a `bug_reports` row,
set `bug_id` so the report cites it. The feed is the only place a user
can see that their report turned into a fix — leaving entries out
silently breaks that feedback loop.
