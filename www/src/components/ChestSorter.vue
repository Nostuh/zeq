<script>
// Chest Sorter — a public tool. Paste the raw in-game "look in chest" output
// for a pile of chests and it parses:
//   • left  — how many items each chest holds (per-chest summary)
//   • right — an item index: which chest(s) hold each item, so you can
//             see duplicates across chests at a glance.
// Parsing is 100% client-side. The only network call is optional: exporting
// the item index to CSV posts the item names to /api/chestlookup to enrich
// them with equipment-catalog stats (blank when an item isn't in the DB).
import axios from 'axios';
import { parseChests, stackQty, stripQty, groupKey } from '../lib/chestParser.js';

// Stat columns appended to the item-index CSV, in order, with CSV headers.
const STAT_COLUMNS = [
    ['wear_slot', 'Slot'], ['weapon_class', 'Weapon class'], ['is_shield', 'Shield'], ['hands', 'Hands'], ['ac', 'AC'],
    ['str', 'STR'], ['con', 'CON'], ['dex', 'DEX'], ['int', 'INT'], ['wis', 'WIS'], ['cha', 'CHA'],
    ['hp', 'HP'], ['sp', 'SP'], ['hpr', 'HPR'], ['spr', 'SPR'],
    ['rphys', 'rPHYS'], ['rmag', 'rMAG'], ['rfire', 'rFIRE'], ['rcold', 'rCOLD'], ['relec', 'rELEC'],
    ['racid', 'rACID'], ['rpoi', 'rPOI'], ['rasphx', 'rASPHX'], ['rpsi', 'rPSI'], ['rshadow', 'rSHADOW'],
    ['dmg_pct', 'Dmg %'], ['dmg_type', 'Dmg type'],
];

// Sample capture so a first-time visitor can see the tool work with one
// click. Trimmed to a few chests; the parser handles any count.
const SAMPLE = `A chest that seems to be of a high value.
There is an important-looking small plaque bolted on the top lid.
It has a label on it saying '50001762'
There is a large lock on it, set to: 0
It is open.
It contains 6 items:
A dirty silk cloak, A blood-stained silver shashka (1h), Stained silver
cuirass, A pale white gemstone, The Asklepian Rod (1h) and A grotesque
obsidian falcata (1h).
A chest that seems to be of a high value.
There is an important-looking small plaque bolted on the top lid.
It has a label on it saying '11446733'
There is a large lock on it, set to: 666
It is open.
It contains 10 items:
Purple belt, Tower shield, The ring of thorns, Dark silver diadem, An ivory
ring, Arm protectors, Red gloves with golden decorations, A great hammer of
war called 'Ravager' (2h), A ring of conversion and The Runed Robes of the
Sun.
A chest that seems to be of a high value.
There is an important-looking small plaque bolted on the top lid.
It has a label on it saying '49847697'
There is a large lock on it, set to: 0
It is open.
It contains 7 items:
Black dragonskin bracelets, Tower shield, A great hammer of war called
'Ravager' (2h), A ruby necklace with a blue crystal embedded in it, A
sparkling bronze crown, White boots with golden decorations and The shining
boots of Yeao.
You see nothing special.`;


export default {
    name: 'ChestSorter',
    data() {
        return {
            raw: '',
            // Per-table sort state. dir: 1 asc, -1 desc.
            chestSort: { key: 'order', dir: 1 },   // order|label|lock|count
            indexSort: { key: 'count', dir: -1 },  // item|count
            exporting: false,                       // item-index CSV stat lookup in flight
        };
    },
    computed: {
        chests() { return parseChests(this.raw); },
        // Chest labels are not unique — the same plaque number can appear on
        // several chests (and some chests carry no label at all). Give every
        // chest a unique display name so the two views can tell them apart:
        // when a base label repeats, suffix it with " #k" in paste order.
        decoratedChests() {
            const counts = new Map();
            for (const c of this.chests) {
                const base = c.label || '(no label)';
                counts.set(base, (counts.get(base) || 0) + 1);
            }
            const running = new Map();
            return this.chests.map((c) => {
                const base = c.label || '(no label)';
                const k = (running.get(base) || 0) + 1;
                running.set(base, k);
                const suffix = counts.get(base) > 1 ? `#${k}` : '';
                const display = suffix ? `${base} ${suffix}` : base;
                return { ...c, base, suffix, display };
            });
        },
        // Physical item total = sum of stack quantities across chests.
        totalItems() { return this.chests.reduce((n, c) => n + (c.count || 0), 0); },
        anyMismatch() {
            return this.chests.some((c) => c.declared != null && c.declared !== c.count);
        },
        // Item index: unique item name → the chest(s) that hold it. When the
        // same chest holds the same item more than once we collapse the
        // repeats into one entry with a `qty` (so a chest label never repeats
        // in a row). `count` is the total occurrences across all chests.
        // Sorted so the most-duplicated items float to the top (that's the
        // point of a "sorter"), then alphabetically for a stable order.
        itemIndex() {
            const groups = new Map();
            for (const c of this.decoratedChests) {
                for (const entry of c.items) {
                    const q = stackQty(entry);       // physical quantity of this entry
                    const stripped = stripQty(entry); // name without the count word
                    const key = groupKey(stripped);   // stack + single collapse here
                    let g = groups.get(key);
                    if (!g) { g = { display: stripped, rank: 3, chests: new Map() }; groups.set(key, g); }
                    // Prefer the nicest label for the merged row: a singular
                    // article form ("A scrap of parchment…") over a plural stack
                    // form ("scraps of parchment…").
                    const rank = (q === 1 && /^(a|an|the)\s/i.test(stripped)) ? 0 : (q === 1 ? 1 : 2);
                    if (rank < g.rank) { g.display = stripped; g.rank = rank; }
                    // `qty` is the PHYSICAL count of this item in that chest (a
                    // stack of N, or the same item listed twice, both add to it).
                    if (!g.chests.has(c.display)) g.chests.set(c.display, { base: c.base, suffix: c.suffix, qty: 0 });
                    g.chests.get(c.display).qty += q;
                }
            }
            const rows = [];
            for (const g of groups.values()) {
                const chests = [...g.chests.values()];
                const count = chests.reduce((n, x) => n + x.qty, 0);
                rows.push({ item: g.display, chests, count });
            }
            rows.sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));
            return rows;
        },
        // Left table, reordered per `chestSort`. Original paste order is the
        // default and the tie-breaker for every other key.
        sortedChests() {
            const { key, dir } = this.chestSort;
            const arr = this.decoratedChests.map((c, i) => ({ ...c, _i: i }));
            if (key === 'order') return arr;
            arr.sort((a, b) => {
                let r = 0;
                if (key === 'label') r = a.base.localeCompare(b.base) || (a.suffix || '').localeCompare(b.suffix || '');
                else if (key === 'lock') r = (a.lock ?? -1) - (b.lock ?? -1);
                else if (key === 'count') r = a.count - b.count;
                return (r * dir) || (a._i - b._i);
            });
            return arr;
        },
        // Right table, reordered per `indexSort`. Item name is the tie-breaker.
        sortedIndex() {
            const { key, dir } = this.indexSort;
            const arr = [...this.itemIndex];
            arr.sort((a, b) => {
                const r = key === 'item' ? a.item.localeCompare(b.item) : a.count - b.count;
                return (r * dir) || a.item.localeCompare(b.item);
            });
            return arr;
        },
    },
    methods: {
        loadSample() { this.raw = SAMPLE; },
        clearAll() { this.raw = ''; },
        // Toggle direction when re-clicking the active column, else switch to it
        // with a sensible default (text asc, numbers desc).
        sortChests(key) {
            const s = this.chestSort;
            if (s.key === key) s.dir = -s.dir;
            else { s.key = key; s.dir = (key === 'label' || key === 'order') ? 1 : -1; }
        },
        sortIndex(key) {
            const s = this.indexSort;
            if (s.key === key) s.dir = -s.dir;
            else { s.key = key; s.dir = key === 'item' ? 1 : -1; }
        },
        // Persistent affordance: neutral ⇅ on inactive columns, ▲/▼ on the
        // active one, so it's obvious every column is clickable.
        caret(state, key) { return state.key === key ? (state.dir === 1 ? '▲' : '▼') : '⇅'; },
        isActiveSort(state, key) { return state.key === key; },
        // --- CSV export (client-side; nothing leaves the browser) ---
        csvCell(v) {
            const s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        },
        downloadCsv(filename, rows) {
            const text = rows.map((r) => r.map((c) => this.csvCell(c)).join(',')).join('\r\n');
            // Prepend a UTF-8 BOM so Excel opens accented item names correctly.
            const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        },
        exportChestsCsv() {
            const rows = [['Chest', 'Lock', 'Items', 'Header count']];
            for (const c of this.sortedChests) rows.push([c.display, c.lock ?? '', c.count, c.declared ?? '']);
            this.downloadCsv('chests.csv', rows);
        },
        // Enriches each item with equipment-catalog stats via /api/chestlookup
        // (public, read-only). Stats are blank for items not found in the DB,
        // and blank for ALL items if the lookup fails — the CSV still exports.
        async exportIndexCsv() {
            if (this.exporting) return;
            this.exporting = true;
            let stats = {};
            try {
                const names = [...new Set(this.sortedIndex.map((r) => r.item))];
                const resp = await axios.post('/api/chestlookup', { names });
                stats = (resp.data && resp.data.data) || {};
            } catch (e) {
                this.$root.flashMsg('Stat lookup failed — exporting without stats', 'danger');
            }
            const rows = [['Item', 'Total qty', 'Chests', ...STAT_COLUMNS.map((c) => c[1])]];
            for (const r of this.sortedIndex) {
                const where = r.chests
                    .map((x) => (x.suffix ? `${x.base} ${x.suffix}` : x.base) + (x.qty > 1 ? ` x${x.qty}` : ''))
                    .join('; ');
                const s = stats[r.item] || {};
                rows.push([r.item, r.count, where, ...STAT_COLUMNS.map((c) => s[c[0]] ?? '')]);
            }
            this.downloadCsv('chest-items.csv', rows);
            this.exporting = false;
        },
    },
};
</script>

<template>
<div class="chest-page">
    <div class="chest-header">
        <div>
            <h2 class="mb-1">Chest Sorter</h2>
            <p class="text-muted mb-0 small">
                Paste the raw in-game output from looking inside a pile of chests.
                It tallies how many items each chest holds and builds an index of
                which chest every item lives in — so duplicates across chests are
                easy to spot. Everything runs in your browser; nothing is uploaded.
            </p>
        </div>
    </div>

    <div class="mb-2 d-flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-outline-secondary" @click="loadSample">Load sample</button>
        <button class="btn btn-sm btn-outline-secondary" @click="clearAll" :disabled="!raw">Clear</button>
        <span class="ms-auto text-muted small align-self-center" v-if="chests.length">
            {{ chests.length }} chest{{ chests.length === 1 ? '' : 's' }} ·
            {{ totalItems }} item{{ totalItems === 1 ? '' : 's' }} ·
            {{ itemIndex.length }} unique
        </span>
    </div>

    <textarea class="form-control chest-input mb-3" v-model="raw" rows="6"
              placeholder="Paste chest contents here…"></textarea>

    <div v-if="!chests.length" class="text-muted">
        No chests parsed yet — paste some output above or click “Load sample”.
    </div>

    <div v-if="anyMismatch" class="alert alert-warning py-2 px-3 small mb-3">
        A <span class="badge bg-warning text-dark">≠</span> badge means the chest's
        header count doesn't match the number of items parsed — this happens when an
        item is <em>named</em> with an embedded comma that looks exactly like a
        separator (e.g. <em>“The Broadsword, Sunbringer”</em> or
        <em>“A mask of the witch goddess, Rangda”</em>). Double-check those chests by eye.
    </div>

    <p v-if="chests.length" class="text-muted small mb-2 sort-tip">
        <i class="bi bi-arrow-down-up"></i>
        Tip: click any column header (<span class="sort-caret">⇅</span>) to sort. Each side has its own <strong>Export CSV</strong>.
    </p>

    <div v-if="chests.length" class="chest-grid">
        <!-- Left: per-chest item counts -->
        <section class="chest-col">
            <div class="chest-col-head">
                <h5 class="mb-0">Items per chest</h5>
                <button class="btn btn-sm btn-outline-secondary" @click="exportChestsCsv">Export CSV</button>
            </div>
            <div class="table-responsive">
                <table class="table table-sm table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th class="sortable" @click="sortChests('label')">Chest label <span class="sort-caret" :class="{ active: isActiveSort(chestSort,'label') }">{{ caret(chestSort, 'label') }}</span></th>
                            <th class="text-end sortable" @click="sortChests('lock')">Lock <span class="sort-caret" :class="{ active: isActiveSort(chestSort,'lock') }">{{ caret(chestSort, 'lock') }}</span></th>
                            <th class="text-end sortable" @click="sortChests('count')">Items <span class="sort-caret" :class="{ active: isActiveSort(chestSort,'count') }">{{ caret(chestSort, 'count') }}</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="c in sortedChests" :key="c._i">
                            <td>
                                <span class="chest-pill">
                                    <span class="chest-pill-name">{{ c.base }}</span><span
                                        v-if="c.suffix" class="chest-pill-suffix">{{ c.suffix }}</span>
                                </span>
                            </td>
                            <td class="text-end text-muted">{{ c.lock ?? '—' }}</td>
                            <td class="text-end fw-bold">
                                {{ c.count }}
                                <span v-if="c.declared != null && c.declared !== c.count"
                                      class="badge bg-warning text-dark ms-1"
                                      :title="'Header said ' + c.declared + ' items but ' + c.count + ' parsed'">
                                    ≠ {{ c.declared }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr class="fw-bold">
                            <td>Total</td>
                            <td></td>
                            <td class="text-end">{{ totalItems }}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </section>

        <!-- Right: item → which chest(s) hold it -->
        <section class="chest-col">
            <div class="chest-col-head">
                <h5 class="mb-0">Which chest holds each item</h5>
                <button class="btn btn-sm btn-outline-secondary" @click="exportIndexCsv" :disabled="exporting"
                        title="Exports the item index and looks up each item's stats from the equipment catalog">
                    {{ exporting ? 'Looking up stats…' : 'Export CSV + stats' }}
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-sm table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th class="sortable" @click="sortIndex('item')">Item <span class="sort-caret" :class="{ active: isActiveSort(indexSort,'item') }">{{ caret(indexSort, 'item') }}</span></th>
                            <th class="text-end sortable" title="Total quantity of this item across all chests (stacks counted)" @click="sortIndex('count')">× <span class="sort-caret" :class="{ active: isActiveSort(indexSort,'count') }">{{ caret(indexSort, 'count') }}</span></th>
                            <th>In chest(s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in sortedIndex" :key="row.item">
                            <td>{{ row.item }}</td>
                            <td class="text-end" :class="row.count > 1 ? 'fw-bold text-primary' : 'text-muted'">
                                {{ row.count }}
                            </td>
                            <td class="chest-labels">
                                <span v-for="(c, j) in row.chests" :key="j" class="chest-pill">
                                    <span class="chest-pill-name">{{ c.base }}</span><span
                                        v-if="c.suffix" class="chest-pill-suffix">{{ c.suffix }}</span><span
                                        v-if="c.qty > 1" class="chest-pill-qty">×{{ c.qty }}</span>
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</div>
</template>

<style scoped>
.chest-page { padding: 1rem 0.5rem 3rem; }
.chest-header { margin-bottom: 1rem; }
.chest-input { font-family: var(--bs-font-monospace); font-size: 0.85rem; }
.chest-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 1.5rem;
    align-items: start;
}
.chest-col { min-width: 0; }
.chest-col-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
}
/* Sortable column headers: clickable, with a reserved slot for the caret so
   the header text doesn't shift when the active sort arrow appears. */
th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
th.sortable:hover { color: var(--bs-primary); }
/* Neutral ⇅ is faint; the active column's arrow is full-strength primary. */
.sort-caret { display: inline-block; min-width: 0.9em; font-size: 0.72em; opacity: 0.4; }
.sort-caret.active { opacity: 1; color: var(--bs-primary); }
.sort-tip .sort-caret { opacity: 0.7; }
/* Each chest renders as a rounded "oval" pill so multiple chest IDs on one
   item row separate cleanly instead of running together. Neutral background
   so it reads in both light and dark themes; the qty rides inside as a small
   primary badge. */
.chest-labels { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chest-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.08rem 0.55rem;
    border-radius: 999px;
    background: var(--bs-tertiary-bg);
    border: 1px solid var(--bs-border-color);
    font-family: var(--bs-font-monospace);
    font-size: 0.8rem;
    line-height: 1.5;
    white-space: nowrap;
}
.chest-pill-name { font-weight: 600; }
.chest-pill-suffix { color: var(--bs-secondary-color); font-weight: 700; }
.chest-pill-qty {
    background: var(--bs-primary);
    color: #fff;
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 0.72rem;
    font-weight: 700;
}
@media (max-width: 800px) {
    .chest-grid { grid-template-columns: 1fr; gap: 1rem; }
}
</style>
