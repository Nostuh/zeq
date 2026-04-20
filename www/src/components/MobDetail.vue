<script>
import axios from 'axios';
import MobHistory from './MobHistory.vue';
import MobAsciiEditor from './MobAsciiEditor.vue';

const DAMAGE_TYPES = ['physical', 'magical', 'fire', 'cold', 'electric', 'poison', 'acid', 'asphyxiation', 'psionic'];
const DAMAGE_LABELS = {
    physical: 'Phys', magical: 'Mag', fire: 'Fire', cold: 'Cold',
    electric: 'Elec', poison: 'Pois', acid: 'Acid',
    asphyxiation: 'Asph', psionic: 'Psi',
};

export default {
    name: 'MobDetail',
    components: { MobHistory, MobAsciiEditor },
    props: ['id'],
    data() {
        return {
            mob: null,
            loading: true,
            editing: null,
            draft: {},
            resistDraft: [],
            showHistory: false,
            isNew: false,
            imageFiles: [],
            uploading: false,
            // Collapsed add forms
            showAddProt: false,
            showAddGuild: false,
            showAddLoot: false,
            newProt: { prot_type: '', priority: 'required', notes: '' },
            newGuild: { guild_name: '', role: '', notes: '' },
            newLoot: { item_name: '', slot: '' },
            editingMap: null,
            DAMAGE_TYPES,
            DAMAGE_LABELS,
        };
    },
    computed: {
        canEdit() { return this.$root.canEditEq; },
        resistMap() {
            if (!this.mob || !this.mob.resistances) return {};
            const m = {};
            for (const r of this.mob.resistances) m[r.damage_type] = r;
            return m;
        },
    },
    methods: {
        async load() {
            if (this.id === 'new') {
                this.isNew = true;
                this.mob = {
                    name: '', short_name: '', area: '', exp_value: null,
                    is_undead: false, is_aggro: false,
                    directions: '', directions_back: '', kill_strategy: '', notes: '',
                    version: 1, resistances: [], prots: [], guilds: [], loot: [], images: [], maps: [],
                };
                this.editing = 'info';
                this.draft = { ...this.mob };
                this.loading = false;
                return;
            }
            this.loading = true;
            try {
                const r = await axios.get('/api/mobs/' + this.id);
                this.mob = r.data.data;
            } catch (e) {
                this.$root.flashError(e);
                this.$router.push({ name: 'mobs' });
                return;
            }
            this.loading = false;
        },
        startEdit(section) {
            this.editing = section;
            if (section === 'info') {
                this.draft = {
                    name: this.mob.name,
                    short_name: this.mob.short_name || '',
                    area: this.mob.area || '',
                    exp_value: this.mob.exp_value,
                    is_undead: !!this.mob.is_undead,
                    is_aggro: !!this.mob.is_aggro,
                    directions: this.mob.directions || '',
                    directions_back: this.mob.directions_back || '',
                    kill_strategy: this.mob.kill_strategy || '',
                    notes: this.mob.notes || '',
                };
            } else if (section === 'resistances') {
                this.resistDraft = DAMAGE_TYPES.map(dt => {
                    const existing = this.resistMap[dt];
                    return {
                        damage_type: dt,
                        value: existing ? existing.value : null,
                        notes: existing ? existing.notes || '' : '',
                    };
                });
            }
        },
        cancelEdit() { this.editing = null; this.draft = {}; },
        async saveInfo() {
            try {
                if (this.isNew) {
                    const r = await axios.post('/api/mobs', this.draft);
                    if (r.data.ok) {
                        this.$root.flashMsg('Mob created');
                        this.$router.push({ name: 'mob-detail', params: { id: r.data.data.id } });
                        return;
                    }
                } else {
                    this.draft.version = this.mob.version;
                    const r = await axios.post('/api/mobs/' + this.mob.id, this.draft);
                    if (r.data.ok) {
                        this.$root.flashMsg('Saved');
                        this.editing = null;
                        await this.load();
                    }
                }
            } catch (e) {
                if (e.response && e.response.status === 409) {
                    this.$root.flashMsg(e.response.data.error, 'danger');
                } else { this.$root.flashError(e); }
            }
        },
        async saveResistances() {
            try {
                await axios.post('/api/mobs/' + this.mob.id + '/resistances', { resistances: this.resistDraft });
                this.$root.flashMsg('Resistances saved');
                this.editing = null;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async addProt() {
            if (!this.newProt.prot_type) return;
            try {
                await axios.post('/api/mobs/' + this.mob.id + '/prots', this.newProt);
                this.$root.flashMsg('Added');
                this.newProt = { prot_type: '', priority: 'required', notes: '' };
                this.showAddProt = false;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async deleteProt(p) {
            if (!confirm('Remove "' + p.prot_type + '"?')) return;
            await axios.delete('/api/mobs/' + this.mob.id + '/prots/' + p.id);
            this.$root.flashMsg('Removed');
            await this.load();
        },
        async addGuild() {
            if (!this.newGuild.guild_name) return;
            try {
                await axios.post('/api/mobs/' + this.mob.id + '/guilds', this.newGuild);
                this.$root.flashMsg('Added');
                this.newGuild = { guild_name: '', role: '', notes: '' };
                this.showAddGuild = false;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async deleteGuild(g) {
            if (!confirm('Remove "' + g.guild_name + '"?')) return;
            await axios.delete('/api/mobs/' + this.mob.id + '/guilds/' + g.id);
            this.$root.flashMsg('Removed');
            await this.load();
        },
        async addLoot() {
            if (!this.newLoot.item_name) return;
            try {
                await axios.post('/api/mobs/' + this.mob.id + '/loot', this.newLoot);
                this.$root.flashMsg('Added');
                this.newLoot = { item_name: '', slot: '' };
                this.showAddLoot = false;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async deleteLoot(l) {
            if (!confirm('Remove "' + l.item_name + '"?')) return;
            await axios.delete('/api/mobs/' + this.mob.id + '/loot/' + l.id);
            this.$root.flashMsg('Removed');
            await this.load();
        },
        async deleteMob() {
            if (!confirm('Delete mob "' + this.mob.name + '"? This cannot be undone.')) return;
            await axios.delete('/api/mobs/' + this.mob.id);
            this.$root.flashMsg('Mob deleted');
            this.$router.push({ name: 'mobs' });
        },
        onImageSelect(e) { this.imageFiles = Array.from(e.target.files || []); },
        async uploadImages() {
            if (!this.imageFiles.length) return;
            this.uploading = true;
            const images = [];
            for (const file of this.imageFiles) {
                const buf = await file.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                images.push({ filename: file.name, data_base64: base64, section: 'general' });
            }
            try {
                await axios.post('/api/mobs/' + this.mob.id + '/images', { images });
                this.$root.flashMsg('Uploaded');
                this.imageFiles = [];
                await this.load();
            } catch (e) { this.$root.flashError(e); }
            this.uploading = false;
        },
        async deleteImage(img) {
            if (!confirm('Delete image?')) return;
            await axios.delete('/api/mobs/' + this.mob.id + '/images/' + img.id);
            this.$root.flashMsg('Deleted');
            await this.load();
        },
        imageUrl(img) { return '/api/mobs/' + this.mob.id + '/images/' + img.id; },
        openMapEditor(map) {
            this.editingMap = map || { title: '', ascii_content: '', notes: '', area_name: '' };
        },
        async saveMap(mapData) {
            const payload = { ...mapData };
            if (this.editingMap && this.editingMap.id) payload.map_id = this.editingMap.id;
            await axios.post('/api/mobs/' + this.mob.id + '/maps', payload);
            this.$root.flashMsg('Map saved');
            this.editingMap = null;
            await this.load();
        },
        async deleteMap(m) {
            if (!confirm('Delete map "' + m.title + '"?')) return;
            await axios.delete('/api/mobs/' + this.mob.id + '/maps/' + m.id);
            this.$root.flashMsg('Deleted');
            await this.load();
        },
        fmtExp(v) {
            if (!v) return 'Unknown';
            return Number(v).toLocaleString();
        },
        resistClass(val) {
            if (val == null) return '';
            return 'mob-resist-' + Math.min(Math.max(val, 1), 8);
        },
    },
    watch: { id() { this.editing = null; this.load(); } },
    mounted() { this.load(); },
};
</script>
<template>
<div v-if="loading" class="text-muted p-3">Loading...</div>
<div v-else-if="mob" class="mob-detail">

    <!-- Header -->
    <div class="d-flex align-items-center mb-3 flex-wrap gap-2">
        <router-link :to="{name:'mobs'}" class="btn btn-sm btn-outline-secondary">&larr; Back</router-link>
        <h2 class="mb-0 flex-grow-1">{{ mob.name }}</h2>
        <span v-if="mob.is_aggro" class="badge bg-danger">AGR</span>
        <span v-if="mob.is_undead" class="badge bg-secondary">UND</span>
        <span v-if="mob.exp_value" class="badge bg-info text-dark">{{ fmtExp(mob.exp_value) }} xp</span>
        <button v-if="canEdit && !isNew" class="btn btn-sm btn-outline-primary" @click="startEdit('info')">Edit</button>
        <button v-if="canEdit && !isNew" class="btn btn-sm btn-outline-info" @click="showHistory = !showHistory">History</button>
        <button v-if="canEdit && !isNew" class="btn btn-sm btn-outline-danger" @click="deleteMob">Delete</button>
    </div>

    <!-- Edit Info Form (full width overlay) -->
    <div v-if="editing === 'info'" class="card mb-3">
        <div class="card-body">
            <h5 class="card-title">{{ isNew ? 'New Mob' : 'Edit Info' }}</h5>
            <div class="row g-2 mb-2">
                <div class="col-md-4">
                    <label class="form-label small">Name</label>
                    <input class="form-control form-control-sm" v-model="draft.name">
                </div>
                <div class="col-md-3">
                    <label class="form-label small">Short Name</label>
                    <input class="form-control form-control-sm" v-model="draft.short_name">
                </div>
                <div class="col-md-3">
                    <label class="form-label small">Area</label>
                    <input class="form-control form-control-sm" v-model="draft.area">
                </div>
                <div class="col-md-2">
                    <label class="form-label small">Exp</label>
                    <input type="number" class="form-control form-control-sm" v-model.number="draft.exp_value">
                </div>
            </div>
            <div class="d-flex gap-3 mb-2">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" v-model="draft.is_aggro" id="aggro">
                    <label class="form-check-label" for="aggro">Aggressive</label>
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" v-model="draft.is_undead" id="undead">
                    <label class="form-check-label" for="undead">Undead</label>
                </div>
            </div>
            <div class="mb-2">
                <label class="form-label small">Directions</label>
                <textarea class="form-control form-control-sm font-monospace" rows="3" v-model="draft.directions"></textarea>
            </div>
            <div class="mb-2">
                <label class="form-label small">Directions Back</label>
                <textarea class="form-control form-control-sm font-monospace" rows="2" v-model="draft.directions_back"></textarea>
            </div>
            <div class="mb-2">
                <label class="form-label small">Kill Strategy</label>
                <textarea class="form-control form-control-sm" rows="4" v-model="draft.kill_strategy"></textarea>
            </div>
            <div class="mb-2">
                <label class="form-label small">Notes</label>
                <textarea class="form-control form-control-sm" rows="6" v-model="draft.notes"></textarea>
            </div>
            <button class="btn btn-sm btn-primary me-2" @click="saveInfo">{{ isNew ? 'Create' : 'Save' }}</button>
            <button class="btn btn-sm btn-secondary" @click="cancelEdit">Cancel</button>
        </div>
    </div>

    <!-- Main layout: content left, sidebar right -->
    <template v-if="!isNew && editing !== 'info'">
    <div class="mob-layout">

        <!-- LEFT: Main content (~85%) -->
        <div class="mob-main">

            <!-- Directions -->
            <div class="mob-section" v-if="mob.directions">
                <h6 class="mob-section-title">Directions</h6>
                <pre class="mob-directions">{{ mob.directions }}</pre>
                <div v-if="mob.directions_back">
                    <small class="text-muted fw-bold">Back:</small>
                    <pre class="mob-directions">{{ mob.directions_back }}</pre>
                </div>
            </div>

            <!-- Kill Strategy -->
            <div class="mob-section" v-if="mob.kill_strategy">
                <h6 class="mob-section-title">Kill Strategy</h6>
                <pre class="mob-strategy">{{ mob.kill_strategy }}</pre>
            </div>

            <!-- Notes (the primary content — all imported text lives here) -->
            <div class="mob-section" v-if="mob.notes">
                <h6 class="mob-section-title">Notes</h6>
                <pre class="mob-notes">{{ mob.notes }}</pre>
            </div>

            <!-- ASCII Maps -->
            <div class="mob-section" v-if="mob.maps.length || canEdit">
                <div class="d-flex align-items-center mb-1">
                    <h6 class="mob-section-title mb-0 me-2">Maps</h6>
                    <button v-if="canEdit" class="btn btn-sm btn-outline-primary" @click="openMapEditor(null)">Add</button>
                </div>
                <div v-for="m in mob.maps" :key="m.id" class="mb-2">
                    <div class="d-flex align-items-center mb-1 gap-1">
                        <strong class="small">{{ m.title }}</strong>
                        <button v-if="canEdit" class="btn btn-sm btn-outline-secondary py-0 px-1" @click="openMapEditor(m)">Edit</button>
                        <button v-if="canEdit" class="btn btn-sm btn-outline-danger py-0 px-1" @click="deleteMap(m)">X</button>
                    </div>
                    <pre class="mob-ascii-map">{{ m.ascii_content }}</pre>
                </div>
                <span v-if="!mob.maps.length && !canEdit" class="text-muted small">None</span>
            </div>

            <MobAsciiEditor v-if="editingMap" :initial="editingMap" @save="saveMap" @cancel="editingMap = null" />

            <!-- Images -->
            <div class="mob-section" v-if="mob.images.length || canEdit">
                <h6 class="mob-section-title">Images</h6>
                <div class="mob-image-grid mb-2" v-if="mob.images.length">
                    <div v-for="img in mob.images" :key="img.id" class="mob-image-thumb">
                        <img :src="imageUrl(img)" :alt="img.caption || img.filename" loading="lazy">
                        <button v-if="canEdit" class="btn btn-sm btn-outline-danger mt-1" @click="deleteImage(img)">X</button>
                    </div>
                </div>
                <div v-if="canEdit">
                    <input type="file" class="form-control form-control-sm mb-1" multiple accept="image/jpeg,image/png" @change="onImageSelect">
                    <button v-if="imageFiles.length" class="btn btn-sm btn-primary" @click="uploadImages" :disabled="uploading">
                        {{ uploading ? 'Uploading...' : 'Upload ' + imageFiles.length }}
                    </button>
                </div>
            </div>
        </div>

        <!-- RIGHT: Sidebar (~15%) -->
        <div class="mob-sidebar">

            <!-- Resistances -->
            <div class="mob-sidebar-section">
                <div class="d-flex align-items-center mb-1">
                    <h6 class="mob-section-title mb-0 me-auto">Resists</h6>
                    <button v-if="canEdit" class="btn btn-sm btn-outline-primary py-0 px-1" @click="startEdit('resistances')">Edit</button>
                </div>
                <div v-if="editing === 'resistances'" class="mb-2">
                    <div v-for="r in resistDraft" :key="r.damage_type" class="d-flex align-items-center gap-1 mb-1">
                        <span class="resist-label-sm">{{ DAMAGE_LABELS[r.damage_type] }}</span>
                        <input type="number" min="1" max="8" class="form-control form-control-sm" style="width:3.5em;" v-model.number="r.value">
                    </div>
                    <button class="btn btn-sm btn-primary me-1" @click="saveResistances">Save</button>
                    <button class="btn btn-sm btn-secondary" @click="cancelEdit">X</button>
                </div>
                <div v-else class="mob-resist-compact">
                    <div v-for="dt in DAMAGE_TYPES" :key="dt" class="resist-row" :class="resistClass(resistMap[dt] && resistMap[dt].value)">
                        <span class="resist-label-sm">{{ DAMAGE_LABELS[dt] }}</span>
                        <span class="resist-val">{{ resistMap[dt] && resistMap[dt].value != null ? resistMap[dt].value : '-' }}</span>
                    </div>
                </div>
            </div>

            <!-- Protections -->
            <div class="mob-sidebar-section">
                <div class="d-flex align-items-center mb-1">
                    <h6 class="mob-section-title mb-0 me-auto">Prots</h6>
                    <button v-if="canEdit" class="btn btn-sm btn-outline-primary py-0 px-1" @click="showAddProt = !showAddProt">+</button>
                </div>
                <div v-if="mob.prots.length" class="d-flex flex-wrap gap-1 mb-1">
                    <span v-for="p in mob.prots" :key="p.id"
                          class="badge" :class="p.priority === 'required' ? 'bg-danger' : 'bg-warning text-dark'">
                        {{ p.prot_type }}
                        <span v-if="canEdit" class="ms-1" style="cursor:pointer;" @click="deleteProt(p)">&times;</span>
                    </span>
                </div>
                <div v-else class="text-muted small mb-1">Empty</div>
                <div v-if="showAddProt" class="mt-1">
                    <input class="form-control form-control-sm mb-1" v-model="newProt.prot_type" placeholder="e.g. cold">
                    <select class="form-select form-select-sm mb-1" v-model="newProt.priority">
                        <option value="required">Required</option>
                        <option value="recommended">Recommended</option>
                    </select>
                    <button class="btn btn-sm btn-primary me-1" @click="addProt">Add</button>
                    <button class="btn btn-sm btn-secondary" @click="showAddProt = false">X</button>
                </div>
            </div>

            <!-- Party Guilds -->
            <div class="mob-sidebar-section">
                <div class="d-flex align-items-center mb-1">
                    <h6 class="mob-section-title mb-0 me-auto">Guilds</h6>
                    <button v-if="canEdit" class="btn btn-sm btn-outline-primary py-0 px-1" @click="showAddGuild = !showAddGuild">+</button>
                </div>
                <div v-if="mob.guilds.length">
                    <div v-for="g in mob.guilds" :key="g.id" class="small d-flex align-items-center mb-1">
                        <span class="me-auto">{{ g.guild_name }} <span v-if="g.role" class="text-muted">({{ g.role }})</span></span>
                        <span v-if="canEdit" class="text-danger" style="cursor:pointer;" @click="deleteGuild(g)">&times;</span>
                    </div>
                </div>
                <div v-else class="text-muted small mb-1">Empty</div>
                <div v-if="showAddGuild" class="mt-1">
                    <input class="form-control form-control-sm mb-1" v-model="newGuild.guild_name" placeholder="Guild">
                    <input class="form-control form-control-sm mb-1" v-model="newGuild.role" placeholder="Role">
                    <button class="btn btn-sm btn-primary me-1" @click="addGuild">Add</button>
                    <button class="btn btn-sm btn-secondary" @click="showAddGuild = false">X</button>
                </div>
            </div>

            <!-- Loot -->
            <div class="mob-sidebar-section">
                <div class="d-flex align-items-center mb-1">
                    <h6 class="mob-section-title mb-0 me-auto">Loot</h6>
                    <button v-if="canEdit" class="btn btn-sm btn-outline-primary py-0 px-1" @click="showAddLoot = !showAddLoot">+</button>
                </div>
                <div v-if="mob.loot.length">
                    <div v-for="l in mob.loot" :key="l.id" class="small d-flex align-items-center mb-1">
                        <span class="me-auto">{{ l.item_name }} <span v-if="l.slot" class="text-muted">({{ l.slot }})</span></span>
                        <span v-if="canEdit" class="text-danger" style="cursor:pointer;" @click="deleteLoot(l)">&times;</span>
                    </div>
                </div>
                <div v-else class="text-muted small mb-1">Empty</div>
                <div v-if="showAddLoot" class="mt-1">
                    <input class="form-control form-control-sm mb-1" v-model="newLoot.item_name" placeholder="Item name">
                    <input class="form-control form-control-sm mb-1" v-model="newLoot.slot" placeholder="Slot">
                    <button class="btn btn-sm btn-primary me-1" @click="addLoot">Add</button>
                    <button class="btn btn-sm btn-secondary" @click="showAddLoot = false">X</button>
                </div>
            </div>

        </div><!-- /sidebar -->
    </div><!-- /mob-layout -->

    <MobHistory v-if="showHistory" :mob-id="mob.id" />
    </template>
</div>
</template>
