# Chest Sorter + Import Equipment

Two features that share one parser for the in-game **"look in chest"** output.

- **Chest Sorter** — public tool at `/chest-sorter` (also in the header **Misc**
  menu and, for signed-in users, the sidebar). Paste chest contents; get a
  per-chest item count and an item→chest index. 100% client-side except an
  optional CSV stat lookup.
- **Import Equipment** — `/equipment-import`, gated on the `equipment` flag
  (view *or* edit). Paste your chests; every item that matches the catalog is
  tagged as **owned by you**; unmatched names are reported back.

Both extract items with the same code:
[www/src/lib/chestParser.js](../www/src/lib/chestParser.js).

## The parse problem

The game's chest output is deceptively messy. Every rule below exists because
real pastes broke the naïve version.

```
It contains 8 items:
'Jawellyn' the bow of deadly accuracy (2h), Jet black scythe (1h), A small
scroll, ... Two Maces of Misfortune < Cursed > (2h) and The drow slayer (1h).
```

- **Wraps across lines** and the item list has no fixed width.
- **Comma-separated, last item joined by " and "** — but item *names* also
  contain commas (`Willbreaker, the whip of submission`,
  `Myrmidon's warboots, designed for steadfast stance`, and named items like
  `The Broadsword, Sunbringer`).
- **Quantity stacks**: N identical items render as ONE pluralised entry —
  `Two Maces of Misfortune`, `Ten large quiver (100/100)s`,
  `Five silver flutes and Five Tinning kits`. The chest's *declared* count
  (`It contains 10 items:`) counts each physical item.
- **Inconsistent pluralisation**: the head noun is pluralised *wherever it sits*
  (`Silver ring with a heartshaped diamond` → `…diamonds`; `A ring made of…` →
  `ring mades of…`) and is sometimes **double-pluralised** (`Arm protectors` →
  `protectorses`, `leggings` → `leggingses`, `Bracers` → `Bracerses`).
- **Lists can lack a trailing period** and run straight into the next chest
  (single-stack chests like `Ten large quiver (100/100)s`).
- **Labels aren't unique** (`NOT KABUL-7MAN` on several chests) and some chests
  have no label / no "A chest…" preamble at all (pastes cut mid-stream).

## How the parser handles it

`parseChests(text)` → ordered `[{ label, lock, declared, items:[…], count }]`.

- **Chest boundary = the `It contains N items:` line**, not the preamble (which
  is optional). `label`/`lock` accumulate into a `pending` bucket and reset
  after each commit, so a label-less chest can't inherit the previous label.
- **List end**: a line ending in `.` OR any *structural* line (`A chest…`,
  `It contains…`, `It has a label…`, `It is open/closed/locked`, …). Checking
  structural **before** the period test is essential — `A chest that seems to be
  of a high value.` ends in a period and would otherwise be swallowed.
- **Chatter** (anything matching nothing — `look at chest 31`) is ignored.

`splitItems(listStr, declared)` uses the declared count as an **oracle** to
resolve ambiguous commas — this is the crux. Each `, ` is classified by the word
after it:

| kind | signal | example |
|------|--------|---------|
| `sep` | Capital / digit / quote | `, Red`, `, A pair`, `, 'Jawellyn` |
| `amb` | lowercase article | `, the`, `, a`, `, an` |
| `internal` | lowercase non-article | `, designed`, `, pulsing` |

The final `" and "` is always a `sep`. Then:

1. Always cut the `sep`s. If the summed quantities already equal `declared`,
   **stop** — this is what keeps `Willbreaker, the whip of submission` whole.
2. **Forward-promote** (shortfall): if we're *under* `declared`, promote `amb`
   then `internal` cuts, one at a time, until the count matches — recovers a
   lowercase-led item (`hand of life (2h)`, `the Cloak of the Grove`).
3. **Reverse-merge** (over-split): if we're *over* `declared`, an item is *named*
   with an embedded `, ProperName` (`The Broadsword, Sunbringer`,
   `witch goddess, Rangda`, `The shield, Defender`). Undo `sep` cuts whose
   trailing piece is a lone proper noun until the count matches again.

Quantities come from `stackQty(entry)` (leading number word `two`…`twenty`,
requiring whitespace so `Two-handed` is NOT a count). The left-table count and
`chest.count` are the **sum of stack quantities** (= declared when reconciled);
a `≠` badge flags any chest that still can't reconcile (a genuinely ambiguous
name — rare).

### Plural/single grouping (the item index)

A stack form and its single form must collapse to one row: `Six scraps of
parchment which reads 'X'` and `A scrap of parchment which reads 'X'` are the
same item. `groupKey(name)` normalises both: drop a leading article, then
**de-pluralise every word** (`depluralWord` peels `s`/`es`/`ies`, keeping `ss`;
handles the head-noun-anywhere and double-plural cases). The rest of the name is
identical between forms, so de-pluralising it too is harmless. The index shows
the nicest label (prefers the singular article form) and the summed quantity.

## Endpoints

- **`POST /api/chestlookup`** — **public**, read-only. Body `{ names: [...] }` →
  `{ "<name>": {stats}|null }`. Enriches the Chest Sorter's item-index CSV with
  `eq_items` stats. Deliberately public (product decision): it only returns
  stats for names you supply, no catalog browse, no ownership. Matching reuses
  `eq_parse.normalizeName` (+ leading count-word strip) so pasted names line up
  with the catalog's stored names. See [api/rest/api/chestlookup.mjs](../api/rest/api/chestlookup.mjs).
- **`POST /api/equipment/import`** — requires the `equipment` flag. Body
  `{ names: [...] }`. Loads the catalog, indexes it by a **loose key**
  (`normalizeName` → article-strip → de-pluralise every word) computed on *both*
  sides so a pasted plural stack meets the catalog's singular (`Two Bracerses of
  Wrath` ↔ `Bracers of Wrath`). Tags the caller as owner of every match; returns
  `{ added, addedItems, alreadyOwned, alreadyOwnedItems, notFound }` so the page
  can list exactly which items were newly tagged. Tagging what *you* have is a
  personal action, so it's view-gated, not edit-gated. In
  [api/rest/api/equipment.mjs](../api/rest/api/equipment.mjs).

## UI notes

- Both pages are dense, theme-aware, and responsive (two-column grid collapsing
  to one at ≤800px). The Chest Sorter's columns are sortable and each side has a
  CSV export.
- Import Equipment leads with a "How this works" block, then paste → **Check
  database & mark owned** → a green "Newly marked as owned" card + a not-found
  warning list.
- The Chest Sorter has a case in the [responsive harness](../scripts/test/responsive.mjs)
  (`--only=chest-sorter`) that loads the sample and opens the Misc dropdown,
  checking layout + the dropdown anchor across 8 viewports.

## Not in the Updates feed

Per [updates.md](updates.md) the `site_updates` feed is **reinc-planner only**.
The Chest Sorter is a Misc tool and Import Equipment is an equipment feature, so
neither gets a `site_updates` row.
