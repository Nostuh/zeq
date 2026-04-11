<script>
// Bug #17 — the original Zcreator desktop app had a "Save Character"
// action that wrote a text summary, and a separate export that spat out
// the train/study commands ready to paste into the game. This tab brings
// both back as copy-to-clipboard blocks. Formulas and formatting mirror
// CharCreator.cs:4152 (saveCharacter_FileOk) and CharCreator.cs:3146
// (train/study chunking — skills emit at most 20 `n train name` calls
// per line before splitting to a new chunk).
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
        // Mirror of CharCreator.cs:3146 — each guild gets its own block
        // with train/study commands joined by `;`. A skill learned at
        // n * 5% emits `n train name`, and `n > 20` splits into multiple
        // 20-count calls (the game caps one train command at 20).
        commandsText() {
            const r = this.reinc;
            if (!r.race) return '';
            const out = [];
            const perGuildSkills = new Map();
            const perGuildSpells = new Map();
            const skillById = new Map(r.skills.map((s) => [s.id, s]));
            const spellById = new Map(r.spells.map((s) => [s.id, s]));
            // Attribute each learned skill/spell to the guild that unlocked
            // it first (lowest level) — matches the Zcreator grouping.
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
            // Walk guilds in pick order so output is stable.
            const guildOrder = r.resolvedPicks.map((p) => p.guild);
            for (const g of guildOrder) {
                const s = perGuildSkills.get(g.id);
                const sp = perGuildSpells.get(g.id);
                if (!s && !sp) continue;
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
                const trainLine = s ? chunks(s.items, 'train') : '';
                const studyLine = sp ? chunks(sp.items, 'study') : '';
                if (!trainLine && !studyLine) continue;
                if (out.length) out.push('');
                out.push(`${g.name}:`);
                if (trainLine) out.push(trainLine);
                if (studyLine) out.push(studyLine);
            }
            return out.join('\n');
        },
    },
    methods: {
        async copy(kind) {
            const text = kind === 'summary' ? this.summaryText : this.commandsText;
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                this.copied = kind;
                setTimeout(() => { if (this.copied === kind) this.copied = ''; }, 1500);
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
                <button class="btn btn-sm btn-outline-primary" @click="copy('summary')" :disabled="!summaryText">
                    {{ copied === 'summary' ? 'Copied!' : 'Copy' }}
                </button>
            </div>
            <pre class="export-pre">{{ summaryText || '(select a race first)' }}</pre>
        </section>
        <section class="ex-section">
            <div class="ex-head d-flex align-items-center justify-content-between">
                <span>Train / Study Commands</span>
                <button class="btn btn-sm btn-outline-primary" @click="copy('commands')" :disabled="!commandsText">
                    {{ copied === 'commands' ? 'Copied!' : 'Copy' }}
                </button>
            </div>
            <pre class="export-pre">{{ commandsText || '(nothing to train — set some skill/spell percents first)' }}</pre>
        </section>
    </div>
</div>
</template>
