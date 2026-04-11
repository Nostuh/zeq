<script>
import axios from 'axios';
export default {
    name: 'Guilds',
    data() {
        return {
            rows: [], q: '',
            creating: false,
            createDraft: { name: '', file_name: '', parent_id: null, max_level: 45 },
        };
    },
    computed: {
        canEdit() { return this.$root.canEdit; },
        filtered() {
            if (!this.q) return this.rows;
            const q = this.q.toLowerCase();
            return this.rows.filter((r) => r.name.toLowerCase().includes(q));
        },
        topLevel() { return this.filtered.filter((r) => !r.parent_id); },
        subOf() {
            const m = {};
            for (const r of this.filtered) if (r.parent_id) (m[r.parent_id] ||= []).push(r);
            return m;
        },
        parents() { return this.rows.filter((r) => !r.parent_id); },
    },
    methods: {
        async load() {
            try { this.rows = (await axios.get('/api/game/guilds')).data.data; }
            catch (e) { this.$root.flashError(e); }
        },
        startCreate() { this.creating = true; this.createDraft = { name: '', file_name: '', parent_id: null, max_level: 45 }; },
        cancelCreate() { this.creating = false; },
        async create() {
            try {
                const r = await axios.post('/api/game/guilds', {
                    name: this.createDraft.name,
                    file_name: this.createDraft.file_name || this.createDraft.name.replace(/\s+/g, '_'),
                    parent_id: this.createDraft.parent_id || null,
                    max_level: parseInt(this.createDraft.max_level, 10) || 0,
                });
                if (r.data.ok) { this.$root.flashMsg('Created'); this.cancelCreate(); await this.load(); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
    },
    mounted() { this.load(); },
};
</script>
<template>
<div>
    <h2>Guilds</h2>
    <div class="mb-2 d-flex gap-2">
        <input class="form-control form-control-sm" style="max-width:20em;" placeholder="Search guilds" v-model="q">
        <button v-if="canEdit" class="btn btn-sm btn-success" @click="startCreate">+ New guild</button>
    </div>

    <div v-if="creating && canEdit" class="card mb-3"><div class="card-body">
        <h5 class="card-title">New guild</h5>
        <div class="row g-2">
            <div class="col-md-3"><label class="form-label small">Display name</label><input class="form-control form-control-sm" v-model="createDraft.name"></div>
            <div class="col-md-3"><label class="form-label small">File name (no .chr)</label><input class="form-control form-control-sm" v-model="createDraft.file_name" :placeholder="createDraft.name.replace(/\s+/g,'_')"></div>
            <div class="col-md-3"><label class="form-label small">Parent guild (optional)</label>
                <select class="form-select form-select-sm" v-model="createDraft.parent_id">
                    <option :value="null">— none (top-level) —</option>
                    <option v-for="p in parents" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
            </div>
            <div class="col-md-2"><label class="form-label small">Max level</label><input class="form-control form-control-sm" v-model.number="createDraft.max_level"></div>
        </div>
        <div class="mt-2">
            <button class="btn btn-sm btn-primary me-1" @click="create">Create</button>
            <button class="btn btn-sm btn-secondary" @click="cancelCreate">Cancel</button>
        </div>
    </div></div>

    <table class="table table-sm table-striped table-hover">
        <thead><tr><th>Name</th><th>File</th><th>Max level</th><th></th></tr></thead>
        <tbody>
            <template v-for="g in topLevel" :key="g.id">
                <tr>
                    <td><strong>{{ g.name }}</strong></td>
                    <td><code class="small">{{ g.file_name }}</code></td>
                    <td>{{ g.max_level }}</td>
                    <td><router-link class="btn btn-sm btn-outline-primary" :to="{name:'guild-detail',params:{id:g.id}}">Open</router-link></td>
                </tr>
                <tr v-for="sg in (subOf[g.id] || [])" :key="sg.id">
                    <td class="ps-4 text-muted">↳ {{ sg.name }}</td>
                    <td><code class="small">{{ sg.file_name }}</code></td>
                    <td>{{ sg.max_level }}</td>
                    <td><router-link class="btn btn-sm btn-outline-secondary" :to="{name:'guild-detail',params:{id:sg.id}}">Open</router-link></td>
                </tr>
            </template>
        </tbody>
    </table>
</div>
</template>
