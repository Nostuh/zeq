<script>
export default {
    name: 'ReincTabSkills',
    inject: ['reinc'],
};
</script>
<template>
<div class="tab-body">
    <div class="skills-grid">
    <div class="col-skill-list">
        <div class="d-flex align-items-center mb-1 gap-2 flex-wrap">
            <h6 class="m-0 flex-grow-1">Available Skills ({{ reinc.skillRows.length }})</h6>
            <button class="btn btn-sm btn-outline-success" @click="reinc.maxAllSkills" :disabled="!reinc.skillRows.length">Max All</button>
            <button class="btn btn-sm btn-outline-secondary" @click="reinc.zeroAllSkills" :disabled="!reinc.skillRows.length">Zero All</button>
        </div>
        <div class="skill-list">
            <div v-for="s in reinc.skillRows" :key="s.skill_id"
                 class="skill-row" :class="{active: reinc.activeSkillId===s.skill_id}"
                 @click="reinc.activeSkillId = s.skill_id">
                <span class="flex-grow-1">{{ s.name }}</span>
                <span class="small">{{ s.learned }} / {{ s.scaled }}</span>
            </div>
        </div>
        <div class="mt-2 small exp-summary">
            <div>Exp for selected Skill: <strong>{{ reinc.nfmt(reinc.activeSkillExp) }}</strong></div>
            <div>Total Exp for all Skills: <strong>{{ reinc.nfmt(reinc.skillExpTotal) }}</strong></div>
        </div>
    </div>
    <div class="col-skill-detail">
        <h6 class="m-0 mb-1">Skill Description</h6>
        <div class="desc-box">
            <div v-if="reinc.activeSkill" class="small">
                <div><strong>{{ reinc.activeSkill.name }}</strong> — start cost: {{ reinc.nfmt(reinc.activeSkill.start_cost) }}</div>
                <div>Per-guild max: {{ reinc.activeSkill.maxPerGuild }}% → char max: {{ reinc.activeSkill.scaled }}%</div>
                <div class="mt-2 d-flex align-items-center gap-2">
                    <input type="number" class="form-control form-control-sm" style="width:6em;"
                           :value="reinc.activeSkill.learned" @input="reinc.setSkillValue($event.target.value)">
                    <button class="btn btn-sm btn-outline-primary" @click="reinc.setMaxSkill">Max</button>
                </div>
            </div>
            <div v-else class="text-muted small">Select a skill from the list.</div>
        </div>
        <h6 class="m-0 mt-3 mb-1">Estimated Skill Costs</h6>
        <div class="cost-table-wrap">
            <table class="cost-table small">
                <thead><tr><th>%</th><th class="text-end">Exp</th><th class="text-end">Gold</th></tr></thead>
                <tbody>
                    <template v-for="(row, i) in reinc.skillCostRows" :key="i">
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
