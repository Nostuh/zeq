# "Resolve all bugs" workflow

When the user says **"resolve all bugs"** (or an equivalent phrasing),
follow this procedure. The goal is to triage every open bug report and
propose a course of action — **not** to auto-apply fixes. The user
decides which ones to act on.

## Rules that apply to every report

1. **Every report is a hypothesis**, not a confirmed defect. Treat each
   one as something that must be **confirmed or denied** against the
   actual code and the live behaviour before proposing anything. A
   "bug" may turn out to be expected behaviour, a misread screen, a
   stale browser cache, or a duplicate of a fixed report.
2. **Always consult [CLAUDE.md](../CLAUDE.md) first.** It points at
   the canonical docs and rules for this project. Re-read it at the
   start of every triage session — it changes as the project grows.
3. **Always consult the source of truth** for whatever subsystem the
   bug touches:
   - Reinc / planner math → the `.chr` data files in `data/` (e.g.
     `wishcost.chr`, `levelcosts.chr`, `statcost.chr`), [reinc.md](reinc.md),
     and the formulas already codified in
     [www/src/components/reinc/engine.js](../www/src/components/reinc/engine.js).
   - Importer / data shapes → the `.chr` files in `data/` and
     [data-import.md](data-import.md).
   - Schema / constraints → [schema.md](schema.md) and `schema/*.sql`.
   - Auth / roles → [auth.md](auth.md) and `api/rest/api/auth.mjs`.
   - UI layout / responsive behaviour → [testing.md](testing.md) and
     [ui.md](ui.md); reproduce with `scripts/test/responsive.mjs` at
     the reported viewport.
4. **Never guess.** If the `.chr` data, the DB, or the responsive
   harness doesn't confirm the bug, say so. Don't propose a fix based
   on vibes.

## 1. Query the bug database

The `/api/bugs/` endpoints are auth-gated (admin session cookie), so
curling them as the agent returns `{"ok":false,"error":"not authenticated"}`.
Go straight to the DB. Credentials live in
[../api/classes/config.json](../api/classes/config.json).

List unresolved reports, severity-ordered:

```sh
mysql -uzork -pstarcraft zeq -e "
  SELECT id, title, severity, page_url, screen_size, created, status
  FROM bug_reports
  WHERE status IN ('open','in_progress')
  ORDER BY FIELD(severity,'critical','high','normal','low'), created DESC;"
```

Pull descriptions for triage — descriptions are long, use `\G`:

```sh
mysql -uzork -pstarcraft zeq -e "
  SELECT id, title, description FROM bug_reports
  WHERE status IN ('open','in_progress') ORDER BY id DESC\G"
```

The captured context columns (`app_state`, `dom_snapshot`, `console_log`)
are big — slice them or they'll flood the terminal:

- `app_state` is JSON; pull fields with `JSON_EXTRACT(app_state, '$.route')`.
- `dom_snapshot` is the `<main>` HTML. Walk it with
  `SUBSTRING(dom_snapshot, 1, 2000)` and shift the offset
  (`SUBSTRING(dom_snapshot, 8000, 6000)`) to read further in.
- `console_log` is an NDJSON tail. Check `LENGTH(console_log)` first —
  it's often `0` for reports filed without any console activity.

Schema lives in [schema.md](schema.md#bug_reports) and the API shape in
[api.md](api.md#bug-reports).

## 2. Investigate each report (confirm or deny)

For every row:

1. Read `description`, `page_url`, `user_agent`, `screen_size`.
2. Read the captured **context** — the reporter's browser sends us an
   `app_state` JSON blob (current route, user, page-specific data like
   reinc guild picks / wishes / totals), a truncated `dom_snapshot` of
   the `<main>` region, and a `console_log` NDJSON tail of the last
   ~100 console entries (including `window.onerror` and
   `unhandledrejection`). These are authoritative — use them.
3. Re-read [CLAUDE.md](../CLAUDE.md) for any rule that might apply to
   the affected subsystem.
4. Cross-reference the source of truth for the subsystem (see the
   "always consult the source of truth" rule above).
5. Try to reproduce the reported behaviour:
   - UI bug → responsive harness at the reported viewport, or a manual
     browser check.
   - Reinc math → use `scripts/test/` sanity-style scripts or mirror
     the selections from `app_state.page` and compute by hand from the
     C# formulas.
   - Data / import → grep the `.chr` files and check row counts.
6. Decide: **confirmed**, **denied**, **cannot reproduce**, or
   **duplicate**. Justify the decision with concrete evidence.
7. If confirmed, determine the **root cause**, not just the symptom.
   "Exp shows as negative" → int32 overflow in the formatter; not "add
   a negative check". Trace back to why the bad state existed.

## 3. Report back to the user

Produce a punch list, one entry per bug, in this shape:

```
#42  [high] [CONFIRMED]  Exp value shows as negative on /reinc
  Reported 2026-04-11 by anon on Chrome 131 at 1920x1080.
  Captured state: Aeuri + Barbarian 45 + Berserker 15 + Fighter 45…
  Reproduced: yes, responsive harness at 1920x1080 → totalExp shows -2.1B.
  Root cause: nfmt() used (n | 0) which truncates to int32; values
    above ~2.1B wrap to negative (Reinc.vue:1340).
  Proposed fix: replace with Math.floor(Number(n)).
  Risk: trivial. Verify: responsive tests + manual check on reinc page.

#43  [normal] [DENIED]  Subguild level count wrong for Healer subguilds
  Reported 2026-04-11 by anon.
  Reproduced: no. Healer max_level=45 and Grand Medics max_level=8 as
    defined in healer.chr Subguilds: section. Sum of 45+8 matches the
    desktop client.
  Proposed: wontfix (expected behaviour). Ask reporter for clarification.
```

Keep each entry under ~10 lines. Group by severity (critical → low)
and always include the confirm/deny decision.

## 4. Wait for approval

**Do not apply any fix without the user explicitly saying so.** The
user will tell you which bugs to resolve. For each approved fix:

1. Make the change.
2. Run relevant tests (responsive harness for UI, sanity script for
   reinc math, manual curl for API).
3. Update the bug report via `POST /api/bugs/:id/status` with
   `status: "resolved"`.
4. Include the report id in the commit message.

## 5. Decline cases

Some bugs aren't fixable. Valid reasons to propose `wontfix`:

- Reporter is describing expected behaviour.
- Bug is in third-party code we don't own.
- Fix would require a rewrite disproportionate to the impact.
- Duplicate of another open or already-resolved report.

Surface these in the punch list with `proposed: wontfix` and the
reason. Still wait for the user to confirm before updating the status.
