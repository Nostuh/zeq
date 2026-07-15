<script>
import zSimpleTableVue from "./tools/zSimpleTable.vue";
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
        return { eq: [] };
    },
    components: { zSimpleTableVue },
    computed: {
        mine() { return this.$route.name === 'equipment'; },
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
                name: { header: "Name" },
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
                eqmob_name: { header: "Eq Mob" },
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
            d.eqmob_name = v.eqmob_name || '';
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
        // Fetch + (re)render the table for the current route. /equipment and
        // /equipment-all share this component, so the router REUSES the
        // instance on a switch and `mounted` does NOT fire again — the watch
        // below calls this so the rows, the "Have" column, and the toggles
        // reload correctly. See the component re-use gotcha in docs/gotchas.md.
        async load() {
            if (!this.$root.user) { this.$router.push({ name: "dashboard" }); return; }
            const url = this.mine ? '/api/equipment/items?mine=1' : '/api/equipment/items';
            const res = await axios.get(url);
            const rows = (res.data && res.data.data) || [];
            this.eq = [];
            uf.dloop(rows, (i, v) => this.eq.push(this.to_display(v)));
            this.$refs.zSimpleTableVue.set_table(this.eq, this.get_config(), { display_limit: 500 });
        },
    },
    watch: {
        // Reload when switching between the mine/all routes (same component).
        '$route.name'() { this.load(); },
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
        <br><br><br>
        <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
    </div>
</template>
