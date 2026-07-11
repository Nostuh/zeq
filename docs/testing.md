# Responsive / usability testing

A headless-browser harness lives at [scripts/test/responsive.mjs](../scripts/test/responsive.mjs).
It drives Puppeteer (bundled Chromium) against the served build, loads
**every page** — public and login-gated — at a matrix of viewport sizes,
and fails the run if any breakpoint has a layout issue that would affect
real users.

The harness exists because "the site is responsive" was asserted several
times before anyone actually verified a 360px phone viewport. This is
the canonical way to verify a UI change works at every breakpoint —
prefer it over eyeballing.

## When to run — ON DEMAND ONLY

**Run this harness only when the user explicitly asks for it.** It is a
saved, on-demand mobile/tablet/desktop gate — not part of the normal
build or commit flow. A full run drives Chromium over every page × 8
viewports and is slow on this host (1 CPU, ~756MB RAM + swap; the harness
sets generous launch/navigation timeouts and `--disable-dev-shm-usage` to
cope). Do not kick it off unprompted. See CLAUDE.md ("only runs when
asked").

## Authenticated pages

Most routes (equipment, mobs, planner-admin, users, bugs) are
login-gated, so the harness authenticates. Rather than drive the login
form — or create a throwaway account, which would burn a `users.id` and
clutter the Users list — `ensureAuthSession()` **borrows an existing
active admin** and mints only a short-lived `sessions` row for it (random
hex PK, nothing auto-increments; `last_login` untouched), then injects the
`zeq_sid` cookie into an isolated browser context. Authed cases run there;
public cases (reinc, login) run anonymously. The session is deleted when
the run ends. This needs DB access via `api/classes/config.json`; if that
fails the authed cases are skipped and the public ones still run. Detail routes (`mob-detail`,
`guild-detail`) resolve a real id from the API before navigating. The
harness never submits forms or clicks destructive buttons — it only opens
overlays and clicks tabs, so it is safe to run against production.

## Running

```
cd scripts/test
node responsive.mjs                       # local: http://localhost
node responsive.mjs --base=https://nostuh.com
```

Exit code `0` = everything passed, non-zero = at least one failure.
Per-case screenshots land in `scripts/test/out/<label>.png` (post-test
state) and `out/<label>_initial.png` (page-load state before any
interactions). Commit neither; they regenerate each run.

## What it checks

For every `(route, viewport)` pair:

1. **Horizontal overflow** — `documentElement.scrollWidth` must not exceed
   `clientWidth`. Catches regressions from `100vw` constraints that
   include the vertical scrollbar and stretched fixed-width children.
2. **No page-level vertical scroll** when the route sets
   `expectNoPageScroll: true` (the reinc planner does). Internal
   scrollable regions are OK and expected; only the page-level scroll is
   forbidden. See the no-scroll rule in [CLAUDE.md](../CLAUDE.md) and
   [docs/reinc.md](reinc.md).
3. **On-load visibility** — `mustBeVisibleOnLoad` selectors must have
   their bounding rect inside the viewport at initial page render, with
   no user scrolling required. For the reinc page, this is the summary
   bar, the tab strip, the race picker, and the guild search box.
4. **Reachability** — `mustExist` selectors must be present, non-zero
   sized, not `display:none`/`visibility:hidden`/`opacity:0`, and either
   already in the viewport or inside a scrollable ancestor so the user
   can reach them. Off-screen-with-no-scroll-container is a hard fail.
5. **Horizontal clipping** — no element's `right` edge may exceed the
   viewport width.

## Viewport matrix

The harness exercises eight viewports covering the full responsive range:

| label        | width  | height | represents              |
|--------------|-------:|-------:|-------------------------|
| mobile       |  360px |  780px | narrow phone (iPhone SE)|
| mobile-wide  |  414px |  900px | larger phone            |
| tablet       |  800px | 1100px | portrait tablet         |
| short-laptop | 1024px |  654px | short-height laptop (bug #25) |
| small-laptop | 1032px |  703px | cramped laptop (bug #23)|
| laptop       | 1280px |  800px | standard laptop         |
| desktop      | 1600px |  900px | standard desktop        |
| desktop-wide | 1920px | 1080px | large monitor           |

Add new entries to `VIEWPORTS` in the harness if a specific device
surfaces a regression. Keep the list small — each row is a full browser
launch's worth of time.

## Adding a new route to the suite

Append an entry to `CASES` in `responsive.mjs`:

```js
{
    route: '/#/races', label: 'races', auth: true,
    waitFor: 'table.table-hover tbody tr',   // waited for after network-idle
    mustBeVisibleOnLoad: ['.app-content main h2'],
    mustExist: ['.app-content main h2', 'input.form-control', 'table.table'],
    modals: [BUG_MODAL],                     // sweep the global report modal
    // expectNoPageScroll is false (omitted) because the admin tables
    // are long and legitimately scroll the page.
},
```

Add `auth: true` for a login-gated route (runs in the injected-session
context). Use `.app-content main h2` for the page heading — a bare `h2`
also matches the visually-hidden SEO block. `waitFor` is a selector the
harness waits for after network-idle (a data-loaded marker). `detail:
'mob' | 'guild'` turns the case into a detail page whose id is resolved
from the API at runtime. A case should either assert no page scroll OR
scroll freely — don't mix semantics. The reinc planner is the only
"locked viewport" route; every admin page and the login page scroll
normally. Elements inside a horizontal-scroll wrapper (wide tables) are
allowed to extend past the viewport — only page-level horizontal overflow
fails a case.

## Modal sweep

The only true overlay in the SPA is the global **Report-Bug/Idea** modal
(App.vue, opened by the persistent `.fab-report` FAB) — every page's
"edit/add/import" affordance is an inline `v-if` reveal, not a modal, and
deletes use native `confirm()`. So the harness sweeps that one global
modal on **every authed page** (confirming it fits over each layout) plus
the reinc planner's own modals. `sweepTabs: true` cases (Costs,
GuildDetail) click through each tab by index and re-check overflow.

On the reinc planner, after the tab walk, the harness opens every planner
modal via real DOM clicks and checks each panel fits the viewport:

- **bug-report** — opens via the `.fab-report` FAB (always visible,
  including at <560px where the header Report button hides). Asserts
  the panel, submit button, and close button are all inside the
  viewport (validates the sticky-footer fix for mobile keyboards).
- **share-build** — opens via the `.sb-share-btn` in the summary bar.
- **guild-info** — switches to General tab, clicks the first guild's
  ⓘ button.
- **boon-info** — switches to Extras tab, clicks the first boon's ⓘ
  button.

Each modal is torn down (close button clicked) before the next opens.

## What the harness does NOT catch

- **Visual regressions** — pixel-diffing would catch colour/spacing
  changes but it's overkill for this project. Check the screenshots by
  eye when a PR touches CSS heavily.
- **Keyboard / focus management** — not exercised. Use manual keyboard
  testing when adding new form widgets.
- **CSS `prefers-reduced-motion` / dark-mode / RTL** — not tested.

## Dependencies

`scripts/test/package.json` owns its own `node_modules/` — Puppeteer
downloads a Chromium build (~170MB) into `~/.cache/puppeteer` on first
install. On a clean RHEL/CentOS host the following system libraries
must be present or Chromium fails to launch:

```
dnf install -y nss atk at-spi2-atk cups-libs libdrm gtk3 \
    libXcomposite libXdamage libXfixes libXrandr alsa-lib pango \
    cairo libxkbcommon xdg-utils libgbm
```

## Before shipping a UI change

1. `cd www/src && npx vite build`
2. `cd ../../scripts/test && node responsive.mjs`
3. Fix any failures. Look at the corresponding `_initial.png` screenshot
   to understand *why* a breakpoint failed.
4. Re-run until every case (each route × 8 viewports) is green.

This is a hard gate for any responsive-design work per
[CLAUDE.md](../CLAUDE.md). Wide data tables (equipment, users, races,
guilds) must scroll inside a `.table-responsive` wrapper (or, for the
shared `zSimpleTable`, an `overflow-x: auto` container) so the page body
never scrolls sideways; the header nav wraps rather than overflow. These
were the fixes the authed-page coverage first surfaced.

# Engine math audit

A separate gate at [scripts/test/audit_engine.mjs](../scripts/test/audit_engine.mjs)
asserts that `www/src/components/reinc/engine.js` (the planner's live
computation module) matches a frozen reference implementation at
[scripts/test/lib/zcreator_reference.mjs](../scripts/test/lib/zcreator_reference.mjs).
The reference holds the Zcreator desktop math as a known-good
implementation; method names and the order of operations mirror the
desktop client so a reader can compare the two side by side.

## What it covers

For every random build the audit asserts engine vs reference match
exactly on every visible field:

- HP, SP, HPR, SPR
- final stats (str / dex / con / int / wis / cha)
- size, skillMax, spellMax
- Race level exp, Guild level exp, QPs left
- Skill exp total, Spell exp total, Stat-training exp total
- Total exp, Gold required

A divergence on any of those fails the run, names the field, prints the
delta, and (for skill / spell totals) lists the specific entry that
disagreed so the cause is one grep away.

## Running

```
cd scripts/test
node audit_engine.mjs                  # 500 random builds, default seed
node audit_engine.mjs --n 5000         # broader sweep
node audit_engine.mjs --seed 42        # different deterministic seed
node audit_engine.mjs --verbose        # print every diff field on a fail
```

The PRNG is mulberry32 with the seed in the CLI flag, so any failure
reproduces by re-running with the same `--seed`. The audit also runs a
small set of **anchor cases** captured by hand from the Zcreator desktop
binary — these are absolute fixed points (e.g. "Devil + 7 maxed guilds
→ Skills total 3,312,752,900") that catch coordinated drift where both
the engine and the reference move together but away from the source of
truth. Add new anchors to `anchors[]` whenever you stand up a new
Zcreator build and copy its numbers across.

## When to run it

- Before shipping any change to `engine.js` or `Reinc.vue` math.
- Before shipping any change to the importer (`scripts/import_zcreator.mjs`)
  or the cost-table seed data — a corrupted `levelcosts.chr` parse will
  surface here.
- When triaging a "the planner says X but the game says Y" bug —
  drop the reporter's `app_state` into a fixed case and let the audit
  pinpoint which field diverged.

## Status

The engine matched the reference across `10,000 random builds across two
seeds + the Devil-7-guild anchor` after the bug-fix sweep that
introduced this harness. The audit caught two real bugs while it was
being built: the FP-order error in `buildSkillCostArray` (`n * (sc/100)`
vs `(n*sc)/100` — `135/100` is not exactly representable, so the
mod-5-round-up step bumped some buckets by a full 5) and the missing
`maxcost` argument on every `skillExp` callsite in `Reinc.vue` (the
SkillSpell.updateExp tail clause for learned > 100 was silently
dropped). Both are now fixed.

## Once nostuh becomes the source of truth

The Zcreator desktop client is no longer being maintained. Once enough
real users have validated that nostuh's planner matches their in-game
experience, the C# port loses its authority and the engine itself
becomes the canonical implementation. At that point the workflow flips:
the reference module stays as a frozen historical record (so any future
divergence between us and Zcreator can be measured), and any new
formula change is implemented in the engine with a unit test pinning
its output. The audit harness remains useful as a regression gate
either way.

