<script>
// Import Equipment — paste your in-game chest contents (exactly like the public
// Chest Sorter) and it tags YOU as an owner of every item it can match in the
// equipment catalog. Uses the SAME parser as the Chest Sorter (../lib/chestParser)
// so the item extraction is identical; the only extra step is a DB lookup +
// ownership tag via POST /api/equipment/import. Items not in the catalog are
// reported back so you know what still needs adding.
import axios from 'axios';
import { parseChests, stackQty, stripQty, groupKey } from '../lib/chestParser.js';

export default {
    name: 'ImportEquipment',
    data() {
        return { raw: '', loading: false, result: null };
    },
    computed: {
        chests() { return parseChests(this.raw); },
        // Unique item names (stack + single merged, quantity summed), same
        // grouping the Chest Sorter uses. `display` is the nicest label.
        uniqueItems() {
            const map = new Map();
            for (const c of this.chests) {
                for (const e of c.items) {
                    const key = groupKey(stripQty(e));
                    const disp = stripQty(e);
                    const q = stackQty(e);
                    if (!map.has(key)) map.set(key, { display: disp, rank: 3, qty: 0 });
                    const g = map.get(key);
                    const rank = (q === 1 && /^(a|an|the)\s/i.test(disp)) ? 0 : (q === 1 ? 1 : 2);
                    if (rank < g.rank) { g.display = disp; g.rank = rank; }
                    g.qty += q;
                }
            }
            return [...map.values()].sort((a, b) => a.display.localeCompare(b.display));
        },
    },
    methods: {
        loadSample() {
            this.raw = "A chest that seems to be of a high value.\n"
                + "It has a label on it saying '50001762'\n"
                + "There is a large lock on it, set to: 0\n"
                + "It is open.\n"
                + "It contains 3 items:\n"
                + "Tower shield, The ring of thorns and A pale white gemstone.";
        },
        clearAll() { this.raw = ''; this.result = null; },
        async runImport() {
            if (this.loading) return;
            const names = this.uniqueItems.map((x) => x.display);
            if (!names.length) { this.$root.flashMsg('Nothing to import — paste some chest contents first', 'danger'); return; }
            this.loading = true;
            this.result = null;
            try {
                const r = await axios.post('/api/equipment/import', { names });
                this.result = (r.data && r.data.data) || null;
                if (this.result) {
                    this.$root.flashMsg(`Marked ${this.result.added} new item${this.result.added === 1 ? '' : 's'} as owned`);
                }
            } catch (e) { this.$root.flashError(e); }
            this.loading = false;
        },
    },
};
</script>

<template>
<div class="import-eq">
    <h2 class="mb-3">Import Equipment</h2>

    <!-- How it works -->
    <div class="card mb-3 how-card">
        <div class="card-body py-2">
            <h6 class="card-title mb-2">How this works</h6>
            <ol class="mb-0 small ps-3">
                <li>Paste the raw in-game output from looking inside your chests (the same text the Chest Sorter accepts).</li>
                <li>It parses every item — merging stacks (<em>“Two Maces…”</em>) and quantity forms automatically.</li>
                <li>Each item is looked up in the equipment catalog. Every match is tagged as <strong>owned by you</strong>.</li>
                <li>When it finishes, you get a list of any items that <strong>weren’t in the database</strong> — add those via <em>Add Equipment</em> if you have them.</li>
            </ol>
        </div>
    </div>

    <div class="mb-2 d-flex gap-2 flex-wrap align-items-center">
        <button class="btn btn-sm btn-outline-secondary" @click="loadSample">Load sample</button>
        <button class="btn btn-sm btn-outline-secondary" @click="clearAll" :disabled="!raw">Clear</button>
        <span class="text-muted small ms-auto" v-if="chests.length">
            Parsed {{ chests.length }} chest{{ chests.length === 1 ? '' : 's' }} ·
            {{ uniqueItems.length }} unique item{{ uniqueItems.length === 1 ? '' : 's' }}
        </span>
    </div>

    <textarea class="form-control import-input mb-3" v-model="raw" rows="8"
              placeholder="Paste chest contents here…"></textarea>

    <button class="btn btn-primary" :disabled="loading || !uniqueItems.length" @click="runImport">
        {{ loading ? 'Checking database…' : 'Check database & mark owned' }}
    </button>

    <!-- Results -->
    <div v-if="result" class="mt-4">
        <div class="alert alert-success py-2 mb-3">
            <strong>{{ result.added }}</strong> new item{{ result.added === 1 ? '' : 's' }} marked as owned.
            <span v-if="result.alreadyOwned" class="text-muted">
                ({{ result.alreadyOwned }} already owned)
            </span>
        </div>

        <div v-if="result.addedItems && result.addedItems.length" class="card mb-3 border-success">
            <div class="card-header bg-success text-white py-2">
                Newly marked as owned ({{ result.addedItems.length }})
            </div>
            <div class="card-body py-2">
                <ul class="notfound-list mb-0">
                    <li v-for="(n, i) in result.addedItems" :key="i">{{ n }}</li>
                </ul>
            </div>
        </div>

        <details v-if="result.alreadyOwnedItems && result.alreadyOwnedItems.length" class="mb-3">
            <summary class="text-muted small">Already owned ({{ result.alreadyOwnedItems.length }})</summary>
            <ul class="notfound-list mt-2 mb-0">
                <li v-for="(n, i) in result.alreadyOwnedItems" :key="i">{{ n }}</li>
            </ul>
        </details>

        <div v-if="result.notFound.length" class="card mb-3 border-warning">
            <div class="card-header bg-warning text-dark py-2">
                {{ result.notFound.length }} item{{ result.notFound.length === 1 ? '' : 's' }} not in the equipment database
            </div>
            <div class="card-body py-2">
                <p class="small text-muted mb-2">
                    These couldn’t be matched to a catalog entry. If you actually have them,
                    add them via <em>Add Equipment</em>.
                </p>
                <ul class="notfound-list mb-0">
                    <li v-for="(n, i) in result.notFound" :key="i">{{ n }}</li>
                </ul>
            </div>
        </div>
        <div v-else class="text-muted small">Every parsed item was found in the catalog. 🎉</div>
    </div>
</div>
</template>

<style scoped>
.import-eq { padding: 1rem 0.5rem 3rem; max-width: 900px; }
.import-input { font-family: var(--bs-font-monospace); font-size: 0.85rem; }
.how-card { background: var(--bs-tertiary-bg); }
.notfound-list {
    columns: 2;
    font-size: 0.85rem;
    padding-left: 1.1rem;
}
@media (max-width: 600px) { .notfound-list { columns: 1; } }
</style>
