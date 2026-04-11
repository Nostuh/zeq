<script>
import axios from 'axios';
import {
    sumGuildBonuses, computeCharacter,
    buildSkillCostArray, skillExp,
    computeLevelExp, computeStatExp,
    MAX_LEVEL,
} from './reinc/engine.js';

const STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export default {
    name: 'Reinc',
    data() {
        return {
            loaded: false,
            tab: 'general',

            // catalog (shared arrays fetched once)
            races: [], guilds: [], skills: [], spells: [],
            wishesCatalog: [], boonsCatalog: [],
            levelCostMap: { level: [], stat: [], quest: [] },
            ssCosts: [],                    // costs.txt per-5% array, length 20

            // per-guild data cache (id -> {bonuses, skills, spells})
            guildData: {},

            // selections
            selectedRaceId: null,
            guildPicks: [],                 // [{ guildId, level }]
            guildSearch: '',
            statTrain: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
            selectedWishes: new Set(),
            selectedBoons: new Set(),
            // Primary state for "free levels" — matches Character.cs where
            // `free` is independent and `totalLevels = 120 - guildlevels + free`.
            // `totalLevels` + `freeLevels` are COMPUTED below from this field,
            // so unchecking a guild correctly drops the total rather than
            // silently growing phantom free levels.
            extraFree: 0,
            quest: 0,
            tp: 1000,

            // skills/spells tabs
            activeSkillId: null,
            skillLearned: {},               // skill_id -> current %
            activeSpellId: null,
            spellLearned: {},

            // "What does this guild teach?" modal — bug #13.
            // `infoGuildId` is null when closed; the data comes from
            // `guildData[infoGuildId]`, lazy-loaded the same way picks are.
            // `infoGuildLevel` is the level slider inside the modal so the
            // user can preview unlocks at any level (defaulted to the picked
            // level when applicable, else the guild's max_level).
            infoGuildId: null,
            infoGuildLevel: 0,
            infoLoading: false,
        };
    },
    computed: {
        enabledRaces() { return this.races.filter((r) => r.enabled); },
        race() { return this.races.find((r) => r.id === this.selectedRaceId) || null; },
        guildTree() {
            const q = (this.guildSearch || '').trim().toLowerCase();
            const parents = this.guilds.filter((g) => !g.parent_id);
            const subMap = {};
            for (const g of this.guilds) if (g.parent_id) (subMap[g.parent_id] ||= []).push(g);
            // Filter: a parent is included if it matches OR any of its subguilds does;
            // a subguild is included if it matches OR its parent does. Picked guilds
            // are always visible so the user doesn't lose a selection behind a search.
            const matches = (g) => !q || g.name.toLowerCase().includes(q) || this.isPicked(g);
            const out = [];
            for (const p of parents) {
                const kids = (subMap[p.id] || []);
                const parentMatches = matches(p);
                const anyKidMatches = kids.some(matches);
                if (!parentMatches && !anyKidMatches) continue;
                out.push({ ...p, depth: 0 });
                for (const s of kids) {
                    if (parentMatches || matches(s)) out.push({ ...s, depth: 1 });
                }
            }
            return out;
        },
        pickedGuildSummaries() {
            return this.resolvedPicks.map((p) => ({
                id: p.guild.id,
                name: p.guild.name,
                level: p.level,
                max: p.guild.max_level,
                isSub: !!p.guild.parent_id,
            }));
        },
        resolvedPicks() {
            return this.guildPicks.map((p) => {
                const g = this.guilds.find((x) => x.id === p.guildId);
                if (!g) return null;
                return { guild: g, level: p.level, data: this.guildData[p.guildId] || null };
            }).filter(Boolean);
        },
        guildLevelsSum() {
            return this.resolvedPicks.reduce((a, p) => a + (p.level | 0), 0);
        },
        // Character.cs setter clamps free <= (MAX_LEVEL - guild_chosen).
        // We treat `extraFree` as the user's independent preference and
        // clamp it at render time to the available budget.
        freeLevels() {
            const budget = Math.max(0, MAX_LEVEL - this.guildLevelsSum);
            return Math.min(Math.max(0, this.extraFree | 0), budget);
        },
        // `totalLevels` is now derived: sum of actual guild levels + clamped
        // free levels. Mirrors Character.cs:150 `totalLevels => 120 - guildlevels + free`.
        totalLevels() { return this.guildLevelsSum + this.freeLevels; },
        MAX_LEVEL() { return MAX_LEVEL; },
        character() {
            if (!this.race) return null;
            return computeCharacter({
                race: this.race,
                guildPicks: this.resolvedPicks,
                stats: this.statTrain,
                wishes: this.selectedWishes,
                boons: this.selectedBoons,
                wishCatalog: this.wishesCatalog,
                boonCatalog: this.boonsCatalog,
            });
        },
        // Effective skill/spell max per entity for the current race/wishes/guilds.
        // For each skill listed in a selected guild, scaledPercent per C#:
        //   scale = min(1, (skillMax+wish)/100)
        //   scaled = 5 * floor(scale * perGuildMax / 5)
        skillRows() {
            if (!this.race || !this.character) return [];
            const scale = Math.min(1, this.character.skillMax / 100);
            const byId = new Map();
            for (const p of this.resolvedPicks) {
                if (!p.data) continue;
                for (const row of p.data.skills) {
                    if (row.level > p.level) continue;
                    const prev = byId.get(row.skill_id);
                    if (!prev || row.max_percent > prev.maxPerGuild) {
                        const name = (this.skills.find((s) => s.id === row.skill_id) || {}).name || ('#' + row.skill_id);
                        byId.set(row.skill_id, { skill_id: row.skill_id, name, maxPerGuild: row.max_percent });
                    }
                }
            }
            const out = [];
            for (const [id, rec] of byId) {
                const capped = rec.maxPerGuild === 100
                    ? (this.character.skillMax)
                    : 5 * Math.floor(scale * rec.maxPerGuild / 5);
                out.push({ ...rec, scaled: capped, learned: this.skillLearned[id] || 0 });
            }
            out.sort((a, b) => a.name.localeCompare(b.name));
            return out;
        },
        spellRows() {
            if (!this.race || !this.character) return [];
            const scale = Math.min(1, this.character.spellMax / 100);
            const byId = new Map();
            for (const p of this.resolvedPicks) {
                if (!p.data) continue;
                for (const row of p.data.spells) {
                    if (row.level > p.level) continue;
                    const prev = byId.get(row.spell_id);
                    if (!prev || row.max_percent > prev.maxPerGuild) {
                        const name = (this.spells.find((s) => s.id === row.spell_id) || {}).name || ('#' + row.spell_id);
                        byId.set(row.spell_id, { spell_id: row.spell_id, name, maxPerGuild: row.max_percent });
                    }
                }
            }
            const out = [];
            for (const [id, rec] of byId) {
                const capped = rec.maxPerGuild === 100
                    ? (this.character.spellMax)
                    : 5 * Math.floor(scale * rec.maxPerGuild / 5);
                out.push({ ...rec, scaled: capped, learned: this.spellLearned[id] || 0 });
            }
            out.sort((a, b) => a.name.localeCompare(b.name));
            return out;
        },
        activeSkill() {
            if (this.activeSkillId == null) return null;
            const row = this.skillRows.find((s) => s.skill_id === this.activeSkillId);
            if (!row) return null;
            const full = this.skills.find((s) => s.id === row.skill_id) || {};
            return { ...row, start_cost: full.start_cost || 0 };
        },
        activeSpell() {
            if (this.activeSpellId == null) return null;
            const row = this.spellRows.find((s) => s.spell_id === this.activeSpellId);
            if (!row) return null;
            const full = this.spells.find((s) => s.id === row.spell_id) || {};
            return { ...row, start_cost: full.start_cost || 0 };
        },
        skillCostTable() {
            if (!this.activeSkill || !this.race) return [];
            return buildSkillCostArray(this.activeSkill.start_cost, this.ssCosts, this.race.skill_cost);
        },
        spellCostTable() {
            if (!this.activeSpell || !this.race) return [];
            return buildSkillCostArray(this.activeSpell.start_cost, this.ssCosts, this.race.spell_cost);
        },
        // Merge the 20 5%-increment cost rows with "Char Max" and "Racial
        // Max" marker rows so the table visually matches the desktop app.
        skillCostRows() { return this._annotatedCostRows(this.skillCostTable, this.activeSkill, 'skill'); },
        spellCostRows() { return this._annotatedCostRows(this.spellCostTable, this.activeSpell, 'spell'); },
        // Exp spent on the currently active skill/spell at its current
        // `learned` value. We pass `maxcost` so the SkillSpell.updateExp
        // tail clause for learned > 100 fires correctly when the planner
        // ever caps a skill above 100% (a 120-cap skill on a max-skill
        // race, for instance — the audit hits these cases).
        activeSkillExp() {
            if (!this.activeSkill || !this.race) return 0;
            const maxcost = (this.race.skill_cost | 0) * 100000;
            return skillExp(this.activeSkill.learned || 0, this.skillCostTable, maxcost);
        },
        activeSpellExp() {
            if (!this.activeSpell || !this.race) return 0;
            const maxcost = (this.race.spell_cost | 0) * 100000;
            return skillExp(this.activeSpell.learned || 0, this.spellCostTable, maxcost);
        },
        skillExpTotal() {
            if (!this.race) return 0;
            const maxcost = (this.race.skill_cost | 0) * 100000;
            let total = 0;
            for (const row of this.skillRows) {
                if (!row.learned) continue;
                const full = this.skills.find((s) => s.id === row.skill_id);
                if (!full) continue;
                const arr = buildSkillCostArray(full.start_cost, this.ssCosts, this.race.skill_cost);
                total += skillExp(row.learned, arr, maxcost);
            }
            return total;
        },
        spellExpTotal() {
            if (!this.race) return 0;
            const maxcost = (this.race.spell_cost | 0) * 100000;
            let total = 0;
            for (const row of this.spellRows) {
                if (!row.learned) continue;
                const full = this.spells.find((s) => s.id === row.spell_id);
                if (!full) continue;
                const arr = buildSkillCostArray(full.start_cost, this.ssCosts, this.race.spell_cost);
                total += skillExp(row.learned, arr, maxcost);
            }
            return total;
        },
        statExpTotal() { return computeStatExp(this.statTrain, this.levelCostMap.stat); },
        levelExpObj() {
            return computeLevelExp({
                guildLevels: this.guildLevelsSum,
                freeLevels: this.freeLevels,
                qps: this.quest,
                levelCosts: this.levelCostMap.level,
                questCosts: this.levelCostMap.quest,
            });
        },
        totalExp() {
            return this.skillExpTotal + this.spellExpTotal + this.statExpTotal
                 + this.levelExpObj.raceExp + this.levelExpObj.guildExp;
        },
        goldRequired() {
            return Math.floor((this.skillExpTotal + this.spellExpTotal) / 2250);
        },
        qpsNeeded() {
            // Mirrors Character.cs:978 qpsneeded — sums questCosts across
            // EVERY level (guild + free), starting at level 0. QPs discount
            // every level the budget reaches, not just the free-level tail.
            let total = 0;
            const end = this.guildLevelsSum + this.freeLevels;
            const arr = this.levelCostMap.quest;
            for (let j = 0; j < end && j < arr.length; j++) total += arr[j] | 0;
            return total;
        },
        wishTpUsed() {
            let t = 0;
            for (const w of this.wishesCatalog) if (this.selectedWishes.has(w.id)) t += w.tp_cost | 0;
            return t;
        },
        boonPpTotal() {
            let t = 0;
            for (const b of this.boonsCatalog) if (this.selectedBoons.has(b.id)) t += b.pp_cost | 0;
            return t;
        },
        groupedWishes() {
            const m = { generic: [], lesser: [], greater: [], resist: [], other: [] };
            for (const w of this.wishesCatalog) (m[w.category] || (m.other)).push(w);
            return m;
        },
        infoGuild() {
            return this.infoGuildId == null ? null : this.guilds.find((g) => g.id === this.infoGuildId) || null;
        },
        // Skills and spells the info-modal guild teaches at or below
        // `infoGuildLevel`. Sorted by unlock-level then name so the
        // progression reads top-to-bottom. Skills/spells unlocked at
        // multiple levels collapse to their lowest unlock level.
        infoGuildUnlocks() {
            if (!this.infoGuild) return { skills: [], spells: [] };
            const data = this.guildData[this.infoGuildId];
            if (!data) return { skills: [], spells: [] };
            const lvl = this.infoGuildLevel | 0;
            const skillById = new Map();
            for (const r of data.skills || []) {
                if (r.level > lvl) continue;
                const prev = skillById.get(r.skill_id);
                if (!prev || r.level < prev.level) {
                    const name = (this.skills.find((s) => s.id === r.skill_id) || {}).name || ('#' + r.skill_id);
                    skillById.set(r.skill_id, { id: r.skill_id, name, level: r.level, max_percent: r.max_percent });
                } else if (r.max_percent > prev.max_percent) {
                    prev.max_percent = r.max_percent;
                }
            }
            const spellById = new Map();
            for (const r of data.spells || []) {
                if (r.level > lvl) continue;
                const prev = spellById.get(r.spell_id);
                if (!prev || r.level < prev.level) {
                    const name = (this.spells.find((s) => s.id === r.spell_id) || {}).name || ('#' + r.spell_id);
                    spellById.set(r.spell_id, { id: r.spell_id, name, level: r.level, max_percent: r.max_percent });
                } else if (r.max_percent > prev.max_percent) {
                    prev.max_percent = r.max_percent;
                }
            }
            const sortFn = (a, b) => a.level - b.level || a.name.localeCompare(b.name);
            return {
                skills: [...skillById.values()].sort(sortFn),
                spells: [...spellById.values()].sort(sortFn),
            };
        },
        groupedBoons() {
            const m = { racial: [], minor: [], preference: [], knowledge: [], weapon: [], lesser: [], greater: [] };
            for (const b of this.boonsCatalog) (m[b.category] || (m.racial = m.racial || [])).push(b);
            return m;
        },
    },
    methods: {
        // Build the cost-table display list including Char Max and Racial
        // Max markers. `active` has { scaled, maxPerGuild }; `kind` is
        // 'skill' or 'spell' for choosing the racial cap.
        _annotatedCostRows(costs, active, kind) {
            if (!costs || !costs.length || !active || !this.race || !this.character) return [];
            const charMax = active.scaled | 0;
            const racialMax = (kind === 'skill' ? this.character.skillMax : this.character.spellMax) | 0;
            // Place each marker after the LAST row whose pct is <= the cap
            // (or at the top if the cap is below 5%).
            const rows = [];
            const markersByAfter = {};        // pct string -> array of {label, pct}
            const charMarkerAfter = 5 * Math.floor(Math.min(charMax, 100) / 5);
            const racialMarkerAfter = 5 * Math.floor(Math.min(racialMax, 100) / 5);
            (markersByAfter[charMarkerAfter] ||= []).push({ label: 'Char Max', pct: charMax });
            // Only show a separate racial marker if it differs from char.
            if (racialMax !== charMax) {
                (markersByAfter[racialMarkerAfter] ||= []).push({ label: 'Racial Max', pct: racialMax });
            }
            for (let i = 0; i < costs.length; i++) {
                const pct = (i + 1) * 5;
                rows.push({
                    kind: 'row',
                    pct,
                    exp: costs[i],
                    gold: Math.floor(costs[i] / 2250),
                    overCharMax: pct > charMax,
                    overRacialMax: pct > racialMax,
                });
                if (markersByAfter[pct]) {
                    for (const m of markersByAfter[pct]) rows.push({ kind: 'marker', ...m });
                }
            }
            return rows;
        },
        maxAllSkills() {
            const out = {};
            for (const r of this.skillRows) out[r.skill_id] = r.scaled;
            this.skillLearned = out;
        },
        zeroAllSkills() { this.skillLearned = {}; },
        maxAllSpells() {
            const out = {};
            for (const r of this.spellRows) out[r.spell_id] = r.scaled;
            this.spellLearned = out;
        },
        zeroAllSpells() { this.spellLearned = {}; },
        setTotalLevels(v) {
            // The "Total Levels" input writes through to `extraFree`.
            // target = clamp(0..MAX_LEVEL); extraFree = target - guildSum
            // (can never go below 0 — if target < guildSum, user gets zero
            // free levels and the display shows guildSum).
            const target = Math.max(0, Math.min(MAX_LEVEL, parseInt(v, 10) || 0));
            this.extraFree = Math.max(0, target - this.guildLevelsSum);
        },
        async load() {
            const r = await axios.get('/api/game/reinc-bootstrap');
            const d = r.data.data;
            this.races = d.races;
            this.guilds = d.guilds;
            this.skills = d.skills;
            this.spells = d.spells;
            this.wishesCatalog = d.wishes;
            this.boonsCatalog = d.boons;
            this.ssCosts = d.ss_costs.map((r) => r.multiplier);
            const lc = { level: [], stat: [], quest: [] };
            for (const r of d.level_costs) { (lc[r.kind] ||= [])[r.level - 1] = r.cost; }
            this.levelCostMap = lc;
            if (this.enabledRaces.length) this.selectedRaceId = this.enabledRaces[0].id;
            this.loaded = true;
        },
        async loadGuildData(id) {
            if (this.guildData[id]) return;
            const r = await axios.get('/api/game/reinc-guild/' + id);
            this.guildData[id] = r.data.data;
        },
        async openGuildInfo(g) {
            this.infoGuildId = g.id;
            const pick = this.guildPicks.find((p) => p.guildId === g.id);
            this.infoGuildLevel = pick ? pick.level : g.max_level;
            if (!this.guildData[g.id]) {
                this.infoLoading = true;
                try { await this.loadGuildData(g.id); }
                finally { this.infoLoading = false; }
            }
        },
        closeGuildInfo() { this.infoGuildId = null; },
        parentOf(g) {
            return g && g.parent_id ? this.guilds.find((x) => x.id === g.parent_id) : null;
        },
        // A subguild is only available once its parent guild is selected and
        // sitting at the parent's max_level. The desktop client enforces this
        // because guild-level bonuses flow: parent_max + subguild_levels.
        isLocked(g) {
            const parent = this.parentOf(g);
            if (!parent) return false;
            const pick = this.guildPicks.find((p) => p.guildId === parent.id);
            if (!pick) return true;
            return (pick.level | 0) < (parent.max_level | 0);
        },
        dropDependentsOf(parentGuild) {
            // Remove any selected subguilds whose parent is no longer valid.
            const subs = this.guilds.filter((x) => x.parent_id === parentGuild.id);
            const subIds = new Set(subs.map((x) => x.id));
            this.guildPicks = this.guildPicks.filter((p) => !subIds.has(p.guildId));
        },
        // Click handler for guild rows. We intercept the click rather than
        // listening to the checkbox `change` event because Vue will skip
        // re-rendering a checkbox whose bound value didn't change — which
        // leaves the DOM visually checked even when we decline the toggle
        // (e.g. locked subguild, or the 120-level cap is full).
        onGuildClick(g) {
            if (this.isLocked(g)) {
                this.$root.flashMsg('Select the parent guild at max level first', 'danger');
                return;
            }
            this.toggleGuild(g);
        },
        async toggleGuild(g) {
            const i = this.guildPicks.findIndex((p) => p.guildId === g.id);
            if (i >= 0) {
                this.guildPicks.splice(i, 1);
                if (!g.parent_id) this.dropDependentsOf(g);
                return;
            }
            // Adding: refuse if there's no room in the 120-level budget.
            const room = Math.max(0, MAX_LEVEL - this.guildLevelsSum);
            if (room <= 0) {
                this.$root.flashMsg(`Total character level is capped at ${MAX_LEVEL}`, 'danger');
                return;
            }
            const startLevel = Math.min(g.max_level, room);
            this.guildPicks.push({ guildId: g.id, level: startLevel });
            await this.loadGuildData(g.id);
        },
        isPicked(g) { return this.guildPicks.some((p) => p.guildId === g.id); },
        pickLevel(g) {
            const p = this.guildPicks.find((pp) => pp.guildId === g.id);
            return p ? p.level : null;
        },
        setPickLevel(g, v) {
            const p = this.guildPicks.find((pp) => pp.guildId === g.id);
            if (!p) return;
            // Respect the per-guild max AND the global 120-level cap.
            const otherSum = this.guildLevelsSum - p.level;
            const globalRoom = Math.max(0, MAX_LEVEL - otherSum);
            const newLevel = Math.max(1, Math.min(g.max_level, globalRoom, parseInt(v, 10) || 0));
            p.level = newLevel;
            if (!g.parent_id && newLevel < g.max_level) this.dropDependentsOf(g);
        },
        reset() {
            if (!confirm('Reset all selections?')) return;
            this.guildPicks = [];
            this.statTrain = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
            this.selectedWishes = new Set();
            this.selectedBoons = new Set();
            this.skillLearned = {};
            this.spellLearned = {};
            this.extraFree = 0;
            this.quest = 0;
        },
        toggleWish(id) {
            const s = new Set(this.selectedWishes);
            s.has(id) ? s.delete(id) : s.add(id);
            this.selectedWishes = s;
        },
        toggleBoon(id) {
            const s = new Set(this.selectedBoons);
            s.has(id) ? s.delete(id) : s.add(id);
            this.selectedBoons = s;
        },
        setMaxSkill() {
            if (!this.activeSkill) return;
            this.skillLearned = { ...this.skillLearned, [this.activeSkill.skill_id]: this.activeSkill.scaled };
        },
        setSkillValue(pct) {
            if (!this.activeSkill) return;
            const capped = Math.max(0, Math.min(this.activeSkill.scaled, parseInt(pct, 10) || 0));
            this.skillLearned = { ...this.skillLearned, [this.activeSkill.skill_id]: capped };
        },
        setMaxSpell() {
            if (!this.activeSpell) return;
            this.spellLearned = { ...this.spellLearned, [this.activeSpell.spell_id]: this.activeSpell.scaled };
        },
        setSpellValue(pct) {
            if (!this.activeSpell) return;
            const capped = Math.max(0, Math.min(this.activeSpell.scaled, parseInt(pct, 10) || 0));
            this.spellLearned = { ...this.spellLearned, [this.activeSpell.spell_id]: capped };
        },
        nfmt(n) {
            if (n == null || isNaN(n)) return '0';
            // Avoid `| 0` — it truncates to int32 and overflows past ~2.1B into negatives.
            return Math.floor(Number(n)).toLocaleString();
        },
        // Short form for the summary bar. Splits into units so big totals stay
        // readable: 225 → "225", 17,053,600 → "17.0M", 6,826,783,700 → "6B 827M",
        // 1,234,567,890,000 → "1T 234B". Small values stay literal.
        sfmt(n) {
            if (n == null || isNaN(n)) return '0';
            const v = Number(n);
            const abs = Math.abs(v);
            const sign = v < 0 ? '-' : '';
            if (abs >= 1e12) {
                const t = Math.floor(abs / 1e12);
                const b = Math.round((abs - t * 1e12) / 1e9);
                return sign + (b ? `${t}T ${b}B` : `${t}T`);
            }
            if (abs >= 1e9) {
                const b = Math.floor(abs / 1e9);
                const m = Math.round((abs - b * 1e9) / 1e6);
                return sign + (m ? `${b}B ${m}M` : `${b}B`);
            }
            if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
            if (abs >= 1e4) return sign + (abs / 1e3).toFixed(1) + 'K';
            return Math.floor(abs).toLocaleString();
        },
    },
    async mounted() {
        try { await this.load(); }
        catch (e) { this.$root.flashError(e); }
        // Expose a snapshot of the planner state to the bug reporter.
        this.$root.registerBugStateProvider(() => ({
            tab: this.tab,
            race: this.race ? { id: this.race.id, name: this.race.name } : null,
            guild_picks: this.guildPicks.map((p) => {
                const g = this.guilds.find((x) => x.id === p.guildId);
                return { id: p.guildId, name: g && g.name, level: p.level, max: g && g.max_level };
            }),
            stat_train: { ...this.statTrain },
            wishes: Array.from(this.selectedWishes),
            boons: Array.from(this.selectedBoons),
            total_levels: this.totalLevels,
            guild_levels_sum: this.guildLevelsSum,
            free_levels: this.freeLevels,
            quest_points: this.quest,
            totals: this.character ? {
                hp: this.character.hp, sp: this.character.sp,
                hpr: this.character.hpr, spr: this.character.spr,
                stats: this.character.finalStats,
                skill_max: this.character.skillMax, spell_max: this.character.spellMax,
            } : null,
            exp: {
                skill: this.skillExpTotal, spell: this.spellExpTotal,
                stat_training: this.statExpTotal, level: this.levelExpObj,
                total: this.totalExp, gold: this.goldRequired,
            },
            active_skill_id: this.activeSkillId,
            active_spell_id: this.activeSpellId,
            skill_learned: { ...this.skillLearned },
            spell_learned: { ...this.spellLearned },
        }));
    },
    beforeUnmount() {
        this.$root.registerBugStateProvider(null);
    },
    watch: {
        guildPicks: {
            deep: true,
            async handler(picks) {
                // Lazy-load per-guild bonus/skill/spell data the first time
                // a guild is selected. `extraFree` is now independent state
                // (see `freeLevels` computed for the derivation); we don't
                // bump it here — `freeLevels` automatically clamps itself
                // to `MAX_LEVEL - guildLevelsSum` at render time.
                for (const p of picks) if (!this.guildData[p.guildId]) await this.loadGuildData(p.guildId);
            },
        },
    },
};
</script>

<template>
<div class="reinc" v-if="loaded">

    <!-- Top summary strip: stats / regen / resistances / exp rate -->
    <div class="summary-bar" v-if="character">
        <div class="sb-row">
            <div class="sb-cell"><span class="sb-label">Race</span><span class="sb-value">{{ race.name }}</span></div>
            <div class="sb-cell"><span class="sb-label">HP</span><span class="sb-value">{{ sfmt(character.hp) }}</span></div>
            <div class="sb-cell"><span class="sb-label">SP</span><span class="sb-value">{{ sfmt(character.sp) }}</span></div>
            <div class="sb-cell"><span class="sb-label">HPR</span><span class="sb-value">{{ character.hpr }}</span></div>
            <div class="sb-cell"><span class="sb-label">SPR</span><span class="sb-value">{{ character.spr }}</span></div>
            <div class="sb-cell" v-for="s in ['str','dex','con','int','wis','cha']" :key="s">
                <span class="sb-label">{{ s.toUpperCase() }}</span><span class="sb-value">{{ character.finalStats[s] }}</span>
            </div>
            <div class="sb-cell"><span class="sb-label">Size</span><span class="sb-value">{{ character.size }}</span></div>
            <div class="sb-cell"><span class="sb-label">Exp rate</span><span class="sb-value">{{ race.exp_rate }}%</span></div>
            <div class="sb-cell"><span class="sb-label">Level</span><span class="sb-value">{{ guildLevelsSum + freeLevels }}/{{ MAX_LEVEL }}</span></div>
            <div class="sb-cell"><span class="sb-label">Total XP</span><span class="sb-value" :title="nfmt(totalExp)">{{ sfmt(totalExp) }}</span></div>
            <div class="sb-cell"><span class="sb-label">Gold</span><span class="sb-value" :title="nfmt(goldRequired)">{{ sfmt(goldRequired) }}</span></div>
        </div>
        <div class="sb-row sb-guilds" v-if="pickedGuildSummaries.length">
            <span class="sb-label me-2">GUILDS</span>
            <span v-for="g in pickedGuildSummaries" :key="g.id" class="sb-chip" :class="{ sub: g.isSub }">
                {{ g.name }} <small>{{ g.level }}/{{ g.max }}</small>
            </span>
        </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs reinc-tabs">
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='general'}" href="#" @click.prevent="tab='general'">General</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='skills'}" href="#" @click.prevent="tab='skills'">Skills</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='spells'}" href="#" @click.prevent="tab='spells'">Spells</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='misc'}" href="#" @click.prevent="tab='misc'">Miscellaneous</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='wishes'}" href="#" @click.prevent="tab='wishes'">Wishes</a></li>
        <li class="nav-item"><a class="nav-link" :class="{active:tab==='boons'}" href="#" @click.prevent="tab='boons'">Boons</a></li>
    </ul>

    <!-- ============ GENERAL TAB ============ -->
    <!-- tab-body is an outer scroll container; grid is a separate inner
         element so the mobile @media `flex: 0 0 auto` rule on the grid
         doesn't also collapse the scroll container. -->
    <div v-if="tab==='general'" class="tab-body">
        <div class="general-grid">
        <div class="col-races">
            <label class="form-label small mb-1"><strong>Select Race</strong></label>
            <select class="form-select form-select-sm list-select" size="12" v-model="selectedRaceId">
                <option v-for="r in enabledRaces" :key="r.id" :value="r.id">{{ r.parent_name ? '  ' : '' }}{{ r.name }}</option>
            </select>

            <label class="form-label small mb-1 mt-2"><strong>Select Guilds</strong></label>
            <input type="search" class="form-control form-control-sm mb-1" placeholder="Search guilds…" v-model="guildSearch">
            <div class="guild-list">
                <div v-if="guildTree.length === 0" class="small text-muted p-2">No guilds match “{{ guildSearch }}”.</div>
                <div v-for="g in guildTree" :key="g.id" class="guild-row"
                     :class="{ picked: isPicked(g), sub: g.depth, locked: isLocked(g) }"
                     :title="isLocked(g) ? 'Select the parent guild at max level to unlock this subguild' : ''">
                    <label class="d-flex align-items-center flex-grow-1 mb-0" :style="isLocked(g) ? 'cursor:not-allowed;' : 'cursor:pointer;'" @click.prevent="onGuildClick(g)">
                        <input type="checkbox" class="form-check-input me-2" :checked="isPicked(g)" :disabled="isLocked(g)" @click.prevent>
                        <span :class="{ 'text-muted': g.depth || isLocked(g) }">{{ g.depth ? '- ' : '' }}{{ g.name }}</span>
                        <span v-if="isLocked(g)" class="ms-2 small text-muted">🔒</span>
                    </label>
                    <input v-if="isPicked(g)" type="number" class="form-control form-control-sm level-input"
                           :value="pickLevel(g)" @input="setPickLevel(g, $event.target.value)" :max="g.max_level" min="1">
                    <span v-if="isPicked(g)" class="small text-muted ms-1">/ {{ g.max_level }}</span>
                    <button type="button" class="btn btn-link btn-sm guild-info-btn"
                            :disabled="isLocked(g)"
                            @click.stop.prevent="openGuildInfo(g)"
                            :title="`Show skills and spells taught by ${g.name}`"
                            aria-label="Show skills and spells">ⓘ</button>
                </div>
            </div>
        </div>

        <div class="col-stats" v-if="race && character">
            <div class="racial-box">
                <h6 class="m-0 mb-1">Racial Stats</h6>
                <div class="racial-grid small">
                    <div>Exp: <b>{{ race.exp_rate }}</b></div>
                    <div>Size: <b>{{ race.size }}</b></div>
                    <div>Str: <b>{{ race.max_str }}</b></div>
                    <div>Dex: <b>{{ race.max_dex }}</b></div>
                    <div>Con: <b>{{ race.max_con }}</b></div>
                    <div>Int: <b>{{ race.max_int }}</b></div>
                    <div>Wis: <b>{{ race.max_wis }}</b></div>
                    <div>Cha: <b>{{ race.max_cha }}</b></div>
                    <div>HP Reg: <b>{{ race.hp_regen }}</b></div>
                    <div>SP Reg: <b>{{ race.sp_regen }}</b></div>
                    <div>Sk Max: <b>{{ race.skill_max }}</b></div>
                    <div>Sk Cost: <b>{{ race.skill_cost }}</b></div>
                    <div>Sp Max: <b>{{ race.spell_max }}</b></div>
                    <div>Sp Cost: <b>{{ race.spell_cost }}</b></div>
                </div>
            </div>

            <div class="computed-box">
                <h6 class="m-0 mb-1">Computed</h6>
                <div class="computed-grid small">
                    <div>HP <b>{{ nfmt(character.hp) }}</b></div>
                    <div>Str <b>{{ character.finalStats.str }}</b></div>
                    <div>Int <b>{{ character.finalStats.int }}</b></div>
                    <div>SkMax <b>{{ character.skillMax }}</b></div>
                    <div>SP <b>{{ nfmt(character.sp) }}</b></div>
                    <div>Con <b>{{ character.finalStats.con }}</b></div>
                    <div>Wis <b>{{ character.finalStats.wis }}</b></div>
                    <div>SpMax <b>{{ character.spellMax }}</b></div>
                    <div>HPR <b>{{ character.hpr }}</b></div>
                    <div>Dex <b>{{ character.finalStats.dex }}</b></div>
                    <div>Cha <b>{{ character.finalStats.cha }}</b></div>
                    <div>Size <b>{{ character.size }}</b></div>
                    <div>SPR <b>{{ character.spr }}</b></div>
                </div>
            </div>
        </div>

        <div class="col-exp">
            <div class="levels-grid small mb-2">
                <div class="lg-row"><span>Total Levels:</span><input type="number" :value="totalLevels" @input="setTotalLevels($event.target.value)" :max="MAX_LEVEL" min="0" class="form-control form-control-sm"></div>
                <div class="lg-row"><span>Guild Levels:</span><span class="readout">{{ guildLevelsSum }}</span></div>
                <div class="lg-row"><span>Free Levels:</span><span class="readout">{{ freeLevels }}</span></div>
                <div class="lg-row"><span>Quest Points:</span><input type="number" v-model.number="quest" class="form-control form-control-sm"></div>
                <div class="lg-row"><span>QPs Needed:</span><span class="readout">{{ nfmt(qpsNeeded) }}</span></div>
                <div class="lg-row"><span>QPs Left:</span><span class="readout">{{ nfmt(levelExpObj.qpsLeft) }}</span></div>
            </div>

            <table class="exp-table small">
                <tr><td>Experience for Skills:</td><td class="text-end">{{ nfmt(skillExpTotal) }}</td></tr>
                <tr><td>Experience for Spells:</td><td class="text-end">{{ nfmt(spellExpTotal) }}</td></tr>
                <tr><td>Experience for Race Levels:</td><td class="text-end">{{ nfmt(levelExpObj.raceExp) }}</td></tr>
                <tr><td>Experience for Guild Levels:</td><td class="text-end">{{ nfmt(levelExpObj.guildExp) }}</td></tr>
                <tr><td>Experience for Stat Training:</td><td class="text-end">{{ nfmt(statExpTotal) }}</td></tr>
                <tr class="fw-bold"><td>Total Experience:</td><td class="text-end">{{ nfmt(totalExp) }}</td></tr>
                <tr><td>Gold Required:</td><td class="text-end">{{ nfmt(goldRequired) }} gp</td></tr>
            </table>

            <button class="btn btn-danger btn-sm mt-2" @click="reset">RESET</button>
        </div>
        </div><!-- /general-grid -->
    </div>

    <!-- ============ SKILLS TAB ============ -->
    <div v-if="tab==='skills'" class="tab-body">
        <div class="skills-grid">
        <div class="col-skill-list">
            <div class="d-flex align-items-center mb-1 gap-2 flex-wrap">
                <h6 class="m-0 flex-grow-1">Available Skills ({{ skillRows.length }})</h6>
                <button class="btn btn-sm btn-outline-success" @click="maxAllSkills" :disabled="!skillRows.length">Max All</button>
                <button class="btn btn-sm btn-outline-secondary" @click="zeroAllSkills" :disabled="!skillRows.length">Zero All</button>
            </div>
            <div class="skill-list">
                <div v-for="s in skillRows" :key="s.skill_id"
                     class="skill-row" :class="{active: activeSkillId===s.skill_id}"
                     @click="activeSkillId = s.skill_id">
                    <span class="flex-grow-1">{{ s.name }}</span>
                    <span class="small">{{ s.learned }} / {{ s.scaled }}</span>
                </div>
            </div>
            <div class="mt-2 small exp-summary">
                <div>Exp for selected Skill: <strong>{{ nfmt(activeSkillExp) }}</strong></div>
                <div>Total Exp for all Skills: <strong>{{ nfmt(skillExpTotal) }}</strong></div>
            </div>
        </div>
        <div class="col-skill-detail">
            <h6 class="m-0 mb-1">Skill Description</h6>
            <div class="desc-box">
                <div v-if="activeSkill" class="small">
                    <div><strong>{{ activeSkill.name }}</strong> — start cost: {{ nfmt(activeSkill.start_cost) }}</div>
                    <div>Per-guild max: {{ activeSkill.maxPerGuild }}% → char max: {{ activeSkill.scaled }}%</div>
                    <div class="mt-2 d-flex align-items-center gap-2">
                        <input type="number" class="form-control form-control-sm" style="width:6em;"
                               :value="activeSkill.learned" @input="setSkillValue($event.target.value)">
                        <button class="btn btn-sm btn-outline-primary" @click="setMaxSkill">Max</button>
                    </div>
                </div>
                <div v-else class="text-muted small">Select a skill from the list.</div>
            </div>
            <h6 class="m-0 mt-3 mb-1">Estimated Skill Costs</h6>
            <div class="cost-table-wrap">
                <table class="cost-table small">
                    <thead><tr><th>%</th><th class="text-end">Exp</th><th class="text-end">Gold</th></tr></thead>
                    <tbody>
                        <template v-for="(row, i) in skillCostRows" :key="i">
                            <tr v-if="row.kind === 'row'" :class="{ 'over-max': row.overCharMax }">
                                <td>{{ row.pct }}%</td>
                                <td class="text-end">{{ nfmt(row.exp) }}</td>
                                <td class="text-end">{{ nfmt(row.gold) }}</td>
                            </tr>
                            <tr v-else class="cap-marker">
                                <td colspan="3">──── {{ row.label }} ({{ row.pct }}%) ────</td>
                            </tr>
                        </template>
                    </tbody>
                </table>
            </div>
        </div>
        </div><!-- /skills-grid -->
    </div>

    <!-- ============ SPELLS TAB ============ -->
    <div v-if="tab==='spells'" class="tab-body">
        <div class="skills-grid">
        <div class="col-skill-list">
            <div class="d-flex align-items-center mb-1 gap-2 flex-wrap">
                <h6 class="m-0 flex-grow-1">Available Spells ({{ spellRows.length }})</h6>
                <button class="btn btn-sm btn-outline-success" @click="maxAllSpells" :disabled="!spellRows.length">Max All</button>
                <button class="btn btn-sm btn-outline-secondary" @click="zeroAllSpells" :disabled="!spellRows.length">Zero All</button>
            </div>
            <div class="skill-list">
                <div v-for="s in spellRows" :key="s.spell_id"
                     class="skill-row" :class="{active: activeSpellId===s.spell_id}"
                     @click="activeSpellId = s.spell_id">
                    <span class="flex-grow-1">{{ s.name }}</span>
                    <span class="small">{{ s.learned }} / {{ s.scaled }}</span>
                </div>
            </div>
            <div class="mt-2 small exp-summary">
                <div>Exp for selected Spell: <strong>{{ nfmt(activeSpellExp) }}</strong></div>
                <div>Total Exp for all Spells: <strong>{{ nfmt(spellExpTotal) }}</strong></div>
            </div>
        </div>
        <div class="col-skill-detail">
            <h6 class="m-0 mb-1">Spell Description</h6>
            <div class="desc-box">
                <div v-if="activeSpell" class="small">
                    <div><strong>{{ activeSpell.name }}</strong> — start cost: {{ nfmt(activeSpell.start_cost) }}</div>
                    <div>Per-guild max: {{ activeSpell.maxPerGuild }}% → char max: {{ activeSpell.scaled }}%</div>
                    <div class="mt-2 d-flex align-items-center gap-2">
                        <input type="number" class="form-control form-control-sm" style="width:6em;"
                               :value="activeSpell.learned" @input="setSpellValue($event.target.value)">
                        <button class="btn btn-sm btn-outline-primary" @click="setMaxSpell">Max</button>
                    </div>
                </div>
                <div v-else class="text-muted small">Select a spell from the list.</div>
            </div>
            <h6 class="m-0 mt-3 mb-1">Estimated Spell Costs</h6>
            <div class="cost-table-wrap">
                <table class="cost-table small">
                    <thead><tr><th>%</th><th class="text-end">Exp</th><th class="text-end">Gold</th></tr></thead>
                    <tbody>
                        <template v-for="(row, i) in spellCostRows" :key="i">
                            <tr v-if="row.kind === 'row'" :class="{ 'over-max': row.overCharMax }">
                                <td>{{ row.pct }}%</td>
                                <td class="text-end">{{ nfmt(row.exp) }}</td>
                                <td class="text-end">{{ nfmt(row.gold) }}</td>
                            </tr>
                            <tr v-else class="cap-marker">
                                <td colspan="3">──── {{ row.label }} ({{ row.pct }}%) ────</td>
                            </tr>
                        </template>
                    </tbody>
                </table>
            </div>
        </div>
        </div><!-- /skills-grid -->
    </div>

    <!-- ============ MISC TAB ============ -->
    <div v-if="tab==='misc'" class="tab-body">
        <div class="misc-grid">
        <div>
            <h6>Stat Training</h6>
            <div class="stat-grid">
                <div v-for="s in ['str','con','dex','int','wis','cha']" :key="s" class="stat-row">
                    <label class="form-label small m-0 me-2" style="width:3em;">{{ s.toUpperCase() }}:</label>
                    <input type="number" class="form-control form-control-sm" v-model.number="statTrain[s]" min="0" max="50">
                </div>
            </div>
            <div class="small mt-2">Exp for stat training: <strong>{{ nfmt(statExpTotal) }}</strong></div>
        </div>
        <div>
            <h6>Resistances</h6>
            <div v-if="character" class="small">
                <div v-for="(val, key) in character.resistances" :key="key">
                    {{ key }}: {{ val }}
                </div>
                <div v-if="!Object.keys(character.resistances).length" class="text-muted">— no guild resistance bonuses —</div>
                <div v-if="character.wishResistances.length" class="mt-2">
                    Wish resistances: <span v-for="r in character.wishResistances" :key="r" class="badge bg-info text-dark me-1">{{ r }}</span>
                </div>
            </div>
        </div>
        </div><!-- /misc-grid -->
    </div>

    <!-- ============ WISHES TAB ============ -->
    <div v-if="tab==='wishes'" class="tab-body">
        <div class="wishes-grid">
        <div class="wishes-header">
            <h6 class="m-0">Wishes</h6>
            <div class="small">TPs spent: <strong>{{ nfmt(wishTpUsed) }}</strong> / <input type="number" v-model.number="tp" class="form-control form-control-sm d-inline-block" style="width:6em;"></div>
        </div>
        <div class="wish-cols">
            <div class="wish-col">
                <div class="cat-head">Generic</div>
                <label v-for="w in groupedWishes.generic" :key="w.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedWishes.has(w.id)" @change="toggleWish(w.id)">
                    {{ w.name }} <small class="text-muted">({{ w.tp_cost }})</small>
                </label>
                <div class="cat-head mt-2">Resistances</div>
                <label v-for="w in groupedWishes.resist" :key="w.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedWishes.has(w.id)" @change="toggleWish(w.id)">
                    {{ w.name }} <small class="text-muted">({{ w.tp_cost }})</small>
                </label>
            </div>
            <div class="wish-col">
                <div class="cat-head">Lesser</div>
                <label v-for="w in groupedWishes.lesser" :key="w.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedWishes.has(w.id)" @change="toggleWish(w.id)">
                    {{ w.name }} <small class="text-muted">({{ w.tp_cost }})</small>
                </label>
            </div>
            <div class="wish-col">
                <div class="cat-head">Greater</div>
                <label v-for="w in groupedWishes.greater" :key="w.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedWishes.has(w.id)" @change="toggleWish(w.id)">
                    {{ w.name }} <small class="text-muted">({{ w.tp_cost }})</small>
                </label>
            </div>
        </div>
        </div><!-- /wishes-grid -->
    </div>

    <!-- ============ BOONS TAB ============ -->
    <div v-if="tab==='boons'" class="tab-body">
        <div class="boons-grid">
        <div class="boons-header">
            <h6 class="m-0">Boons</h6>
            <div class="small">Total PP Cost: <strong>{{ nfmt(boonPpTotal) }}</strong></div>
        </div>
        <div class="boon-cols">
            <div class="boon-col">
                <div class="cat-head">Racial (50 PP)</div>
                <label v-for="b in groupedBoons.racial" :key="b.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedBoons.has(b.id)" @change="toggleBoon(b.id)">
                    {{ b.name }}
                </label>
                <div class="cat-head mt-2">Preference (50 PP)</div>
                <label v-for="b in groupedBoons.preference" :key="b.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedBoons.has(b.id)" @change="toggleBoon(b.id)">
                    {{ b.name }}
                </label>
                <div class="cat-head mt-2">Knowledge (100 PP)</div>
                <label v-for="b in groupedBoons.knowledge" :key="b.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedBoons.has(b.id)" @change="toggleBoon(b.id)">
                    {{ b.name }}
                </label>
            </div>
            <div class="boon-col">
                <div class="cat-head">Minor (100 PP)</div>
                <label v-for="b in groupedBoons.minor" :key="b.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedBoons.has(b.id)" @change="toggleBoon(b.id)">
                    {{ b.name }}
                </label>
                <div class="cat-head mt-2">Weapon (75 PP)</div>
                <label v-for="b in groupedBoons.weapon" :key="b.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedBoons.has(b.id)" @change="toggleBoon(b.id)">
                    {{ b.name }}
                </label>
            </div>
            <div class="boon-col">
                <div class="cat-head">Lesser</div>
                <label v-for="b in groupedBoons.lesser" :key="b.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedBoons.has(b.id)" @change="toggleBoon(b.id)">
                    {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                </label>
                <div class="cat-head mt-2">Greater</div>
                <label v-for="b in groupedBoons.greater" :key="b.id" class="wish-item">
                    <input type="checkbox" class="form-check-input me-1" :checked="selectedBoons.has(b.id)" @change="toggleBoon(b.id)">
                    {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                </label>
            </div>
        </div>
        </div><!-- /boons-grid -->
    </div>

<!-- Per-guild "what does this teach" modal — bug #13. -->
<div v-if="infoGuild" class="reinc-modal-backdrop" @click.self="closeGuildInfo">
    <div class="reinc-modal-panel">
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="m-0">{{ infoGuild.name }}<span class="text-muted small ms-2">skills &amp; spells</span></h5>
            <button type="button" class="btn-close" aria-label="Close" @click="closeGuildInfo"></button>
        </div>
        <div class="d-flex align-items-center gap-2 mb-2 small">
            <label class="m-0">Show unlocks at level</label>
            <input type="number" class="form-control form-control-sm rm-level-input"
                   v-model.number="infoGuildLevel" min="1" :max="infoGuild.max_level">
            <span class="text-muted">/ {{ infoGuild.max_level }}</span>
            <input type="range" class="form-range flex-grow-1"
                   v-model.number="infoGuildLevel" min="1" :max="infoGuild.max_level">
        </div>
        <div v-if="infoLoading" class="text-muted small">Loading…</div>
        <div v-else class="rm-cols">
            <div>
                <h6 class="mb-1">Skills <span class="text-muted small">({{ infoGuildUnlocks.skills.length }})</span></h6>
                <div v-if="!infoGuildUnlocks.skills.length" class="text-muted small">None at this level.</div>
                <table v-else class="table table-sm small mb-0">
                    <thead><tr><th>Lv</th><th>Name</th><th class="text-end">Max %</th></tr></thead>
                    <tbody>
                        <tr v-for="s in infoGuildUnlocks.skills" :key="s.id">
                            <td class="text-muted">{{ s.level }}</td>
                            <td>{{ s.name }}</td>
                            <td class="text-end">{{ s.max_percent }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div>
                <h6 class="mb-1">Spells <span class="text-muted small">({{ infoGuildUnlocks.spells.length }})</span></h6>
                <div v-if="!infoGuildUnlocks.spells.length" class="text-muted small">None at this level.</div>
                <table v-else class="table table-sm small mb-0">
                    <thead><tr><th>Lv</th><th>Name</th><th class="text-end">Max %</th></tr></thead>
                    <tbody>
                        <tr v-for="s in infoGuildUnlocks.spells" :key="s.id">
                            <td class="text-muted">{{ s.level }}</td>
                            <td>{{ s.name }}</td>
                            <td class="text-end">{{ s.max_percent }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
</div>
<div v-else class="p-3">Loading Zcreator data…</div>
</template>

<style scoped>
.reinc {
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}
.summary-bar {
    padding: 0.4rem 0.6rem;
    background: #1f2937; color: #fff;
    border-radius: 0.35rem;
    margin-bottom: 0.35rem;
    flex: 0 0 auto;
}
.sb-row { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; }
.sb-row + .sb-row { margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.12); }
.sb-cell { display: flex; flex-direction: column; min-width: 3.5em; }
.sb-label { font-size: 0.65rem; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.5px; }
.sb-value { font-weight: 700; font-size: 0.95rem; }
.sb-guilds { gap: 0.35rem; }
.sb-chip {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.1rem 0.55rem;
    background: #374151; border-radius: 999px;
    font-size: 0.78rem;
}
.sb-chip small { opacity: 0.7; }
.sb-chip.sub { background: #4b3a5a; }

.reinc-tabs { flex: 0 0 auto; margin-bottom: 0; }
.tab-body {
    background: #fff;
    border: 1px solid #dee2e6;
    border-top: 0;
    border-radius: 0 0 0.35rem 0.35rem;
    padding: 0.6rem;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;              /* inner areas scroll individually */
    display: flex;
    flex-direction: column;
}

/* GENERAL */
.general-grid {
    display: grid;
    /* Give the guild picker the most room on desktop since that's where
       users spend the most time; stats and exp are narrower. */
    grid-template-columns: minmax(18rem, 1.6fr) minmax(16rem, 1.2fr) minmax(14rem, 1fr);
    gap: 0.75rem;
    width: 100%;
    flex: 1 1 auto;
    min-height: 0;
}
.col-races, .col-stats, .col-exp {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.list-select { font-family: monospace; flex: 0 0 auto; }
.guild-list {
    flex: 1 1 auto;
    min-height: 4rem;
    overflow-y: auto;
    border: 1px solid #dee2e6; border-radius: 0.25rem;
    padding: 0.25rem;
    font-family: monospace;
}
.guild-row { display: flex; align-items: center; padding: 0.1rem 0.25rem; }
.guild-row.sub { padding-left: 1rem; }
.guild-row.picked { background: #e7f1ff; }
.guild-row.locked { opacity: 0.55; }
.guild-info-btn {
    padding: 0 0.35rem; line-height: 1; text-decoration: none;
    color: #6c757d; font-size: 1rem;
}
.guild-info-btn:hover:not(:disabled) { color: #0d6efd; }
.guild-info-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* Per-guild "what does this teach" modal — bug #13.
 * Uses its own classes (not .modal-backdrop) so it doesn't collide with
 * BugReportModal's scoped styles or Bootstrap's modal CSS. The panel
 * scrolls internally because the planner page is locked to 100vh. */
.reinc-modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 2000;
    display: flex; align-items: flex-start; justify-content: center;
    padding: 3rem 1rem 1rem;
    overflow-y: auto;
}
.reinc-modal-panel {
    background: #fff;
    padding: 1.25rem;
    border-radius: 0.5rem;
    width: 100%;
    max-width: 44rem;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    box-shadow: 0 1rem 3rem rgba(0,0,0,0.35);
}
.rm-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.rm-level-input { width: 4.5rem; }
@media (max-width: 720px) {
    .rm-cols { grid-template-columns: 1fr; }
    .reinc-modal-backdrop { padding: 1rem 0.5rem; }
}
.level-input { width: 4em; padding: 0.1rem 0.3rem; height: auto; }

.racial-box, .computed-box {
    border: 1px solid #6c757d;
    padding: 0.4rem 0.5rem;
    border-radius: 0.25rem;
    margin-bottom: 0.5rem;
    font-family: monospace;
}
.racial-grid, .computed-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.1rem 0.6rem;
}

.levels-grid { display: grid; grid-template-columns: 1fr; gap: 0.2rem; }
.lg-row { display: grid; grid-template-columns: 9rem 1fr; align-items: center; gap: 0.5rem; }
.readout { font-family: monospace; font-weight: 600; }

.exp-table { width: 100%; border-collapse: collapse; }
.exp-table td { padding: 0.1rem 0.25rem; border-top: 1px solid #eee; font-family: monospace; }

/* SKILLS */
.skills-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1.3fr) minmax(16rem, 1fr);
    gap: 0.75rem;
    width: 100%;
    flex: 1 1 auto;
    min-height: 0;
}
.col-skill-list, .col-skill-detail {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.skill-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid #dee2e6;
    border-radius: 0.25rem;
    font-family: monospace;
}
.cost-table-wrap { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.skill-row { display: flex; padding: 0.1rem 0.5rem; cursor: pointer; }
.skill-row:hover { background: #f1f5f9; }
.skill-row.active { background: #cfe2ff; }
.desc-box { border: 1px solid #dee2e6; min-height: 7rem; padding: 0.5rem; border-radius: 0.25rem; background: #fafafa; }
.cost-table { width: 100%; font-family: monospace; border-collapse: separate; border-spacing: 0; }
.cost-table th, .cost-table td { padding: 0.1rem 0.4rem; }
/* Sticky header with an opaque background — without a background the
   header paints on top of the first few rows when the container scrolls. */
.cost-table thead th {
    position: sticky;
    top: 0;
    background: #fff;
    border-bottom: 1px solid #6c757d;
    z-index: 1;
}
.cost-table tbody tr.over-max { color: #999; }
.cost-table tbody tr.cap-marker td {
    text-align: center;
    color: #6c757d;
    font-size: 0.7rem;
    padding: 0.1rem 0;
    border-top: 1px dashed #adb5bd;
    border-bottom: 1px dashed #adb5bd;
}
.exp-summary { flex: 0 0 auto; padding-top: 0.25rem; border-top: 1px solid #dee2e6; margin-top: 0.5rem !important; }

/* MISC */
.misc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}
.stat-grid { display: grid; grid-template-columns: 1fr; gap: 0.25rem; max-width: 14rem; }
.stat-row { display: flex; align-items: center; }

/* WISHES + BOONS */
.wishes-grid, .boons-grid {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.wishes-header, .boons-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    flex: 0 0 auto;
}
.wish-cols, .boon-cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
}
.wish-col, .boon-col { font-family: monospace; }
.cat-head { font-weight: 700; text-transform: uppercase; font-size: 0.7rem; color: #555; border-bottom: 1px solid #aaa; margin-bottom: 0.25rem; }
.wish-item { display: flex; align-items: center; margin-bottom: 0.15rem; cursor: pointer; }

/* Mobile / narrow */
@media (max-width: 800px) {
    .general-grid, .skills-grid, .misc-grid { grid-template-columns: 1fr; }
    .wish-cols, .boon-cols { grid-template-columns: 1fr; }
    .racial-grid, .computed-grid { grid-template-columns: repeat(2, 1fr); }
    .summary-bar { font-size: 0.75rem; }
    /* On narrow viewports the stacked single-column layout cannot fit in
       a fixed viewport, so the tab-body scrolls internally. This is still
       an internal scroll region — not a page-level scroll — which honours
       the "no page scroll" rule from CLAUDE.md. The inner col-* elements
       drop their own overflow so there isn't a nested double-scroll. */
    .tab-body { overflow-y: auto; }
    .col-races, .col-stats, .col-exp,
    .col-skill-list, .col-skill-detail { overflow: visible; }
    .guild-list, .skill-list, .cost-table-wrap { max-height: none; }
    .general-grid, .skills-grid { flex: 0 0 auto; }
}
@media (max-width: 520px) {
    .summary-bar { font-size: 0.7rem; }
    .sb-cell { min-width: 2.75em; }
}
</style>
