# UI conventions

The SPA is a Vue 3 app built with Vite, styled with Bootstrap 5. Entry
is [www/src/main.js](../www/src/main.js); the root component is
[App.vue](../www/src/App.vue); routes live in
[routes.js](../www/src/routes.js). Page components are in
[www/src/components/](../www/src/components/).

## Goals

- **Data-dense, not visually elaborate.** Every screen is a table or
  a simple form. Spacing is Bootstrap's `table-sm`. Avoid fancy
  animations or custom theming.
- **Responsive is non-negotiable.** Every screen must work on desktop,
  tablet, and mobile. Use CSS grid with `@media (max-width: ...)`
  breakpoints that collapse multi-column layouts to a single column.
  Never use fixed pixel widths on page-level containers. Test each
  change at ~360px (mobile), ~800px (tablet), and ≥1280px (desktop).
  Desktop layouts should fill the available viewport width — avoid
  narrow `max-width` constraints on the main planner/admin pages.
- **Flag-aware rendering.** Every sidebar section and edit control is
  gated on a capability flag (see [auth.md](auth.md)). Edit controls are
  hidden (not just disabled) when the matching `_edit` capability is
  false; whole sections/links are hidden when the view capability is
  false. The server enforces the same rules regardless, so the UI check
  is purely ergonomic.
- **Fetch, not reload.** Every mutation is an `axios.post`/`.delete`
  followed by a local data refresh and a flash message via
  `$root.flashMsg(msg)` or `$root.flashError(e)`.
- **Confirm before destructive actions.** Always `confirm()` before
  DELETE; phrase the prompt with the resource name.

## Global state on the root

`App.vue` is the owner of auth state and flash state. Components read
and call via `$root`:

- `$root.user` — `{id, name, role, flags: [...]}` or `null`.
- `$root.isAuthed` / `$root.isAdmin`.
- Capability computeds (all admin-implied): `canEquipment` /
  `canEquipmentEdit`, `canLookups`, `canEqmobs` / `canEqmobsEdit`,
  `canPlannerAdmin`. Back-compat aliases still used by page components:
  `canEdit` (= `canPlannerAdmin`), `canEditEq` (= `canEqmobsEdit`),
  `hasEqAccess` (= `canEqmobs`). `hasAnySection` gates the "no access" hint.
- `$root.routeAllowed(name)` / `$root.landingRoute()` — the per-route flag
  gate and the post-login landing target.
- `$root.flashMsg(msg, type = 'success')` — green/red toast top-right.
- `$root.flashError(e)` — extracts `e.response.data.error` and shows it.
- `$root.loadMe()` — re-hydrates `user` from `/api/auth/me`.
- `$root.logout()` — `POST /api/auth/logout` and redirect.

`$root` is also the correct place to stash any small global that a
handful of components need; don't reach for Vuex or Pinia for this.

On every route change (and on mount), `App.vue`'s `enforceRouteAccess`
re-checks the session (`loadMe()` if `user` is null), kicks
unauthenticated users to `login`, and redirects any user lacking the
route's required flag back to `home` (the public planner). The
`routeAllowed(name)` switch is the single source of truth for which flag
each route needs — keep it in sync with the sidebar's `sideSections`. The sidebar
is organised into flag-gated sections: **Misc**, **Equipment**, **Lookups**,
**EQ Mobs**, **Planner Admin**, **Admin** (Users + Bug Reports).

## Sidebar

Signed-in, non-reinc pages use the `.app-content.app-shell` wrapper in
[App.vue](../www/src/App.vue): a CSS grid at `>=md` with the sidebar rail
(`#sidebarMenu`) and `<main>`. Signed-out pages keep the old offset
`col-md-9` column with no sidebar.

- **Contents are data, not markup.** `sideSections` (computed) lists every
  section and link with its label, Bootstrap icon and flag gate. To add a
  page: add one `L(routeName, label, icon, flag)` entry, and a matching
  case in `routeAllowed()`. Check the icon exists in the installed
  `bootstrap-icons` (1.11.x), or it renders blank.
- **Sticky rail, one viewport tall.** `top: var(--zeq-navh)` and
  `height: calc(100vh - var(--zeq-navh))` with `overflow-y: auto`. The panel
  background always reaches the bottom of the window, and if the links ever
  outgrow a very short window the rail scrolls on its own. The previous
  rule (fixed `calc(100vh - 65px)` in styles.scss, no overflow) let an
  admin's list spill below the painted panel.
- **Condensed** by default (12.5rem wide, 0.875rem links, tight padding),
  with the current page highlighted (`router-link-active` →
  `--bs-primary-bg-subtle`).
- **Collapse toggle.** The solid button at the top shrinks the rail to a
  5rem (80px) icon strip: labels go `display:none`, section titles become
  thin dividers, and each link gains a `title` tooltip + `aria-label`
  (the hidden label no longer names it). The state is per-browser in
  `localStorage['zeq_side_collapsed']`, the same pattern as the theme. It
  only applies at `>=md`: below that the header hamburger opens the stacked
  menu with full labels and the collapse button is hidden.
- All colours are Bootstrap CSS variables; the panel background is
  `.bg-light`, overridden for dark mode in `styles.scss`.

## Component layout

Each resource has one or two components:

- Flat-list resources (races, skills, spells, users, costs): a single
  component renders a table with inline-edit rows.
  - Hidden by default, revealed by an "Edit" button per row.
  - Inline row spans the table width with a nested form.
  - Save/Cancel buttons at the bottom of the inline form.
- Hierarchical resource (guilds): two components — `Guilds.vue`
  (flat list grouped by parent) and `GuildDetail.vue` (tabbed view of
  bonuses, skills, spells).
- `Spells.vue` is a thin wrapper that renders `Skills.vue` with
  `resource="spells"` — the underlying table logic is identical.

## Guild detail view

`GuildDetail.vue` is the only non-trivial page. It fetches
`/api/game/guilds/:id`, groups `bonuses`, `skills`, and `spells` by
`level` using `Map` reducers in computed properties, and renders them
in three tabs. Each level row collects its badges into a single cell
to keep the visual density high. Subguilds are shown as linked pills
above the tabs.

## Inline edit pattern

```js
data() { return { editId: null, draft: {} }; }
startEdit(row) { this.editId = row.id; this.draft = { ...row }; }
cancel()       { this.editId = null; this.draft = {}; }
async save()   {
    await axios.post(`/api/game/<resource>/${this.editId}`, this.draft);
    this.$root.flashMsg('Saved'); this.cancel(); await this.load();
}
```

Always clone the row into `draft` so the table isn't mutated until the
save completes; refresh from the server after save so computed fields
like `parent_name` stay correct.

## Build

```
cd www/src && npx vite build
```

Outputs into `www/src/dist`. Nginx serves that directory. During
development, `npx vite` from the same directory serves on port 8081
with `/api` proxied to `localhost:50000`.

## EQ Mob Knowledge Base pages

Components:

- `MobList.vue` — searchable table (desktop) / cards (mobile). Search
  is debounced 300ms. Click row → detail view.
- `MobDetail.vue` — all-in-one mob view, one column in plain page flow
  (no sticky panels, no inner vertical scroll), ordered by what a player
  needs for the kill:
  1. **Overview row** (`.mob-overview`, flex-wrap): Resists (nine
     `.mob-resist-tile`s, 9 across, 5+4 below 420px; the edit inputs live
     in the same tiles), Prots (badges), Guilds. Resists take the full row
     at tablet widths and prots/guilds wrap under it.
  2. **Loot table** (`.mob-loot-table`): every drop with its catalog stat
     line. Only stat columns that are non-zero for at least one of this
     mob's drops are rendered; zeros are blank, negatives red, headers sort
     (stats high→low first). Free-text rows show "(no stats)". It sits in
     `.table-responsive` (no sticky header, so `overflow-x` is safe) with
     the Item column `position: sticky; left: 0` so names stay visible
     while the stats scroll sideways on a phone.
  3. **Folds** (`details.mob-fold`): Directions, Kill Strategy, Notes,
     Maps, Images — collapsed by default, open state remembered per
     browser. `:open` + `@toggle` copying `e.target.open` back keeps the
     bound state equal to the DOM (see the checkbox gotcha).

  It used to be two columns with a 220px right sidebar for resists/loot;
  the sidebar had no room for stats, so it was replaced.
- `MobHistory.vue` — paginated changelog. Click entry to expand inline
  diff (old → new per field). `init` entries styled as system imports.
- `MobAsciiEditor.vue` — split-pane: textarea left, `<pre>` preview
  right. Auto-strips non-7-bit ASCII on paste. Line/col counter.

Route guard: `/mobs` and `/mobs/:id` redirect to home if
`$root.hasEqAccess` (= `canEqmobs`) is false. Sidebar "EQ Mobs" section
is gated on the same, between Lookups and Planner Admin.

Relevant `$root` computeds (see the Global-state section above):
- `canEqmobs` (alias `hasEqAccess`) — has `eqmobs` or `eqmobs_edit`, or admin
- `canEqmobsEdit` (alias `canEditEq`) — has `eqmobs_edit`, or admin

## Avoid

- The `www/src/old_components/` directory — orphaned from the legacy
  Karran Intelligence app. Don't import from it.
- Vuex / Pinia. `$root` is enough for a tool of this scope.
- Toast libraries. The hand-rolled `flashMsg` slot on `App.vue` is
  enough.
