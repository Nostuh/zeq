<script>
import axios from 'axios';
export default {
    name: 'Costs',
    data() {
        return {
            level_costs: [], wish_costs: [], ss_costs: [],
            tab: 'level',
            newLevel: null, newWish: null, newSS: null,
        };
    },
    computed: {
        canEdit() { return this.$root.canEdit; },
        byKind() {
            const m = { level: [], stat: [], quest: [] };
            for (const r of this.level_costs) (m[r.kind] ||= []).push(r);
            return m;
        },
        lesser() { return this.wish_costs.filter((w) => w.kind === 'lesser'); },
        greater() { return this.wish_costs.filter((w) => w.kind === 'greater'); },
    },
    methods: {
        async load() {
            try { Object.assign(this, (await axios.get('/api/game/costs')).data.data); }
            catch (e) { this.$root.flashError(e); }
        },
        async saveLevel(row) {
            try { await axios.post('/api/game/costs/level', { kind: row.kind, level: row.level, cost: parseInt(row.cost, 10) }); this.$root.flashMsg('Saved'); }
            catch (e) { this.$root.flashError(e); }
        },
        async delLevel(row) {
            if (!confirm(`Delete ${row.kind} cost at level ${row.level}?`)) return;
            try { await axios.delete(`/api/game/costs/level/${row.kind}/${row.level}`); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        startNewLevel() {
            const existing = this.byKind[this.tab] || [];
            const nextLevel = existing.length ? Math.max(...existing.map((r) => r.level)) + 1 : 1;
            this.newLevel = { kind: this.tab, level: nextLevel, cost: 0 };
        },
        async createLevel() {
            try {
                await axios.post('/api/game/costs/level', {
                    kind: this.newLevel.kind,
                    level: parseInt(this.newLevel.level, 10),
                    cost: parseInt(this.newLevel.cost, 10),
                });
                this.$root.flashMsg('Added');
                this.newLevel = null;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },

        async saveWish(row) {
            try { await axios.post('/api/game/costs/wish', { kind: row.kind, tier: row.tier, cost: parseInt(row.cost, 10) }); this.$root.flashMsg('Saved'); }
            catch (e) { this.$root.flashError(e); }
        },
        async delWish(row) {
            if (!confirm(`Delete ${row.kind} wish tier ${row.tier}?`)) return;
            try { await axios.delete(`/api/game/costs/wish/${row.kind}/${row.tier}`); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        startNewWish(kind) {
            const existing = this.wish_costs.filter((r) => r.kind === kind);
            const nextTier = existing.length ? Math.max(...existing.map((r) => r.tier)) + 1 : 1;
            this.newWish = { kind, tier: nextTier, cost: 0 };
        },
        async createWish() {
            try {
                await axios.post('/api/game/costs/wish', {
                    kind: this.newWish.kind,
                    tier: parseInt(this.newWish.tier, 10),
                    cost: parseInt(this.newWish.cost, 10),
                });
                this.$root.flashMsg('Added');
                this.newWish = null;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },

        async saveSS(row) {
            try { await axios.post('/api/game/costs/ss', { from_pct: row.from_pct, to_pct: row.to_pct, multiplier: parseInt(row.multiplier, 10) }); this.$root.flashMsg('Saved'); }
            catch (e) { this.$root.flashError(e); }
        },
        async delSS(row) {
            if (!confirm(`Delete range ${row.from_pct}-${row.to_pct}%?`)) return;
            try { await axios.delete('/api/game/costs/ss/' + row.id); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        startNewSS() { this.newSS = { from_pct: 0, to_pct: 5, multiplier: 1 }; },
        async createSS() {
            try {
                await axios.post('/api/game/costs/ss', {
                    from_pct: parseInt(this.newSS.from_pct, 10),
                    to_pct: parseInt(this.newSS.to_pct, 10),
                    multiplier: parseInt(this.newSS.multiplier, 10),
                });
                this.$root.flashMsg('Added');
                this.newSS = null;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
    },
    mounted() { this.load(); },
};
</script>
<template>
<div>
    <h2>Cost tables</h2>
    <ul class="nav nav-tabs">
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='level'}" href="#" @click.prevent="tab='level'">Level XP</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='stat'}" href="#" @click.prevent="tab='stat'">Stat</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='quest'}" href="#" @click.prevent="tab='quest'">Quest points</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='wish'}" href="#" @click.prevent="tab='wish'">Wishes</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='ss'}" href="#" @click.prevent="tab='ss'">Skill/Spell %</a></li>
    </ul>

    <div class="pt-3">
        <div v-if="['level','stat','quest'].includes(tab)">
            <div class="mb-2" v-if="canEdit">
                <button v-if="!newLevel" class="btn btn-sm btn-success" @click="startNewLevel">+ Add level</button>
                <div v-else class="card card-body p-2" style="max-width:30em;">
                    <div class="row g-2 align-items-end">
                        <div class="col-4"><label class="form-label small">Level</label><input class="form-control form-control-sm" v-model.number="newLevel.level"></div>
                        <div class="col-4"><label class="form-label small">Cost</label><input class="form-control form-control-sm" v-model.number="newLevel.cost"></div>
                        <div class="col-4">
                            <button class="btn btn-sm btn-primary me-1" @click="createLevel">Add</button>
                            <button class="btn btn-sm btn-secondary" @click="newLevel = null">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            <table class="table table-sm table-striped" style="max-width:30em;">
                <thead><tr><th>Level</th><th>Cost</th><th v-if="canEdit" style="width:10em;"></th></tr></thead>
                <tbody>
                    <tr v-for="r in byKind[tab]" :key="r.level">
                        <td>{{ r.level }}</td>
                        <td><input v-if="canEdit" class="form-control form-control-sm" v-model.number="r.cost"><span v-else>{{ r.cost }}</span></td>
                        <td v-if="canEdit">
                            <button class="btn btn-sm btn-outline-primary me-1" @click="saveLevel(r)">Save</button>
                            <button class="btn btn-sm btn-outline-danger" @click="delLevel(r)">Del</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="tab==='wish'">
            <div class="row">
                <div class="col-md-6">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5>Lesser wishes</h5>
                        <button v-if="canEdit && (!newWish || newWish.kind !== 'lesser')" class="btn btn-sm btn-success" @click="startNewWish('lesser')">+ Add tier</button>
                    </div>
                    <div v-if="canEdit && newWish && newWish.kind === 'lesser'" class="card card-body p-2 mb-2">
                        <div class="row g-2 align-items-end">
                            <div class="col-4"><label class="form-label small">Tier</label><input class="form-control form-control-sm" v-model.number="newWish.tier"></div>
                            <div class="col-4"><label class="form-label small">Cost</label><input class="form-control form-control-sm" v-model.number="newWish.cost"></div>
                            <div class="col-4">
                                <button class="btn btn-sm btn-primary me-1" @click="createWish">Add</button>
                                <button class="btn btn-sm btn-secondary" @click="newWish = null">Cancel</button>
                            </div>
                        </div>
                    </div>
                    <table class="table table-sm table-striped"><thead><tr><th>Tier</th><th>Cost</th><th v-if="canEdit"></th></tr></thead><tbody>
                        <tr v-for="r in lesser" :key="r.tier">
                            <td>{{ r.tier }}</td>
                            <td><input v-if="canEdit" class="form-control form-control-sm" v-model.number="r.cost"><span v-else>{{ r.cost }}</span></td>
                            <td v-if="canEdit">
                                <button class="btn btn-sm btn-outline-primary me-1" @click="saveWish(r)">Save</button>
                                <button class="btn btn-sm btn-outline-danger" @click="delWish(r)">Del</button>
                            </td>
                        </tr>
                    </tbody></table>
                </div>
                <div class="col-md-6">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5>Greater wishes</h5>
                        <button v-if="canEdit && (!newWish || newWish.kind !== 'greater')" class="btn btn-sm btn-success" @click="startNewWish('greater')">+ Add tier</button>
                    </div>
                    <div v-if="canEdit && newWish && newWish.kind === 'greater'" class="card card-body p-2 mb-2">
                        <div class="row g-2 align-items-end">
                            <div class="col-4"><label class="form-label small">Tier</label><input class="form-control form-control-sm" v-model.number="newWish.tier"></div>
                            <div class="col-4"><label class="form-label small">Cost</label><input class="form-control form-control-sm" v-model.number="newWish.cost"></div>
                            <div class="col-4">
                                <button class="btn btn-sm btn-primary me-1" @click="createWish">Add</button>
                                <button class="btn btn-sm btn-secondary" @click="newWish = null">Cancel</button>
                            </div>
                        </div>
                    </div>
                    <table class="table table-sm table-striped"><thead><tr><th>Tier</th><th>Cost</th><th v-if="canEdit"></th></tr></thead><tbody>
                        <tr v-for="r in greater" :key="r.tier">
                            <td>{{ r.tier }}</td>
                            <td><input v-if="canEdit" class="form-control form-control-sm" v-model.number="r.cost"><span v-else>{{ r.cost }}</span></td>
                            <td v-if="canEdit">
                                <button class="btn btn-sm btn-outline-primary me-1" @click="saveWish(r)">Save</button>
                                <button class="btn btn-sm btn-outline-danger" @click="delWish(r)">Del</button>
                            </td>
                        </tr>
                    </tbody></table>
                </div>
            </div>
        </div>

        <div v-if="tab==='ss'">
            <p class="small text-muted">From <code>costs.txt</code>. Per-percent training cost multipliers.</p>
            <div class="mb-2" v-if="canEdit">
                <button v-if="!newSS" class="btn btn-sm btn-success" @click="startNewSS">+ Add range</button>
                <div v-else class="card card-body p-2" style="max-width:40em;">
                    <div class="row g-2 align-items-end">
                        <div class="col-3"><label class="form-label small">From %</label><input class="form-control form-control-sm" v-model.number="newSS.from_pct"></div>
                        <div class="col-3"><label class="form-label small">To %</label><input class="form-control form-control-sm" v-model.number="newSS.to_pct"></div>
                        <div class="col-3"><label class="form-label small">Multiplier</label><input class="form-control form-control-sm" v-model.number="newSS.multiplier"></div>
                        <div class="col-3">
                            <button class="btn btn-sm btn-primary me-1" @click="createSS">Add</button>
                            <button class="btn btn-sm btn-secondary" @click="newSS = null">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            <table class="table table-sm table-striped" style="max-width:40em;">
                <thead><tr><th>From %</th><th>To %</th><th>Multiplier</th><th v-if="canEdit" style="width:12em;"></th></tr></thead>
                <tbody>
                    <tr v-for="r in ss_costs" :key="r.id">
                        <td>{{ r.from_pct }}</td>
                        <td>{{ r.to_pct }}</td>
                        <td><input v-if="canEdit" class="form-control form-control-sm" v-model.number="r.multiplier"><span v-else>{{ r.multiplier }}</span></td>
                        <td v-if="canEdit">
                            <button class="btn btn-sm btn-outline-primary me-1" @click="saveSS(r)">Save</button>
                            <button class="btn btn-sm btn-outline-danger" @click="delSS(r)">Del</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
</template>
