<script>
export default {
    name: 'ReincTabSpells',
    inject: ['reinc'],
};
</script>
<template>
<div class="tab-body">
    <div class="skills-grid">
    <div class="col-skill-list">
        <div class="d-flex align-items-center mb-1 gap-2 flex-wrap">
            <h6 class="m-0 flex-grow-1">Available Spells ({{ reinc.spellRows.length }})</h6>
            <button class="btn btn-sm btn-outline-success" @click="reinc.maxAllSpells" :disabled="!reinc.spellRows.length">Max All</button>
            <button class="btn btn-sm btn-outline-secondary" @click="reinc.zeroAllSpells" :disabled="!reinc.spellRows.length">Zero All</button>
        </div>
        <div class="skill-list">
            <div v-for="s in reinc.spellRows" :key="s.spell_id"
                 class="skill-row" :class="{active: reinc.activeSpellId===s.spell_id}"
                 @click="reinc.activeSpellId = s.spell_id">
                <span class="flex-grow-1">{{ s.name }}</span>
                <span class="small">{{ s.learned }} / {{ s.scaled }}</span>
            </div>
        </div>
        <div class="mt-2 small exp-summary">
            <div>Exp for selected Spell: <strong>{{ reinc.nfmt(reinc.activeSpellExp) }}</strong></div>
            <div>Total Exp for all Spells: <strong>{{ reinc.nfmt(reinc.spellExpTotal) }}</strong></div>
        </div>
    </div>
    <div class="col-skill-detail">
        <h6 class="m-0 mb-1">Spell Description</h6>
        <div class="desc-box">
            <div v-if="reinc.activeSpell" class="small">
                <div><strong>{{ reinc.activeSpell.name }}</strong> — start cost: {{ reinc.nfmt(reinc.activeSpell.start_cost) }}</div>
                <div>Per-guild max: {{ reinc.activeSpell.maxPerGuild }}% → char max: {{ reinc.activeSpell.scaled }}%</div>
                <div class="mt-2 d-flex align-items-center gap-2">
                    <input type="number" class="form-control form-control-sm" style="width:6em;"
                           :value="reinc.activeSpell.learned" @input="reinc.setSpellValue($event.target.value)">
                    <button class="btn btn-sm btn-outline-primary" @click="reinc.setMaxSpell">Max</button>
                </div>
            </div>
            <div v-else class="text-muted small">Select a spell from the list.</div>
        </div>
        <h6 class="m-0 mt-3 mb-1">Estimated Spell Costs</h6>
        <div class="cost-table-wrap">
            <table class="cost-table small">
                <thead><tr><th>%</th><th class="text-end">Exp</th><th class="text-end">Gold</th></tr></thead>
                <tbody>
                    <template v-for="(row, i) in reinc.spellCostRows" :key="i">
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
