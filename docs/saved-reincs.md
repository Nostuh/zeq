# Saved reincs (Builds page)

Public share-a-reinc feature at `/builds`. Users save the planner
state with a title, author, and optional description; visitors browse
the list, vote, and jump into `/#/reinc?build=<id>` to rehydrate the
exact build. There is no login, no edit path, and (deliberately) only
a lightweight anti-abuse layer on votes.

## Files

- [schema/zeq.sql](../schema/zeq.sql) — `game_saved_reincs` and
  `game_saved_reinc_votes` tables.
- [api/rest/api/builds.mjs](../api/rest/api/builds.mjs) — JSON API.
- [www/src/components/Builds.vue](../www/src/components/Builds.vue) — list page.
- [www/src/components/reinc/SaveBuildModal.vue](../www/src/components/reinc/SaveBuildModal.vue)
  — share modal in the planner.
- [www/src/components/Reinc.vue](../www/src/components/Reinc.vue) —
  `buildSnapshot()`, `applyBuildState()`, `loadBuildFromQuery()`.
- [scripts/seed_saved_reincs.mjs](../scripts/seed_saved_reincs.mjs) —
  three prebuilt "funny" reincs marked `is_featured = 1`.

## Data shape

`game_saved_reincs.state` is a JSON blob (MEDIUMTEXT) versioned with
`v: 1`. Current shape:

```json
{
    "v": 1,
    "race_id": 12,
    "guild_picks": [ { "guild_id": 7, "level": 45 }, ... ],
    "stat_train":  { "str": 0, "dex": 0, "con": 0, "int": 0, "wis": 0, "cha": 0 },
    "wishes":      [ 3, 5, 19 ],
    "boons":       [ ],
    "skill_learned": { "42": 100, "108": 50 },
    "spell_learned": { "17": 80 },
    "extra_free":  10,
    "quest":       500,
    "tp":          1000
}
```

The surrounding row caches display metadata (`race_name`,
`guild_summary`, `total_levels`, `total_exp`, `gold`, `hp`, `sp`) so
the `/builds` list can render without running the engine. **Metadata
is a snapshot, not a live recomputation** — see the drift section
below.

## ⚠️ Data drift rules (the big one)

Saved builds reference `game_*` IDs. When the importer, a seed, or an
admin edit changes those underlying tables, old builds can rot:

| Change in game data           | Effect on a saved build              |
| ----------------------------- | ------------------------------------ |
| Race deleted / `enabled = 0`  | `applyBuildState` silently drops the race; planner lands on the default race. |
| Guild deleted or renamed      | The pick is dropped; guild's skills/spells go with it. |
| Guild `max_level` lowered     | Pick level is clamped to the new max. |
| Skill / spell deleted         | Learned percent is dropped for that entity. |
| Wish / boon renamed or deleted| Selection is dropped. |
| Cost table values changed     | No effect on state, BUT cached `total_exp` / `gold` are now stale. |
| New constraint added (e.g. 15 sub-levels per primary)| Restore loop clamps or drops the offending picks; user gets a flash. The build can never re-import as an *invalid* state — see the `subBudgetByParent` walk in `applyBuildState`. |

**Rules when making future changes to game data:**

1. **Never hard-delete a referenced game row** unless you accept that
   older builds will lose that piece of their reinc. If you need to
   rename a guild, update it in place; the `id` stays valid and the
   display name on old builds auto-refreshes next time the planner
   re-renders them.
2. **Treat cached metadata as stale** on any engine or cost-table
   change. `total_exp`, `gold`, `hp`, and `sp` columns are a
   display-time shortcut for the `/builds` list — they do not round-
   trip through the planner. After a math fix, the user's first
   "Open in planner" view will show the new correct numbers; the list
   row will keep showing the old cached values until someone saves a
   fresh copy of the build.
3. **Bump `state.v`** on any breaking change to the state shape and
   update `applyBuildState` to migrate (or gracefully drop) old
   versions. The client tolerates missing fields; it does NOT tolerate
   a completely reinterpreted field.
4. **Don't store fully denormalized data in `state`.** It's tempting
   to snapshot guild bonuses / skill unlocks alongside the ids so
   old builds freeze in time. Resist: the planner's whole value is
   that it recomputes from live data, and frozen numbers would
   diverge from Zcreator the moment a formula fix lands.

When in doubt, the safest way to "refresh" every seeded build is:
`node scripts/seed_saved_reincs.mjs --force`. The flag re-resolves
every seed against current data and overwrites cached metadata.

## API

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/builds?sort=top\|new&q=...` | list rows + per-viewer `myVotes` map |
| GET    | `/api/builds/:id`                 | full row incl. `state` JSON and `myVote` |
| POST   | `/api/builds`                     | create `{title, author, description, state, race_name, guild_summary, total_levels, total_exp, gold, hp, sp}` |
| POST   | `/api/builds/:id/vote`            | `{value: 1 \| -1 \| 0}` — 0 clears |

All endpoints are public. Votes are scoped by `sha1(ip + salt)` with a
single per-instance salt constant in `builds.mjs`; rotating the salt
effectively resets the ledger. There is no rate limit beyond the
"one vote per (reinc, ip-hash)" unique index; the user accepted that
some abuse is unavoidable without login. Don't add a rate limit that
would break legit shared-network users (offices, schools, ISPs that
CGNAT) without discussing it first.

## UX contract

- **Creation is from the planner only.** The /builds page has no
  "new build" form — the only way to save is to build a reinc in
  /reinc and hit the 💾 Share Build button in the summary bar. This
  means every saved build has a valid state (the modal refuses to
  submit if `character` is null).
- **No edit, no delete** (for users). The user asked for this
  explicitly: "once saved, the reinc can't be edited... they would
  need to go back into their reinc, make updates, and save again for
  a new instance". If a user wants to update a build they re-save;
  admin-side deletion is a future addition.
- **Sort defaults to "Top".** Featured (seeded) builds are pinned
  above tied scores so the day-one curated set doesn't get buried by
  a single upvote on a fresh build.
- **Votes are optimistic.** The client highlights the clicked arrow
  immediately and updates `upvotes`/`downvotes` from the server's
  response. Clicking an already-active arrow clears the vote.
