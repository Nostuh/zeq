<script>
import axios from 'axios';
import MobHistory from './MobHistory.vue';
import MobAsciiEditor from './MobAsciiEditor.vue';
import ItemDetailModal from './ItemDetailModal.vue';
import EqScoringHelp from './EqScoringHelp.vue';

const DAMAGE_TYPES = ['physical', 'magical', 'fire', 'cold', 'electric', 'poison', 'acid', 'asphyxiation', 'psionic'];
const DAMAGE_LABELS = {
    physical: 'Phys', magical: 'Mag', fire: 'Fire', cold: 'Cold',
    electric: 'Elec', poison: 'Pois', acid: 'Acid',
    asphyxiation: 'Asph', psionic: 'Psi',
};

// Loot table stat columns, in the equipment catalog's order and with its
// labels. Only columns where at least one of this mob's drops is non-zero
// are shown, so a mob that drops two cloaks doesn't get 25 blank columns.
const RESIST_KEYS = ['rphys', 'rpsi', 'relec', 'rmag', 'rpoi', 'rfire', 'rcold', 'racid', 'rasphx', 'rshadow'];
const LOOT_STATS = [
    ['weapon_class_value', 'WpnCls'], ['dmg', 'Dmg'], ['ac', 'Ac'],
    ['str', 'Str'], ['con', 'Con'], ['dex', 'Dex'], ['int', 'Int'], ['wis', 'Wis'], ['cha', 'Cha'],
    ['hpr', 'Hpr'], ['spr', 'Spr'], ['hp', 'Hp'], ['sp', 'Sp'],
    ['rphys', 'Phys'], ['rpsi', 'Psi'], ['relec', 'Elec'], ['rmag', 'Mag'], ['rpoi', 'Poi'],
    ['rfire', 'Fire'], ['rcold', 'Cold'], ['racid', 'Acid'], ['rasphx', 'Asph'], ['rshadow', 'Shdw'],
    ['rtot', 'ΣRes'],
];

// Reference sections below the loot. Collapsed by default so the page
// opens on what you need for the kill (resists, prots, drops); which ones
// a viewer opens is remembered in their browser across mobs.
const FOLDS_KEY = 'zeq_mob_folds';
function loadFolds() {
    try { return JSON.parse(localStorage.getItem(FOLDS_KEY)) || {}; } catch (e) { return {}; }
}

export default {
    name: 'MobDetail',
    components: { MobHistory, MobAsciiEditor, ItemDetailModal, EqScoringHelp },
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
            newLoot: { item_name: '', slot: '', equipment_id: null },
            newLootResults: [],
            // Equipment cross-link state: the item detail modal + the
            // per-loot-row binder typeahead (link a free-text loot row to a
            // catalog item without leaving the page).
            modalItemId: null,
            linkingLootId: null,
            lootQuery: '',
            lootResults: [],
            editingMap: null,
            // Loot table sort: null key = the stored loot order.
            lootSort: { key: null, dir: 1 },
            folds: loadFolds(),
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
        linkedLootCount() {
            return this.mob ? this.mob.loot.filter(l => l.equipment_id).length : 0;
        },
        lootCols() {
            if (!this.mob) return [];
            return LOOT_STATS
                .filter(([k]) => this.mob.loot.some(l => this.statNum(l, k) !== 0))
                .map(([key, label]) => ({ key, label }));
        },
        lootHasBonuses() {
            return !!this.mob && this.mob.loot.some(l => l.bonus_summary);
        },
        // Every column, for the binder row's colspan.
        lootColspan() {
            return 2 + this.lootCols.length + (this.lootHasBonuses ? 1 : 0) + (this.canEdit ? 1 : 0);
        },
        sortedLoot() {
            if (!this.mob) return [];
            const { key, dir } = this.lootSort;
            if (!key) return this.mob.loot;
            const val = key === 'name' ? (l) => (l.eq_name || l.item_name || '').toLowerCase()
                : key === 'slot' ? (l) => this.lootSlot(l).toLowerCase()
                : (l) => this.statNum(l, key);
            return [...this.mob.loot].sort((a, b) => {
                const x = val(a), y = val(b);
                return (x < y ? -1 : x > y ? 1 : 0) * dir;
            });
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
                this.$root.flashMsg(this.newLoot.equipment_id ? 'Added + linked to catalog' : 'Added (free text — not in catalog)');
                this.newLoot = { item_name: '', slot: '', equipment_id: null };
                this.newLootResults = [];
                this.showAddLoot = false;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        // Add-form typeahead: typing searches the equipment catalog; picking
        // a result fills the name AND links the new loot row to that item.
        // Typing again after a pick clears the link (the text no longer
        // matches a catalog row we chose).
        async searchNewLoot() {
            this.newLoot.equipment_id = null;
            const q = this.newLoot.item_name.trim();
            if (!q) { this.newLootResults = []; return; }
            const seq = (this._newLootSeq = (this._newLootSeq || 0) + 1);
            try {
                const r = await axios.get('/api/mobs/eq-items', { params: { q } });
                if (seq !== this._newLootSeq) return;
                this.newLootResults = (r.data && r.data.data) || [];
            } catch (e) { if (seq === this._newLootSeq) this.newLootResults = []; }
        },
        pickNewLoot(it) {
            this.newLoot.item_name = it.name;
            this.newLoot.equipment_id = it.id;
            if (!this.newLoot.slot) this.newLoot.slot = it.wear_slot || '';
            this.newLootResults = [];
        },
        async deleteLoot(l) {
            if (!confirm('Remove "' + l.item_name + '"?')) return;
            await axios.delete('/api/mobs/' + this.mob.id + '/loot/' + l.id);
            this.$root.flashMsg('Removed');
            await this.load();
        },
        // --- Loot ↔ equipment binder ---
        startLinkLoot(l) {
            this.linkingLootId = l.id;
            this.lootQuery = l.item_name;
            this.searchLootItems();
        },
        cancelLinkLoot() { this.linkingLootId = null; this.lootQuery = ''; this.lootResults = []; },
        async searchLootItems() {
            const q = this.lootQuery.trim();
            if (!q) { this.lootResults = []; return; }
            // Guard against out-of-order responses: only the latest
            // keystroke's results may land (same pattern in searchNewLoot).
            const seq = (this._lootSeq = (this._lootSeq || 0) + 1);
            try {
                const r = await axios.get('/api/mobs/eq-items', { params: { q } });
                if (seq !== this._lootSeq) return;
                this.lootResults = (r.data && r.data.data) || [];
            } catch (e) { if (seq === this._lootSeq) this.lootResults = []; }
        },
        async setLootLink(l, item) {
            // Unlink is confirmable — a linked row silently degrading back to
            // free text on a stray click was too easy to hit.
            if (!item && !confirm('Unlink "' + (l.eq_name || l.item_name) + '" from the equipment catalog?\nThe loot row stays as plain text.')) return;
            try {
                await axios.post('/api/mobs/' + this.mob.id + '/loot/' + l.id, {
                    item_name: l.item_name, slot: l.slot, sort_order: l.sort_order,
                    equipment_id: item ? item.id : null,
                });
                this.$root.flashMsg(item ? 'Linked to ' + item.name : 'Unlinked');
                this.cancelLinkLoot();
                await this.load();
            } catch (e) { this.$root.flashError(e); }
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
        // --- Loot stats table ---
        // Numeric value of a stat column for sorting / column pruning. Free
        // text rows carry NULL stats → 0.
        statNum(l, key) {
            if (key === 'dmg') return Number(l.dmg_pct) || 0;
            if (key === 'rtot') return RESIST_KEYS.reduce((a, k) => a + (Number(l[k]) || 0), 0);
            return Number(l[key]) || 0;
        },
        // Cell text: blank for zero so the dense table stays readable (same
        // rule as the equipment catalog).
        statCell(l, key) {
            const n = this.statNum(l, key);
            if (!n) return '';
            if (key === 'dmg') return `${n}% ${l.dmg_type || ''}`.trim();
            return n;
        },
        // Catalog slot display (weapon class / shield / 2h suffix, as in the
        // equipment list), falling back to the loot row's own slot text.
        lootSlot(l) {
            if (!l.equipment_id) return l.slot || '';
            let slot = l.eq_wear_slot || l.slot || '';
            if (l.weapon_class) slot += ` (${l.weapon_class}${l.hands == 2 ? ' 2h' : ''})`;
            else if (l.is_shield) slot += ' (shield)';
            else if (l.hands == 2) slot += ' (2h)';
            return slot;
        },
        // Click a header: stats sort highest first, text columns A→Z; a
        // second click flips the direction.
        sortLoot(key) {
            if (this.lootSort.key === key) this.lootSort.dir = -this.lootSort.dir;
            else this.lootSort = { key, dir: key === 'name' || key === 'slot' ? 1 : -1 };
        },
        sortMark(key) {
            if (this.lootSort.key !== key) return '';
            return this.lootSort.dir > 0 ? '▲' : '▼';
        },
        // --- Collapsible sections ---
        // <details> owns its open state; @toggle copies it back, so the
        // bound value always matches the DOM (no checkbox-style desync).
        onFold(name, e) {
            const open = e.target.open;
            if (!!this.folds[name] === open) return;
            this.folds = { ...this.folds, [name]: open };
            try { localStorage.setItem(FOLDS_KEY, JSON.stringify(this.folds)); } catch (err) { /* private mode etc. */ }
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
        <h2 class="mb-0 flex-grow-1">{{ mob.name }}
            <small v-if="mob.short_name" class="text-muted fs-6">aka {{ mob.short_name }}</small>
        </h2>
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

    <!-- Layout, top to bottom: what you need for the kill (resists, prots,
         guilds), then every drop with its stats, then the long reference
         material (directions, notes, maps, images) folded away. -->
    <template v-if="!isNew && editing !== 'info'">

    <!-- Overview: resists / prots / guilds -->
    <div class="mob-overview">
        <section class="mob-panel mob-panel-resists">
            <div class="d-flex align-items-center mb-1">
                <h6 class="mob-section-title mb-0 me-auto">Resists</h6>
                <button v-if="canEdit && editing !== 'resistances'" class="btn btn-sm btn-outline-primary py-0 px-1" @click="startEdit('resistances')">Edit</button>
            </div>
            <div v-if="editing === 'resistances'">
                <div class="mob-resist-strip mb-1">
                    <label v-for="r in resistDraft" :key="r.damage_type" class="mob-resist-tile">
                        <span class="mob-resist-lbl">{{ DAMAGE_LABELS[r.damage_type] }}</span>
                        <input type="number" min="1" max="8" class="form-control form-control-sm text-center px-0" v-model.number="r.value">
                    </label>
                </div>
                <button class="btn btn-sm btn-primary me-1" @click="saveResistances">Save</button>
                <button class="btn btn-sm btn-secondary" @click="cancelEdit">Cancel</button>
            </div>
            <div v-else class="mob-resist-strip">
                <div v-for="dt in DAMAGE_TYPES" :key="dt" class="mob-resist-tile"
                     :class="resistClass(resistMap[dt] && resistMap[dt].value)">
                    <span class="mob-resist-lbl">{{ DAMAGE_LABELS[dt] }}</span>
                    <span class="mob-resist-num">{{ resistMap[dt] && resistMap[dt].value != null ? resistMap[dt].value : '-' }}</span>
                </div>
            </div>
            <!-- Raw KYA captures for this mob (name-string match) -->
            <router-link v-if="mob.kya && mob.kya.count && $root.canLookups"
                         class="small d-inline-block mt-1"
                         :to="{ name: 'kya', query: { name: mob.kya.matched_name } }">
                KYA Lookup ({{ mob.kya.count }} raw entr{{ mob.kya.count > 1 ? 'ies' : 'y' }}) &rarr;
            </router-link>
        </section>

        <!-- Protections -->
        <section class="mob-panel">
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
                <input class="form-control form-control-sm mb-1" v-model="newProt.prot_type" maxlength="255" placeholder="e.g. cold, or 'G-physical / Lpsionic / Iron will'">
                <select class="form-select form-select-sm mb-1" v-model="newProt.priority">
                    <option value="required">Required</option>
                    <option value="recommended">Recommended</option>
                </select>
                <button class="btn btn-sm btn-primary me-1" @click="addProt">Add</button>
                <button class="btn btn-sm btn-secondary" @click="showAddProt = false">X</button>
            </div>
        </section>

        <!-- Party Guilds -->
        <section class="mob-panel">
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
        </section>
    </div>

    <!-- Loot: every drop with its catalog stats, side by side -->
    <section class="mob-section">
        <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
            <h6 class="mob-section-title mb-0">Loot</h6>
            <span v-if="mob.loot.length" class="small text-muted">
                {{ mob.loot.length }} drop{{ mob.loot.length === 1 ? '' : 's' }}<template
                    v-if="linkedLootCount < mob.loot.length">, {{ linkedLootCount }} with stats</template>
            </span>
            <button v-if="canEdit" class="btn btn-sm btn-outline-primary py-0 px-1" @click="showAddLoot = !showAddLoot">+</button>
            <span class="ms-auto d-flex align-items-center flex-wrap gap-2 small">
                <EqScoringHelp v-if="linkedLootCount" small />
                <!-- Jump to the equipment list filtered to this mob's drops -->
                <router-link v-if="$root.canEquipment && linkedLootCount"
                             :to="{ name: 'equipment-all', query: { mob: mob.id } }">
                    Browse in Equipment &rarr;
                </router-link>
            </span>
        </div>

        <div v-if="showAddLoot" class="mb-2 mob-loot-binder mob-loot-add">
            <input class="form-control form-control-sm mb-1" v-model="newLoot.item_name"
                   @input="searchNewLoot" placeholder="Type to search the catalog…">
            <div v-if="newLootResults.length" class="mob-loot-results small mb-1">
                <a v-for="it in newLootResults" :key="it.id" href="#" class="d-block px-1"
                   @click.prevent="pickNewLoot(it)">
                    {{ it.name }} <span class="text-muted">({{ it.wear_slot }}<template v-if="it.weapon_class"> {{ it.weapon_class }}</template>)</span>
                </a>
            </div>
            <div class="small mb-1">
                <template v-if="newLoot.equipment_id">
                    <i class="bi bi-box-seam text-success"></i> Will be linked to this catalog item.
                </template>
                <template v-else-if="newLoot.item_name.trim()">
                    <span class="text-muted">No catalog pick — will be added as plain text.</span>
                </template>
            </div>
            <!-- No slot input: a catalog pick brings its own wear slot
                 (auto-filled in pickNewLoot); free-text rows don't need one. -->
            <button class="btn btn-sm btn-primary me-1" @click="addLoot">Add</button>
            <button class="btn btn-sm btn-secondary" @click="showAddLoot = false">X</button>
        </div>

        <!-- Own horizontal scroll box: with many stat columns the table is
             wider than a phone. No sticky header, so overflow-x here is
             safe (docs/gotchas.md); the Item column sticks LEFT instead. -->
        <div v-if="mob.loot.length" class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0 mob-loot-table">
            <thead>
                <tr>
                    <th class="mob-loot-name" @click="sortLoot('name')">Item {{ sortMark('name') }}</th>
                    <th @click="sortLoot('slot')">Slot {{ sortMark('slot') }}</th>
                    <th v-for="c in lootCols" :key="c.key" class="text-end" @click="sortLoot(c.key)">{{ c.label }}{{ sortMark(c.key) }}</th>
                    <th v-if="lootHasBonuses" class="mob-loot-bonus mob-loot-nosort">Bonuses</th>
                    <th v-if="canEdit" class="mob-loot-nosort"></th>
                </tr>
            </thead>
            <tbody>
                <template v-for="l in sortedLoot" :key="l.id">
                <tr>
                    <td class="mob-loot-name">
                        <!-- Linked to the equipment catalog → open the item modal -->
                        <template v-if="l.equipment_id">
                            <a href="#" @click.prevent="modalItemId = l.equipment_id">{{ l.eq_name || l.item_name }}</a>
                        </template>
                        <template v-else>
                            {{ l.item_name }}
                            <span class="text-muted small" title="Free text — not linked to the equipment catalog, so no stats">(no stats)</span>
                        </template>
                    </td>
                    <td class="text-nowrap">{{ lootSlot(l) }}</td>
                    <td v-for="c in lootCols" :key="c.key" class="text-end text-nowrap"
                        :class="{ 'text-danger': statNum(l, c.key) < 0 }">{{ statCell(l, c.key) }}</td>
                    <td v-if="lootHasBonuses" class="small mob-loot-bonus">{{ l.bonus_summary }}</td>
                    <td v-if="canEdit" class="text-nowrap text-end">
                        <i v-if="!l.equipment_id" class="bi bi-link-45deg text-primary me-1"
                           style="cursor:pointer" title="Link this text to an equipment catalog item"
                           @click="linkingLootId === l.id ? cancelLinkLoot() : startLinkLoot(l)"></i>
                        <i v-if="l.equipment_id" class="bi bi-x-diamond text-warning me-1"
                           style="cursor:pointer" title="Unlink from the equipment catalog (keeps the text row)"
                           @click="setLootLink(l, null)"></i>
                        <span class="text-danger" style="cursor:pointer;" title="Remove this drop" @click="deleteLoot(l)">&times;</span>
                    </td>
                </tr>
                <!-- Inline binder typeahead -->
                <tr v-if="linkingLootId === l.id">
                    <td :colspan="lootColspan">
                        <div class="mob-loot-binder mob-loot-add small">
                            <input class="form-control form-control-sm mb-1" v-model="lootQuery"
                                   @input="searchLootItems" placeholder="Search catalog items…">
                            <div v-if="lootResults.length" class="mob-loot-results">
                                <a v-for="it in lootResults" :key="it.id" href="#" class="d-block px-1"
                                   @click.prevent="setLootLink(l, it)">
                                    {{ it.name }} <span class="text-muted">({{ it.wear_slot }}<template v-if="it.weapon_class"> {{ it.weapon_class }}</template>)</span>
                                </a>
                            </div>
                            <div v-else-if="lootQuery.trim()" class="text-muted">No catalog match.</div>
                        </div>
                    </td>
                </tr>
                </template>
            </tbody>
        </table>
        </div>
        <div v-else class="text-muted small">Empty</div>
    </section>

    <!-- Reference material, folded (open state remembered per browser) -->
    <details v-if="mob.directions || mob.directions_back" class="mob-fold"
             :open="!!folds.directions" @toggle="onFold('directions', $event)">
        <summary class="mob-section-title">Directions</summary>
        <pre v-if="mob.directions" class="mob-directions">{{ mob.directions }}</pre>
        <div v-if="mob.directions_back">
            <small class="text-muted fw-bold">Back:</small>
            <pre class="mob-directions">{{ mob.directions_back }}</pre>
        </div>
    </details>

    <details v-if="mob.kill_strategy" class="mob-fold"
             :open="!!folds.strategy" @toggle="onFold('strategy', $event)">
        <summary class="mob-section-title">Kill Strategy</summary>
        <pre class="mob-strategy">{{ mob.kill_strategy }}</pre>
    </details>

    <!-- Notes (the primary content — all imported text lives here) -->
    <details v-if="mob.notes" class="mob-fold"
             :open="!!folds.notes" @toggle="onFold('notes', $event)">
        <summary class="mob-section-title">Notes</summary>
        <pre class="mob-notes">{{ mob.notes }}</pre>
    </details>

    <!-- ASCII Maps -->
    <details v-if="mob.maps.length || canEdit" class="mob-fold"
             :open="!!folds.maps" @toggle="onFold('maps', $event)">
        <summary class="mob-section-title">Maps <span class="mob-fold-count">({{ mob.maps.length }})</span></summary>
        <button v-if="canEdit && !editingMap" class="btn btn-sm btn-outline-primary mb-2" @click="openMapEditor(null)">Add map</button>
        <div v-for="m in mob.maps" :key="m.id" class="mb-2">
            <div class="d-flex align-items-center mb-1 gap-1">
                <strong class="small">{{ m.title }}</strong>
                <button v-if="canEdit" class="btn btn-sm btn-outline-secondary py-0 px-1" @click="openMapEditor(m)">Edit</button>
                <button v-if="canEdit" class="btn btn-sm btn-outline-danger py-0 px-1" @click="deleteMap(m)">X</button>
            </div>
            <pre class="mob-ascii-map">{{ m.ascii_content }}</pre>
        </div>
        <MobAsciiEditor v-if="editingMap" :initial="editingMap" @save="saveMap" @cancel="editingMap = null" />
    </details>

    <!-- Images -->
    <details v-if="mob.images.length || canEdit" class="mob-fold"
             :open="!!folds.images" @toggle="onFold('images', $event)">
        <summary class="mob-section-title">Images <span class="mob-fold-count">({{ mob.images.length }})</span></summary>
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
    </details>
    <MobHistory v-if="showHistory" :mob-id="mob.id" />
    </template>

    <ItemDetailModal :item-id="modalItemId" @close="modalItemId = null" @changed="load()" />
</div>
</template>
