<script>
// KYA Lookup — search the kya_info table by mob name, view aggregated
// resistance buckets (from kya output) plus the raw consider/kya
// entries that contributed. See docs/kya.md for the three capture
// formats this view has to handle (A target-only, B kya, C consider).

import axios from 'axios';

// In-game element token order. PHYS first because it's almost always
// the highest bucket; ASPHYX last is just convention from the game UI.
const ELEMENTS = ['PHYS', 'MAG', 'FIRE', 'COLD', 'ELEC', 'ACID', 'POIS', 'ASPHYX', 'PSI'];

// Canonical mapping between the in-game `consider` descriptor and the
// numeric kya bucket (0 = most vulnerable, 7 = most resistant). Source
// of truth is the in-game trigger that captures `consider` output —
// kya.1..kya.8 in the trigger correspond to bucket 0..7 here, in
// descending order of vulnerability. Verified against B+C pairs in
// the data (e.g., id 2714 + 2715 for Watcher: ACID at bucket 2 = "vulnerable",
// PHYS at bucket 5 = "barely susceptible").
const CONSIDER_TO_BUCKET = {
    'completely vulnerable': 0,
    'very vulnerable':       1,
    'vulnerable':            2,
    'susceptible':           3,
    'somewhat susceptible':  4,
    'barely susceptible':    5,
    'immune':                6,
    'invulnerable':          7,
};

// "consider" reports each element by its long name; kya buckets use the
// short token. Same element, different vocabulary, so we crosswalk.
const LONG_TO_SHORT = {
    physical: 'PHYS', magical: 'MAG', fire: 'FIRE', cold: 'COLD',
    electric: 'ELEC', acid: 'ACID', poison: 'POIS',
    asphyxiation: 'ASPHYX', psionic: 'PSI',
};

// --- parsers (one per capture pattern) ---

function parsePatternB(info) {
    // Split on any combination of CR/LF — the captured kya output ends
    // each line with "\n\r" (LF then CR, not the usual CRLF), so /\r?\n/
    // alone leaves a stray \r at the start of every subsequent line and
    // the ^anchored regexes below silently fail to match.
    const lines = info.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const out = { caster: null, target: null, hp: null, least: null, most: null, buckets: {} };
    if (lines[0]) out.caster = lines[0].replace(/'s\s*$/, '').trim();
    if (lines[1]) {
        const m = lines[1].match(/^(.+?)\s+at\s+(\d+)?/);
        if (m) { out.target = m[1].trim(); out.hp = m[2] ? parseInt(m[2], 10) : null; }
    }
    for (const line of lines) {
        let m;
        if ((m = line.match(/^Least:\s*(.*)$/i))) out.least = m[1].trim();
        else if ((m = line.match(/^Most:\s*(.*)$/i))) out.most = m[1].trim();
        else if ((m = line.match(/^(\d+)\s+of\s+\d+\s*-\s*(.*)$/i))) {
            const bucket = parseInt(m[1], 10);
            const tokens = m[2].trim().split(/\s+/);
            for (const t of tokens) if (t) out.buckets[t.toUpperCase()] = bucket;
        }
    }
    return out;
}

function parsePatternC(info) {
    const segs = info.split('|').map(s => s.trim()).filter(Boolean);
    const out = { gender: null, race: null, susceptibilities: {} };
    // Order longest-first so "completely vulnerable" wins over "vulnerable",
    // "somewhat susceptible" over "susceptible", etc. — alternation is
    // greedy left-to-right.
    const DESC = '(completely vulnerable|very vulnerable|somewhat susceptible|barely susceptible|invulnerable|vulnerable|susceptible|immune)';
    const lineRe = new RegExp(`is\\s+${DESC}\\s+to\\s+([a-z]+)\\.?\\s*$`, 'i');
    for (const s of segs) {
        let m;
        if ((m = s.match(/gender is:\s*(.*)$/i))) out.gender = m[1].trim();
        else if ((m = s.match(/^race:\s*(.*)$/i))) out.race = m[1].trim();
        else if ((m = s.match(lineRe))) {
            const degree = m[1].toLowerCase();
            const elem = m[2].toLowerCase();
            const short = LONG_TO_SHORT[elem];
            if (short) out.susceptibilities[short] = degree;
        }
    }
    return out;
}

function parsePatternA(info) {
    return parsePatternB(info);
}

export default {
    name: 'Kya',
    data() {
        return {
            q: '',
            mobs: [],
            loading: false,
            debounce: null,
            selected: null,
            entries: [],
            entriesLoading: false,
            ELEMENTS,
            CONSIDER_TO_BUCKET,
        };
    },
    computed: {
        // Group entries into encounters. A pair = one B + one C row for the
        // same mob captured in adjacent ids (the in-game trigger fires both
        // commands back-to-back, so paired rows are typically id N and N+1).
        // Solo entries (B or A or C alone) become single-row encounters.
        // Real-data check (post-id-909): 856 pairs, 95 solo-B, 0 solo-C.
        encounters() {
            const sorted = [...this.entries].sort((a, b) => a.id - b.id);
            const out = [];
            let i = 0;
            while (i < sorted.length) {
                const a = sorted[i];
                const b = sorted[i + 1];
                const pairable = b
                    && Math.abs(b.id - a.id) <= 2
                    && a.pattern !== b.pattern
                    && (a.pattern === 'B' || a.pattern === 'C')
                    && (b.pattern === 'B' || b.pattern === 'C');
                if (pairable) {
                    out.push({
                        ids: [a.id, b.id],
                        b: a.pattern === 'B' ? a : b,
                        c: a.pattern === 'C' ? a : b,
                        a: null,
                    });
                    i += 2;
                } else {
                    out.push({
                        ids: [a.id],
                        b: a.pattern === 'B' ? a : null,
                        c: a.pattern === 'C' ? a : null,
                        a: a.pattern === 'A' ? a : null,
                    });
                    i += 1;
                }
            }
            return out;
        },
        // Single resistance profile per mob. Consider is the primary source
        // (verbal descriptors → bucket via CONSIDER_TO_BUCKET); kya is used
        // as fallback when consider isn't captured for that encounter, AND
        // as a cross-check when both exist (every mismatch counted in
        // `mismatch`). 2.53% mismatch rate across all paired data — small
        // but non-zero, so we surface it as a quiet flag rather than an
        // alarm.
        aggregate() {
            const acc = {};
            for (const el of ELEMENTS) acc[el] = { sum: 0, n: 0, mismatch: 0, last: null };
            for (const enc of this.encounters) {
                const bBuckets = (enc.b && enc.b.parsed && enc.b.parsed.buckets) || {};
                const aBuckets = (enc.a && enc.a.parsed && enc.a.parsed.buckets) || {};
                const cSusc    = (enc.c && enc.c.parsed && enc.c.parsed.susceptibilities) || {};
                for (const el of ELEMENTS) {
                    const cVal = cSusc[el] != null ? CONSIDER_TO_BUCKET[cSusc[el]] : null;
                    const bVal = bBuckets[el] != null ? bBuckets[el] : (aBuckets[el] != null ? aBuckets[el] : null);
                    let chosen = null;
                    if (cVal != null) {
                        chosen = cVal;
                        acc[el].last = cSusc[el];
                        if (bVal != null && bVal !== cVal) acc[el].mismatch += 1;
                    } else if (bVal != null) {
                        chosen = bVal;
                    }
                    if (chosen == null) continue;
                    acc[el].sum += chosen;
                    acc[el].n += 1;
                }
            }
            const out = {};
            for (const el of ELEMENTS) {
                const a = acc[el];
                out[el] = {
                    avg: a.n ? a.sum / a.n : null,
                    n: a.n,
                    mismatch: a.mismatch,
                    last: a.last,
                };
            }
            return out;
        },
    },
    methods: {
        async loadMobs() {
            this.loading = true;
            try {
                const r = await axios.get('/api/kya/mobs', { params: { q: this.q } });
                this.mobs = (r.data && r.data.data) || [];
            } catch (e) { this.$root.flashError(e); }
            this.loading = false;
        },
        onSearch() {
            clearTimeout(this.debounce);
            this.debounce = setTimeout(() => this.loadMobs(), 250);
        },
        async pickMob(m) {
            this.selected = m;
            this.entries = [];
            this.entriesLoading = true;
            // Keep the selection shareable / deep-linkable (?name=…) without
            // adding history entries for every click.
            if ((this.$route.query.name || '') !== m.mob_name) {
                this.$router.replace({ name: 'kya', query: { name: m.mob_name } });
            }
            try {
                const r = await axios.get('/api/kya/by-mob', { params: { name: m.mob_name } });
                const raw = (r.data && r.data.data) || [];
                this.entries = raw.map(row => {
                    let parsed = null;
                    if (row.pattern === 'B') parsed = parsePatternB(row.info);
                    else if (row.pattern === 'C') parsed = parsePatternC(row.info);
                    else if (row.pattern === 'A') parsed = parsePatternA(row.info);
                    return { ...row, parsed };
                });
            } catch (e) { this.$root.flashError(e); }
            this.entriesLoading = false;
        },
        clearSelection() {
            this.selected = null;
            this.entries = [];
            if (this.$route.query.name) this.$router.replace({ name: 'kya', query: {} });
        },
        // ?name= deep-link (mob detail + item modal link here). Prefer the
        // real list row (it carries the per-pattern counts for the header);
        // fall back to a synthetic row — pickMob only needs mob_name.
        async applyRouteName() {
            const name = (this.$route.query.name || '').trim();
            if (!name || (this.selected && this.selected.mob_name === name)) return;
            this.q = name;
            await this.loadMobs();
            const hit = this.mobs.find(m => (m.mob_name || '').toLowerCase() === name.toLowerCase());
            this.pickMob(hit || { mob_name: name, a_count: 0, b_count: 0, c_count: 0, total: 0 });
        },
        bucketColor(avg) {
            // Bucket scale: 0 = completely vulnerable (red), 7 = invulnerable
            // (green). Anchored to the in-game `consider` trigger mapping.
            if (avg == null) return 'kya-cell-na';
            if (avg <= 1.5) return 'kya-cell-vuln';
            if (avg <= 3.5) return 'kya-cell-soft';
            if (avg <= 5.5) return 'kya-cell-mid';
            return 'kya-cell-resistant';
        },
        fmtAvg(v) { return v == null ? '—' : v.toFixed(1); },
        // Helpers for the kya-cross-check row in a paired encounter.
        // The cell shows the kya bucket; if a paired consider value
        // disagrees we colour the cell amber and add a tooltip.
        kyaCellVal(enc, el) {
            const buckets = (enc.b && enc.b.parsed && enc.b.parsed.buckets)
                || (enc.a && enc.a.parsed && enc.a.parsed.buckets) || {};
            return buckets[el] != null ? buckets[el] : '—';
        },
        cellClass(enc, el) {
            const buckets = (enc.b && enc.b.parsed && enc.b.parsed.buckets)
                || (enc.a && enc.a.parsed && enc.a.parsed.buckets) || {};
            const cBucket = enc.c && enc.c.parsed
                ? CONSIDER_TO_BUCKET[enc.c.parsed.susceptibilities[el]]
                : null;
            const bBucket = buckets[el];
            if (bBucket == null) return 'kya-cell-na';
            if (cBucket != null && bBucket !== cBucket) return 'kya-cell-disagree';
            return this.bucketColor(bBucket);
        },
        cellTitle(enc, el) {
            const buckets = (enc.b && enc.b.parsed && enc.b.parsed.buckets)
                || (enc.a && enc.a.parsed && enc.a.parsed.buckets) || {};
            const cDeg = enc.c && enc.c.parsed && enc.c.parsed.susceptibilities[el];
            const cBucket = cDeg != null ? CONSIDER_TO_BUCKET[cDeg] : null;
            const bBucket = buckets[el];
            if (bBucket == null) return '';
            if (cBucket != null && bBucket !== cBucket) {
                return `Disagreement: kya=${bBucket}, consider=${cDeg} (=${cBucket})`;
            }
            return `kya bucket ${bBucket}`;
        },
    },
    watch: {
        // In-app navigation to /kya?name=X while already mounted (e.g. from
        // the item modal) — same-component reuse, mounted won't re-fire.
        '$route.query.name'() { if (this.$route.name === 'kya') this.applyRouteName(); },
    },
    mounted() {
        if (this.$route.query.name) this.applyRouteName();
        else this.loadMobs();
    },
};
</script>

<template>
<div class="kya-page p-3">
    <h2 class="mb-3">KYA Lookup</h2>

    <div class="mb-3">
        <input class="form-control" placeholder="Search mob name (e.g. watcher, zorky, demon)…"
               v-model="q" @input="onSearch" autofocus>
    </div>

    <!-- Mob list (collapses when one is selected) -->
    <div v-if="!selected">
        <div v-if="loading" class="text-muted">Loading…</div>
        <div v-else-if="!mobs.length" class="text-muted">No matches.</div>
        <div v-else class="table-responsive">
        <table class="table table-sm table-striped table-hover">
            <thead>
                <tr>
                    <th>Mob</th>
                    <th class="text-end">KYA entries</th>
                    <th class="text-end">Consider entries</th>
                    <th class="text-end">Target-only</th>
                    <th class="text-end">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="m in mobs" :key="m.mob_name" @click="pickMob(m)" class="kya-row-click">
                    <td><a href="#" @click.prevent="pickMob(m)">{{ m.mob_name }}</a></td>
                    <td class="text-end">{{ m.b_count }}</td>
                    <td class="text-end">{{ m.c_count }}</td>
                    <td class="text-end">{{ m.a_count }}</td>
                    <td class="text-end fw-bold">{{ m.total }}</td>
                </tr>
            </tbody>
        </table>
        </div>
    </div>

    <!-- Detail view -->
    <div v-else>
        <div class="d-flex align-items-center mb-3">
            <button class="btn btn-sm btn-secondary me-3" @click="clearSelection">← Back</button>
            <h3 class="mb-0">{{ selected.mob_name }}</h3>
            <span class="ms-3 text-muted">
                {{ selected.b_count }} kya / {{ selected.c_count }} consider / {{ selected.a_count }} target-only
            </span>
        </div>

        <div v-if="entriesLoading" class="text-muted">Loading entries…</div>

        <div v-else>
            <!-- Aggregate: single resistance profile per mob.
                 Consider is the prime source; kya is fallback + cross-check. -->
            <div class="card kya-card mb-4">
                <div class="card-header">
                    Resistance profile
                    <span class="text-muted small ms-2">
                        — consider primary, kya fallback. 0 = vulnerable, 7 = invulnerable.
                    </span>
                </div>
                <div class="card-body p-2">
                    <table class="table table-sm mb-0 kya-agg-table">
                        <thead>
                            <tr>
                                <th>Element</th>
                                <th class="text-end">Avg</th>
                                <th>Latest descriptor</th>
                                <th class="text-end">N</th>
                                <th class="text-end" title="Encounters where kya bucket disagreed with the consider descriptor">⚠ kya ≠ consider</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="el in ELEMENTS" :key="'agg'+el">
                                <td>{{ el }}</td>
                                <td class="text-end" :class="bucketColor(aggregate[el].avg)">{{ fmtAvg(aggregate[el].avg) }}</td>
                                <td class="text-muted small">{{ aggregate[el].last || '—' }}</td>
                                <td class="text-end text-muted">{{ aggregate[el].n }}</td>
                                <td class="text-end small" :class="aggregate[el].mismatch ? 'text-warning' : 'text-muted'">
                                    {{ aggregate[el].mismatch || '—' }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Per-encounter list. Pairs render as one card with both
                 formats stacked; solos render with only their format. -->
            <h4 class="mb-2">Encounters ({{ encounters.length }})</h4>
            <div v-for="enc in encounters" :key="enc.ids.join('-')" class="card kya-card mb-2">
                <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span>
                        <span class="badge bg-secondary me-2">
                            #{{ enc.ids.join(' + #') }}
                        </span>
                        <span v-if="enc.b && enc.c" class="badge bg-success me-1">PAIRED</span>
                        <span v-else-if="enc.b" class="badge bg-primary me-1">KYA only</span>
                        <span v-else-if="enc.c" class="badge bg-info text-dark me-1">CONSIDER only</span>
                        <span v-else-if="enc.a" class="badge bg-warning text-dark me-1">TARGET only</span>
                    </span>
                    <span class="text-muted small text-end">
                        <template v-if="enc.b && enc.b.parsed">
                            target: <code>{{ enc.b.parsed.target }}</code> · hp {{ enc.b.parsed.hp ?? '?' }}%
                            · least <strong>{{ enc.b.parsed.least || '—' }}</strong>
                            · most <strong>{{ enc.b.parsed.most || '—' }}</strong>
                        </template>
                        <template v-else-if="enc.c && enc.c.parsed">
                            {{ enc.c.parsed.gender || '?' }} · {{ enc.c.parsed.race || '?' }}
                        </template>
                        <template v-else-if="enc.a && enc.a.parsed">
                            target: <code>{{ enc.a.parsed.target }}</code> · hp {{ enc.a.parsed.hp ?? '?' }}%
                        </template>
                    </span>
                </div>
                <div class="card-body p-2">
                    <!-- Consider row (primary). Numeric cell, descriptor in tooltip. -->
                    <div v-if="enc.c && enc.c.parsed" class="mb-2">
                        <div class="text-muted small mb-1">consider (primary):</div>
                        <table class="table table-sm mb-0 kya-entry-table">
                            <thead>
                                <tr><th v-for="el in ELEMENTS" :key="el">{{ el }}</th></tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td v-for="el in ELEMENTS" :key="el"
                                        :class="bucketColor(enc.c.parsed.susceptibilities[el] != null ? CONSIDER_TO_BUCKET[enc.c.parsed.susceptibilities[el]] : null)"
                                        :title="enc.c.parsed.susceptibilities[el] || ''">
                                        {{ enc.c.parsed.susceptibilities[el] != null ? CONSIDER_TO_BUCKET[enc.c.parsed.susceptibilities[el]] : '—' }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <!-- KYA row (confirmation when paired, primary when solo) -->
                    <div v-if="(enc.b && enc.b.parsed) || (enc.a && enc.a.parsed)">
                        <div class="text-muted small mb-1">
                            kya<span v-if="enc.c"> (cross-check):</span><span v-else>:</span>
                        </div>
                        <table class="table table-sm mb-0 kya-entry-table">
                            <thead>
                                <tr><th v-for="el in ELEMENTS" :key="el">{{ el }}</th></tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td v-for="el in ELEMENTS" :key="el"
                                        :class="cellClass(enc, el)"
                                        :title="cellTitle(enc, el)">
                                        {{ kyaCellVal(enc, el) }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <details class="mt-2">
                        <summary class="text-muted small">Raw</summary>
                        <pre v-if="enc.b" class="kya-raw small mt-1 mb-1">{{ enc.b.info }}</pre>
                        <pre v-if="enc.c" class="kya-raw small mt-1 mb-1">{{ enc.c.info }}</pre>
                        <pre v-if="enc.a" class="kya-raw small mt-1 mb-1">{{ enc.a.info }}</pre>
                    </details>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.kya-row-click { cursor: pointer; }
.kya-card { background: var(--bs-body-bg); }
.kya-agg-table th, .kya-agg-table td { padding: 0.25rem 0.5rem; }
.kya-entry-table th, .kya-entry-table td {
    text-align: center;
    padding: 0.25rem 0.4rem;
    min-width: 3em;
}
.kya-raw {
    background: var(--bs-tertiary-bg);
    color: var(--bs-body-color);
    padding: 0.5rem;
    border-radius: 0.25rem;
    white-space: pre-wrap;
    word-break: break-word;
}
/* Heatmap colors must work in both light and dark themes — use rgba
   over body bg so the contrast survives a theme flip without per-theme
   overrides. See docs/ui.md. */
.kya-cell-resistant { background: rgba(40, 167, 69, 0.25); }
.kya-cell-mid       { background: rgba(255, 193, 7, 0.18); }
.kya-cell-soft      { background: rgba(253, 126, 20, 0.22); }
.kya-cell-vuln      { background: rgba(220, 53, 69, 0.30); }
.kya-cell-na        { color: var(--bs-secondary-color); }
/* Amber outline for B/C disagreements — quiet signal, not an alarm.
   ~2.5% of paired entries actually disagree, so the styling shouldn't
   shout when it fires. */
.kya-cell-disagree {
    background: rgba(255, 193, 7, 0.35);
    outline: 1px dashed rgba(220, 53, 69, 0.7);
    outline-offset: -2px;
}
</style>
