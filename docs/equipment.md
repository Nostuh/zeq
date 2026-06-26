# Equipment pages

Per-user equipment tracker + the basis for the planned EQ Builder.
Items are stored **structured** in `eq_items` (parsed once at add time,
server-side); "ownership" is a tag in `eq_ownership`. Full rationale,
data model, and phase log: [equipment-redesign.md](equipment-redesign.md).
Backend: [api.md](api.md) (`/api/equipment`) + [schema.md](schema.md).

## Pages, routes, nav

| Component | Route (`name`) | Shows |
|---|---|---|
| [Equipment.vue](../www/src/components/Equipment.vue) | `/equipment` (`equipment`) | the signed-in user's owned items |
| [Equipment.vue](../www/src/components/Equipment.vue) | `/equipment-all` (`equipment-all`) | every item in the catalog |
| [EquipmentAdd.vue](../www/src/components/EquipmentAdd.vue) | `/equipment-add` (`equipment-add`) | paste-to-add form |
| [EquipmentBuild.vue](../www/src/components/EquipmentBuild.vue) | `/equipment-build` (`equipment-build`) | EQ Builder — best set from owned items |

One component (`Equipment.vue`) serves both list routes, choosing mine
vs. all by `this.$route.name` — there is no `EquipmentAll.vue` (it was a
near-duplicate that drifted; removed in the redesign). Routes carry no
auth meta; the component self-guards on `$root.user` and the
`/api/equipment` endpoints require a session (`requireAuth`), so the
browser's `zeq_sid` cookie is what authorizes reads/writes.

## How items are added (the only path)

`EquipmentAdd.vue` collects pasted in-game **identify text** + a slot
radio + an EQ-mob select and POSTs to `/api/equipment/add`. The server
parses the text **once** ([api/classes/eq_parse.mjs](../api/classes/eq_parse.mjs)),
best-of-merges it into the catalog
([api/classes/eq_store.mjs](../api/classes/eq_store.mjs)), and tags the
caller as an owner. There is no manual stat entry — the parse sets the
stats. The adverb→magnitude and "in general" AC scales, the slot
classifier (weapons/shields → `wield`, weapon class as an attribute),
and the name normalizer live in `eq_parse.mjs`.

## List view

`Equipment.vue` fetches `/api/equipment/items[?mine=1]` and renders the
pre-parsed columns through
[zSimpleTable.vue](../www/src/components/tools/zSimpleTable.vue) — **no
client-side parsing**. Zero stats are blanked for readability; `slot`,
`dmg`, and weapon class are composed for display. The **Have** column —
an icon toggle (`toggle` display type) that calls `POST`/`DELETE
/api/equipment/items/:id/own` to tag/untag ownership — shows **only on
All Equipment** (`/equipment-all`); on My Equipment every row is owned
by definition, so the column is dropped (`get_config` keys off `mine`).
It uses a Bootstrap icon, never a native checkbox (see the
checkbox-desync entry in [gotchas.md](gotchas.md)). Headers are sticky
(`top: 65px`).

## Legacy

The old `eq`/`eqmobs` tables and the equipment parts of `/api/eq`
(`/add`, `/eq`, `/eq-mobs`, `/add-mob`, `/copy_to_user`, `/login`) are
**frozen** — no longer read or written by the UI, kept only as history
pending retirement (no-drop rule). `POST /api/eq/kya` (KYA ingest) and
`GET /api/eq/version` stay live for in-game triggers — see
[kya.md](kya.md).
