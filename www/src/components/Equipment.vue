<script>
import zSimpleTableVue from "./tools/zSimpleTable.vue";
import ItemDetailModal from "./ItemDetailModal.vue";
import axios from 'axios';
import { uf } from '../../utils/tools.mjs';

// Unified equipment list. Stats come pre-parsed from /api/equipment
// (eq_items) — NO client-side parsing. One component serves both the
// "My Equipment" (mine) and "All Equipment" views, picked by route name,
// which is why EquipmentAll.vue no longer exists. See
// docs/equipment-redesign.md.
const STAT_COLS = ['str', 'con', 'dex', 'int', 'wis', 'cha', 'hpr', 'spr',
    'hp', 'sp', 'rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire', 'rcold',
    'racid', 'rasphx', 'rshadow', 'ac', 'wc', 'dmg_pct'];

export default {
    name: "Equipment",
    data() {
        return {
            eq: [],
            modalItemId: null,
            mobFilterName: null,   // chip label when ?mob= is active
        };
    },
    components: { zSimpleTableVue, ItemDetailModal },
    computed: {
        mine() { return this.$route.name === 'equipment'; },
        mobFilterId() { return parseInt(this.$route.query.mob, 10) || null; },
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
                mob_disp: { header: "Eq Mob" },
                bonus_summary: { header: "Bonuses" },
            };
            return cfg;
        },
        // Map an API row to a display row: blank out zero stats so the
        // dense table stays readable, and build the composite columns.
        to_display(v) {
            const d = { id: v.id, name: v.name, owned: !!v.owned };
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
            d.mob_disp = v.mob_names || (v.eqmob_name ? `legacy: ${v.eqmob_name}` : '');
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
            this.eq = [];
            uf.dloop(rows, (i, v) => this.eq.push(this.to_display(v)));
            this.$refs.zSimpleTableVue.set_table(this.eq, this.get_config(), { display_limit: 500 });
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
</style>

<template>
    <div>
        <h2>{{ mine ? 'My Equipment' : 'All Equipment' }}</h2>
        <button v-if="$root.canEquipmentEdit" class="btn btn-primary" type="button" @click="add_eq">Add Item</button>
        <div v-if="mobFilterId" class="mt-2">
            <span class="badge text-bg-primary">
                Drops from: {{ mobFilterName || '…' }}
                <i class="bi bi-x-lg ms-1" style="cursor:pointer" @click="clearMobFilter"></i>
            </span>
        </div>
        <br><br>
        <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
        <ItemDetailModal :item-id="modalItemId" @close="modalItemId = null" @changed="load()" />
    </div>
</template>
