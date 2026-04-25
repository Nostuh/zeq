<script>
// Combined Skills/Spells tab — bug #33. Replaces the two separate
// TabSkills.vue / TabSpells.vue tabs with a single tab and a
// Skills/Spells radio toggle. The underlying state is still split
// across the parent (skillRows/spellRows, activeSkillId/activeSpellId,
// skillCostRows/spellCostRows) — this component just dispatches to
// the right side based on `mode`.
export default {
    name: 'ReincTabSkillSpells',
    inject: ['reinc'],
    data() {
        return { mode: 'skills' };
    },
    computed: {
        isSkills() { return this.mode === 'skills'; },
        rows() { return this.isSkills ? this.reinc.skillRows : this.reinc.spellRows; },
        active() { return this.isSkills ? this.reinc.activeSkill : this.reinc.activeSpell; },
        activeId() { return this.isSkills ? this.reinc.activeSkillId : this.reinc.activeSpellId; },
        costRows() { return this.isSkills ? this.reinc.skillCostRows : this.reinc.spellCostRows; },
        activeExp() { return this.isSkills ? this.reinc.activeSkillExp : this.reinc.activeSpellExp; },
        totalExp() { return this.isSkills ? this.reinc.skillExpTotal : this.reinc.spellExpTotal; },
        listLabel() { return this.isSkills ? 'Available Skills' : 'Available Spells'; },
        detailLabel() { return this.isSkills ? 'Skill' : 'Spell'; },
    },
    methods: {
        selectRow(r) {
            const id = this.isSkills ? r.skill_id : r.spell_id;
            if (this.isSkills) this.reinc.activeSkillId = id;
            else this.reinc.activeSpellId = id;
        },
        rowKey(r) { return this.isSkills ? r.skill_id : r.spell_id; },
        rowIsActive(r) { return this.activeId === this.rowKey(r); },
        maxAll() {
            if (this.isSkills) this.reinc.maxAllSkills();
            else this.reinc.maxAllSpells();
        },
        zeroAll() {
            if (this.isSkills) this.reinc.zeroAllSkills();
            else this.reinc.zeroAllSpells();
        },
        setValue(v) {
            if (this.isSkills) this.reinc.setSkillValue(v);
            else this.reinc.setSpellValue(v);
        },
        setMax() {
            if (this.isSkills) this.reinc.setMaxSkill();
            else this.reinc.setMaxSpell();
        },
        // Open the help-text modal for the row's underlying skill/spell.
        // The row from `skillRows` carries `skill_id`; from `spellRows`,
        // `spell_id`. The parent's openSkillInfo / openSpellInfo accept
        // either shape.
        openInfo(r) {
            if (this.isSkills) this.reinc.openSkillInfo(r);
            else this.reinc.openSpellInfo(r);
        },
    },
};
</script>
<template>
<div class="tab-body">
    <div class="ss-mode-toggle btn-group btn-group-sm mb-2 align-self-start" role="group" aria-label="Skills or spells">
        <button type="button"
                class="btn"
                :class="isSkills ? 'btn-primary' : 'btn-outline-primary'"
                @click="mode = 'skills'">Skills</button>
        <button type="button"
                class="btn"
                :class="!isSkills ? 'btn-primary' : 'btn-outline-primary'"
                @click="mode = 'spells'">Spells</button>
    </div>
    <div class="skills-grid">
    <div class="col-skill-list">
        <div class="d-flex align-items-center mb-1 gap-2 flex-wrap">
            <h6 class="m-0 flex-grow-1">{{ listLabel }} ({{ rows.length }})</h6>
            <button class="btn btn-sm btn-outline-success" @click="maxAll" :disabled="!rows.length">Max All</button>
            <button class="btn btn-sm btn-outline-secondary" @click="zeroAll" :disabled="!rows.length">Zero All</button>
        </div>
        <div class="skill-list">
            <div v-for="s in rows" :key="rowKey(s)"
                 class="skill-row" :class="{active: rowIsActive(s)}"
                 @click="selectRow(s)">
                <button type="button" class="ss-info-btn"
                        @click.stop.prevent="openInfo(s)"
                        :title="`What does ${s.name} do?`"
                        aria-label="Show description">
                    <i class="bi bi-info-circle"></i>
                </button>
                <span class="flex-grow-1">{{ s.name }}</span>
                <span class="small">{{ s.learned }} / {{ s.scaled }}</span>
            </div>
        </div>
        <div class="mt-2 small exp-summary">
            <div>Exp for selected {{ detailLabel }}: <strong>{{ reinc.nfmt(activeExp) }}</strong></div>
            <div>Total Exp for all {{ isSkills ? 'Skills' : 'Spells' }}: <strong>{{ reinc.nfmt(totalExp) }}</strong></div>
        </div>
    </div>
    <div class="col-skill-detail">
        <h6 class="m-0 mb-1">{{ detailLabel }} Description</h6>
        <div class="desc-box">
            <div v-if="active" class="small">
                <div><strong>{{ active.name }}</strong> — start cost: {{ reinc.nfmt(active.start_cost) }}</div>
                <div>Per-guild max: {{ active.maxPerGuild }}% → char max: {{ active.scaled }}%</div>
                <div class="mt-2 d-flex align-items-center gap-2">
                    <input type="number" class="form-control form-control-sm" style="width:6em;"
                           :value="active.learned" @input="setValue($event.target.value)">
                    <button class="btn btn-sm btn-outline-primary" @click="setMax">Max</button>
                </div>
            </div>
            <div v-else class="text-muted small">Select a {{ detailLabel.toLowerCase() }} from the list.</div>
        </div>
        <h6 class="m-0 mt-3 mb-1">Estimated {{ detailLabel }} Costs</h6>
        <div class="cost-table-wrap">
            <table class="cost-table small">
                <thead><tr><th>%</th><th class="text-end">Exp</th><th class="text-end">Gold</th></tr></thead>
                <tbody>
                    <template v-for="(row, i) in costRows" :key="i">
                        <tr v-if="row.kind === 'row'" :class="{ 'over-max': row.overCharMax }">
                            <td>{{ row.pct }}%</td>
                            <td class="text-end">{{ reinc.nfmt(row.exp) }}</td>
                            <td class="text-end">{{ reinc.nfmt(row.gold) }}</td>
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
</template>
