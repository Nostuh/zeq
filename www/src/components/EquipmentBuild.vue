<script>
import axios from 'axios';

// EQ Builder: weight some stats, get the best gear set from the items you
// own. Backed by POST /api/equipment/build (per-slot greedy). See
// docs/equipment-redesign.md.
const STATS = [
    { key: 'str', label: 'Str' }, { key: 'con', label: 'Con' }, { key: 'dex', label: 'Dex' },
    { key: 'int', label: 'Int' }, { key: 'wis', label: 'Wis' }, { key: 'cha', label: 'Cha' },
    { key: 'hp', label: 'Hp' }, { key: 'hpr', label: 'Hpr' }, { key: 'spr', label: 'Spr' },
    { key: 'sp', label: 'Sp' }, { key: 'ac', label: 'Ac' },
    { key: 'weapon_class_value', label: 'WpnCls' }, { key: 'dmg_pct', label: 'Dmg%' },
    { key: 'rphys', label: 'Phys' }, { key: 'rpsi', label: 'Psi' }, { key: 'relec', label: 'Elec' },
    { key: 'rmag', label: 'Mag' }, { key: 'rpoi', label: 'Poi' }, { key: 'rfire', label: 'Fire' },
    { key: 'rcold', label: 'Cold' }, { key: 'racid', label: 'Acid' }, { key: 'rasphx', label: 'Asph' },
    { key: 'rshadow', label: 'Shdw' },
];

export default {
    name: "EquipmentBuild",
    data() {
        return {
            stats: STATS,
            weights: Object.fromEntries(STATS.map(s => [s.key, 0])),
            wield: 'dual',
            result: null,
            loading: false,
            showHelp: true,
        };
    },
    computed: {
        // Stats with a non-zero weight — the columns worth showing in results.
        activeStats() { return this.stats.filter(s => Number(this.weights[s.key])); },
    },
    methods: {
        clear() { for (const s of this.stats) this.weights[s.key] = 0; this.result = null; },
        preset(obj) { this.clear(); Object.assign(this.weights, obj); this.build(); },
        fmt(v) { return v ? v : ''; },
        async build() {
            const weights = {};
            for (const s of this.stats) if (Number(this.weights[s.key])) weights[s.key] = Number(this.weights[s.key]);
            if (!Object.keys(weights).length) { this.$root.send_global_alert("Set at least one weight", true); return; }
            this.loading = true;
            try {
                const res = await axios.post('/api/equipment/build', { weights, wield: this.wield });
                if (!res.data || !res.data.ok) { this.$root.send_global_alert((res.data && res.data.error) || "Build failed", true); return; }
                this.result = res.data.data;
            } catch (e) {
                this.$root.send_global_alert("Build failed — re-login?", true);
            } finally { this.loading = false; }
        },
        typeOf(p) {
            if (p.weapon_class) return `${p.weapon_class}${p.hands == 2 ? ' 2h' : ''}`;
            if (p.is_shield) return 'shield';
            return '';
        },
    },
    mounted() {
        if (!this.$root.user) { this.$router.push({ name: "dashboard" }); }
    },
};
</script>

<template>
    <div>
        <h2>EQ Builder</h2>

        <!-- How-to: explains what the weights do and how the build is chosen. -->
        <div class="card mb-3 border-info">
            <div class="card-body py-2">
                <div class="d-flex align-items-center">
                    <strong class="me-2">How it works</strong>
                    <button class="btn btn-sm btn-link p-0" @click="showHelp = !showHelp">{{ showHelp ? 'hide' : 'show' }}</button>
                </div>
                <div v-if="showHelp" class="small mt-1">
                    <p class="mb-1">
                        Give a <strong>weight</strong> to each stat you care about — a bigger number means that
                        stat matters more. The builder scores every item you <strong>own</strong> as
                        <em>(weight × stat), summed over all weighted stats</em>, then fills each gear slot with
                        your highest-scoring item. You have one item per slot, except <strong>2 rings</strong>
                        (finger) and <strong>2 wield</strong> slots.
                    </p>
                    <ul class="mb-1">
                        <li><strong>0</strong> ignores a stat; a <strong>negative</strong> weight avoids it (e.g. <code>wis -1</code> to dump wisdom).</li>
                        <li>Relative size is what counts: <code>Str 2, Con 1</code> values strength twice as much as constitution.</li>
                        <li><strong>Presets</strong> set common goals in one click; <strong>Clear</strong> resets all weights to 0.</li>
                        <li><strong>Wield slots</strong> choose how to fill your two wield slots: two weapons, a weapon + shield, shield only (no weapon), or no weapons at all (caster).</li>
                        <li><strong>Multi-slot</strong> items (battlesuits, robes) are <strong>not included yet</strong> — they cover several slots at once and we don't track which ones.</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="card mb-3">
            <div class="card-body">
                <div class="mb-2">
                    <span class="me-2 fw-bold">Presets:</span>
                    <button class="btn btn-sm btn-outline-secondary me-1" @click="preset({str:1})">Most Str</button>
                    <button class="btn btn-sm btn-outline-secondary me-1" @click="preset({con:1})">Most Con</button>
                    <button class="btn btn-sm btn-outline-secondary me-1" @click="preset({int:1})">Most Int</button>
                    <button class="btn btn-sm btn-outline-secondary me-1" @click="preset({hp:1,con:1,ac:1})">Tank</button>
                    <button class="btn btn-sm btn-outline-secondary me-1" @click="preset({str:2,con:1,dex:1})">Melee</button>
                    <button class="btn btn-sm btn-outline-danger" @click="clear">Clear</button>
                </div>
                <div class="weight-grid">
                    <div v-for="s in stats" :key="s.key" class="weight-cell">
                        <label class="form-label mb-0 small">{{ s.label }}</label>
                        <input type="number" class="form-control form-control-sm" v-model.number="weights[s.key]" step="1" />
                    </div>
                </div>

                <div class="mt-3">
                    <span class="me-2 fw-bold small">Wield slots:</span>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" id="wield-dual" value="dual" v-model="wield">
                        <label class="form-check-label small" for="wield-dual">Two weapons</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" id="wield-shield" value="shield" v-model="wield">
                        <label class="form-check-label small" for="wield-shield">Weapon + shield</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" id="wield-shield-only" value="shield_only" v-model="wield">
                        <label class="form-check-label small" for="wield-shield-only">Shield only</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" id="wield-none" value="none" v-model="wield">
                        <label class="form-check-label small" for="wield-none">No weapons</label>
                    </div>
                </div>

                <button class="btn btn-primary mt-3" :disabled="loading" @click="build">{{ loading ? 'Building…' : 'Build Set' }}</button>
            </div>
        </div>

        <div v-if="result">
            <div class="d-flex flex-wrap align-items-center mb-2">
                <h4 class="me-3 mb-0">Score: {{ result.score }}</h4>
                <span class="badge bg-secondary me-2" v-for="s in activeStats" :key="s.key">
                    {{ s.label }} total: {{ result.totals[s.key] }}
                </span>
                <span class="text-muted small ms-auto">
                    from {{ result.owned }} owned · {{ result.unplaced }} unplaced<span v-if="result.multiIgnored"> · {{ result.multiIgnored }} multi-slot ignored</span>
                </span>
            </div>
            <table class="table table-bordered table-striped table-sm">
                <thead>
                    <tr>
                        <th>Slot</th><th>Item</th><th>Type</th>
                        <th v-for="s in activeStats" :key="s.key" class="text-end">{{ s.label }}</th>
                        <th class="text-end">Score</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="p in result.picks" :key="p.wear_slot + p.slot_index">
                        <td>{{ p.wear_slot }}<span v-if="p.slot_index > 1" class="text-muted"> #{{ p.slot_index }}</span></td>
                        <td>{{ p.name }}</td>
                        <td class="text-muted small">{{ typeOf(p) }}</td>
                        <td v-for="s in activeStats" :key="s.key" class="text-end">{{ fmt(p[s.key]) }}</td>
                        <td class="text-end">{{ p.item_score }}</td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr class="fw-bold">
                        <td colspan="3" class="text-end">Totals</td>
                        <td v-for="s in activeStats" :key="s.key" class="text-end">{{ result.totals[s.key] }}</td>
                        <td class="text-end">{{ result.score }}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>
</template>

<style scoped>
.weight-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.5rem;
}
.weight-cell { display: flex; flex-direction: column; }
</style>
