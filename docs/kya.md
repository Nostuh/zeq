# KYA Lookup

Read-only browser over `kya_info` at `/kya`. Lets logged-in users
search by mob name and see aggregated resistance buckets plus every
raw entry the importer has captured for that mob.

The page is private/internal — it is **not** part of the reinc
planner and so does **not** get a `site_updates` row when it
changes. See the rule in [CLAUDE.md](../CLAUDE.md).

## Auth

`requireAuth` (any active user). Same level as the legacy My
Equipment page. The route guard in [App.vue](../www/src/App.vue)
sends unauthenticated visitors to `/login`.

## Files

- [api/rest/api/kya.mjs](../api/rest/api/kya.mjs) — `GET /api/kya/mobs`,
  `GET /api/kya/by-mob`. Both gated with `requireAuth`.
- [www/src/components/Kya.vue](../www/src/components/Kya.vue) — search
  page + detail view + per-pattern parsers + bucket heatmap.
- Ingest stays where it has always been: `POST /api/eq/kya` in
  [api/rest/api/eq.mjs](../api/rest/api/eq.mjs). The in-game trigger
  posts there with a hardcoded `pw=zork`. Move it to `/api/kya/ingest`
  only when the in-game trigger is updated; until then the alias
  is load-bearing.

## The three capture formats

`kya_info` has 2,715 rows in three shapes (plus one corrupt row at
id 405). Name extraction happens in SQL via a CASE expression in
[kya.mjs](../api/rest/api/kya.mjs); the bucket / consider parsing
happens in JS in [Kya.vue](../www/src/components/Kya.vue).

### Pattern A — "target only" (5 rows, ids 1–5, oldest)

Raw single block. No caster line; the first word IS the mob keyword.

```
shy at 99
Least: magical
Most: fire
1 of 7 -  MAG ASPHYX ACID COLD POIS PSI ELEC
2 of 7 -  PHYS
3 of 7 -  FIRE
```

`mob_name = LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(info, '\n', 1), ' at ', 1))`

### Pattern B — "kya / possessive" (1,853 rows)

The bulk of the table. First line is the caster's display name in
possessive form; second line is the kya target keyword + remaining
hp%; the rest is `Least:` / `Most:` and bucket lines `<n> of 7 -  ELEM ...`.

```
Cyndre's
cyndre at 99
Least: psionic
Most: physical
3 of 7 -  ACID PSI
4 of 7 -  ASPHYX FIRE MAG ELEC COLD POIS
5 of 7 -  PHYS
```

`mob_name = TRIM(TRAILING ''s' FROM SUBSTRING_INDEX(info, '\n', 1))`
(yields `Cyndre`).

Caster ≠ target sometimes — id 17 is `Jaga-syn's\nkalak at` (one
mob casts kya on another). The display-name extraction puts that
row under "Jaga-syn", not "Kalak". Tiny share of rows; flagged
here so future-you remembers.

### Pattern C — "consider" (856 rows, starts at id 909)

Pipe-joined single line. Output of the in-game `consider` command,
captured alongside Pattern B starting around id 909.

```
Watcher's gender is: female|race:        ghost (undead)|Watcher is susceptible to psionic.|Watcher is susceptible to magical.|...
```

`mob_name = SUBSTRING_INDEX(info, ''s gender is:', 1)` (yields `Watcher`).

Susceptibility descriptors recognised by the parser map 1:1 to the
numeric kya bucket. The mapping is the canonical one from the
in-game trigger that captures `consider` output (`kya.1..kya.8` →
bucket `0..7`, descending vulnerability):

| descriptor              | bucket |
|-------------------------|:-:|
| completely vulnerable   | 0 |
| very vulnerable         | 1 |
| vulnerable              | 2 |
| susceptible             | 3 |
| somewhat susceptible    | 4 |
| barely susceptible      | 5 |
| immune                  | 6 |
| invulnerable            | 7 |

Verified against B+C pairs in the data: id 2715 (B) shows ACID at
bucket 2, PHYS at bucket 5; id 2714 (C) for the same Watcher says
"vulnerable to acid" and "barely susceptible to physical". Every
element matches.

**Bucket scale orientation: 0 = most vulnerable, 7 = most resistant.**
The `Most:` line in pattern B reports the most-resistant element
(highest bucket), `Least:` reports the least-resistant (lowest bucket).
The heatmap in [Kya.vue](../www/src/components/Kya.vue) colors low
buckets red and high buckets green to match.

### X — corrupt (id 405)

`.'s\nguard 5 at 99\n...`. Aborted/garbled. The CASE returns
`mob_name = NULL` and the listing query filters NULLs out.

## Search

`%foo%` substring, case-insensitive, on the extracted `mob_name`.
Empty `q` returns all distinct mobs (capped at 500 in the SQL
`LIMIT`). Search hits both the display-name (B/C) and the keyword
(A) — they live in the same column.

## Deep-linking + cross-links (July 2026)

`/kya?name=<mob_name>` auto-selects that mob (Kya.vue `applyRouteName`:
watch on `$route.query.name` because the component is reused; selection
also `router.replace`s the query so it's shareable). The Mob KB detail
page and the equipment ItemDetailModal link here when captures exist —
correlation is name-string only (`kya_info` has no FKs): KB names are
tried verbatim and with a trailing ` NN%` suffix stripped, plus
`short_name`. The extraction SQL (`EXTRACT_SQL`) moved to
[api/classes/kya_extract.mjs](../api/classes/kya_extract.mjs) (shared
with `kyaCountsByNames()` used by the mob/item detail summaries);
`/api/kya/*` behavior is unchanged and the ingest alias `POST /api/eq/kya`
is untouched.

## Aggregation

Pattern B and pattern C are two displays of the *same* in-game state
captured in the same session — for paired rows we verified across
many mobs that every element agrees. So averaging both formats
side-by-side double-counts the same encounter. Instead, the page
groups entries into **encounters** and reports one aggregate.

### Pairing rule

Sort all entries for the selected mob by id ascending. For each row,
if the next row is the **opposite pattern** (B/C) AND within ±2 ids,
treat the two as one encounter. Otherwise it's a solo encounter.

Real-data check (post-id-909 capture window):

- **856 paired** (B + C from the same in-game session)
- **95 solo B** (kya cast without a follow-up consider, or vice versa)
- **0 solo C** (every consider in the data has a paired kya)

### Primacy

**Consider is the prime source. Kya is the fallback + cross-check.**
For each element of each encounter:

1. If the encounter has a consider value → use it (mapped via
   `CONSIDER_TO_BUCKET`).
2. Otherwise, if the encounter has a kya bucket → use that.
3. If both exist *and* disagree → still use consider, but increment
   a per-element `mismatch` counter so the UI can surface "kya ≠
   consider on N encounters" as a quiet flag.

Cross-data agreement: 97.47% of paired comparisons agree exactly;
2.53% disagree (range 1.45%–3.41% per element). Disagreements
likely reflect the in-game state changing between the two casts
(prots wearing off, status effects), not a parsing bug. Verified
again whenever the parser changes.

### UI

- **Aggregate panel** — single table, one row per element, columns:
  `Element | Avg | Latest descriptor | N | ⚠ kya ≠ consider`. Heat
  map: 0 (vulnerable) red → 7 (invulnerable) green.
- **Encounter cards** — one card per encounter:
  - Paired card: a `consider (primary)` row above a `kya
    (cross-check)` row, both showing bucket numbers (descriptor as
    hover tooltip on the consider cells). Cells where kya disagrees
    with consider get an amber dashed outline.
  - Solo card: just the format that exists.
  - All raw `info` is hidden behind a `<details>` for verification.

## Gotcha — line endings in pattern A/B

Captured rows use **`\n\r`** as the row separator (LF then CR, not
the usual CRLF or LF). A naive `info.split(/\r?\n/)` leaves a stray
`\r` at the start of every line after the first, and `^`-anchored
parsers like `^Least:` or `^N of M -` silently fail to match. Use
`info.split(/[\r\n]+/).map(l => l.trim())` instead. This bit us
once already (averages rendered as `—` for every element) — fixed
in the parser, noted here so it doesn't bite again if anyone
rewrites it.

## Pairing (TODO)

When ingest started capturing both formats per encounter (id 909
onward), pattern B and pattern C rows for the same mob arrive as
adjacent ids in the same in-game session. The page currently
lists them in id order without trying to pair them. A future
enhancement could collapse adjacent same-mob B+C pairs into a
single "encounter" card. The capture order isn't guaranteed
forever, so the heuristic should fall back to flat-list when
adjacency breaks.

## Future cleanup

- Move `POST /api/eq/kya` ingest → `POST /api/kya/ingest` once the
  in-game trigger is updated. Keep the old path as a deprecated
  alias for one release before deleting.
- Pair B+C entries by encounter (above).
- Optionally back-fill the X row (id 405) by hand or drop it.
