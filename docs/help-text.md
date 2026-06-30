# Skill & spell help text

The info (ⓘ) button on the reinc planner's **Skills/Spells** tab shows a
description for the selected skill or spell. That text is
`game_skills.help_text` / `game_spells.help_text`. When a row has none,
the modal shows *"No description recorded … please report it via the 🐞
button"* (see the `infoSkill`/`infoSpell` modals in
[Reinc.vue](../www/src/components/Reinc.vue)).

There are **two sources** for `help_text`, in order:

1. **Zcreator `.chr` import** — the primary importer seeds it from
   [data/help_skill.chr](../data/help_skill.chr) /
   [data/help_spell.chr](../data/help_spell.chr) via `importHelp()` in
   [scripts/import_zcreator.mjs](../scripts/import_zcreator.mjs)
   (`-----`-delimited blocks). See [data-import.md](data-import.md).
   These files are incomplete — historically ~40% of skills and ~30% of
   spells had no entry (that gap is what bug #35 / "no acrobatics
   description" surfaced).

2. **Live in-game capture** — a one-off backfill that fills the gaps the
   `.chr` files miss, ingested by
   [scripts/seed_help_text.mjs](../scripts/seed_help_text.mjs) from raw
   client output stored in
   [data/help_captures/](../data/help_captures/). This page documents
   that process.

The remaining blanks after both passes are entries the **game itself has
no help for** — `help <x>` returns *"No such known …"*,
*"The information about this skill is classified."*, or *"Dark powers
cloud your mind."*. Those cannot be filled; the modal fallback covers
them. As of the 2026-06-29 run, **310 descriptions were backfilled**
(skills 228→92 still-blank, spells 247→73).

## Mass-update process (how to do it again)

### 1. Find what's missing

`/api/equipment`-style admin endpoints aren't needed — go straight to
the DB (creds in [../api/classes/config.json](../api/classes/config.json)).
Generate the in-game command list, one `help …` per blank row:

```sh
mysql -uzork -pstarcraft zeq -N -e "
  SELECT CONCAT('help skill ', name) FROM game_skills
  WHERE help_text IS NULL OR help_text='' ORDER BY name;" > skills_cmds.txt
mysql -uzork -pstarcraft zeq -N -e "
  SELECT CONCAT('help spell ', name) FROM game_spells
  WHERE help_text IS NULL OR help_text='' ORDER BY name;" > spells_cmds.txt
```

### 2. Capture in-game

Paste those command lists into the MUD client (zmud/tintin/…) and capture
**all** the output to a plain text file — one file for skills, one for
spells. Save them as
[data/help_captures/skills.txt](../data/help_captures/skills.txt) /
[spells.txt](../data/help_captures/spells.txt) (overwrite the existing
captures, or keep both and pass all files to the seeder).

**Capture quality:** if you queue every command ahead of the output, the
client echoes the queued `help …` commands back into the stream and they
splice into the output — mid-line, mid-word, even mid-header
(`Hel` + echoes + `p on song: …`). The seeder repairs this (see below),
but a cleaner capture (slight delay between commands, or local echo off)
needs less repair. CRLF line endings are fine — the seeder normalises them.

### 3. Seed

```sh
node scripts/seed_help_text.mjs data/help_captures/skills.txt data/help_captures/spells.txt --dry-run
node scripts/seed_help_text.mjs data/help_captures/skills.txt data/help_captures/spells.txt
```

- `--dry-run` parses and reports counts (filled / already-had / no DB row)
  without writing. Always dry-run first and check **`no DB row: 0`** — a
  non-zero count means a captured name didn't match the catalog (printed
  at the end) and needs a name fix.
- Default is **fill-missing-only** (won't clobber existing `help_text`),
  so re-running is safe/idempotent.
- `--overwrite` refreshes every matched row from the capture — use it when
  re-capturing to fix earlier parse artifacts.

No rebuild needed (DB only). The planner reads `help_text` live.

## How the seeder works (and why)

- **Matches by header, not position.** Each response block is keyed off
  its `Help on skill:` / `Help on spell:` / `Help on song:` header, so the
  capture order doesn't matter and failed `help` commands (which produce
  no header) are simply skipped.
- **Bard "songs"** report as `Help on song: <name>.` but live in
  `game_spells`, so song blocks are matched there.
- **Storage format mirrors the importer:** everything *after* the header
  line (the `Usage duration:` / `Casting time:` … metadata plus the prose
  body), header stripped, name lowercased.
- **Noise scrub:** drops the client prompt lines (`q: …`, `p: Not in
  battle …`), stray casting-output digit lines, and — the hard part —
  **typed-ahead command echoes**. Because an echo can splice mid-word, the
  scrubber removes the *exact* command strings (`help skill <name>` /
  `help spell <name>` built from the live catalog, longest first) so the
  surrounding text rejoins (`protection o` + echo + `f` → `protection
  of`). This is **CRLF-normalised first** — without that, the echo's line
  terminator is left behind and the rejoin fails.
- **Wrapped headers:** the two joke "skills" with sentence-long names wrap
  the header across two lines; the parser stitches the continuation back
  into the name. (Those two also exist as duplicate rows — one with the
  truncated wrapped name — a pre-existing import quirk, harmless.)

## Keeping the captures

[data/help_captures/](../data/help_captures/) is committed as source data
(like the `.chr` files) so the backfill is reproducible. If you re-capture,
overwrite those files and commit them alongside any `--overwrite` re-seed.
