<script>
// /builds — public gallery of saved reincs ("builds"). Each row is a
// reinc the community saved from the planner; visitors can see a
// short summary, upvote/downvote it, and click "Open in planner" to
// jump into /reinc?build=<id> and rehydrate the exact state.
//
// Builds cannot be edited; a user who wants to tweak their reinc
// reopens it in the planner, makes changes, and saves a NEW build.
// See docs/saved-reincs.md for the full data model + drift notes.
import axios from 'axios';

const SORTS = [
    { value: 'top', label: 'Top' },
    { value: 'new', label: 'Newest' },
];

export default {
    name: 'Builds',
    data() {
        return {
            rows: [],
            myVotes: {},
            loading: true,
            sort: 'top',
            q: '',
            expandedId: null,
            sorts: SORTS,
        };
    },
    computed: {
        empty() { return !this.loading && !this.rows.length; },
    },
    methods: {
        fmtDate(iso) {
            if (!iso) return '';
            const d = new Date(iso);
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        },
        nfmt(n) {
            if (n == null || isNaN(n)) return '0';
            return Math.floor(Number(n)).toLocaleString();
        },
        sfmt(n) {
            if (n == null || isNaN(n)) return '0';
            const v = Number(n);
            const abs = Math.abs(v);
            if (abs >= 1e12) return (abs / 1e12).toFixed(1) + 'T';
            if (abs >= 1e9)  return (abs / 1e9).toFixed(1) + 'B';
            if (abs >= 1e6)  return (abs / 1e6).toFixed(1) + 'M';
            if (abs >= 1e4)  return (abs / 1e3).toFixed(1) + 'K';
            return Math.floor(abs).toLocaleString();
        },
        score(r) { return (r.upvotes | 0) - (r.downvotes | 0); },
        myVoteFor(id) { return this.myVotes[id] || 0; },
        async load() {
            this.loading = true;
            try {
                const r = await axios.get('/api/builds', {
                    params: { sort: this.sort, q: this.q || undefined },
                });
                const d = r.data && r.data.data;
                this.rows = (d && d.rows) || [];
                this.myVotes = (d && d.myVotes) || {};
            } catch (e) {
                this.$root.flashError(e);
            }
            this.loading = false;
        },
        toggleExpand(r) {
            this.expandedId = this.expandedId === r.id ? null : r.id;
        },
        openInPlanner(r) {
            this.$router.push({ name: 'reinc', query: { build: r.id } });
        },
        // Clicking an already-highlighted arrow clears that vote (value
        // 0). Clicking the other arrow switches sides. The server
        // handles all three cases atomically per (reinc, ip_hash).
        async vote(r, dir) {
            const current = this.myVoteFor(r.id);
            const next = current === dir ? 0 : dir;
            try {
                const resp = await axios.post('/api/builds/' + r.id + '/vote', { value: next });
                const d = resp.data && resp.data.data;
                if (d) {
                    r.upvotes = d.upvotes;
                    r.downvotes = d.downvotes;
                    this.myVotes = { ...this.myVotes, [r.id]: d.myVote };
                }
            } catch (e) { this.$root.flashError(e); }
        },
    },
    mounted() { this.load(); },
    watch: {
        sort() { this.load(); },
    },
};
</script>

<template>
<div class="builds-page">
    <div class="bl-header">
        <div>
            <h2 class="mb-1">Shared Reinc Builds</h2>
            <p class="text-muted mb-0 small">
                Saved reincs posted by planner users. Open one in the planner
                to inspect or tweak it; vote to bubble the good ones up. Want
                to post your own?
                <router-link :to="{name:'reinc'}">Build it in the planner</router-link>
                and hit the 💾 Share Build button in the summary bar.
            </p>
        </div>
    </div>

    <div class="bl-controls">
        <div class="btn-group btn-group-sm" role="group">
            <button v-for="s in sorts" :key="s.value"
                    type="button"
                    class="btn"
                    :class="sort === s.value ? 'btn-primary' : 'btn-outline-primary'"
                    @click="sort = s.value">
                {{ s.label }}
            </button>
        </div>
        <form class="bl-search" @submit.prevent="load">
            <input v-model="q" type="search" class="form-control form-control-sm"
                   placeholder="Search title, author, race, guild…" />
            <button type="submit" class="btn btn-sm btn-outline-secondary">Search</button>
        </form>
    </div>

    <div v-if="loading" class="text-muted">Loading…</div>
    <div v-else-if="empty" class="text-muted">
        No builds have been shared yet. Be the first!
    </div>

    <ul v-else class="bl-list">
        <li v-for="r in rows" :key="r.id" class="bl-card">
            <div class="bl-votes">
                <button type="button" class="bl-vote up"
                        :class="{ active: myVoteFor(r.id) === 1 }"
                        @click="vote(r, 1)"
                        aria-label="Upvote">▲</button>
                <div class="bl-score" :title="`${r.upvotes} up / ${r.downvotes} down`">
                    {{ score(r) }}
                </div>
                <button type="button" class="bl-vote down"
                        :class="{ active: myVoteFor(r.id) === -1 }"
                        @click="vote(r, -1)"
                        aria-label="Downvote">▼</button>
            </div>

            <div class="bl-body">
                <div class="bl-title-row">
                    <span class="bl-title">{{ r.title }}</span>
                    <span v-if="r.is_featured" class="badge bg-warning text-dark">Featured</span>
                    <span class="bl-author">by {{ r.author }}</span>
                    <span class="bl-date text-muted">{{ fmtDate(r.created) }}</span>
                </div>
                <div class="bl-meta">
                    <span class="bl-race">{{ r.race_name || '?' }}</span>
                    <span v-if="r.guild_summary" class="bl-guilds">{{ r.guild_summary }}</span>
                </div>
                <div class="bl-stats">
                    <span><b>LVL</b> {{ r.total_levels }}</span>
                    <span><b>HP</b> {{ sfmt(r.hp) }}</span>
                    <span><b>SP</b> {{ sfmt(r.sp) }}</span>
                    <span><b>XP</b> <span :title="nfmt(r.total_exp)">{{ sfmt(r.total_exp) }}</span></span>
                    <span><b>Gold</b> <span :title="nfmt(r.gold)">{{ sfmt(r.gold) }}</span></span>
                </div>
                <div v-if="expandedId === r.id && r.description" class="bl-desc">
                    {{ r.description }}
                </div>
            </div>

            <div class="bl-actions">
                <button v-if="r.description"
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        @click="toggleExpand(r)">
                    {{ expandedId === r.id ? 'Hide' : 'Details' }}
                </button>
                <button type="button"
                        class="btn btn-sm btn-primary"
                        @click="openInPlanner(r)">
                    Open in planner
                </button>
            </div>
        </li>
    </ul>
</div>
</template>

<style scoped>
.builds-page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1rem 0.5rem 3rem;
}
.bl-header { margin-bottom: 1rem; }
.bl-controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
}
.bl-search { display: flex; gap: 0.35rem; flex: 1 1 18rem; max-width: 28rem; }
.bl-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.bl-card {
    display: grid;
    grid-template-columns: 3.5rem 1fr auto;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid #dee2e6;
    border-radius: 0.35rem;
    background: #fff;
    align-items: start;
}
.bl-votes {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding-top: 0.15rem;
}
.bl-vote {
    background: transparent;
    border: 1px solid transparent;
    color: #6c757d;
    font-size: 1.1rem;
    line-height: 1;
    padding: 0.1rem 0.45rem;
    border-radius: 0.25rem;
    cursor: pointer;
}
.bl-vote:hover { background: #f1f3f5; color: #212529; }
.bl-vote.up.active { color: #198754; background: #d1e7dd; }
.bl-vote.down.active { color: #b02a37; background: #f8d7da; }
.bl-score { font-weight: 700; font-size: 0.95rem; font-variant-numeric: tabular-nums; }
.bl-body { min-width: 0; }
.bl-title-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
    margin-bottom: 0.2rem;
}
.bl-title { font-weight: 700; font-size: 1rem; }
.bl-author { font-size: 0.85rem; color: #495057; }
.bl-date { font-size: 0.75rem; margin-left: auto; }
.bl-meta {
    font-size: 0.85rem;
    color: #495057;
    margin-bottom: 0.25rem;
}
.bl-race { font-weight: 600; margin-right: 0.5rem; }
.bl-guilds { font-family: monospace; }
.bl-stats {
    display: flex;
    gap: 0.75rem 1.25rem;
    flex-wrap: wrap;
    font-size: 0.8rem;
    color: #212529;
}
.bl-stats b {
    font-weight: 700;
    color: #6c757d;
    font-size: 0.65rem;
    text-transform: uppercase;
    margin-right: 0.2rem;
    letter-spacing: 0.05em;
}
.bl-desc {
    margin-top: 0.5rem;
    padding: 0.5rem 0.65rem;
    background: #f8f9fa;
    border-left: 3px solid #0d6efd;
    font-size: 0.85rem;
    white-space: pre-wrap;
}
.bl-actions {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    align-items: stretch;
}
@media (max-width: 700px) {
    .bl-card { grid-template-columns: 3rem 1fr; }
    .bl-actions { grid-column: 1 / -1; flex-direction: row; justify-content: flex-end; }
    .bl-date { margin-left: 0; }
}

/* Dark mode — scoped overrides live here so Vue's scope hash doesn't
   outrank them. Ancestor [data-bs-theme="dark"] on <html> still matches. */
[data-bs-theme="dark"] .bl-card {
    background: #1b1f23;
    border-color: #2a2f36;
}
[data-bs-theme="dark"] .bl-vote { color: #adb5bd; }
[data-bs-theme="dark"] .bl-vote:hover { background: #23272e; color: #e9ecef; }
[data-bs-theme="dark"] .bl-vote.up.active { color: #75b798; background: #1c3a2b; }
[data-bs-theme="dark"] .bl-vote.down.active { color: #ea868f; background: #3a1c21; }
[data-bs-theme="dark"] .bl-author,
[data-bs-theme="dark"] .bl-meta { color: #adb5bd; }
[data-bs-theme="dark"] .bl-stats { color: #e9ecef; }
[data-bs-theme="dark"] .bl-stats b { color: #8a939c; }
[data-bs-theme="dark"] .bl-desc {
    background: #23272e;
    border-left-color: #6ea8fe;
}
</style>
