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

        <label class="form-label small mb-1 mt-2"><strong>Select Guilds</strong></label>
        <input type="search" class="form-control form-control-sm mb-1" placeholder="Search guilds…" v-model="reinc.guildSearch">
        <div class="guild-list">
            <div v-if="reinc.guildTree.length === 0" class="small text-muted p-2">No guilds match “{{ reinc.guildSearch }}”.</div>
            <div v-for="g in reinc.guildTree" :key="g.id" class="guild-row"
                 :class="{ picked: reinc.isPicked(g), sub: g.depth, locked: reinc.isLocked(g) }"
                 :title="reinc.isLocked(g) ? 'Select the parent guild at max level to unlock this subguild' : ''">
                <label class="d-flex align-items-center flex-grow-1 mb-0" :style="reinc.isLocked(g) ? 'cursor:not-allowed;' : 'cursor:pointer;'" @click.prevent="reinc.onGuildClick(g)">
                    <input type="checkbox" class="form-check-input me-2" :checked="reinc.isPicked(g)" :disabled="reinc.isLocked(g)" @click.prevent>
                    <span :class="{ 'text-muted': g.depth || reinc.isLocked(g) }">{{ g.depth ? '- ' : '' }}{{ g.name }}</span>
                    <span v-if="reinc.isLocked(g)" class="ms-2 small text-muted">🔒</span>
                </label>
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

    <div class="col-stats" v-if="reinc.race && reinc.character">
        <div class="racial-box">
            <h6 class="m-0 mb-1">Racial Stats</h6>
            <div class="racial-grid small">
                <div>Exp: <b>{{ reinc.race.exp_rate }}</b></div>
                <div>Size: <b>{{ reinc.race.size }}</b></div>
                <div>Str: <b>{{ reinc.race.max_str }}</b></div>
                <div>Dex: <b>{{ reinc.race.max_dex }}</b></div>
                <div>Con: <b>{{ reinc.race.max_con }}</b></div>
                <div>Int: <b>{{ reinc.race.max_int }}</b></div>
                <div>Wis: <b>{{ reinc.race.max_wis }}</b></div>
                <div>Cha: <b>{{ reinc.race.max_cha }}</b></div>
                <div>HP Reg: <b>{{ reinc.race.hp_regen }}</b></div>
                <div>SP Reg: <b>{{ reinc.race.sp_regen }}</b></div>
                <div>Sk Max: <b>{{ reinc.race.skill_max }}</b></div>
                <div>Sk Cost: <b>{{ reinc.race.skill_cost }}</b></div>
                <div>Sp Max: <b>{{ reinc.race.spell_max }}</b></div>
                <div>Sp Cost: <b>{{ reinc.race.spell_cost }}</b></div>
            </div>
        </div>

        <div class="computed-box">
            <h6 class="m-0 mb-1">Computed</h6>
            <div class="computed-grid small">
                <div>HP <b>{{ reinc.nfmt(reinc.character.hp) }}</b></div>
                <div>Str <b>{{ reinc.character.finalStats.str }}</b></div>
                <div>Int <b>{{ reinc.character.finalStats.int }}</b></div>
                <div>SkMax <b>{{ reinc.character.skillMax }}</b></div>
                <div>SP <b>{{ reinc.nfmt(reinc.character.sp) }}</b></div>
                <div>Con <b>{{ reinc.character.finalStats.con }}</b></div>
                <div>Wis <b>{{ reinc.character.finalStats.wis }}</b></div>
                <div>SpMax <b>{{ reinc.character.spellMax }}</b></div>
                <div>HPR <b>{{ reinc.character.hpr }}</b></div>
                <div>Dex <b>{{ reinc.character.finalStats.dex }}</b></div>
                <div>Cha <b>{{ reinc.character.finalStats.cha }}</b></div>
                <div>Size <b>{{ reinc.character.size }}</b></div>
                <div>SPR <b>{{ reinc.character.spr }}</b></div>
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
