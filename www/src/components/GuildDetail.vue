<script>
import axios from 'axios';
export default {
    name: 'GuildDetail',
    props: ['id'],
    data() {
        return {
            loaded: false,
            guild: null,
            bonuses: [],
            skills: [],
            spells: [],
            subguilds: [],
            allGuilds: [],
            tab: 'bonuses',

            editMeta: false,
            draftMeta: {},

            bonusEditId: null, bonusDraft: {},
            bonusNew: null,

            skillEditId: null, skillDraft: {},
            skillNew: null,
            skillOptions: [],

            spellEditId: null, spellDraft: {},
            spellNew: null,
            spellOptions: [],

            // Import-from-text card: admin pastes the in-game
            // `info short` + `info full` blob, previews the parse
            // via dry_run, then commits.
            showImport: false,
            importText: '',
            importPreview: null,
            importLoading: false,
        };
    },
    computed: {
        canEdit() { return this.$root.canEdit; },
        bonusesByLevel() { return this.groupByLevel(this.bonuses); },
        skillsByLevel()  { return this.groupByLevel(this.skills); },
        spellsByLevel()  { return this.groupByLevel(this.spells); },
    },
    methods: {
        groupByLevel(list) {
            const m = new Map();
            for (const r of list) {
                if (!m.has(r.level)) m.set(r.level, []);
                m.get(r.level).push(r);
            }
            return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
        },
        async load() {
            this.loaded = false;
            try {
                const r = await axios.get('/api/game/guilds/' + this.id);
                Object.assign(this, r.data.data);
                // Load guilds for parent picker; skills/spells for autocompletes.
                const [gs, sk, sp] = await Promise.all([
                    axios.get('/api/game/guilds'),
                    axios.get('/api/game/skills'),
                    axios.get('/api/game/spells'),
                ]);
                this.allGuilds = gs.data.data;
                this.skillOptions = sk.data.data;
                this.spellOptions = sp.data.data;
                this.loaded = true;
            } catch (e) { this.$root.flashError(e); }
        },

        // --- guild metadata ---
        startEditMeta() {
            this.draftMeta = {
                name: this.guild.name,
                file_name: this.guild.file_name,
                parent_id: this.guild.parent_id,
                max_level: this.guild.max_level,
            };
            this.editMeta = true;
        },
        async saveMeta() {
            try {
                await axios.post('/api/game/guilds/' + this.id, {
                    ...this.draftMeta,
                    parent_id: this.draftMeta.parent_id || null,
                    max_level: parseInt(this.draftMeta.max_level, 10) || 0,
                });
                this.$root.flashMsg('Saved');
                this.editMeta = false;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async del() {
            if (!confirm(`Delete guild "${this.guild.name}"? This also deletes its level data.`)) return;
            try { await axios.delete('/api/game/guilds/' + this.id); this.$root.flashMsg('Deleted'); this.$router.push({ name: 'guilds' }); }
            catch (e) { this.$root.flashError(e); }
        },

        // --- bonuses ---
        startBonusEdit(b) { this.bonusEditId = b.id; this.bonusDraft = { ...b }; },
        cancelBonusEdit() { this.bonusEditId = null; this.bonusDraft = {}; },
        async saveBonus() {
            try {
                const d = this.bonusDraft;
                await axios.post('/api/game/guild-bonuses/' + this.bonusEditId, {
                    level: parseInt(d.level, 10), bonus_name: d.bonus_name, value: parseInt(d.value, 10),
                });
                this.$root.flashMsg('Saved');
                this.cancelBonusEdit();
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async delBonus(b) {
            if (!confirm(`Delete bonus ${b.bonus_name}(${b.value}) at level ${b.level}?`)) return;
            try { await axios.delete('/api/game/guild-bonuses/' + b.id); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        startBonusNew() { this.bonusNew = { level: 1, bonus_name: '', value: 1 }; },
        async createBonus() {
            try {
                await axios.post('/api/game/guilds/' + this.id + '/bonuses', {
                    level: parseInt(this.bonusNew.level, 10),
                    bonus_name: this.bonusNew.bonus_name,
                    value: parseInt(this.bonusNew.value, 10),
                });
                this.$root.flashMsg('Added');
                this.bonusNew = null;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },

        // --- skill unlocks ---
        startSkillEdit(s) { this.skillEditId = s.id; this.skillDraft = { ...s }; },
        cancelSkillEdit() { this.skillEditId = null; this.skillDraft = {}; },
        async saveSkill() {
            try {
                const d = this.skillDraft;
                await axios.post('/api/game/guild-skills/' + this.skillEditId, {
                    skill_id: parseInt(d.skill_id, 10),
                    level: parseInt(d.level, 10),
                    max_percent: parseInt(d.max_percent, 10),
                });
                this.$root.flashMsg('Saved');
                this.cancelSkillEdit();
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async delSkill(s) {
            if (!confirm(`Delete skill unlock "${s.name}" at level ${s.level}?`)) return;
            try { await axios.delete('/api/game/guild-skills/' + s.id); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        startSkillNew() { this.skillNew = { level: 1, skill_id: null, max_percent: 5 }; },
        async createSkill() {
            try {
                await axios.post('/api/game/guilds/' + this.id + '/skills', {
                    level: parseInt(this.skillNew.level, 10),
                    skill_id: parseInt(this.skillNew.skill_id, 10),
                    max_percent: parseInt(this.skillNew.max_percent, 10),
                });
                this.$root.flashMsg('Added');
                this.skillNew = null;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },

        // --- spell unlocks ---
        startSpellEdit(s) { this.spellEditId = s.id; this.spellDraft = { ...s }; },
        cancelSpellEdit() { this.spellEditId = null; this.spellDraft = {}; },
        async saveSpell() {
            try {
                const d = this.spellDraft;
                await axios.post('/api/game/guild-spells/' + this.spellEditId, {
                    spell_id: parseInt(d.spell_id, 10),
                    level: parseInt(d.level, 10),
                    max_percent: parseInt(d.max_percent, 10),
                });
                this.$root.flashMsg('Saved');
                this.cancelSpellEdit();
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async delSpell(s) {
            if (!confirm(`Delete spell unlock "${s.name}" at level ${s.level}?`)) return;
            try { await axios.delete('/api/game/guild-spells/' + s.id); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        startSpellNew() { this.spellNew = { level: 1, spell_id: null, max_percent: 5 }; },
        async createSpell() {
            try {
                await axios.post('/api/game/guilds/' + this.id + '/spells', {
                    level: parseInt(this.spellNew.level, 10),
                    spell_id: parseInt(this.spellNew.spell_id, 10),
                    max_percent: parseInt(this.spellNew.max_percent, 10),
                });
                this.$root.flashMsg('Added');
                this.spellNew = null;
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },

        // --- import from pasted game text ---
        startImport() {
            this.showImport = true;
            this.importText = '';
            this.importPreview = null;
        },
        cancelImport() {
            this.showImport = false;
            this.importText = '';
            this.importPreview = null;
        },
        async previewImport() {
            if (!this.importText.trim()) return;
            this.importLoading = true;
            try {
                const r = await axios.post(`/api/game/guilds/${this.id}/import-text`,
                    { text: this.importText, dry_run: true });
                if (r.data.ok) { this.importPreview = r.data.data; }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
            finally { this.importLoading = false; }
        },
        async commitImport() {
            if (!this.importPreview) return;
            const p = this.importPreview;
            const msg = `Replace this guild's data with the parsed rows?\n\n`
                + `  ${p.parsed.bonuses} bonuses\n`
                + `  ${p.parsed.skills} skill unlocks\n`
                + `  ${p.parsed.spells} spell unlocks\n\n`
                + `Existing rows for this guild will be deleted.`;
            if (!confirm(msg)) return;
            this.importLoading = true;
            try {
                const r = await axios.post(`/api/game/guilds/${this.id}/import-text`,
                    { text: this.importText, dry_run: false });
                if (r.data.ok) {
                    this.$root.flashMsg('Guild data imported from game text');
                    this.cancelImport();
                    await this.load();
                } else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
            finally { this.importLoading = false; }
        },
        formatVerified(ts) {
            if (!ts) return 'never';
            // The column is a naive DATETIME stored in the server's
            // local clock; toLocaleString is fine for a human hint.
            return new Date(ts.replace(' ', 'T')).toLocaleString();
        },
    },
    mounted() { this.load(); },
    watch: { id() { this.load(); } },
};
</script>
<template>
<div v-if="loaded">
    <nav class="mb-2"><router-link :to="{name:'guilds'}">← Guilds</router-link></nav>
    <h2>
        {{ guild.name }}
        <small class="text-muted" v-if="guild.parent_name">(subguild of {{ guild.parent_name }})</small>
    </h2>

    <!-- Metadata block -->
    <div class="mb-3">
        <div v-if="!editMeta">
            <span class="me-3">Max level: <strong>{{ guild.max_level }}</strong></span>
            <span class="me-3">File: <code>{{ guild.file_name }}.chr</code></span>
            <span class="me-3" v-if="guild.parent_name">Parent: <strong>{{ guild.parent_name }}</strong></span>
            <span class="me-3 small text-muted" :title="guild.last_verified_at || 'never verified against the live game'">
                Last verified: <strong>{{ formatVerified(guild.last_verified_at) }}</strong>
            </span>
            <button v-if="canEdit" class="btn btn-sm btn-outline-primary me-1" @click="startEditMeta">Edit</button>
            <button v-if="canEdit" class="btn btn-sm btn-outline-success me-1" @click="startImport">Import from game text</button>
            <button v-if="canEdit" class="btn btn-sm btn-outline-danger" @click="del">Delete</button>
        </div>
        <div v-else class="row g-2">
            <div class="col-md-3"><label class="form-label small">Display name</label><input class="form-control form-control-sm" v-model="draftMeta.name"></div>
            <div class="col-md-3"><label class="form-label small">File name</label><input class="form-control form-control-sm" v-model="draftMeta.file_name"></div>
            <div class="col-md-3"><label class="form-label small">Parent guild</label>
                <select class="form-select form-select-sm" v-model="draftMeta.parent_id">
                    <option :value="null">— none —</option>
                    <option v-for="p in allGuilds.filter(g => !g.parent_id && g.id !== guild.id)" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
            </div>
            <div class="col-md-2"><label class="form-label small">Max level</label><input class="form-control form-control-sm" v-model.number="draftMeta.max_level"></div>
            <div class="col-12">
                <button class="btn btn-sm btn-primary me-1" @click="saveMeta">Save</button>
                <button class="btn btn-sm btn-secondary" @click="editMeta = false">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Import-from-text card. Admin pastes the in-game `info short`
         and/or `info full` output here. Clicking Preview parses the
         text server-side (dry_run) and shows counts + any skill/spell
         names that don't match the catalog. Commit replaces every
         bonus/skill/spell row for this guild and stamps
         last_verified_at. -->
    <div v-if="showImport" class="card mb-3"><div class="card-body">
        <h5 class="card-title">Import from game text</h5>
        <p class="small text-muted mb-2">
            Paste the output of <code>info short</code> and <code>info full</code> from the guild trainer.
            Both blocks can be in one paste, in any order. Preview first to see what will change.
        </p>
        <textarea class="form-control font-monospace" rows="10"
                  v-model="importText"
                  placeholder="| Lvl | Str | Dex | ... | Spr |&#10;|   1 |     |   2 | ... |   1 |&#10;...&#10;Level 1 abilities:&#10;May study spell ... to ...%"></textarea>
        <div class="mt-2 d-flex gap-2 align-items-center flex-wrap">
            <button class="btn btn-sm btn-primary" @click="previewImport" :disabled="importLoading || !importText.trim()">
                {{ importLoading ? 'Working…' : 'Preview' }}
            </button>
            <button class="btn btn-sm btn-success" @click="commitImport" :disabled="!importPreview || importLoading">
                Commit
            </button>
            <button class="btn btn-sm btn-secondary" @click="cancelImport">Cancel</button>
        </div>
        <div v-if="importPreview" class="mt-3 small">
            <div>
                Parsed:
                <strong>{{ importPreview.parsed.bonuses }}</strong> bonuses,
                <strong>{{ importPreview.parsed.skills }}</strong> skill unlocks
                (<span :class="{ 'text-danger': importPreview.missing_skills.length }">{{ importPreview.resolved.skills }} matched</span>),
                <strong>{{ importPreview.parsed.spells }}</strong> spell unlocks
                (<span :class="{ 'text-danger': importPreview.missing_spells.length }">{{ importPreview.resolved.spells }} matched</span>).
            </div>
            <div v-if="importPreview.missing_skills.length" class="text-danger">
                Unknown skills (add to the Skills catalog first):
                <code v-for="n in importPreview.missing_skills" :key="n" class="me-2">{{ n }}</code>
            </div>
            <div v-if="importPreview.missing_spells.length" class="text-danger">
                Unknown spells (add to the Spells catalog first):
                <code v-for="n in importPreview.missing_spells" :key="n" class="me-2">{{ n }}</code>
            </div>
            <div v-if="!importPreview.missing_skills.length && !importPreview.missing_spells.length" class="text-success">
                Everything resolves — Commit will delete this guild's existing rows and replace them with the parse.
            </div>
        </div>
    </div></div>

    <div v-if="subguilds.length" class="mb-3">
        <h5>Subguilds</h5>
        <router-link v-for="sg in subguilds" :key="sg.id" :to="{name:'guild-detail',params:{id:sg.id}}"
            class="btn btn-sm btn-outline-secondary me-1 mb-1">{{ sg.name }} ({{ sg.max_level }})</router-link>
    </div>

    <ul class="nav nav-tabs">
        <li class="nav-item"><a class="nav-link" :class="{active: tab==='bonuses'}" href="#" @click.prevent="tab='bonuses'">Stat bonuses ({{ bonuses.length }})</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active: tab==='skills'}" href="#" @click.prevent="tab='skills'">Skill unlocks ({{ skills.length }})</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active: tab==='spells'}" href="#" @click.prevent="tab='spells'">Spell unlocks ({{ spells.length }})</a></li>
    </ul>

    <div class="tab-content pt-3">

        <!-- BONUSES -->
        <div v-if="tab==='bonuses'">
            <div class="mb-2" v-if="canEdit">
                <button v-if="!bonusNew" class="btn btn-sm btn-success" @click="startBonusNew">+ Add bonus</button>
                <div v-else class="card card-body p-2">
                    <div class="row g-2 align-items-end">
                        <div class="col-md-2"><label class="form-label small">Level</label><input class="form-control form-control-sm" v-model.number="bonusNew.level"></div>
                        <div class="col-md-4"><label class="form-label small">Bonus name</label><input class="form-control form-control-sm" v-model="bonusNew.bonus_name" placeholder="e.g. hp, con, physical resistance"></div>
                        <div class="col-md-2"><label class="form-label small">Value</label><input class="form-control form-control-sm" v-model.number="bonusNew.value"></div>
                        <div class="col-md-4">
                            <button class="btn btn-sm btn-primary me-1" @click="createBonus">Add</button>
                            <button class="btn btn-sm btn-secondary" @click="bonusNew = null">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            <table class="table table-sm table-striped">
                <thead><tr><th style="width:4em;">Lvl</th><th>Bonus</th><th style="width:6em;">Value</th><th v-if="canEdit" style="width:12em;"></th></tr></thead>
                <tbody>
                    <template v-for="b in bonuses" :key="b.id">
                        <tr v-if="bonusEditId !== b.id">
                            <td>{{ b.level }}</td>
                            <td>{{ b.bonus_name }}</td>
                            <td>{{ b.value }}</td>
                            <td v-if="canEdit">
                                <button class="btn btn-sm btn-outline-primary me-1" @click="startBonusEdit(b)">Edit</button>
                                <button class="btn btn-sm btn-outline-danger" @click="delBonus(b)">Del</button>
                            </td>
                        </tr>
                        <tr v-else>
                            <td><input class="form-control form-control-sm" v-model.number="bonusDraft.level"></td>
                            <td><input class="form-control form-control-sm" v-model="bonusDraft.bonus_name"></td>
                            <td><input class="form-control form-control-sm" v-model.number="bonusDraft.value"></td>
                            <td>
                                <button class="btn btn-sm btn-primary me-1" @click="saveBonus">Save</button>
                                <button class="btn btn-sm btn-secondary" @click="cancelBonusEdit">Cancel</button>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>

        <!-- SKILL UNLOCKS -->
        <div v-if="tab==='skills'">
            <div class="mb-2" v-if="canEdit">
                <button v-if="!skillNew" class="btn btn-sm btn-success" @click="startSkillNew">+ Add skill unlock</button>
                <div v-else class="card card-body p-2">
                    <div class="row g-2 align-items-end">
                        <div class="col-md-2"><label class="form-label small">Level</label><input class="form-control form-control-sm" v-model.number="skillNew.level"></div>
                        <div class="col-md-4"><label class="form-label small">Skill</label>
                            <select class="form-select form-select-sm" v-model="skillNew.skill_id">
                                <option :value="null" disabled>— pick a skill —</option>
                                <option v-for="s in skillOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
                            </select>
                        </div>
                        <div class="col-md-2"><label class="form-label small">Max %</label><input class="form-control form-control-sm" v-model.number="skillNew.max_percent"></div>
                        <div class="col-md-4">
                            <button class="btn btn-sm btn-primary me-1" @click="createSkill">Add</button>
                            <button class="btn btn-sm btn-secondary" @click="skillNew = null">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            <table class="table table-sm table-striped">
                <thead><tr><th style="width:4em;">Lvl</th><th>Skill</th><th style="width:6em;">Max %</th><th v-if="canEdit" style="width:12em;"></th></tr></thead>
                <tbody>
                    <template v-for="s in skills" :key="s.id">
                        <tr v-if="skillEditId !== s.id">
                            <td>{{ s.level }}</td>
                            <td>{{ s.name }}</td>
                            <td>{{ s.max_percent }}</td>
                            <td v-if="canEdit">
                                <button class="btn btn-sm btn-outline-primary me-1" @click="startSkillEdit(s)">Edit</button>
                                <button class="btn btn-sm btn-outline-danger" @click="delSkill(s)">Del</button>
                            </td>
                        </tr>
                        <tr v-else>
                            <td><input class="form-control form-control-sm" v-model.number="skillDraft.level"></td>
                            <td><select class="form-select form-select-sm" v-model="skillDraft.skill_id">
                                <option v-for="o in skillOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
                            </select></td>
                            <td><input class="form-control form-control-sm" v-model.number="skillDraft.max_percent"></td>
                            <td>
                                <button class="btn btn-sm btn-primary me-1" @click="saveSkill">Save</button>
                                <button class="btn btn-sm btn-secondary" @click="cancelSkillEdit">Cancel</button>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>

        <!-- SPELL UNLOCKS -->
        <div v-if="tab==='spells'">
            <div class="mb-2" v-if="canEdit">
                <button v-if="!spellNew" class="btn btn-sm btn-success" @click="startSpellNew">+ Add spell unlock</button>
                <div v-else class="card card-body p-2">
                    <div class="row g-2 align-items-end">
                        <div class="col-md-2"><label class="form-label small">Level</label><input class="form-control form-control-sm" v-model.number="spellNew.level"></div>
                        <div class="col-md-4"><label class="form-label small">Spell</label>
                            <select class="form-select form-select-sm" v-model="spellNew.spell_id">
                                <option :value="null" disabled>— pick a spell —</option>
                                <option v-for="s in spellOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
                            </select>
                        </div>
                        <div class="col-md-2"><label class="form-label small">Max %</label><input class="form-control form-control-sm" v-model.number="spellNew.max_percent"></div>
                        <div class="col-md-4">
                            <button class="btn btn-sm btn-primary me-1" @click="createSpell">Add</button>
                            <button class="btn btn-sm btn-secondary" @click="spellNew = null">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            <table class="table table-sm table-striped">
                <thead><tr><th style="width:4em;">Lvl</th><th>Spell</th><th style="width:6em;">Max %</th><th v-if="canEdit" style="width:12em;"></th></tr></thead>
                <tbody>
                    <template v-for="s in spells" :key="s.id">
                        <tr v-if="spellEditId !== s.id">
                            <td>{{ s.level }}</td>
                            <td>{{ s.name }}</td>
                            <td>{{ s.max_percent }}</td>
                            <td v-if="canEdit">
                                <button class="btn btn-sm btn-outline-primary me-1" @click="startSpellEdit(s)">Edit</button>
                                <button class="btn btn-sm btn-outline-danger" @click="delSpell(s)">Del</button>
                            </td>
                        </tr>
                        <tr v-else>
                            <td><input class="form-control form-control-sm" v-model.number="spellDraft.level"></td>
                            <td><select class="form-select form-select-sm" v-model="spellDraft.spell_id">
                                <option v-for="o in spellOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
                            </select></td>
                            <td><input class="form-control form-control-sm" v-model.number="spellDraft.max_percent"></td>
                            <td>
                                <button class="btn btn-sm btn-primary me-1" @click="saveSpell">Save</button>
                                <button class="btn btn-sm btn-secondary" @click="cancelSpellEdit">Cancel</button>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>
    </div>
</div>
</template>
