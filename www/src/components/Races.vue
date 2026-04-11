<script>
import axios from 'axios';
const STATS = ['max_str','max_dex','max_con','max_int','max_wis','max_cha','size','exp_rate','sp_regen','hp_regen','skill_max','spell_max','skill_cost','spell_cost'];
const BLANK = () => ({ name: '', parent_id: null, help_text: '', enabled: 1,
    max_str: 50, max_dex: 50, max_con: 50, max_int: 50, max_wis: 50, max_cha: 50,
    size: 50, exp_rate: 100, sp_regen: 20, hp_regen: 20,
    skill_max: 100, spell_max: 100, skill_cost: 100, spell_cost: 100 });
export default {
    name: 'Races',
    data() {
        return {
            rows: [], q: '', editId: null, draft: {}, showHelp: null,
            creating: false, createDraft: BLANK(), stats: STATS,
        };
    },
    computed: {
        canEdit() { return this.$root.canEdit; },
        parents() { return this.rows.filter((r) => !r.parent_id); },
    },
    methods: {
        async load() {
            try { this.rows = (await axios.get('/api/game/races', { params: { q: this.q } })).data.data; }
            catch (e) { this.$root.flashError(e); }
        },
        startEdit(row) { this.editId = row.id; this.draft = { ...row }; this.creating = false; },
        cancel() { this.editId = null; this.draft = {}; },
        startCreate() { this.creating = true; this.createDraft = BLANK(); this.editId = null; },
        cancelCreate() { this.creating = false; this.createDraft = BLANK(); },
        buildPayload(d) {
            const p = { name: d.name, parent_id: d.parent_id || null, help_text: d.help_text || null, enabled: d.enabled ? 1 : 0 };
            for (const s of STATS) p[s] = parseInt(d[s], 10) || 0;
            return p;
        },
        async toggleEnabled(row) {
            try {
                await axios.post('/api/game/races/' + row.id, { enabled: row.enabled ? 0 : 1 });
                this.$root.flashMsg(row.enabled ? 'Disabled' : 'Enabled');
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async save() {
            try {
                const r = await axios.post('/api/game/races/' + this.editId, this.buildPayload(this.draft));
                if (r.data.ok) { this.$root.flashMsg('Saved'); this.cancel(); await this.load(); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
        async create() {
            try {
                const r = await axios.post('/api/game/races', this.buildPayload(this.createDraft));
                if (r.data.ok) { this.$root.flashMsg('Created'); this.cancelCreate(); await this.load(); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
        async del(row) {
            if (!confirm(`Delete race "${row.name}"? This cannot be undone.`)) return;
            try { await axios.delete('/api/game/races/' + row.id); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
    },
    mounted() { this.load(); },
    watch: { q() { this.load(); } },
};
</script>
<template>
<div>
    <h2>Races</h2>
    <div class="mb-2 d-flex gap-2">
        <input class="form-control form-control-sm" style="max-width:20em;" placeholder="Search races" v-model="q">
        <button v-if="canEdit" class="btn btn-sm btn-success" @click="startCreate">+ New race</button>
    </div>

    <div v-if="creating && canEdit" class="card mb-3"><div class="card-body">
        <h5 class="card-title">New race</h5>
        <div class="row g-2">
            <div class="col-md-3"><label class="form-label small">Name</label><input class="form-control form-control-sm" v-model="createDraft.name"></div>
            <div class="col-md-3"><label class="form-label small">Parent race (optional)</label>
                <select class="form-select form-select-sm" v-model="createDraft.parent_id">
                    <option :value="null">— none (top-level) —</option>
                    <option v-for="p in parents" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
            </div>
            <div class="col-md-1" v-for="s in stats" :key="s"><label class="form-label small">{{ s.replace('max_','') }}</label><input class="form-control form-control-sm" v-model.number="createDraft[s]"></div>
            <div class="col-12"><label class="form-label small">Help text</label><textarea class="form-control form-control-sm" rows="4" v-model="createDraft.help_text"></textarea></div>
        </div>
        <div class="mt-2">
            <button class="btn btn-sm btn-primary me-1" @click="create">Create</button>
            <button class="btn btn-sm btn-secondary" @click="cancelCreate">Cancel</button>
        </div>
    </div></div>

    <table class="table table-sm table-striped table-hover align-middle">
        <thead><tr>
            <th>On</th><th>Name</th><th>Str</th><th>Dex</th><th>Con</th><th>Int</th><th>Wis</th><th>Cha</th>
            <th>Siz</th><th>Exp</th><th>SpR</th><th>HpR</th><th>SkM</th><th>SpM</th><th>SkC</th><th>SpC</th>
            <th>Help</th><th v-if="canEdit"></th>
        </tr></thead>
        <tbody>
            <template v-for="r in rows" :key="r.id">
                <tr :class="{ 'text-muted opacity-75': !r.enabled }">
                    <td>
                        <input type="checkbox" class="form-check-input" :checked="!!r.enabled" :disabled="!canEdit" @change="toggleEnabled(r)">
                    </td>
                    <td>
                        <span v-if="r.parent_name" class="ms-3">↳ {{ r.name }}</span>
                        <strong v-else>{{ r.name }}</strong>
                    </td>
                    <td v-for="s in stats" :key="s">{{ r[s] }}</td>
                    <td><button v-if="r.help_text" class="btn btn-sm btn-outline-secondary py-0" @click="showHelp = showHelp === r.id ? null : r.id">{{ showHelp === r.id ? '−' : '+' }}</button></td>
                    <td v-if="canEdit">
                        <button class="btn btn-sm btn-outline-primary me-1" @click="startEdit(r)">Edit</button>
                        <button class="btn btn-sm btn-outline-danger" @click="del(r)">Del</button>
                    </td>
                </tr>
                <tr v-if="showHelp === r.id"><td :colspan="18"><pre class="small mb-0">{{ r.help_text }}</pre></td></tr>
                <tr v-if="editId === r.id && canEdit"><td :colspan="18">
                    <div class="row g-2">
                        <div class="col-md-3"><label class="form-label small">Name</label><input class="form-control form-control-sm" v-model="draft.name"></div>
                        <div class="col-md-3"><label class="form-label small">Parent race</label>
                            <select class="form-select form-select-sm" v-model="draft.parent_id">
                                <option :value="null">— none —</option>
                                <option v-for="p in parents" :key="p.id" :value="p.id" :disabled="p.id === draft.id">{{ p.name }}</option>
                            </select>
                        </div>
                        <div class="col-md-2"><label class="form-label small d-block">Enabled</label>
                            <div class="form-check form-switch"><input class="form-check-input" type="checkbox" v-model="draft.enabled" :true-value="1" :false-value="0"></div>
                        </div>
                        <div class="col-md-1" v-for="s in stats" :key="s"><label class="form-label small">{{ s.replace('max_','') }}</label><input class="form-control form-control-sm" v-model.number="draft[s]"></div>
                        <div class="col-12"><label class="form-label small">Help text</label><textarea class="form-control form-control-sm" rows="6" v-model="draft.help_text"></textarea></div>
                    </div>
                    <div class="mt-2">
                        <button class="btn btn-sm btn-primary me-1" @click="save">Save</button>
                        <button class="btn btn-sm btn-secondary" @click="cancel">Cancel</button>
                    </div>
                </td></tr>
            </template>
        </tbody>
    </table>
</div>
</template>
