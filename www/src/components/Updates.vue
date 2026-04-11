<script>
import axios from 'axios';

const KINDS = [
    { value: 'fix',     label: 'Fix',     badge: 'bg-success'   },
    { value: 'feature', label: 'Feature', badge: 'bg-primary'   },
    { value: 'tweak',   label: 'Tweak',   badge: 'bg-info'      },
    { value: 'content', label: 'Content', badge: 'bg-secondary' },
];

const pad = (n) => String(n).padStart(2, '0');

// `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm`. The API
// returns `created` as a naive Eastern wall-clock string already in
// that shape (just with seconds), so editing simply trims the seconds.
function toFormInput(naive) {
    if (!naive) return '';
    const m = String(naive).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    return m ? `${m[1]}T${m[2]}` : '';
}

// Current wall-clock time in America/New_York, formatted for the
// datetime-local input. Used when authoring a new entry — the seed
// file timestamps are Eastern, and we keep new ones consistent.
function nowEasternInput() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}`;
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
        sortedRows() {
            // `created` is a naive string ("YYYY-MM-DDTHH:mm:ss") authored
            // in Eastern wall-clock. Lexicographic sort is fine — no need
            // to round-trip through Date.
            return [...this.rows].sort((a, b) => {
                return String(b.created || '').localeCompare(String(a.created || ''));
            });
        },
    },
    methods: {
        emptyForm() {
            return { id: null, kind: 'fix', title: '', body: '', bug_id: '', created: nowEasternInput() };
        },
        kindMeta(k) { return KINDS.find((x) => x.value === k) || KINDS[0]; },
        // `naive` is "YYYY-MM-DDTHH:mm:ss" with no timezone. Treat it as
        // Eastern wall-clock and format it as wall-clock — never coerce
        // through `new Date(naive)`, which would re-interpret it as the
        // viewer's local TZ and shift it across day boundaries.
        parseNaive(naive) {
            if (!naive) return null;
            const m = String(naive).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
            if (!m) return null;
            return {
                y: +m[1], mo: +m[2], d: +m[3],
                h: +m[4], mi: +m[5], s: +m[6],
            };
        },
        fmtStampDate(naive) {
            const p = this.parseNaive(naive);
            if (!p) return '';
            const dt = new Date(p.y, p.mo - 1, p.d);
            return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        },
        fmtStampTime(naive) {
            const p = this.parseNaive(naive);
            if (!p) return '';
            const dt = new Date(2000, 0, 1, p.h, p.mi);
            return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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
                created: toFormInput(r.created),
            };
        },
        cancel() { this.editing = null; this.form = this.emptyForm(); },
        async save() {
            const payload = {
                kind: this.form.kind,
                title: this.form.title.trim(),
                body: this.form.body.trim() || null,
                bug_id: this.form.bug_id === '' ? null : parseInt(this.form.bug_id, 10),
                // Send the form value as a naive wall-clock string. The
                // server stores it verbatim — never round-trip through
                // `new Date()` here, which would re-anchor it to UTC and
                // shift it a few hours when displayed.
                created: this.form.created || null,
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
                Fixes, tweaks, and new features to the Zorky's reinc planner.
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

    <ul class="upd-list">
        <li v-for="r in sortedRows" :key="r.id" class="upd-item">
            <div class="upd-stamp" :title="r.created">
                <span class="upd-stamp-date">{{ fmtStampDate(r.created) }}</span>
                <span class="upd-stamp-time">{{ fmtStampTime(r.created) }}</span>
            </div>
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
.upd-list { list-style: none; padding: 0; margin: 0; }
.upd-item {
    display: grid;
    grid-template-columns: 7.5rem 5rem 1fr auto;
    gap: 0.75rem;
    align-items: start;
    padding: 0.6rem 0;
    border-bottom: 1px solid #f1f3f5;
}
.upd-item:last-child { border-bottom: none; }
.upd-item .badge { justify-self: start; margin-top: 0.15rem; }
.upd-stamp {
    display: flex;
    flex-direction: column;
    font-size: 0.78rem;
    color: #6c757d;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    padding-top: 0.15rem;
}
.upd-stamp-date { font-weight: 600; }
.upd-stamp-time { font-weight: 400; opacity: 0.85; }
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

[data-bs-theme="dark"] .upd-item { border-bottom-color: #23272e; }
[data-bs-theme="dark"] .upd-bug { color: #adb5bd; }
[data-bs-theme="dark"] .upd-stamp { color: #adb5bd; }
[data-bs-theme="dark"] .upd-desc { color: #ced4da; }
</style>
