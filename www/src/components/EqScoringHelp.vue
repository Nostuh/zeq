<script>
// "How these numbers work" — the explainer behind every stat number shown
// on the equipment screens and in the item detail modal.
//
// The point it exists to make: the values in eq_items are ADJECTIVE
// SCORES, not the bonus the item actually grants in game. The MUD
// describes each stat with an adverb ("strongly", "a bit"); the parser in
// api/classes/eq_parse.mjs maps each adverb to a fixed ordinal. What that
// turns into on your character depends on your race multiplier, whether
// the item is bound, and the MUD's own rounding — none of which we model.
// So the scores rank items against each other; they do NOT predict a
// number of stat points.
//
// The ladders come from GET /api/equipment/scales, which serves
// eq_parse.mjs's own tables, so this panel cannot drift from the parser.
//
// Renders as an inline trigger link plus a modal. Drop it anywhere:
//   <EqScoringHelp />
import axios from 'axios';

export default {
    name: 'EqScoringHelp',
    props: {
        // Compact trigger for tight spots (the item detail modal).
        small: { type: Boolean, default: false },
    },
    data() {
        return {
            open: false,
            scales: null,
            loading: false,
            error: null,
        };
    },
    methods: {
        async show() {
            this.open = true;
            if (this.scales || this.loading) return;
            this.loading = true;
            this.error = null;
            try {
                const r = await axios.get('/api/equipment/scales');
                this.scales = (r.data && r.data.data) || null;
            } catch (e) {
                this.error = 'Could not load the adjective scales.';
            } finally {
                this.loading = false;
            }
        },
        close() { this.open = false; },
    },
    mounted() {
        this._esc = (e) => { if (e.key === 'Escape' && this.open) this.close(); };
        document.addEventListener('keydown', this._esc);
    },
    beforeUnmount() { document.removeEventListener('keydown', this._esc); },
};
</script>

<template>
<span>
    <a href="#" :class="small ? 'small' : ''" @click.prevent="show">
        <i class="bi bi-info-circle"></i> How these numbers work
    </a>

    <div v-if="open" class="eqsh-backdrop" @click.self="close">
        <div class="eqsh-panel" role="dialog" aria-modal="true">
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h5 class="m-0">How item scoring works</h5>
                <button type="button" class="btn-close" aria-label="Close" @click="close"></button>
            </div>

            <p class="mb-2">
                Every number on these pages is an <b>adjective score</b> — not the
                bonus the item actually gives you in game.
            </p>
            <p class="mb-2">
                The MUD never prints a number. It describes each stat with an
                adverb — <i>“It increases the user's strength a bit.”</i> — so we
                map each adverb onto a fixed value and store that. An item at
                <b>14</b> strength has a bigger strength adjective than an item at
                <b>10</b>. That is the whole claim.
            </p>
            <div class="alert alert-warning py-2 mb-3">
                <b>We are not calculating what the item actually gives.</b>
                The real gain depends on your race's percentage, whether the item
                is <b>bound</b> or unbound, and the MUD's own rounding — so the
                same adjective lands differently on different characters. Use
                these scores to <b>compare items</b>, not to predict stat points.
            </div>

            <div v-if="loading" class="text-muted py-3 text-center">Loading scales…</div>
            <div v-else-if="error" class="alert alert-danger py-2">{{ error }}</div>

            <template v-else-if="scales">
                <div class="eqsh-label">Stats &amp; resistances</div>
                <p class="small text-muted mb-1">
                    Used for str/con/dex/int/wis/cha, hp/sp, regen, and every
                    resistance column. Resists by slot typically run
                    <i>a bit</i> → <i>somewhat</i> → <i>adequately</i> →
                    <i>strongly</i> → <i>superbly</i> → <i>tremendously</i> →
                    <i>unearthly</i>.
                </p>
                <div class="eqsh-ladder mb-3">
                    <span v-for="s in scales.amount" :key="s.label" class="eqsh-tier">
                        <b>{{ s.value }}</b> {{ s.label }}
                    </span>
                </div>

                <div class="eqsh-label">Armour class / weapon class</div>
                <p class="small text-muted mb-1">
                    A separate ladder — the game phrases these as
                    “<i>&lt;adjective&gt; in general</i>”.
                </p>
                <div class="eqsh-ladder mb-3">
                    <span v-for="s in scales.ac" :key="s.label" class="eqsh-tier">
                        <b>{{ s.value }}</b> {{ s.label.replace(' in general', '') }}
                    </span>
                </div>

                <div class="eqsh-label">Skill &amp; spell bonuses</div>
                <p class="small text-muted mb-1">
                    A six-step quality ladder from the in-game library, stored
                    ordinally. Ranking only — the steps are not evenly spaced.
                </p>
                <div class="eqsh-ladder mb-3">
                    <span v-for="s in scales.skill" :key="s.label" class="eqsh-tier">
                        <b>{{ s.value }}</b> {{ s.label }}
                    </span>
                </div>

                <p class="small text-muted mb-0">
                    The top of each ladder is estimated. The game prints those
                    tiers without a magnitude, so their values are slotted in to
                    rank correctly against the tiers below them; the spacing
                    between them is a guess. If you learn a real number, report it
                    with the 🐞 button and we'll correct the ladder.
                </p>
            </template>
        </div>
    </div>
</span>
</template>

<style scoped>
/* Unique class names on purpose — .modal-backdrop collides with Bootstrap's
   own modal CSS (same reason ItemDetailModal uses .itemdm-*). Themed via the
   Bootstrap body vars so it works in light and dark. z-index above the item
   detail modal (2050) since it can be opened from inside it. */
.eqsh-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 2060;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
}
.eqsh-panel {
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
    border: 1px solid var(--bs-border-color);
    border-radius: 0.5rem;
    padding: 1rem 1.25rem;
    width: 100%;
    max-width: 40rem;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
}
.eqsh-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bs-secondary-color);
    margin-bottom: 0.15rem;
}
.eqsh-ladder {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
}
.eqsh-tier {
    font-size: 0.78rem;
    background: var(--bs-tertiary-bg);
    border: 1px solid var(--bs-border-color);
    border-radius: 0.25rem;
    padding: 0.1rem 0.4rem;
    white-space: nowrap;
}
.eqsh-tier b { font-weight: 600; margin-right: 0.2rem; }
</style>
