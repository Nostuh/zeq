<script>
import axios from 'axios';
export default {
    name: 'MobHistory',
    props: ['mobId'],
    data() {
        return {
            entries: [],
            total: 0,
            page: 1,
            loading: false,
            expandedId: null,
        };
    },
    methods: {
        async load() {
            this.loading = true;
            try {
                const r = await axios.get('/api/mobs/' + this.mobId + '/history', { params: { page: this.page } });
                this.entries = r.data.data.rows || [];
                this.total = r.data.data.total || 0;
            } catch (e) { this.$root.flashError(e); }
            this.loading = false;
        },
        toggle(entry) {
            this.expandedId = this.expandedId === entry.id ? null : entry.id;
        },
        fmtDate(v) {
            if (!v) return '';
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        },
        parseDiff(entry) {
            if (entry.diff_json) {
                try { return JSON.parse(entry.diff_json); } catch { return null; }
            }
            return null;
        },
        parseSnapshot(entry) {
            if (entry.snapshot) {
                try { return JSON.parse(entry.snapshot); } catch { return null; }
            }
            return null;
        },
        actionBadge(action) {
            if (action === 'create') return 'bg-success';
            if (action === 'update') return 'bg-primary';
            if (action === 'delete') return 'bg-danger';
            return 'bg-secondary';
        },
        prevPage() { if (this.page > 1) { this.page--; this.load(); } },
        nextPage() { if (this.page * 50 < this.total) { this.page++; this.load(); } },
    },
    mounted() { this.load(); },
    watch: { mobId() { this.page = 1; this.load(); } },
};
</script>
<template>
<div class="mob-section mob-history-panel">
    <h5>Edit History</h5>
    <div v-if="loading" class="text-muted">Loading...</div>
    <div v-else>
        <div v-for="entry in entries" :key="entry.id" class="mob-history-entry mb-2"
             :class="{ 'mob-history-init': entry.user_name === 'init' }">
            <div class="d-flex align-items-center gap-2" style="cursor:pointer;" @click="toggle(entry)">
                <span class="badge" :class="actionBadge(entry.action)">{{ entry.action }}</span>
                <span class="badge bg-secondary">{{ entry.section }}</span>
                <span class="fw-semibold" :class="entry.user_name === 'init' ? 'text-muted fst-italic' : ''">
                    {{ entry.user_name === 'init' ? 'System Import' : entry.user_name }}
                </span>
                <span class="text-muted small ms-auto">{{ fmtDate(entry.created) }}</span>
                <span class="small">{{ expandedId === entry.id ? '▼' : '▶' }}</span>
            </div>
            <div v-if="expandedId === entry.id" class="mt-2 ps-3">
                <!-- Diff view -->
                <div v-if="parseDiff(entry)" class="mob-history-diff">
                    <div v-for="(change, field) in parseDiff(entry)" :key="field" class="mb-1">
                        <strong>{{ field }}:</strong>
                        <div v-if="typeof change === 'object' && change.old !== undefined" class="d-flex flex-column">
                            <div class="diff-old"><del>{{ change.old != null ? change.old : '(empty)' }}</del></div>
                            <div class="diff-new"><ins>{{ change.new != null ? change.new : '(empty)' }}</ins></div>
                        </div>
                        <span v-else class="text-muted">{{ JSON.stringify(change) }}</span>
                    </div>
                </div>
                <!-- Snapshot view -->
                <div v-else-if="parseSnapshot(entry)">
                    <pre class="small mb-0">{{ JSON.stringify(parseSnapshot(entry), null, 2) }}</pre>
                </div>
                <div v-else class="text-muted small">No details available</div>
            </div>
        </div>
        <div v-if="!entries.length" class="text-muted">No history entries.</div>
        <div v-if="total > 50" class="d-flex gap-2 mt-2">
            <button class="btn btn-sm btn-outline-secondary" @click="prevPage" :disabled="page <= 1">Prev</button>
            <span class="small align-self-center">Page {{ page }} of {{ Math.ceil(total / 50) }}</span>
            <button class="btn btn-sm btn-outline-secondary" @click="nextPage" :disabled="page * 50 >= total">Next</button>
        </div>
    </div>
</div>
</template>
