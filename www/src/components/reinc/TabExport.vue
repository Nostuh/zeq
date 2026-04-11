<script>
// Bug #17 — the original Zcreator desktop app had a "Save Character"
// action that wrote a text summary, and a separate export that spat out
// the train/study commands ready to paste into the game. This tab brings
// both back as copy-to-clipboard blocks. Formulas and formatting mirror
// CharCreator.cs:4152 (saveCharacter_FileOk) and CharCreator.cs:3146
// (train/study chunking — skills emit at most 20 `n train name` calls
// per line before splitting to a new chunk).
//
// Train/study commands are rendered as one block per guild, each with
// its own copy button, so users can paste straight into the game one
// guild at a time (you have to be IN the guildhall to run the commands,
// and the guild header label itself is not a valid game command —
// that's why the copy button deliberately copies ONLY the command line,
// never the guild name above it). A separate "Select Wishes" block
// emits `select <wish>` commands for every wish the user picked.
export default {
    name: 'ReincTabExport',
    inject: ['reinc'],
    data() {
        return { copied: '' };
    },
    computed: {
        summaryText() {
            const r = this.reinc;
            if (!r.race || !r.character) return '';
            const c = r.character;
            const lines = [];
            const dashes = '----------------------------------------';
            lines.push(dashes);
            lines.push('RACE: ' + r.race.name);
            lines.push(dashes);
            lines.push('');
            lines.push('GUILDS');
            lines.push(dashes);
            for (const p of r.resolvedPicks) {
                lines.push(`${p.guild.name}  ${p.level}/${p.guild.max_level}`);
            }
            lines.push(`Free Levels: ${r.freeLevels}`);
            lines.push(dashes);
            lines.push('');
            lines.push('RESULTING CHARACTER');
            lines.push(dashes);
            const row = (k, v) => lines.push(`${k}:\t${v}`);
            row('Hpmax', r.nfmt(c.hp));
            row('Spmax', r.nfmt(c.sp));
            row('Hpregen', c.hpr);
            row('Spregen', c.spr);
            row('SkillMax', c.skillMax);
            row('SpellMax', c.spellMax);
            row('Str', c.finalStats.str);
            row('Con', c.finalStats.con);
            row('Dex', c.finalStats.dex);
            row('Int', c.finalStats.int);
            row('Wis', c.finalStats.wis);
            row('Cha', c.finalStats.cha);
            row('Size', c.size);
            row('Exprate', r.race.exp_rate + '%');
            row('Total Level', `${r.totalLevels}/${r.MAX_LEVEL}`);
            row('Experience', r.nfmt(r.totalExp));
            row('Gold', r.nfmt(r.goldRequired));
            row('Quest Points', r.quest);
            lines.push(dashes);
            lines.push('');
            lines.push('WISHES');
            lines.push(dashes);
            const pickedWishes = r.wishesCatalog.filter((w) => r.selectedWishes.has(w.id));
            if (pickedWishes.length) for (const w of pickedWishes) lines.push(w.name);
            else lines.push('(none)');
            lines.push(dashes);
            lines.push('');
            lines.push('BOONS');
            lines.push(dashes);
            const pickedBoons = r.boonsCatalog.filter((b) => r.selectedBoons.has(b.id));
            if (pickedBoons.length) for (const b of pickedBoons) lines.push(b.name);
            else lines.push('(none)');
            lines.push(dashes);
            return lines.join('\n');
        },
        // Per-guild train/study blocks. Each entry is
        //   { guild: {id,name}, commands: "…" }
        // where `commands` is the game-pasteable command string (no
        // guild-name header — that's display-only). Chunking follows
        // CharCreator.cs:3146: each skill learned at n*5% emits
        // `n train name`, and n>20 splits into 20-count calls because
        // the game caps one train command at 20.
        commandBlocks() {
            const r = this.reinc;
            if (!r.race) return [];
            const perGuildSkills = new Map();
            const perGuildSpells = new Map();
            const skillById = new Map(r.skills.map((s) => [s.id, s]));
            const spellById = new Map(r.spells.map((s) => [s.id, s]));
            // Attribute each learned skill/spell to the guild that
            // unlocked it first (lowest level) — matches the Zcreator
            // grouping.
            for (const [idRaw, pct] of Object.entries(r.skillLearned)) {
                const id = +idRaw; const learned = pct | 0;
                if (learned <= 0) continue;
                let best = null;
                for (const p of r.resolvedPicks) {
                    if (!p.data) continue;
                    for (const row of p.data.skills) {
                        if (row.skill_id !== id) continue;
                        if (row.level > p.level) continue;
                        if (!best || row.level < best.level) best = { guild: p.guild, level: row.level };
                    }
                }
                if (!best) continue;
                if (!perGuildSkills.has(best.guild.id)) perGuildSkills.set(best.guild.id, { guild: best.guild, items: [] });
                perGuildSkills.get(best.guild.id).items.push({ name: (skillById.get(id) || {}).name || ('#' + id), n: Math.floor(learned / 5) });
            }
            for (const [idRaw, pct] of Object.entries(r.spellLearned)) {
                const id = +idRaw; const learned = pct | 0;
                if (learned <= 0) continue;
                let best = null;
                for (const p of r.resolvedPicks) {
                    if (!p.data) continue;
                    for (const row of p.data.spells) {
                        if (row.spell_id !== id) continue;
                        if (row.level > p.level) continue;
                        if (!best || row.level < best.level) best = { guild: p.guild, level: row.level };
                    }
                }
                if (!best) continue;
                if (!perGuildSpells.has(best.guild.id)) perGuildSpells.set(best.guild.id, { guild: best.guild, items: [] });
                perGuildSpells.get(best.guild.id).items.push({ name: (spellById.get(id) || {}).name || ('#' + id), n: Math.floor(learned / 5) });
            }
            const chunks = (items, verb) => {
                const parts = [];
                for (const it of items) {
                    let left = it.n;
                    while (left > 0) {
                        const take = left > 20 ? 20 : left;
                        parts.push(`${take} ${verb} ${it.name}`);
                        left -= take;
                    }
                }
                return parts.join(';');
            };
            const out = [];
            for (const p of r.resolvedPicks) {
                const g = p.guild;
                const s = perGuildSkills.get(g.id);
                const sp = perGuildSpells.get(g.id);
                if (!s && !sp) continue;
                const trainLine = s ? chunks(s.items, 'train') : '';
                const studyLine = sp ? chunks(sp.items, 'study') : '';
                const commands = [trainLine, studyLine].filter(Boolean).join('\n');
                if (!commands) continue;
                out.push({ guild: { id: g.id, name: g.name }, commands });
            }
            return out;
        },
        // `select <wish>` commands for every wish currently picked,
        // joined by `;` so the whole string pastes as one input.
        wishSelectText() {
            const r = this.reinc;
            const picked = r.wishesCatalog.filter((w) => r.selectedWishes.has(w.id));
            if (!picked.length) return '';
            return picked.map((w) => `select ${w.name.toLowerCase()}`).join(';');
        },
        // `select <boon>` commands for every boon currently picked.
        // Same shape as the wish trainer — one line per boon so the
        // player can paste the whole block at the boon trader. Racial
        // boons that don't match the selected race are filtered out
        // defensively; they should already be unselected by the race
        // watcher in Reinc.vue, but belt-and-braces keeps the export
        // honest if state ever drifts.
        boonSelectText() {
            const r = this.reinc;
            const picked = r.boonsCatalog.filter((b) => r.selectedBoons.has(b.id) && !r.isBoonLocked(b));
            if (!picked.length) return '';
            return picked.map((b) => `select ${b.name.toLowerCase()}`).join(';');
        },
    },
    methods: {
        async copyText(key, text) {
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                this.copied = key;
                setTimeout(() => { if (this.copied === key) this.copied = ''; }, 1500);
            } catch (e) {
                this.reinc.$root.flashMsg('Copy failed — select the text manually', 'danger');
            }
        },
    },
};
</script>
<template>
<div class="tab-body">
    <div class="export-grid">
        <section class="ex-section">
            <div class="ex-head d-flex align-items-center justify-content-between">
                <span>Character Summary</span>
                <button class="btn btn-sm btn-outline-primary" @click="copyText('summary', summaryText)" :disabled="!summaryText">
                    {{ copied === 'summary' ? 'Copied!' : 'Copy' }}
                </button>
            </div>
            <pre class="export-pre">{{ summaryText || '(select a race first)' }}</pre>
        </section>

        <section class="ex-section">
            <div class="ex-head">
                <span>Train / Study Commands</span>
                <div class="small text-muted fw-normal">One block per guild — the copy button copies only the command line, not the guild name, so you can paste it while standing in that guildhall.</div>
            </div>
            <div v-if="!commandBlocks.length" class="text-muted small">
                (nothing to train — set some skill/spell percents first)
            </div>
            <!--
              The per-guild command blocks have to live in their own
              scroll container because .ex-section sets overflow: hidden
              to keep the planner fitted inside 100vh. Without this wrap,
              any build with more than ~two guilds of commands (Abjurer
              + both its subguilds, for instance) gets the later blocks
              silently clipped off the bottom of the screen.
            -->
            <div v-if="commandBlocks.length" class="per-guild-list">
                <div v-for="blk in commandBlocks" :key="blk.guild.id" class="per-guild-block">
                    <div class="per-guild-head">
                        <strong class="small">{{ blk.guild.name }}</strong>
                        <button class="btn btn-sm btn-outline-primary" @click="copyText('g' + blk.guild.id, blk.commands)">
                            {{ copied === 'g' + blk.guild.id ? 'Copied!' : 'Copy' }}
                        </button>
                    </div>
                    <pre class="export-pre per-guild-pre">{{ blk.commands }}</pre>
                </div>
            </div>
        </section>

        <section class="ex-section">
            <div class="ex-head d-flex align-items-center justify-content-between">
                <span>Select Wishes</span>
                <button class="btn btn-sm btn-outline-primary" @click="copyText('wishes', wishSelectText)" :disabled="!wishSelectText">
                    {{ copied === 'wishes' ? 'Copied!' : 'Copy' }}
                </button>
            </div>
            <pre class="export-pre">{{ wishSelectText || '(no wishes selected)' }}</pre>
        </section>

        <section class="ex-section">
            <div class="ex-head d-flex align-items-center justify-content-between">
                <span>Select Boons</span>
                <button class="btn btn-sm btn-outline-primary" @click="copyText('boons', boonSelectText)" :disabled="!boonSelectText">
                    {{ copied === 'boons' ? 'Copied!' : 'Copy' }}
                </button>
            </div>
            <pre class="export-pre">{{ boonSelectText || '(no boons selected)' }}</pre>
        </section>
    </div>
</div>
</template>

<style scoped>
/* The command-blocks list owns its own overflow region so the user can
   scroll between guilds when a wide build produces more commands than
   fit in the tab. Each inner `.per-guild-pre` falls back to natural
   height so a full block is visible at once instead of the user having
   to fight a nested scroll. */
.per-guild-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-right: 0.25rem;
}
.per-guild-block + .per-guild-block { margin-top: 0.75rem; }
.per-guild-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.25rem;
}
.per-guild-pre {
    flex: 0 0 auto;
    overflow: visible;
    max-height: none;
}
</style>
