# manual_onboard — bulk-load equipment from the in-game Trader's Library

A repeatable routine for **you** to harvest item data from ZombieMUD's
Trader's Library (the `lookup` command) and fold it into the global
equipment catalog (`eq_items`). It reuses the **exact same parser** the
live Equipment "Add" form and the legacy migration use
([api/classes/eq_parse.mjs](../api/classes/eq_parse.mjs)) — taught to also
read the library's `lookup` text format — so nothing can drift.

This is **catalog enrichment only**. It never touches ownership (`/equipment`
"I have this" tags) — the library is "every item in the game," not "what I
own." Design/maintenance detail lives in
[docs/manual-onboard.md](../docs/manual-onboard.md).

## The runbook (resume here any time)

The whole cycle, and exactly what to **say to me** at each step. Progress
lives in [STATUS.md](STATUS.md) — open it to see where we left off.

**1 — Build lookup commands.** Paste each `list <slot>` output into
`lists/<slot>.txt` (slot = filename; a `1h_`/`2h_` prefix ⇒ weapon). Then say
**“build my lookup commands.”** I run `node scripts/onboard_eq.mjs --commands
--all` and write `commands/<slot>.txt` — a paste-ready block of `lookup <name>`
lines. (`--all` = every item; drop it for only items not yet in the catalog.)

**2 — Collect the data (you, in the MUD).** Paste each `commands/<slot>.txt`
block into the MUD; copy the whole `lookup` output back into the matching
`armour/<slot>.txt` or `weapons/<hands>_<class>.txt`. Failed lookups
(“You can't find any records…”) are fine — ignored automatically.

**3 — Verify.** Say **“verify”** (or “run the checks”). I run the dry-run
`node scripts/onboard_eq.mjs` — it reports NEW / CHANGED (stat + bonus + cover
diffs) / CALLOUTS and writes nothing. We resolve each callout together (ignore
it → `ignore.txt`, or it's a real stat → a parse rule).

**4 — Import.** Say **“import”** (or “apply”). I run `node scripts/onboard_eq.mjs
--apply` — best-of merge into `eq_items` (+ bonuses + covers).

Re-runnable and idempotent: re-pasting or re-importing only adds/raises data
(best-of merge), never deletes — so it's always safe to redo a slot.

## The loop (per slot)

0. **(Optional, recommended) Get the exact `lookup` commands to type.**
   In game run `list <slot>` (e.g. `list amulet`) — a box of every item
   name in that slot — and paste it into `lists/<slot>.txt`. Then I run
   `node scripts/onboard_eq.mjs --commands`, which writes
   `commands/<slot>.txt`: a ready-to-paste block of `lookup <name>` lines
   for only the items **not already in the catalog** (so you never look up
   what we already have). Paste that block into the MUD in one go.

1. **In game**, `lookup` each item (by hand, or via the step-0 block). The
   `lookup` output is one boxed block per item:

   ```
   *-----------------------------------------------------------------------*
   |                An amulet made entirely out of emeralds                |
   *-----------------------------------------------------------------------*
   It decreases the users constitution poorly. (5/20)
   It increases the users wisdom slightly. (7/20)
   ...
   ```

   > `lookup <word>` is a **name search**, not a slot dump — `lookup amulet`
   > only returns items with "amulet" in the name. To get a whole slot you
   > `lookup` each item by name and let the blocks pile up in the scrollback.

2. **Copy** the whole scrollback and **paste** it into the matching drop
   file. The slot is taken from the **filename**, so put amulets in
   `armour/amulet.txt`, 2h swords in `weapons/2h_sword.txt`, etc.
   - It's fine if a file holds many blocks, blank lines, or your typed
     `lookup ...` command echoes — only the text inside the `*---*` boxes
     is read.
   - Re-pasting / overlapping captures is safe: items dedup by
     `(name, slot)` and merge **best-of** (the higher magnitude per stat
     wins), so a partial identify never overwrites a fuller one.

3. **Ask me to run it.** I run the dry-run first, show you what's new,
   what changed, and any **callouts** (lines no rule understood), then
   apply on your OK.

## Folder layout

```
manual_onboard/
  README.md            ← this file
  ignore.txt           ← lines to stop flagging as callouts (you grow this)
  lists/               ← (step 0) paste `list <slot>` output here, one file per slot
    amulet.txt ... 1h_sword.txt ...
  commands/            ← GENERATED `lookup <name>` blocks (gitignored); paste into the MUD
  armour/              ← (step 2) one file per wear slot — paste lookup output here
    amulet.txt arms.txt belt.txt cloak.txt feet.txt finger.txt
    hands.txt head.txt held.txt legs.txt multi.txt neck.txt
    shield.txt torso.txt
  weapons/             ← one file per <hands>_<class>; sets hands + weapon_class
    1h_sword.txt 1h_axe.txt 1h_dagger.txt 1h_bow.txt 1h_ancient.txt
    1h_polearm.txt 1h_bludgeon.txt 1h_staff.txt 1h_instrument.txt
    2h_sword.txt 2h_axe.txt 2h_dagger.txt 2h_bow.txt 2h_ancient.txt
    2h_polearm.txt 2h_staff.txt 2h_bludgeon.txt
```

Drop files are named the same in `lists/`, `armour/`, and `weapons/` — the
slot is taken from the filename (`1h_`/`2h_` prefix ⇒ weapon).

(Weapons and shields are stored in the `wield` slot; `weapon_class` and
`hands` come from the weapon filename. `shield.txt` → `is_shield`.)

## Multi-slot items (battlesuits, robes…)

A `multi` item covers several slots at once. The library is the **only**
place that tells us which — the last line of its `lookup` reads:

```
(Note: This item covers multiple slots: arms/legs/torso)
```

You don't have to sort these out. Wherever you paste a block with that
note (even in `armour/torso.txt`), it's stored as `wear_slot = 'multi'`
with its covered slots recorded in `eq_item_covers`. `multi.txt` is just a
convenient place to collect them. (Hooking covered-slots into the EQ
Builder is a follow-up — see [docs/manual-onboard.md](../docs/manual-onboard.md).)

## Running it (what I do)

```bash
# one-time: create the eq_item_covers table (idempotent)
mysql zeq < schema/equipment.sql

cd scripts
node onboard_eq.mjs --commands   # step 0: lists/*.txt → commands/*.txt (lookup lines for missing items)
node onboard_eq.mjs --commands --all   # ...same but every listed item, not just the missing ones
node onboard_eq.mjs              # DRY-RUN: report new / changed / callouts, writes nothing
node onboard_eq.mjs --apply      # apply inserts + best-of merges to eq_items
node onboard_eq.mjs --file ../manual_onboard/armour/amulet.txt   # one file only
```

The dry-run prints, **per drop file**: item count, **NEW** items, and
**CHANGED** items (with the per-stat / bonus / cover diff vs the catalog).
Then, **once after all files**, a single global **CALLOUTS** section: each
distinct body line no rule recognized, with its total occurrence count
across every file and one example item. For each callout you tell me either
"ignore it" (I add a pattern to `ignore.txt`) or "that's a stat" (I add a
parse rule to `eq_parse.mjs`). Then I `--apply`.
