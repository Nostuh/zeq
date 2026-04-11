<script>
import axios from 'axios';

const KINDS = [
    { value: 'fix',     label: 'Fix',     badge: 'bg-success'   },
    { value: 'feature', label: 'Feature', badge: 'bg-primary'   },
    { value: 'tweak',   label: 'Tweak',   badge: 'bg-info'      },
    { value: 'content', label: 'Content', badge: 'bg-secondary' },
];

function toLocalInput(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default {
    name: 'Updates',
    data() {
        return {
            rows: [],
            loading: true,
            editing: null,
            form: this.emptyForm(),
            kinds: KINDS,
        };
    },
    computed: {
        isAdmin() { return this.$root && this.$root.isAdmin; },
        grouped() {
            const by = {};
            for (const r of this.rows) {
                const d = new Date(r.created);
                const key = d.toISOString().slice(0, 10);
                (by[key] ||= []).push(r);
            }
            return Object.entries(by)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([date, items]) => ({ date, items }));
        },
    },
    methods: {
        emptyForm() {
            return { id: null, kind: 'fix', title: '', body: '', bug_id: '', created: toLocalInput(new Date()) };
        },
        kindMeta(k) { return KINDS.find((x) => x.value === k) || KINDS[0]; },
        fmtDate(iso) {
            if (!iso) return '';
            const d = new Date(iso);
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        },
        async load() {
            this.loading = true;
            try {
                const r = await axios.get('/api/updates/');
                this.rows = (r.data && r.data.data) || [];
            } catch (e) { this.$root.flashError(e); }
            this.loading = false;
        },
        startCreate() {
            this.editing = 'new';
            this.form = this.emptyForm();
        },
        startEdit(r) {
            this.editing = r.id;
            this.form = {
                id: r.id,
                kind: r.kind,
                title: r.title,
                body: r.body || '',
                bug_id: r.bug_id || '',
                created: toLocalInput(new Date(r.created)),
            };
        },
        cancel() { this.editing = null; this.form = this.emptyForm(); },
        async save() {
            const payload = {
                kind: this.form.kind,
                title: this.form.title.trim(),
                body: this.form.body.trim() || null,
                bug_id: this.form.bug_id === '' ? null : parseInt(this.form.bug_id, 10),
                created: new Date(this.form.created).toISOString(),
            };
            if (!payload.title) { this.$root.flashMsg('Title required', 'danger'); return; }
            try {
                if (this.editing === 'new') {
                    await axios.post('/api/updates/', payload);
                    this.$root.flashMsg('Update posted');
                } else {
                    await axios.post('/api/updates/' + this.editing, payload);
                    this.$root.flashMsg('Update saved');
                }
                this.cancel();
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
        async del(r) {
            if (!confirm(`Delete update "${r.title}"?`)) return;
            try {
                await axios.delete('/api/updates/' + r.id);
                this.$root.flashMsg('Deleted');
                await this.load();
            } catch (e) { this.$root.flashError(e); }
        },
    },
    mounted() { this.load(); },
};
</script>

<template>
<div class="updates-page">
    <div class="upd-header">
        <div>
            <h2 class="mb-1">Recent Updates</h2>
            <p class="text-muted mb-0 small">
                Fixes, tweaks, and new features to the Nostuh reinc planner.
                Items tagged with a bug number came from a user report via the
                “Report Bug / Idea” button — thanks for the feedback!
            </p>
        </div>
        <div v-if="isAdmin" class="upd-admin-actions">
            <button class="btn btn-sm btn-primary" @click="startCreate" v-if="editing !== 'new'">
                + New update
            </button>
        </div>
    </div>

    <div v-if="isAdmin && editing !== null" class="card mb-3 upd-form">
        <div class="card-body">
            <h6 class="card-title mb-3">{{ editing === 'new' ? 'New update' : 'Edit update' }}</h6>
            <div class="row g-2">
                <div class="col-md-2">
                    <label class="form-label small mb-0">Kind</label>
                    <select v-model="form.kind" class="form-select form-select-sm">
                        <option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.label }}</option>
                    </select>
                </div>
                <div class="col-md-7">
                    <label class="form-label small mb-0">Title</label>
                    <input v-model="form.title" class="form-control form-control-sm" placeholder="Short summary" />
                </div>
                <div class="col-md-3">
                    <label class="form-label small mb-0">Date</label>
                    <input type="datetime-local" v-model="form.created" class="form-control form-control-sm" />
                </div>
                <div class="col-md-2">
                    <label class="form-label small mb-0">Bug #</label>
                    <input v-model="form.bug_id" class="form-control form-control-sm" placeholder="optional" />
                </div>
                <div class="col-md-10">
                    <label class="form-label small mb-0">Body (optional)</label>
                    <textarea v-model="form.body" class="form-control form-control-sm" rows="3" placeholder="Plain text. Describe what users will notice."></textarea>
                </div>
            </div>
            <div class="mt-3 d-flex gap-2">
                <button class="btn btn-sm btn-success" @click="save">Save</button>
                <button class="btn btn-sm btn-outline-secondary" @click="cancel">Cancel</button>
            </div>
        </div>
    </div>

    <div v-if="loading" class="text-muted">Loading…</div>
    <div v-else-if="!rows.length" class="text-muted">No updates logged yet.</div>

    <div v-for="group in grouped" :key="group.date" class="upd-group">
        <div class="upd-date">{{ fmtDate(group.date) }}</div>
        <ul class="upd-list">
            <li v-for="r in group.items" :key="r.id" class="upd-item">
                <span class="badge" :class="kindMeta(r.kind).badge">{{ kindMeta(r.kind).label }}</span>
                <div class="upd-body">
                    <div class="upd-title">
                        {{ r.title }}
                        <span v-if="r.bug_id" class="upd-bug" :title="r.bug_title || ''">
                            (from bug #{{ r.bug_id }})
                        </span>
                    </div>
                    <div v-if="r.body" class="upd-desc">{{ r.body }}</div>
                </div>
                <div v-if="isAdmin" class="upd-actions">
                    <button class="btn btn-sm btn-outline-secondary" @click="startEdit(r)">Edit</button>
                    <button class="btn btn-sm btn-outline-danger" @click="del(r)">Delete</button>
                </div>
            </li>
        </ul>
    </div>
</div>
</template>

<style scoped>
.updates-page {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem 0.5rem 3rem;
}
.upd-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.25rem;
}
.upd-admin-actions { flex-shrink: 0; }
.upd-group { margin-bottom: 1.5rem; }
.upd-date {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c757d;
    border-bottom: 1px solid #dee2e6;
    padding-bottom: 0.25rem;
    margin-bottom: 0.6rem;
}
.upd-list { list-style: none; padding: 0; margin: 0; }
.upd-item {
    display: grid;
    grid-template-columns: 5rem 1fr auto;
    gap: 0.75rem;
    align-items: start;
    padding: 0.55rem 0;
    border-bottom: 1px solid #f1f3f5;
}
.upd-item:last-child { border-bottom: none; }
.upd-item .badge { justify-self: start; margin-top: 0.15rem; }
.upd-title { font-weight: 600; line-height: 1.3; }
.upd-bug { font-weight: 400; color: #6c757d; font-size: 0.85em; margin-left: 0.25rem; }
.upd-desc { margin-top: 0.25rem; color: #495057; font-size: 0.9rem; white-space: pre-wrap; }
.upd-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
.upd-form { border-color: #0d6efd; }
@media (max-width: 600px) {
    .upd-item {
        grid-template-columns: 1fr;
        gap: 0.35rem;
    }
    .upd-actions { justify-self: start; }
    .upd-header { flex-direction: column; }
}
</style>
