<script>
import axios from 'axios';
export default {
    name: 'Bugs',
    data() { return { rows: [], filter: '', expanded: new Set(), domExpanded: new Set() }; },
    computed: {
        filtered() { return this.filter ? this.rows.filter((r) => r.status === this.filter) : this.rows; },
    },
    methods: {
        async load() {
            try { this.rows = (await axios.get('/api/bugs/', { params: this.filter ? { status: this.filter } : {} })).data.data; }
            catch (e) { this.$root.flashError(e); }
        },
        async setStatus(b, status) {
            try { await axios.post('/api/bugs/' + b.id + '/status', { status }); this.$root.flashMsg('Updated'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        async del(b) {
            if (!confirm(`Delete report #${b.id}?`)) return;
            try { await axios.delete('/api/bugs/' + b.id); this.$root.flashMsg('Deleted'); await this.load(); }
            catch (e) { this.$root.flashError(e); }
        },
        toggle(id) {
            const s = new Set(this.expanded);
            s.has(id) ? s.delete(id) : s.add(id);
            this.expanded = s;
        },
        isOpen(id) { return this.expanded.has(id); },
        toggleDom(id) {
            const s = new Set(this.domExpanded);
            s.has(id) ? s.delete(id) : s.add(id);
            this.domExpanded = s;
        },
        isDomOpen(id) { return this.domExpanded.has(id); },
        previewDom(raw, open) {
            if (!raw) return '';
            // Show only the first 1200 chars collapsed so the admin row
            // stays compact. The expand button swaps to the full snapshot.
            const LIMIT = 1200;
            if (open || raw.length <= LIMIT) return raw;
            return raw.slice(0, LIMIT) + '\n… [+' + (raw.length - LIMIT).toLocaleString() + ' more chars; click expand]';
        },
        prettyJson(raw) {
            if (!raw) return '';
            try { return JSON.stringify(JSON.parse(raw), null, 2); }
            catch { return String(raw); }
        },
    },
    mounted() { this.load(); },
    watch: { filter() { this.load(); } },
};
</script>
<template>
<div>
    <h2>Bug Reports &amp; Ideas</h2>
    <div class="mb-2">
        <select class="form-select form-select-sm" style="max-width:15em;" v-model="filter">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="wontfix">Won't fix</option>
        </select>
    </div>
    <table class="table table-sm table-striped align-middle">
        <thead><tr><th>#</th><th>Title</th><th>Status</th><th>Reporter</th><th>Page</th><th>When</th><th style="width:22em;"></th></tr></thead>
        <tbody>
            <template v-for="b in filtered" :key="b.id">
                <tr>
                    <td>{{ b.id }}</td>
                    <td><strong>{{ b.title }}</strong></td>
                    <td><span class="badge bg-light text-dark border">{{ b.status }}</span></td>
                    <td class="small">{{ b.reporter_name || b.user_name || 'anon' }}</td>
                    <td class="small" style="word-break:break-all;max-width:18em;">{{ b.page_url }}</td>
                    <td class="small">{{ b.created }}</td>
                    <td>
                        <select class="form-select form-select-sm d-inline-block" style="width:9em;" :value="b.status" @change="setStatus(b, $event.target.value)">
                            <option value="open">open</option>
                            <option value="in_progress">in progress</option>
                            <option value="resolved">resolved</option>
                            <option value="wontfix">wontfix</option>
                        </select>
                        <button class="btn btn-sm btn-outline-danger ms-1" @click="del(b)">Del</button>
                    </td>
                </tr>
                <tr><td colspan="7">
                    <pre class="small mb-0">{{ b.description }}</pre>
                    <div class="small text-muted">{{ b.user_agent }} — {{ b.screen_size }}</div>
                    <button class="btn btn-sm btn-outline-secondary mt-1" @click="toggle(b.id)">
                        {{ isOpen(b.id) ? '− hide captured context' : '+ show captured context (app_state / DOM / console)' }}
                    </button>
                    <div v-if="b.attachments && b.attachments.length" class="mt-2 d-flex flex-wrap gap-2">
                        <a v-for="a in b.attachments" :key="a.id"
                           :href="`/api/bugs/${b.id}/attachments/${a.id}`"
                           target="_blank" rel="noopener"
                           :title="`${a.filename} (${Math.round(a.size_bytes/1024)} KB)`">
                            <img :src="`/api/bugs/${b.id}/attachments/${a.id}`"
                                 :alt="a.filename" class="attachment-thumb">
                        </a>
                    </div>
                    <div v-if="isOpen(b.id)" class="mt-2">
                        <div v-if="b.app_state" class="mb-2">
                            <div class="small fw-bold">app_state</div>
                            <pre class="small context-block">{{ prettyJson(b.app_state) }}</pre>
                        </div>
                        <div v-if="b.console_log" class="mb-2">
                            <div class="small fw-bold">console_log (last entries)</div>
                            <pre class="small context-block">{{ b.console_log }}</pre>
                        </div>
                        <div v-if="b.dom_snapshot" class="mb-2">
                            <div class="small fw-bold d-flex align-items-center gap-2">
                                dom_snapshot
                                <button class="btn btn-sm btn-outline-secondary py-0 px-2" @click="toggleDom(b.id)">
                                    {{ isDomOpen(b.id) ? 'collapse' : 'expand' }}
                                </button>
                                <span class="text-muted fw-normal">{{ (b.dom_snapshot.length/1024).toFixed(1) }} KB</span>
                            </div>
                            <pre class="small context-block">{{ previewDom(b.dom_snapshot, isDomOpen(b.id)) }}</pre>
                        </div>
                        <div v-if="!b.app_state && !b.console_log && !b.dom_snapshot" class="small text-muted">
                            (no captured context — legacy report)
                        </div>
                    </div>
                </td></tr>
            </template>
        </tbody>
    </table>
</div>
</template>
<style scoped>
.attachment-thumb {
    width: 7rem;
    height: 7rem;
    object-fit: cover;
    border: 1px solid #dee2e6;
    border-radius: 0.25rem;
    transition: transform 120ms;
}
.attachment-thumb:hover { transform: scale(1.03); border-color: #0d6efd; }
.context-block {
    max-height: 18rem;
    overflow: auto;
    background: #f8f9fa;
    padding: 0.5rem;
    border: 1px solid #dee2e6;
    border-radius: 0.25rem;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: monospace;
    font-size: 0.72rem;
}

[data-bs-theme="dark"] .context-block {
    background: #23272e;
    border-color: #2a2f36;
    color: #e9ecef;
}
[data-bs-theme="dark"] .attachment-thumb { border-color: #2a2f36; }
</style>
