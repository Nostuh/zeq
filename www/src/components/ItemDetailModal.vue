<script>
// Item detail modal — the shared "view an item" panel used by the
// Equipment list, the EQ Builder picks, and the Mob KB loot lists.
// Shows every parsed stat PLUS the raw identify/lookup text the parser
// consumed (eq_items.raw_info), and the cross-link context: which Mob KB
// mobs drop the item, what else those mobs drop, and whether KYA data
// exists for them. Flags gate the JUMP LINKS, not the read-only info —
// the payload behind this (GET /api/equipment/items/:id) accepts any
// equipment or eqmobs flag. See docs/equipment-redesign.md.
//
// Props: itemId (null = hidden). Emits: close, changed (parent should
// refetch its list after ownership/link/note edits).
import axios from 'axios';

const STAT_LABELS = [
    ['str', 'Str'], ['con', 'Con'], ['dex', 'Dex'], ['int', 'Int'],
    ['wis', 'Wis'], ['cha', 'Cha'], ['hpr', 'Hpr'], ['spr', 'Spr'],
    ['hp', 'Hp'], ['sp', 'Sp'], ['ac', 'Ac'],
    ['rphys', 'Phys'], ['rpsi', 'Psi'], ['relec', 'Elec'], ['rmag', 'Mag'],
    ['rpoi', 'Poi'], ['rfire', 'Fire'], ['rcold', 'Cold'], ['racid', 'Acid'],
    ['rasphx', 'Asph'], ['rshadow', 'Shdw'],
];

export default {
    name: 'ItemDetailModal',
    props: {
        itemId: { type: Number, default: null },
    },
    emits: ['close', 'changed'],
    data() {
        return {
            currentId: null,
            backStack: [],       // in-modal navigation history (sibling jumps)
            item: null,
            loading: false,
            error: null,
            // editor state
            noteDraft: '',
            savingNote: false,
            mobQuery: '',
            mobResults: [],
            linking: false,
            showRepaste: false,
            repasteText: '',
            reparsing: false,
        };
    },
    computed: {
        show() { return this.currentId != null; },
        canEdit() { return this.$root.canEquipmentEdit; },
        stats() {
            if (!this.item) return [];
            return STAT_LABELS
                .map(([k, label]) => ({ label, value: Number(this.item[k]) || 0 }))
                .filter(s => s.value !== 0);
        },
        slotDisp() {
            const v = this.item;
            if (!v) return '';
            let slot = v.wear_slot || '';
            if (v.weapon_class) slot += ` (${v.weapon_class}${v.hands == 2 ? ' 2h' : ''})`;
            else if (v.is_shield) slot += ' (shield)';
            else if (v.hands == 2) slot += ' (2h)';
            return slot;
        },
        // Siblings grouped per dropping mob, current item excluded.
        siblingsByMob() {
            if (!this.item || !this.item.dropped_by) return [];
            return this.item.dropped_by.map(d => ({
                mob: d,
                drops: (this.item.siblings || []).filter(s =>
                    s.mob_id === d.mob_id && s.equipment_id !== this.item.id),
            })).filter(g => g.drops.length);
        },
        // Slot value the re-paste should carry: the parser's classifySlot
        // wants a weapon class / 'shield' for wield items, not 'wield'.
        repasteSlot() {
            const v = this.item;
            if (!v) return '';
            return v.weapon_class || (v.is_shield ? 'shield' : v.wear_slot);
        },
    },
    watch: {
        itemId(v) {
            this.backStack = [];
            if (v != null) this.open(v);
            else this.currentId = null;
        },
    },
    mounted() {
        this._esc = (e) => { if (e.key === 'Escape' && this.show) this.close(); };
        document.addEventListener('keydown', this._esc);
        if (this.itemId != null) this.open(this.itemId);
    },
    beforeUnmount() { document.removeEventListener('keydown', this._esc); },
    methods: {
        close() { this.currentId = null; this.$emit('close'); },
        goBack() {
            const prev = this.backStack.pop();
            if (prev != null) this.open(prev, false);
        },
        openSibling(equipmentId) {
            if (!equipmentId) return;
            this.backStack.push(this.currentId);
            this.open(equipmentId, false);
        },
        async open(id, resetStack = true) {
            if (resetStack) this.backStack = [];
            this.currentId = id;
            this.loading = true;
            this.error = null;
            this.item = null;
            this.mobQuery = '';
            this.mobResults = [];
            this.showRepaste = false;
            this.repasteText = '';
            try {
                const r = await axios.get(`/api/equipment/items/${id}`);
                this.item = r.data && r.data.data;
                this.noteDraft = (this.item && this.item.note) || '';
            } catch (e) {
                this.error = 'Could not load item detail.';
            } finally {
                this.loading = false;
            }
        },
        async reload() { if (this.currentId != null) await this.open(this.currentId, false); },

        async toggleOwned() {
            if (!this.canEdit || !this.item) return;
            const desired = !this.item.owned;
            try {
                if (desired) await axios.post(`/api/equipment/items/${this.item.id}/own`);
                else await axios.delete(`/api/equipment/items/${this.item.id}/own`);
                this.item.owned = desired; // icon-driven state, no native checkbox (gotchas)
                this.$emit('changed');
            } catch (e) { this.$root.send_global_alert('Failed — re-login?', true); }
        },
        async saveNote() {
            if (this.savingNote) return;
            this.savingNote = true;
            try {
                await axios.post(`/api/equipment/items/${this.item.id}/note`, { note: this.noteDraft });
                this.item.note = this.noteDraft.trim() || null;
                this.$root.send_global_alert('Note saved');
                this.$emit('changed');
            } catch (e) { this.$root.send_global_alert('Note save failed', true); }
            finally { this.savingNote = false; }
        },

        async searchMobs() {
            const q = this.mobQuery.trim();
            if (!q) { this.mobResults = []; return; }
            // Only the latest keystroke's results may land (out-of-order
            // response guard).
            const seq = (this._mobSeq = (this._mobSeq || 0) + 1);
            try {
                const r = await axios.get('/api/equipment/mobs', { params: { q } });
                if (seq !== this._mobSeq) return;
                this.mobResults = (r.data && r.data.data) || [];
            } catch (e) { if (seq === this._mobSeq) this.mobResults = []; }
        },
        async linkMob(mob) {
            if (this.linking) return;
            this.linking = true;
            try {
                await axios.post(`/api/equipment/items/${this.item.id}/mobs`, { mob_id: mob.id });
                this.mobQuery = '';
                this.mobResults = [];
                await this.reload();
                this.$emit('changed');
            } catch (e) { this.$root.send_global_alert('Link failed', true); }
            finally { this.linking = false; }
        },
        async unlinkMob(d) {
            try {
                await axios.delete(`/api/equipment/items/${this.item.id}/mobs/${d.loot_id}`);
                await this.reload();
                this.$emit('changed');
            } catch (e) { this.$root.send_global_alert('Unlink failed', true); }
        },

        async submitRepaste() {
            const info = this.repasteText.trim();
            if (!info || this.reparsing) return;
            this.reparsing = true;
            try {
                const r = await axios.post('/api/equipment/add', { info, slot: this.repasteSlot });
                const newId = r.data && r.data.data && r.data.data.id;
                if (newId && newId !== this.item.id) {
                    this.$root.send_global_alert('Parsed as a different item — showing it now');
                    this.open(newId, false);
                } else {
                    this.$root.send_global_alert('Re-parsed and merged');
                    await this.reload();
                }
                this.showRepaste = false;
                this.repasteText = '';
                this.$emit('changed');
            } catch (e) {
                const msg = e.response && e.response.data && e.response.data.error;
                this.$root.send_global_alert(msg || 'Re-parse failed', true);
            } finally { this.reparsing = false; }
        },

        jumpToMob(d) {
            this.close();
            this.$router.push({ name: 'mob-detail', params: { id: d.mob_id } });
        },
        jumpToKya(d) {
            this.close();
            this.$router.push({ name: 'kya', query: { name: d.kya_name } });
        },
    },
};
</script>

<template>
<div v-if="show" class="itemdm-backdrop" @click.self="close">
    <div class="itemdm-panel" role="dialog" aria-modal="true">
        <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
                <a v-if="backStack.length" href="#" class="small d-block mb-1" @click.prevent="goBack">
                    <i class="bi bi-arrow-left"></i> back
                </a>
                <h5 class="m-0">{{ item ? item.name : 'Loading…' }}</h5>
                <div v-if="item" class="mt-1 d-flex flex-wrap gap-1">
                    <span class="badge text-bg-secondary">{{ slotDisp }}</span>
                    <span v-if="item.bound" class="badge text-bg-warning">bound</span>
                    <span v-if="item.needs_review" class="badge text-bg-danger">needs review</span>
                    <span v-if="item.covers && item.covers.length" class="badge text-bg-info">
                        covers: {{ item.covers.join(' / ') }}
                    </span>
                </div>
            </div>
            <button type="button" class="btn-close" aria-label="Close" @click="close"></button>
        </div>

        <div v-if="loading" class="text-muted py-4 text-center">Loading…</div>
        <div v-else-if="error" class="alert alert-danger py-2">{{ error }}</div>

        <template v-else-if="item">
            <!-- Stats -->
            <div v-if="stats.length || item.weapon_class_value || item.dmg_pct" class="itemdm-stats mb-2">
                <span v-for="s in stats" :key="s.label" class="itemdm-stat">
                    <b>{{ s.label }}</b> {{ s.value }}
                </span>
                <span v-if="item.weapon_class_value" class="itemdm-stat"><b>WpnCls</b> {{ item.weapon_class_value }}</span>
                <span v-if="item.dmg_pct" class="itemdm-stat"><b>Dmg</b> {{ item.dmg_pct }}% {{ item.dmg_type || '' }}</span>
            </div>

            <!-- Bonuses -->
            <div v-if="item.bonuses && item.bonuses.length" class="mb-2">
                <div class="itemdm-label">Bonuses</div>
                <span v-for="b in item.bonuses" :key="b.bonus_name" class="badge text-bg-light border me-1 mb-1">
                    {{ b.bonus_name }} {{ b.amount > 0 ? '+' + b.amount : b.amount }}
                </span>
            </div>

            <!-- Ownership -->
            <div class="mb-2 d-flex align-items-center gap-2">
                <template v-if="canEdit">
                    <i class="bi" :class="item.owned ? 'bi-check-square-fill text-success' : 'bi-square text-secondary'"
                       style="cursor:pointer;font-size:1.15em" @click="toggleOwned"></i>
                    <span class="small">{{ item.owned ? 'You have this item' : 'Mark as owned' }}</span>
                </template>
                <template v-else-if="item.owned">
                    <i class="bi bi-check-square-fill text-success"></i>
                    <span class="small">You have this item</span>
                </template>
                <span v-if="item.own_note" class="small text-muted">— {{ item.own_note }}</span>
            </div>

            <!-- Dropped by -->
            <div class="mb-2">
                <div class="itemdm-label">Dropped by</div>
                <div v-if="!item.dropped_by.length" class="small text-muted">
                    No mob linked yet.
                    <span v-if="item.eqmob_name">Legacy label: <b>{{ item.eqmob_name }}</b></span>
                </div>
                <div v-for="d in item.dropped_by" :key="d.loot_id" class="d-flex align-items-center gap-2 small mb-1">
                    <router-link v-if="$root.canEqmobs" :to="{ name: 'mob-detail', params: { id: d.mob_id } }"
                                 @click="close">{{ d.mob_name }}</router-link>
                    <span v-else>{{ d.mob_name }}</span>
                    <span v-if="d.area" class="text-muted">({{ d.area }})</span>
                    <a v-if="d.kya_count && $root.canLookups" href="#" @click.prevent="jumpToKya(d)">
                        KYA ({{ d.kya_count }})
                    </a>
                    <i v-if="canEdit" class="bi bi-x-circle text-danger ms-auto" style="cursor:pointer"
                       title="Unlink this mob (the mob keeps the loot row as free text)"
                       @click="unlinkMob(d)"></i>
                </div>
                <!-- Editor: set the source mob (one per item — picking a new
                     mob MOVES the item; the old mob keeps a free-text row) -->
                <div v-if="canEdit" class="mt-1 itemdm-binder">
                    <input v-model="mobQuery" @input="searchMobs" class="form-control form-control-sm"
                           :placeholder="item.dropped_by.length ? 'Change source mob — replaces the current one…' : 'Set source mob — type to search the Mob KB…'" />
                    <div v-if="mobResults.length" class="itemdm-typeahead">
                        <a v-for="m in mobResults" :key="m.id" href="#" class="d-block px-2 py-1"
                           @click.prevent="linkMob(m)">
                            {{ m.name }} <span v-if="m.area" class="text-muted small">({{ m.area }})</span>
                        </a>
                    </div>
                </div>
            </div>

            <!-- Also drops -->
            <div v-if="siblingsByMob.length" class="mb-2">
                <div class="itemdm-label">Also drops</div>
                <div v-for="g in siblingsByMob" :key="g.mob.mob_id" class="small mb-1">
                    <span class="text-muted">{{ g.mob.mob_name }}:</span>
                    <template v-for="(s, i) in g.drops" :key="s.loot_id">
                        <a v-if="s.equipment_id" href="#" @click.prevent="openSibling(s.equipment_id)">{{ s.item_name }}</a>
                        <span v-else>{{ s.item_name }}</span><span v-if="i < g.drops.length - 1">, </span>
                    </template>
                </div>
            </div>

            <!-- Raw source -->
            <details open class="mb-2">
                <summary class="itemdm-label" style="cursor:pointer">Original identify / lookup text</summary>
                <pre v-if="item.raw_info" class="itemdm-raw">{{ item.raw_info }}</pre>
                <div v-else class="small text-muted">No raw text stored for this item.</div>
            </details>

            <!-- Note -->
            <div class="mb-2">
                <div class="itemdm-label">Note</div>
                <template v-if="canEdit">
                    <textarea v-model="noteDraft" rows="2" class="form-control form-control-sm"
                              placeholder="Catalog note (visible to everyone)"></textarea>
                    <button class="btn btn-sm btn-outline-primary mt-1" :disabled="savingNote"
                            @click="saveNote">{{ savingNote ? 'Saving…' : 'Save note' }}</button>
                </template>
                <div v-else class="small">{{ item.note || '—' }}</div>
            </div>

            <!-- Re-paste (editor) -->
            <div v-if="canEdit" class="mb-1">
                <a href="#" class="small" @click.prevent="showRepaste = !showRepaste">
                    <i class="bi" :class="showRepaste ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
                    Re-paste identify / lookup text (re-parse &amp; merge)
                </a>
                <div v-if="showRepaste" class="mt-1">
                    <textarea v-model="repasteText" rows="6" class="form-control form-control-sm font-monospace"
                              placeholder="Paste the full identify or library lookup text…"></textarea>
                    <button class="btn btn-sm btn-outline-primary mt-1" :disabled="reparsing"
                            @click="submitRepaste">{{ reparsing ? 'Parsing…' : 'Re-parse' }}</button>
                </div>
            </div>
        </template>
    </div>
</div>
</template>

<style scoped>
/* Unique class names on purpose — .modal-backdrop collides with Bootstrap's
   own modal CSS (see the note in Reinc.vue). Works in both themes via the
   Bootstrap body vars. z-index above the navbar (1020) and the reinc modals. */
.itemdm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 2050;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
}
.itemdm-panel {
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
    border: 1px solid var(--bs-border-color);
    border-radius: 0.5rem;
    padding: 1rem 1.25rem;
    width: 100%;
    max-width: 34rem;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
}
.itemdm-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bs-secondary-color);
    margin-bottom: 0.15rem;
}
.itemdm-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    font-size: 0.85rem;
}
.itemdm-stat b { font-weight: 600; }
.itemdm-raw {
    font-size: 0.75rem;
    background: var(--bs-tertiary-bg);
    border: 1px solid var(--bs-border-color);
    border-radius: 0.25rem;
    padding: 0.5rem;
    max-height: 16rem;
    overflow: auto;
    white-space: pre-wrap;
    margin: 0;
}
.itemdm-binder { position: relative; max-width: 24rem; }
.itemdm-typeahead {
    position: absolute;
    left: 0; right: 0;
    background: var(--bs-body-bg);
    border: 1px solid var(--bs-border-color);
    border-radius: 0.25rem;
    z-index: 10;
    max-height: 12rem;
    overflow-y: auto;
}
.itemdm-typeahead a { text-decoration: none; }
.itemdm-typeahead a:hover { background: var(--bs-tertiary-bg); }
</style>
