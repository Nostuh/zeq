<script>
import axios from 'axios';
export default {
    name: 'MobList',
    data() {
        return {
            rows: [],
            q: '',
            loading: false,
            debounceTimer: null,
        };
    },
    computed: {
        canEdit() { return this.$root.canEditEq; },
    },
    methods: {
        async load() {
            this.loading = true;
            try {
                const params = this.q ? { q: this.q } : {};
                const r = await axios.get('/api/mobs', { params });
                this.rows = r.data.data || [];
            } catch (e) { this.$root.flashError(e); }
            this.loading = false;
        },
        onSearch() {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.load(), 300);
        },
        goToMob(mob) {
            this.$router.push({ name: 'mob-detail', params: { id: mob.id } });
        },
        resistSummary(mob) {
            if (!mob.resistances || !mob.resistances.length) return null;
            let most = null, least = null;
            for (const r of mob.resistances) {
                if (r.value == null) continue;
                if (!most || r.value > most.value) most = r;
                if (!least || r.value < least.value) least = r;
            }
            return { most, least };
        },
        resistLabel(type) {
            const labels = {
                physical: 'Phys', magical: 'Mag', fire: 'Fire', cold: 'Cold',
                electric: 'Elec', poison: 'Pois', acid: 'Acid',
                asphyxiation: 'Asph', psionic: 'Psi',
            };
            return labels[type] || type;
        },
        fmtExp(v) {
            if (!v) return '';
            if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
            if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
            return String(v);
        },
    },
    mounted() { this.load(); },
};
</script>
<template>
<div>
    <div class="d-flex align-items-center mb-3">
        <h2 class="mb-0 me-3">EQ Mob Database</h2>
        <button v-if="canEdit" class="btn btn-sm btn-primary"
                @click="$router.push({ name: 'mob-detail', params: { id: 'new' } })">
            Add Mob
        </button>
    </div>

    <div class="mb-3">
        <input class="form-control" placeholder="Search mobs by name, area, or alias..."
               v-model="q" @input="onSearch" autofocus>
    </div>

    <div v-if="loading" class="text-muted">Loading...</div>

    <!-- Desktop table -->
    <table v-if="!loading && rows.length" class="table table-sm table-striped table-hover align-middle mob-list-table d-none d-md-table">
        <thead>
            <tr>
                <th>Name</th>
                <th>Area</th>
                <th>Exp</th>
                <th>Resists Most</th>
                <th>Resists Least</th>
                <th class="text-center">Loot</th>
                <th class="text-center">Flags</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="mob in rows" :key="mob.id" @click="goToMob(mob)" style="cursor:pointer;">
                <td class="fw-semibold">{{ mob.name }}</td>
                <td class="text-muted small">{{ mob.area || '' }}</td>
                <td class="small">{{ fmtExp(mob.exp_value) }}</td>
                <td>
                    <span v-if="resistSummary(mob) && resistSummary(mob).most"
                          class="badge mob-resist-badge"
                          :class="'mob-resist-' + resistSummary(mob).most.value">
                        {{ resistLabel(resistSummary(mob).most.type) }} ({{ resistSummary(mob).most.value }})
                    </span>
                </td>
                <td>
                    <span v-if="resistSummary(mob) && resistSummary(mob).least"
                          class="badge mob-resist-badge"
                          :class="'mob-resist-' + resistSummary(mob).least.value">
                        {{ resistLabel(resistSummary(mob).least.type) }} ({{ resistSummary(mob).least.value }})
                    </span>
                </td>
                <td class="text-center">{{ mob.loot_count || 0 }}</td>
                <td class="text-center">
                    <span v-if="mob.is_aggro" class="badge bg-danger me-1" title="Aggressive">AGR</span>
                    <span v-if="mob.is_undead" class="badge bg-secondary" title="Undead">UND</span>
                </td>
            </tr>
        </tbody>
    </table>

    <!-- Mobile cards -->
    <div v-if="!loading && rows.length" class="d-md-none">
        <div v-for="mob in rows" :key="mob.id" class="card mb-2" @click="goToMob(mob)" style="cursor:pointer;">
            <div class="card-body p-2">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <strong>{{ mob.name }}</strong>
                        <div class="text-muted small">{{ mob.area || '' }}</div>
                    </div>
                    <div class="text-end">
                        <span v-if="mob.is_aggro" class="badge bg-danger me-1">AGR</span>
                        <span v-if="mob.is_undead" class="badge bg-secondary">UND</span>
                    </div>
                </div>
                <div class="small mt-1" v-if="resistSummary(mob)">
                    <span v-if="resistSummary(mob).most" class="me-2">
                        Most: <span class="badge mob-resist-badge" :class="'mob-resist-' + resistSummary(mob).most.value">
                            {{ resistLabel(resistSummary(mob).most.type) }}
                        </span>
                    </span>
                    <span v-if="resistSummary(mob).least">
                        Least: <span class="badge mob-resist-badge" :class="'mob-resist-' + resistSummary(mob).least.value">
                            {{ resistLabel(resistSummary(mob).least.type) }}
                        </span>
                    </span>
                </div>
            </div>
        </div>
    </div>

    <div v-if="!loading && !rows.length" class="text-muted">No mobs found.</div>
</div>
</template>
