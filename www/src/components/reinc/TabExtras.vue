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

        <section class="ex-section ex-wishes">
            <div class="ex-head d-flex align-items-center justify-content-between">
                <span>Wishes</span>
                <span class="small fw-normal">TPs spent: <strong>{{ reinc.nfmt(reinc.wishTpUsed) }}</strong>
                    / <input type="number" v-model.number="reinc.tp" class="form-control form-control-sm d-inline-block" style="width:6em;">
                </span>
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
            <div class="ex-head d-flex align-items-center justify-content-between">
                <span>Boons</span>
                <span class="small fw-normal">Total PP Cost: <strong>{{ reinc.nfmt(reinc.boonPpTotal) }}</strong></span>
            </div>
            <div class="boon-cols">
                <div class="boon-col">
                    <div class="cat-head">Racial (50 PP)</div>
                    <label v-for="b in reinc.groupedBoons.racial" :key="b.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedBoons.has(b.id)" @change="reinc.toggleBoon(b.id)">
                        {{ b.name }}
                    </label>
                    <div class="cat-head mt-2">Preference (50 PP)</div>
                    <label v-for="b in reinc.groupedBoons.preference" :key="b.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedBoons.has(b.id)" @change="reinc.toggleBoon(b.id)">
                        {{ b.name }}
                    </label>
                    <div class="cat-head mt-2">Knowledge (100 PP)</div>
                    <label v-for="b in reinc.groupedBoons.knowledge" :key="b.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedBoons.has(b.id)" @change="reinc.toggleBoon(b.id)">
                        {{ b.name }}
                    </label>
                </div>
                <div class="boon-col">
                    <div class="cat-head">Minor (100 PP)</div>
                    <label v-for="b in reinc.groupedBoons.minor" :key="b.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedBoons.has(b.id)" @change="reinc.toggleBoon(b.id)">
                        {{ b.name }}
                    </label>
                    <div class="cat-head mt-2">Weapon (75 PP)</div>
                    <label v-for="b in reinc.groupedBoons.weapon" :key="b.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedBoons.has(b.id)" @change="reinc.toggleBoon(b.id)">
                        {{ b.name }}
                    </label>
                </div>
                <div class="boon-col">
                    <div class="cat-head">Lesser</div>
                    <label v-for="b in reinc.groupedBoons.lesser" :key="b.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedBoons.has(b.id)" @change="reinc.toggleBoon(b.id)">
                        {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                    </label>
                    <div class="cat-head mt-2">Greater</div>
                    <label v-for="b in reinc.groupedBoons.greater" :key="b.id" class="wish-item">
                        <input type="checkbox" class="form-check-input me-1" :checked="reinc.selectedBoons.has(b.id)" @change="reinc.toggleBoon(b.id)">
                        {{ b.name }} <small class="text-muted">({{ b.pp_cost }})</small>
                    </label>
                </div>
            </div>
        </section>
    </div>
</div>
</template>
