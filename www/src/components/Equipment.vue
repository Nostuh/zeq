<script>
import zSimpleTableVue from "./tools/zSimpleTable.vue";
import ItemDetailModal from "./ItemDetailModal.vue";
import EqScoringHelp from "./EqScoringHelp.vue";
import axios from 'axios';
import { uf } from '../../utils/tools.mjs';

// Unified equipment list. Stats come pre-parsed from /api/equipment
// (eq_items) — NO client-side parsing. One component serves both the
// "My Equipment" (mine) and "All Equipment" views, picked by route name,
// which is why EquipmentAll.vue no longer exists. See
// docs/equipment-redesign.md.
// Every resistance column, summed into the ΣRes total column. Shadow is
// included: it is a real resist and on most items it is 0 anyway, so
// leaving it out would only hide the handful of items that carry it.
// Bug #43.
const RESIST_COLS = ['rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire',
    'rcold', 'racid', 'rasphx', 'rshadow'];

// Label for items whose wear_slot is blank in the catalog (a small number
// of rows the parser could not classify).
const NO_SLOT = '(unslotted)';

export default {
    name: "Equipment",
    data() {
        return {
            eq: [],
            allRows: [],           // every loaded row, pre slot-filter
            slotFilter: [],        // selected wear_slots; empty = show all
            modalItemId: null,
            mobFilterName: null,   // chip label when ?mob= is active
        };
    },
    components: { zSimpleTableVue, ItemDetailModal, EqScoringHelp },
    computed: {
        mine() { return this.$route.name === 'equipment'; },
        mobFilterId() { return parseInt(this.$route.query.mob, 10) || null; },
        // Slots actually present in the loaded rows, with counts, so the
        // filter never offers an option that would return nothing.
        slotOptions() {
            const counts = new Map();
            for (const r of this.allRows) {
                const s = r.wear_slot || NO_SLOT;
                counts.set(s, (counts.get(s) || 0) + 1);
            }
            return [...counts.entries()]
                .map(([slot, count]) => ({ slot, count }))
                .sort((a, b) => b.count - a.count || a.slot.localeCompare(b.slot));
        },
    },
    methods: {
        add_eq() { this.$router.push({ name: "equipment-add" }); },
        get_config() {
            const cfg = {
                // "Have" toggle only on the All Equipment view (on My
                // Equipment every row is owned, so the column is noise) AND
                // only for users who can edit — tagging ownership is an
                // equipment_edit write, so view-only users don't get it.
                ...(!this.mine && this.$root.canEquipmentEdit ? { owned: { header: "Have", display_type: "toggle", callback: this.toggle_owned } } : {}),
                // Name opens the item detail modal (stats + raw identify
                // text + mob links).
                name: { header: "Name", display_type: "link", callback: (d) => { this.modalItemId = d.id; } },
                slot_disp: { header: "Slot" },
                wc: { header: "WpnCls" },
                dmg: { header: "Dmg" },
                ac: { header: "Ac" },
                str: { header: "Str" }, con: { header: "Con" }, dex: { header: "Dex" },
                int: { header: "Int" }, wis: { header: "Wis" }, cha: { header: "Cha" },
                hpr: { header: "Hpr" }, spr: { header: "Spr" }, hp: { header: "Hp" }, sp: { header: "Sp" },
                rphys: { header: "Phys" }, rpsi: { header: "Psi" }, relec: { header: "Elec" },
                rmag: { header: "Mag" }, rpoi: { header: "Poi" }, rfire: { header: "Fire" },
                rcold: { header: "Cold" }, racid: { header: "Acid" }, rasphx: { header: "Asph" },
                rshadow: { header: "Shdw" },
                // Sum of every resist column — kept adjacent to the block it
                // totals. Numeric (not blanked to '') when non-zero so the
                // table sorts it numerically. Bug #43.
                rtot: { header: "ΣRes" },
                // Mob names link to the mob's KB page for users with mob
                // access; plain text (or "legacy: X") otherwise.
                mob_disp: {
                    header: "Eq Mob", display_type: "links",
                    callback: (d, e) => { if (e && e.id) this.$router.push({ name: 'mob-detail', params: { id: e.id } }); },
                },
                bonus_summary: { header: "Bonuses" },
            };
            return cfg;
        },
        // Map an API row to a display row: blank out zero stats so the
        // dense table stays readable, and build the composite columns.
        to_display(v) {
            const d = { id: v.id, name: v.name, owned: !!v.owned };
            // Raw slot is kept for the slot filter (slot_disp carries the
            // weapon-class suffix, so it can't be matched exactly).
            d.wear_slot = v.wear_slot || '';
            // Total resists — summed from the API row BEFORE the loop below
            // blanks zeros out, and left blank when the item has none so the
            // dense table stays readable.
            const rtot = RESIST_COLS.reduce((a, c) => a + (Number(v[c]) || 0), 0);
            d.rtot = rtot || '';
            let slot = v.wear_slot || '';
            if (v.weapon_class) slot += ` (${v.weapon_class}${v.hands == 2 ? ' 2h' : ''})`;
            else if (v.is_shield) slot += ' (shield)';
            else if (v.hands == 2) slot += ' (2h)';
            d.slot_disp = slot;
            d.wc = v.weapon_class_value || '';
            d.dmg = v.dmg_pct ? `${v.dmg_pct}% ${v.dmg_type || ''}`.trim() : '';
            for (const c of ['str', 'con', 'dex', 'int', 'wis', 'cha', 'hpr', 'spr',
                'hp', 'sp', 'rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire',
                'rcold', 'racid', 'rasphx', 'rshadow', 'ac']) d[c] = v[c] || '';
            // Prefer the Mob KB link(s); fall back to the frozen legacy
            // eqmob label until every item is linked through mob_loot.
            // With mob access the names become links ({label,id} array →
            // zSimpleTable 'links' cells); plain text otherwise.
            if (v.mob_links && this.$root.canEqmobs) {
                d.mob_disp = String(v.mob_links).split('||').map(s => {
                    const cut = s.lastIndexOf('|');
                    return { label: s.slice(0, cut), id: parseInt(s.slice(cut + 1), 10) };
                });
            } else {
                d.mob_disp = v.mob_names || (v.eqmob_name ? `legacy: ${v.eqmob_name}` : '');
            }
            d.bonus_summary = v.bonus_summary || '';
            return d;
        },
        async toggle_owned(d) {
            const desired = !d.owned;
            try {
                if (desired) await axios.post(`/api/equipment/items/${d.id}/own`);
                else await axios.delete(`/api/equipment/items/${d.id}/own`);
                d.owned = desired; // reactive icon update (no native checkbox — see gotchas)
                if (!desired && this.mine) this.$root.send_global_alert("Removed from your equipment");
            } catch (e) {
                this.$root.send_global_alert("Failed — re-login?", true);
            }
        },
        clearMobFilter() {
            const query = { ...this.$route.query };
            delete query.mob;
            this.$router.push({ name: this.$route.name, query });
        },
        // --- Slot filter (bug #40) -------------------------------------
        // Multi-select: pick any combination of slots, e.g. just amulets,
        // or amulets + neck, and then sort/search within that subset.
        // Driven by reactive state on plain buttons rather than native
        // <input> elements — see the checkbox-desync gotcha in
        // docs/gotchas.md.
        isSlotOn(slot) { return this.slotFilter.includes(slot); },
        toggleSlot(slot) {
            const i = this.slotFilter.indexOf(slot);
            if (i >= 0) this.slotFilter.splice(i, 1);
            else this.slotFilter.push(slot);
            this.render();
        },
        clearSlots() {
            if (!this.slotFilter.length) return;
            this.slotFilter = [];
            this.render();
        },
        // Apply the slot filter to the loaded rows and (re)draw the table.
        // Empty filter = show everything.
        render() {
            const on = new Set(this.slotFilter);
            this.eq = on.size
                ? this.allRows.filter((r) => on.has(r.wear_slot || NO_SLOT))
                : this.allRows.slice();
            this.$refs.zSimpleTableVue.set_table(this.eq, this.get_config(), { display_limit: 500 });
        },
        // Fetch + (re)render the table for the current route. /equipment and
        // /equipment-all share this component, so the router REUSES the
        // instance on a switch and `mounted` does NOT fire again — the watch
        // below calls this so the rows, the "Have" column, and the toggles
        // reload correctly. See the component re-use gotcha in docs/gotchas.md.
        async load() {
            if (!this.$root.user) { this.$router.push({ name: "dashboard" }); return; }
            const params = new URLSearchParams();
            if (this.mine) params.set('mine', '1');
            if (this.mobFilterId) params.set('mob', String(this.mobFilterId));
            const qs = params.toString();
            const res = await axios.get('/api/equipment/items' + (qs ? '?' + qs : ''));
            const rows = (res.data && res.data.data) || [];
            this.allRows = [];
            uf.dloop(rows, (i, v) => this.allRows.push(this.to_display(v)));
            // Drop any selected slot that this route's rows don't contain,
            // so switching My ↔ All can't leave an empty table behind an
            // invisible filter.
            const present = new Set(this.allRows.map((r) => r.wear_slot || NO_SLOT));
            this.slotFilter = this.slotFilter.filter((s) => present.has(s));
            this.render();
            // Chip label for the active mob filter (from the rows if
            // possible; else look the mob up).
            this.mobFilterName = null;
            if (this.mobFilterId) {
                const withMob = rows.find(r => r.mob_names);
                if (withMob) this.mobFilterName = withMob.mob_names.split(', ')[0];
                else {
                    try {
                        const m = await axios.get('/api/equipment/mobs');
                        const hit = ((m.data && m.data.data) || []).find(x => x.id === this.mobFilterId);
                        this.mobFilterName = hit ? hit.name : `mob #${this.mobFilterId}`;
                    } catch (e) { this.mobFilterName = `mob #${this.mobFilterId}`; }
                }
            }
        },
    },
    watch: {
        // Reload when switching mine/all routes OR when the ?mob= query
        // changes (same component instance both times — fullPath, not name;
        // see the component re-use gotcha in docs/gotchas.md).
        '$route.fullPath'() {
            if (['equipment', 'equipment-all'].includes(this.$route.name)) this.load();
        },
    },
    async mounted() { await this.load(); },
};
</script>

<style scoped>
/* Sticky header + horizontal-scroll containment now live in the shared
   zSimpleTable component (.zst-scroll) so the header pins reliably without the
   ghost-row bleed. Here we only tighten the dense 24-stat-column grid so more
   columns fit at once. The higher-specificity selector (scope attr + .table)
   beats Bootstrap's own `.table > :not(caption) > * > *` padding. */
:deep(table.table) {
    font-size: 0.78rem;
}
:deep(table.table) > :not(caption) > * > * {
    padding: 0.2rem 0.35rem;
}

/* Slot filter bar — wraps freely so 14 slot chips fit any viewport without a
   fixed px breakpoint. Colours come from Bootstrap button variants, so both
   themes are covered. */
.eq-slotbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
}
.eq-slotbar .btn {
    padding: 0.1rem 0.45rem;
    font-size: 0.78rem;
}
.eq-slotbar-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bs-secondary-color);
    margin-right: 0.15rem;
}
.eq-slotbar-count {
    font-size: 0.78rem;
    margin-left: 0.35rem;
}
</style>

<template>
    <div>
        <div class="d-flex flex-wrap align-items-center gap-3">
            <h2 class="m-0">{{ mine ? 'My Equipment' : 'All Equipment' }}</h2>
            <EqScoringHelp />
        </div>
        <button v-if="$root.canEquipmentEdit" class="btn btn-primary mt-2" type="button" @click="add_eq">Add Item</button>
        <div v-if="mobFilterId" class="mt-2">
            <span class="badge text-bg-primary">
                Drops from: {{ mobFilterName || '…' }}
                <i class="bi bi-x-lg ms-1" style="cursor:pointer" @click="clearMobFilter"></i>
            </span>
        </div>

        <!-- Slot filter (bug #40): narrow the catalog to one or more slots,
             then sort/search inside that subset. -->
        <div v-if="slotOptions.length > 1" class="eq-slotbar mt-2">
            <span class="eq-slotbar-label">Slot:</span>
            <button type="button" class="btn btn-sm"
                    :class="slotFilter.length ? 'btn-outline-secondary' : 'btn-secondary'"
                    @click="clearSlots">All</button>
            <button v-for="o in slotOptions" :key="o.slot" type="button" class="btn btn-sm"
                    :class="isSlotOn(o.slot) ? 'btn-primary' : 'btn-outline-secondary'"
                    @click="toggleSlot(o.slot)">
                {{ o.slot }} <span class="opacity-75">{{ o.count }}</span>
            </button>
            <span class="eq-slotbar-count text-muted">
                {{ eq.length }}<template v-if="eq.length !== allRows.length"> of {{ allRows.length }}</template> items
            </span>
        </div>

        <br>
        <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
        <ItemDetailModal :item-id="modalItemId" @close="modalItemId = null" @changed="load()" />
    </div>
</template>
