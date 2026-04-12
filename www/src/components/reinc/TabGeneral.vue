<script>
export default {
    name: 'ReincTabGeneral',
    inject: ['reinc'],
};
</script>
<template>
<div class="tab-body">
    <div class="general-grid">
    <div class="col-races">
        <label class="form-label small mb-1"><strong>Select Race</strong></label>
        <!-- Bug #15 — render races as a list of rows instead of a bare
             <select>, so each row can show skill/spell max and cost
             right-aligned (Sk / Sp columns). Lets you compare races
             without clicking into each one. -->
        <div class="race-list">
            <div class="race-hd">
                <span class="flex-grow-1">Race</span>
                <span class="race-cell" title="Skill Max">SkM</span>
                <span class="race-cell" title="Skill Cost">SkC</span>
                <span class="race-cell" title="Spell Max">SpM</span>
                <span class="race-cell" title="Spell Cost">SpC</span>
            </div>
            <div v-for="r in reinc.enabledRaces" :key="r.id"
                 class="race-row" :class="{ active: reinc.selectedRaceId === r.id, sub: r.parent_name }"
                 @click="reinc.selectedRaceId = r.id">
                <span class="flex-grow-1">{{ r.parent_name ? '· ' : '' }}{{ r.name }}</span>
                <span class="race-cell" :title="`Skill Max ${r.skill_max}%`">{{ r.skill_max }}</span>
                <span class="race-cell" :title="`Skill Cost ${r.skill_cost}`">{{ r.skill_cost }}</span>
                <span class="race-cell" :title="`Spell Max ${r.spell_max}%`">{{ r.spell_max }}</span>
                <span class="race-cell" :title="`Spell Cost ${r.spell_cost}`">{{ r.spell_cost }}</span>
            </div>
        </div>
    </div>

    <!-- Bug #26 — guild picker now owns its own column instead of sharing
         vertical space with the race list. When the summary bar grows
         from picking guilds/resists, the tab-body shrinks and .guild-list
         absorbs the shrink via its own overflow-y scroll. Previously the
         race-list's 18rem cap + .col-races { overflow:hidden } clipped
         the guild list off-screen on taller viewports too.
         The old Racial Stats / Computed readouts lived here but were
         redundant with the summary bar — those chips now show base/max
         alongside the computed values up top. -->
    <div class="col-guilds">
        <label class="form-label small mb-1"><strong>Select Guilds</strong></label>
        <input type="search" class="form-control form-control-sm mb-1" placeholder="Search guilds…" v-model="reinc.guildSearch">
        <div class="guild-list">
            <div v-if="reinc.guildTree.length === 0" class="small text-muted p-2">No guilds match “{{ reinc.guildSearch }}”.</div>
            <div v-for="g in reinc.guildTree" :key="g.id" class="guild-row"
                 :class="{ picked: reinc.isPicked(g), sub: g.depth, locked: reinc.isLocked(g) }"
                 :title="reinc.isLocked(g) ? 'Select the parent guild at max level to unlock this subguild' : ''">
                <!-- Bug #27 — native <input checkbox> desync is unfixable
                     in Vue 3: `:checked` + `@click.prevent` still drifts
                     from the DOM .checked property across browsers. Replace
                     the checkbox entirely with a Bootstrap icon driven by
                     isPicked() state — zero DOM-state to desync. -->
                <div class="d-flex align-items-center flex-grow-1 mb-0"
                     :style="reinc.isLocked(g) ? 'cursor:not-allowed;' : 'cursor:pointer;'"
                     @click="reinc.onGuildClick(g)">
                    <i class="bi me-2 guild-check"
                       :class="reinc.isPicked(g) ? 'bi-check-square-fill text-primary' : 'bi-square'"
                       role="checkbox" :aria-checked="reinc.isPicked(g)"></i>
                    <!-- Bug #28 — show "/max" next to every guild name when
                         it's NOT currently picked, so the user can eyeball
                         each row's ceiling without picking it or opening the
                         unlock modal. Picked rows already display "/max" as
                         part of the level input on the right. -->
                    <span :class="{ 'text-muted': g.depth || reinc.isLocked(g) }">{{ g.depth ? '- ' : '' }}{{ g.name }}<small v-if="!reinc.isPicked(g)" class="text-muted ms-1">/{{ g.max_level }}</small></span>
                    <span v-if="reinc.isLocked(g)" class="ms-2 small text-muted">🔒</span>
                </div>
                <input v-if="reinc.isPicked(g)" type="number" class="form-control form-control-sm level-input"
                       :value="reinc.pickLevel(g)" @input="reinc.setPickLevel(g, $event.target.value)" :max="g.max_level" min="1">
                <span v-if="reinc.isPicked(g)" class="small text-muted ms-1">/ {{ g.max_level }}</span>
                <button type="button" class="info-btn"
                        :disabled="reinc.isLocked(g)"
                        @click.stop.prevent="reinc.openGuildInfo(g)"
                        :title="`Show skills and spells taught by ${g.name}`"
                        aria-label="Show skills and spells">
                    <i class="bi bi-info-circle"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Bug #16 — only the two user-editable inputs live here now;
         every readout (Total/Guild Levels, QPs Needed/Left, and the
         full exp breakdown + gold) is in the summary bar header so
         it's visible from every tab. -->
    <div class="col-exp">
        <div class="levels-grid small mb-2">
            <div class="lg-row">
                <span>Free Levels:</span>
                <input type="number" :value="reinc.freeLevels"
                       @input="reinc.setFreeLevels($event.target.value)"
                       :max="Math.max(0, reinc.MAX_LEVEL - reinc.guildLevelsSum)"
                       min="0" class="form-control form-control-sm">
            </div>
            <div class="lg-row">
                <span>Quest Points:</span>
                <input type="number" v-model.number="reinc.quest" class="form-control form-control-sm">
            </div>
        </div>
        <div class="small text-muted mb-2">
            Level / XP / QP totals live in the header above — they update live
            as you adjust guilds, free levels, quest points, skills, and wishes.
        </div>
        <div class="d-flex gap-2 mt-2">
            <button class="btn btn-danger btn-sm" @click="reinc.reset">RESET</button>
            <button type="button"
                    class="btn btn-sm fw-bold"
                    :class="reinc.gimdoriOn ? 'btn-warning' : 'btn-outline-warning'"
                    @click="reinc.toggleGimdori"
                    :title="reinc.gimdoriOn
                        ? 'Gimdori Mode is ON — every guild change auto-maxes skills, spells, wishes and boons. Click to turn off.'
                        : 'Turn on Gimdori Mode — every subsequent guild change will auto-max skills, spells, wishes and boons.'">
                💪 GIMDORI MODE: {{ reinc.gimdoriOn ? 'ON' : 'OFF' }}
            </button>
        </div>
    </div>
    </div><!-- /general-grid -->
</div>
</template>
