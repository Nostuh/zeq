# Responsive / usability testing

A headless-browser harness lives at [scripts/test/responsive.mjs](../scripts/test/responsive.mjs).
It drives Puppeteer (bundled Chromium) against the locally-served build,
loads each page at a matrix of viewport sizes, and fails the run if any
breakpoint has a layout issue that would affect real users.

The harness exists because "the site is responsive" was asserted several
times before anyone actually verified a 360px phone viewport. This is
the canonical way to verify a UI change works at every breakpoint —
prefer it over eyeballing.

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

The harness exercises six viewports covering the full responsive range:

| label        | width  | height | represents              |
|--------------|-------:|-------:|-------------------------|
| mobile       |  360px |  780px | narrow phone (iPhone SE)|
| mobile-wide  |  414px |  900px | larger phone            |
| tablet       |  800px | 1100px | portrait tablet         |
| laptop       | 1280px |  800px | cramped laptop          |
| desktop      | 1600px |  900px | standard desktop        |
| desktop-wide | 1920px | 1080px | large monitor           |

Add new entries to `VIEWPORTS` in the harness if a specific device
surfaces a regression. Keep the list small — each row is a full browser
launch's worth of time.

## Adding a new route to the suite

Append an entry to `CASES` in `responsive.mjs`:

```js
{
    route: '/#/races',
    label: 'races-admin',
    mustBeVisibleOnLoad: ['h2', 'table thead'],
    mustExist: ['table tbody tr', 'button.btn-outline-primary'],
    // expectNoPageScroll is false (omitted) because the admin tables
    // are long and legitimately scroll the page.
},
```

A case should either assert no page scroll OR scroll freely — don't mix
semantics. The reinc planner is the only "locked viewport" route today;
every admin page and the login page scroll normally.

## What the harness does NOT catch

- **Visual regressions** — pixel-diffing would catch colour/spacing
  changes but it's overkill for this project. Check the screenshots by
  eye when a PR touches CSS heavily.
- **Keyboard / focus management** — not exercised. Use manual keyboard
  testing when adding new form widgets.
- **Actual interactivity** — the harness does not click, type, or
  navigate after load. Add test cases with explicit click/type flows
  if a regression proves this is needed.
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
4. Re-run until all 12 cases (2 routes × 6 viewports) are green.

This is a hard gate for any responsive-design work per
[CLAUDE.md](../CLAUDE.md).
