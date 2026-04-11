<script>
import axios from 'axios';
export default {
    name: 'Skills',
    props: { resource: { type: String, default: 'skills' }, label: { type: String, default: 'Skills' } },
    data() {
        return {
            rows: [], q: '', editId: null, draft: {}, helpId: null,
            creating: false, createDraft: { name: '', start_cost: 0, help_text: '' },
        };
    },
    computed: { canEdit() { return this.$root.canEdit; } },
    methods: {
        async load() {
            try { this.rows = (await axios.get('/api/game/' + this.resource, { params: { q: this.q } })).data.data; }
            catch (e) { this.$root.flashError(e); }
        },
        async loadOne(id) {
            const r = await axios.get('/api/game/' + this.resource + '/' + id);
            return r.data.data;
        },
        startCreate() { this.creating = true; this.createDraft = { name: '', start_cost: 0, help_text: '' }; this.editId = null; },
        cancelCreate() { this.creating = false; },
        async create() {
            try {
                const r = await axios.post('/api/game/' + this.resource, {
                    name: this.createDraft.name,
                    start_cost: parseInt(this.createDraft.start_cost, 10) || 0,
                    help_text: this.createDraft.help_text || null,
                });
                if (r.data.ok) { this.$root.flashMsg('Created'); this.cancelCreate(); await this.load(); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
        async startEdit(row) { this.editId = row.id; this.draft = await this.loadOne(row.id); this.creating = false; },
        cancel() { this.editId = null; this.draft = {}; },
        async save() {
            try {
                const r = await axios.post('/api/game/' + this.resource + '/' + this.editId, {
                    name: this.draft.name,
                    start_cost: parseInt(this.draft.start_cost, 10) || 0,
                    help_text: this.draft.help_text,
                });
                if (r.data.ok) { this.$root.flashMsg('Saved'); this.cancel(); await this.load(); }
            } catch (e) { this.$root.flashError(e); }
        },
        async del(row) {
            if (!confirm(`Delete "${row.name}"?`)) return;
            try { await axios.delete('/api/game/' + this.resource + '/' + row.id); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        async showHelp(row) {
            if (this.helpId === row.id) { this.helpId = null; return; }
            const full = await this.loadOne(row.id);
            row.help_text = full.help_text;
            this.helpId = row.id;
        },
    },
    mounted() { this.load(); },
    watch: { q() { this.load(); }, resource() { this.load(); } },
};
</script>
<template>
<div>
    <h2>{{ label }}</h2>
    <div class="mb-2 d-flex gap-2">
        <input class="form-control form-control-sm" style="max-width:20em;" :placeholder="'Search ' + label.toLowerCase()" v-model="q">
        <button v-if="canEdit" class="btn btn-sm btn-success" @click="startCreate">+ New {{ label.slice(0,-1).toLowerCase() }}</button>
    </div>

    <div v-if="creating && canEdit" class="card mb-3"><div class="card-body">
        <h5 class="card-title">New {{ label.slice(0,-1).toLowerCase() }}</h5>
        <div class="row g-2">
            <div class="col-md-4"><label class="form-label small">Name</label><input class="form-control form-control-sm" v-model="createDraft.name"></div>
            <div class="col-md-2"><label class="form-label small">Start cost</label><input class="form-control form-control-sm" v-model.number="createDraft.start_cost"></div>
            <div class="col-12"><label class="form-label small">Help text</label><textarea class="form-control form-control-sm" rows="4" v-model="createDraft.help_text"></textarea></div>
        </div>
        <div class="mt-2">
            <button class="btn btn-sm btn-primary me-1" @click="create">Create</button>
            <button class="btn btn-sm btn-secondary" @click="cancelCreate">Cancel</button>
        </div>
    </div></div>

    <table class="table table-sm table-striped table-hover align-middle">
        <thead><tr><th>Name</th><th style="width:10em;">Start cost</th><th>Help</th><th v-if="canEdit"></th></tr></thead>
        <tbody>
            <template v-for="r in rows" :key="r.id">
                <tr>
                    <td>{{ r.name }}</td>
                    <td>{{ r.start_cost }}</td>
                    <td><button class="btn btn-sm btn-outline-secondary py-0" @click="showHelp(r)">{{ helpId === r.id ? '−' : '+' }}</button></td>
                    <td v-if="canEdit">
                        <button class="btn btn-sm btn-outline-primary me-1" @click="startEdit(r)">Edit</button>
                        <button class="btn btn-sm btn-outline-danger" @click="del(r)">Del</button>
                    </td>
                </tr>
                <tr v-if="helpId === r.id && r.help_text"><td :colspan="4"><pre class="small mb-0">{{ r.help_text }}</pre></td></tr>
                <tr v-if="editId === r.id && canEdit"><td :colspan="4">
                    <div class="row g-2">
                        <div class="col-md-4"><label class="form-label small">Name</label><input class="form-control form-control-sm" v-model="draft.name"></div>
                        <div class="col-md-2"><label class="form-label small">Start cost</label><input class="form-control form-control-sm" v-model.number="draft.start_cost"></div>
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
