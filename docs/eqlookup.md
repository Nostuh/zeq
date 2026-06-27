# External equipment lookup (`/api/eqlookup`)

A read-only, plain-text equipment lookup meant to be called from a player's
**in-game MUD client (zmud)**, not the website. The client sends a search
term plus a shared password; the server replies with terminal-ready lines.

Source: [api/rest/api/eqlookup.mjs](../api/rest/api/eqlookup.mjs). Data comes
from `eq_items` / `eq_item_bonuses` — the same structured catalog the
Equipment pages use (see [equipment-redesign.md](equipment-redesign.md)).

## Why it breaks two house rules on purpose

- **Not JSON.** Every other endpoint returns `{ok,data}` ([api.md](api.md)).
  This one returns `text/plain`, because its consumer is a MUD window that
  prints the body verbatim — no Vue, no parsing.
- **Not session-authed.** Every `/api/equipment` route is behind
  `requireAuth`. This one can't carry a session cookie from zmud, so it
  lives in its **own router file** (auth is per-router) and uses a shared
  `secretpw` instead. That separation is deliberate: never add an
  unauthenticated route to the auth-gated equipment router.

## Request

`POST /api/eqlookup` (GET also works for clients that can't POST). Params
are read from the form body **or** the query string, interchangeably:

| param      | required | meaning                                  |
|------------|----------|------------------------------------------|
| `secretpw` | yes      | shared secret; must equal `zorkrocks`    |
| `q`        | yes      | search term (aliases: `name`, `lookup`)  |

The match is **case-insensitive partial** on the item name (`name LIKE
%q%`; the column collation is `utf8mb4_unicode_ci`).

### Filter flags (inside `q`)

`q` is parsed for flags, so the zmud alias can send the whole typed line
unchanged (e.g. `eqlook -r phys -p zorky -s hands`). Any token that is not a
flag or a flag's value is the free-text name search, so flags combine with a
name and with each other (all AND-ed):

| flag | value | filter |
|------|-------|--------|
| `-r` / `-resist` | resist element | item has a **positive** resistance in that element; results are ordered by it, highest first |
| `-p` / `-player` | zeq username | item is owned by that user (`eq_ownership`; case-insensitive) |
| `-s` / `-slot`   | wear slot     | `wear_slot` equals it exactly |

- Resist elements: `phys psi elec mag poi fire cold acid asph shadow` — a
  bad value returns one line: `Unknown resist '<x>'. Valid: phys / psi / ...`.
- Slots: `head neck cloak amulet torso arms hands belt legs feet held finger
  wield multi` — a bad value returns `Unknown slot '<x>'. Valid: head / ...`.
- Resist→column is a **whitelist map** (`RESIST_COLS`); the column name is
  never taken from raw input, and every user value goes through an
  `@placeholder`, so flags are injection-safe.
- An empty `q` (or only unknown flags) returns the one-line `Usage:` hint.

**Bad/missing `secretpw` → bare `404`**, identical to a route that doesn't
exist. No "unauthorized" response, by design (`simple protect`). Rotate the
password by editing `SECRET` in the source.

## Response (depends on match count `n`)

The thresholds answer "how much detail is useful at this many hits":

Output is **plain ASCII on single lines** — no `;` (zMUD command separator)
and no fancy punctuation — because the zmud client re-sends each line as a
`party say`. List items are joined with ` / `, and `<desc>` echoes the search
(the name in single quotes and/or the flags, e.g. `-r phys -s hands`).

- **`n == 0`** — `No equipment matches <desc>.`
- **`1 ≤ n ≤ 6`** — one full line per item (see format below). Few enough
  to read every stat at a glance.
- **`7 ≤ n ≤ 20`** — a single line listing the matched **names** only, so
  the caller can re-look-up something narrower or an exact name:
  `12 matches: A blue steel long sword / Blue steel gauntlets / ...`
- **`n ≥ 21`** — count only: `47 matches for <desc> - too many to list,
  narrow your search.`

### Per-item line format

```
<Name> [<slot>]: <stat> <stat> ...  |  <bonus>, <bonus>
```

- `slot` = `wear_slot` plus `weapon_class`/`2h`/`shield` when applicable.
- Stats use the Equipment-page labels/order (Ac, Str…Cha, Hpr Spr Hp Sp,
  then resistances Phys…Shdw), each signed (`Str+16`, `Ac-1`). `WpnCls`
  and `Dmg <n>% <type>` lead when present.
- **Zero / null values are never printed.** A bonus with an unrecorded
  magnitude prints its name with no number.
- Skill/spell bonuses (`eq_item_bonuses`) follow a `|`, e.g.
  `nerve mastery+5, quick chant+5`.

Example (`q=blue steel`):

```
A blue steel long sword [wield sword]: WpnCls 11  |  ...
Blue steel gauntlets [hands]: Int+16 Wis+4 Spr+9 Hpr+9 Elec+3 Mag+9  |  nerve mastery+5, quick chant+5
```

## Smoke test

```sh
curl -s -X POST http://localhost:<api_port>/api/eqlookup \
  -d 'secretpw=zorkrocks' -d 'q=blue steel'
curl -s -X POST http://localhost:<api_port>/api/eqlookup \
  -d 'secretpw=wrong' -d 'q=blue steel' -o /dev/null -w '%{http_code}\n'   # → 404
```
