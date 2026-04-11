<script>
// Bug #18 — stat training, resistances, wishes, and boons used to be
// spread across three separate tabs (Misc / Wishes / Boons). The reporter
// asked for everything on one page. This tab is that page: four labelled
// sections in a responsive grid, collapsing to a single column on narrow
// viewports.
export default {
    name: 'ReincTabExtras',
    inject: ['reinc'],
};
</script>
<template>
<div class="tab-body">
    <div class="extras-grid">
        <!-- Stat training removed: ZombieMUD no longer has a stat room, so
             there's nothing for the planner to cost out. The stat-training
             exp math is still in engine.js (statTrain stays at zero, so
             statExpTotal is always 0) in case the game ever brings stat
             training back. If it does, uncomment this section and the
             "Stat XP" chip in Reinc.vue's summary bar.
        <section class="ex-section ex-training">
            <h6 class="ex-head">Stat Training</h6>
            <div class="stat-grid">
                <div v-for="s in ['str','con','dex','int','wis','cha']" :key="s" class="stat-row">
                    <label class="form-label small m-0 me-2" style="width:3em;">{{ s.toUpperCase() }}:</label>
                    <input type="number" class="form-control form-control-sm" v-model.number="reinc.statTrain[s]" min="0" max="50">
                </div>
            </div>
            <div class="small mt-2">Exp for stat training: <strong>{{ reinc.nfmt(reinc.statExpTotal) }}</strong></div>
        </section>
        -->

        <section class="ex-section ex-wishes">
            <div class="ex-head d-flex align-items-center justify-content-between flex-wrap gap-2">
                <span>Wishes</span>
                <div class="d-flex align-items-center gap-2 small fw-normal">
                    <button class="btn btn-sm btn-outline-secondary" type="button" @click="reinc.selectAllWishes">All</button>
                    <button class="btn btn-sm btn-outline-secondary" type="button" @click="reinc.clearAllWishes">None</button>
                    <span>TPs spent: <strong>{{ reinc.nfmt(reinc.wishTpUsed) }}</strong></span>
                    <span>/ <input type="number" v-model.number="reinc.tp" class="form-control form-control-sm d-inline-block" style="width:6em;"></span>
                </div>
            </div>
            <div class="wish-cols">
                <div class="wish-col">
                    <div class="cat-head">Generic</div>
                    <label v-for="w in reinc.groupedWishes.generic" :key="w.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedWishes.has(w.id)" @change="reinc.toggleWish(w.id)">
                        {{ w.name }} <small class="text-muted">({{ w.tp_cost }})</small>
                    </label>
                    <div class="cat-head mt-2">Resistances</div>
                    <label v-for="w in reinc.groupedWishes.resist" :key="w.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedWishes.has(w.id)" @change="reinc.toggleWish(w.id)">
                        {{ w.name }} <small class="text-muted">({{ w.tp_cost }})</small>
                    </label>
                </div>
                <div class="wish-col">
                    <div class="cat-head">Lesser</div>
                    <label v-for="w in reinc.groupedWishes.lesser" :key="w.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedWishes.has(w.id)" @change="reinc.toggleWish(w.id)">
                        {{ w.name }} <small class="text-muted">({{ w.tp_cost }})</small>
                    </label>
                </div>
                <div class="wish-col">
                    <div class="cat-head">Greater</div>
                    <label v-for="w in reinc.groupedWishes.greater" :key="w.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedWishes.has(w.id)" @change="reinc.toggleWish(w.id)">
                        {{ w.name }} <small class="text-muted">({{ w.tp_cost }})</small>
                    </label>
                </div>
            </div>
        </section>

        <section class="ex-section ex-boons">
            <div class="ex-head d-flex align-items-center justify-content-between flex-wrap gap-2">
                <span>Boons</span>
                <div class="d-flex align-items-center gap-2 small fw-normal">
                    <button class="btn btn-sm btn-outline-secondary" type="button" @click="reinc.selectAllBoons">All</button>
                    <button class="btn btn-sm btn-outline-secondary" type="button" @click="reinc.clearAllBoons">None</button>
                    <span>Total PP Cost: <strong>{{ reinc.nfmt(reinc.boonPpTotal) }}</strong></span>
                </div>
            </div>
            <div class="boon-cols">
                <!-- Five categories match the live game's `list <cat>`
                     output exactly: racial / power / minor / lesser /
                     greater. Each boon row has an info button that
                     opens a modal showing the game's `info <cat> N`
                     description text, seeded into game_boons.description.
                     Racial boons are locked unless the selected race
                     matches their "Boon of <Race>" suffix. -->
                <div class="boon-col">
                    <div class="cat-head">Racial</div>
                    <div v-for="b in reinc.groupedBoons.racial" :key="b.id"
                         class="boon-item"
                         :class="{ locked: reinc.isBoonLocked(b) }"
                         :title="reinc.isBoonLocked(b) ? 'Only selectable when your race is ' + b.name.replace(/^Boon of /, '') : ''">
                        <label class="wish-item flex-grow-1 mb-0">
                            <input type="checkbox" class="form-check-input me-1"
                                   :checked="reinc.selectedBoons.has(b.id)"
                                   :disabled="reinc.isBoonLocked(b)"
                                   @change="reinc.toggleBoon(b.id)">
                            {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                        </label>
                        <button type="button" class="info-btn" @click.stop.prevent="reinc.openBoonInfo(b)"
                                :title="`What does ${b.name} do?`" aria-label="Show boon info">
                            <i class="bi bi-info-circle"></i>
                        </button>
                    </div>
                    <div class="cat-head mt-2">Power</div>
                    <div v-for="b in reinc.groupedBoons.power" :key="b.id" class="boon-item">
                        <label class="wish-item flex-grow-1 mb-0">
                            <input type="checkbox" class="form-check-input me-1"
                                   :checked="reinc.selectedBoons.has(b.id)"
                                   @change="reinc.toggleBoon(b.id)">
                            {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                        </label>
                        <button type="button" class="info-btn" @click.stop.prevent="reinc.openBoonInfo(b)"
                                :title="`What does ${b.name} do?`" aria-label="Show boon info">
                            <i class="bi bi-info-circle"></i>
                        </button>
                    </div>
                </div>
                <div class="boon-col">
                    <div class="cat-head">Minor</div>
                    <div v-for="b in reinc.groupedBoons.minor" :key="b.id" class="boon-item">
                        <label class="wish-item flex-grow-1 mb-0">
                            <input type="checkbox" class="form-check-input me-1"
                                   :checked="reinc.selectedBoons.has(b.id)"
                                   @change="reinc.toggleBoon(b.id)">
                            {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                        </label>
                        <button type="button" class="info-btn" @click.stop.prevent="reinc.openBoonInfo(b)"
                                :title="`What does ${b.name} do?`" aria-label="Show boon info">
                            <i class="bi bi-info-circle"></i>
                        </button>
                    </div>
                </div>
                <div class="boon-col">
                    <div class="cat-head">Lesser</div>
                    <div v-for="b in reinc.groupedBoons.lesser" :key="b.id" class="boon-item">
                        <label class="wish-item flex-grow-1 mb-0">
                            <input type="checkbox" class="form-check-input me-1"
                                   :checked="reinc.selectedBoons.has(b.id)"
                                   @change="reinc.toggleBoon(b.id)">
                            {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                        </label>
                        <button type="button" class="info-btn" @click.stop.prevent="reinc.openBoonInfo(b)"
                                :title="`What does ${b.name} do?`" aria-label="Show boon info">
                            <i class="bi bi-info-circle"></i>
                        </button>
                    </div>
                    <div class="cat-head mt-2">Greater</div>
                    <div v-for="b in reinc.groupedBoons.greater" :key="b.id" class="boon-item">
                        <label class="wish-item flex-grow-1 mb-0">
                            <input type="checkbox" class="form-check-input me-1"
                                   :checked="reinc.selectedBoons.has(b.id)"
                                   @change="reinc.toggleBoon(b.id)">
                            {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                        </label>
                        <button type="button" class="info-btn" @click.stop.prevent="reinc.openBoonInfo(b)"
                                :title="`What does ${b.name} do?`" aria-label="Show boon info">
                            <i class="bi bi-info-circle"></i>
                        </button>
                    </div>
                </div>
            </div>
        </section>
    </div>
</div>
</template>
