<script>
import axios from 'axios';

// Capability flags + implications. Mirrors FLAGS / FLAG_IMPLIES in
// api/rest/api/auth.mjs. Toggling a flag posts the full desired set.
const IMPLIES = { equipment_edit: ['equipment'], eqmobs_edit: ['eqmobs'] };
const IMPLIED_BY = { equipment: ['equipment_edit'], eqmobs: ['eqmobs_edit'] };

export default {
    name: 'Users',
    data() {
        return {
            rows: [],
            newUser: { name: '', password: '', role: 'viewer' },
            pwFor: null,
            pwVal: '',
        };
    },
    methods: {
        async load() {
            try { const r = await axios.get('/api/users/'); this.rows = r.data.data; }
            catch (e) { this.$root.flashError(e); }
        },
        isSelf(u) { return this.$root.user && u.id === this.$root.user.id; },
        isAdminUser(u) { return u.role === 'admin'; },
        hasFlag(u, f) { return (u.flags || []).includes(f); },
        fmtDate(v) {
            if (!v) return '—';
            const d = new Date(v);
            if (isNaN(d.getTime())) return String(v);
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        },
        async add() {
            try {
                const r = await axios.post('/api/users/', this.newUser);
                if (r.data.ok) {
                    this.$root.flashMsg('User created');
                    this.newUser = { name: '', password: '', role: 'viewer' };
                    await this.load();
                } else { this.$root.flashMsg(r.data.error, 'danger'); }
            } catch (e) { this.$root.flashError(e); }
        },
        // Admin is the master role (implies every flag). Toggling it flips
        // between 'admin' and 'viewer'.
        async setAdmin(u, makeAdmin) {
            try {
                const r = await axios.post('/api/users/' + u.id + '/role', { role: makeAdmin ? 'admin' : 'viewer' });
                if (r.data.ok) { this.$root.flashMsg('Role updated'); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
            finally { await this.load(); }
        },
        async toggleActive(u) {
            try {
                const r = await axios.post('/api/users/' + u.id + '/active', { active: !u.active });
                if (r.data.ok) { this.$root.flashMsg('Updated'); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
            finally { await this.load(); }
        },
        async resetPw(u) {
            if (!this.pwVal) return;
            try {
                const r = await axios.post('/api/users/' + u.id + '/password', { password: this.pwVal });
                if (r.data.ok) { this.$root.flashMsg('Password reset'); this.pwFor = null; this.pwVal = ''; }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
        // Flip one flag and post the resulting set. Edit flags pull in their
        // view flag; removing a view flag drops its edit flag. Always reload
        // afterwards so the native checkboxes re-sync to server truth (see
        // docs/gotchas.md — Vue checkbox desync).
        async toggleFlag(u, flag) {
            const cur = new Set(u.flags || []);
            if (cur.has(flag)) {
                cur.delete(flag);
                for (const dep of (IMPLIED_BY[flag] || [])) cur.delete(dep);
            } else {
                cur.add(flag);
                for (const base of (IMPLIES[flag] || [])) cur.add(base);
            }
            try {
                const r = await axios.post('/api/users/' + u.id + '/flags', { flags: [...cur] });
                if (r.data.ok) { this.$root.flashMsg('Access updated'); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
            finally { await this.load(); }
        },
        async del(u) {
            if (!confirm(`Delete user "${u.name}"?`)) return;
            try {
                const r = await axios.delete('/api/users/' + u.id);
                if (r.data.ok) { this.$root.flashMsg('Deleted'); await this.load(); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
    },
    mounted() { this.load(); },
};
</script>
<template>
<div>
    <h2>Users</h2>
    <p class="text-muted small mb-3">
        Access is flag-based. <strong>Admin</strong> grants everything.
        Otherwise tick the areas a user may reach; <em>Edit</em> implies
        <em>View</em>. The server enforces these regardless of the UI.
    </p>

    <div class="card mb-3">
        <div class="card-body">
            <h5 class="card-title">Add user</h5>
            <div class="row g-2 align-items-center">
                <div class="col-md-3"><input class="form-control form-control-sm" placeholder="name" v-model="newUser.name"></div>
                <div class="col-md-3"><input type="password" class="form-control form-control-sm" placeholder="password" v-model="newUser.password"></div>
                <div class="col-md-2">
                    <select class="form-select form-select-sm" v-model="newUser.role">
                        <option value="viewer">viewer</option>
                        <option value="admin">admin</option>
                    </select>
                </div>
                <div class="col-md-2"><button class="btn btn-sm btn-primary" @click="add">Create</button></div>
            </div>
            <div class="form-text">New non-admin users start with no access — grant flags below.</div>
        </div>
    </div>

    <div class="table-responsive">
    <table class="table table-sm table-striped align-middle users-table">
        <thead>
            <tr>
                <th rowspan="2" class="align-middle">Name</th>
                <th rowspan="2" class="align-middle text-center">Admin</th>
                <th colspan="2" class="text-center border-start">Equipment</th>
                <th rowspan="2" class="align-middle text-center border-start">Lookups</th>
                <th colspan="2" class="text-center border-start">EQ Mobs</th>
                <th rowspan="2" class="align-middle text-center border-start">Planner<br>Admin</th>
                <th rowspan="2" class="align-middle border-start">Status</th>
                <th rowspan="2" class="align-middle">Last login</th>
                <th rowspan="2" class="align-middle" style="width:26em;">Actions</th>
            </tr>
            <tr>
                <th class="text-center border-start fw-normal small">View</th>
                <th class="text-center fw-normal small">Edit</th>
                <th class="text-center border-start fw-normal small">View</th>
                <th class="text-center fw-normal small">Edit</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="u in rows" :key="u.id">
                <td>{{ u.name }} <span v-if="isSelf(u)" class="badge bg-warning text-dark">you</span></td>

                <!-- Admin (master) -->
                <td class="text-center">
                    <input type="checkbox" class="form-check-input"
                           :checked="isAdminUser(u)"
                           :disabled="isSelf(u)"
                           @change="setAdmin(u, $event.target.checked)">
                </td>

                <!-- Equipment view/edit -->
                <td class="text-center border-start">
                    <input type="checkbox" class="form-check-input" title="View equipment"
                           :checked="isAdminUser(u) || hasFlag(u,'equipment')"
                           :disabled="isAdminUser(u)"
                           @change="toggleFlag(u,'equipment')">
                </td>
                <td class="text-center">
                    <input type="checkbox" class="form-check-input" title="Add/edit equipment"
                           :checked="isAdminUser(u) || hasFlag(u,'equipment_edit')"
                           :disabled="isAdminUser(u)"
                           @change="toggleFlag(u,'equipment_edit')">
                </td>

                <!-- Lookups -->
                <td class="text-center border-start">
                    <input type="checkbox" class="form-check-input" title="KYA lookup (read-only)"
                           :checked="isAdminUser(u) || hasFlag(u,'lookups')"
                           :disabled="isAdminUser(u)"
                           @change="toggleFlag(u,'lookups')">
                </td>

                <!-- EQ Mobs view/edit -->
                <td class="text-center border-start">
                    <input type="checkbox" class="form-check-input" title="View mob KB"
                           :checked="isAdminUser(u) || hasFlag(u,'eqmobs')"
                           :disabled="isAdminUser(u)"
                           @change="toggleFlag(u,'eqmobs')">
                </td>
                <td class="text-center">
                    <input type="checkbox" class="form-check-input" title="Edit mob KB"
                           :checked="isAdminUser(u) || hasFlag(u,'eqmobs_edit')"
                           :disabled="isAdminUser(u)"
                           @change="toggleFlag(u,'eqmobs_edit')">
                </td>

                <!-- Planner Admin -->
                <td class="text-center border-start">
                    <input type="checkbox" class="form-check-input" title="Races/Guilds/Skills/Spells/Costs"
                           :checked="isAdminUser(u) || hasFlag(u,'planner_admin')"
                           :disabled="isAdminUser(u)"
                           @change="toggleFlag(u,'planner_admin')">
                </td>

                <td class="border-start">
                    <span class="badge" :class="u.active ? 'bg-success' : 'bg-secondary'">{{ u.active ? 'active' : 'inactive' }}</span>
                </td>
                <td class="small">{{ fmtDate(u.last_login) }}</td>
                <td>
                    <button class="btn btn-sm btn-outline-secondary me-1" @click="toggleActive(u)" :disabled="isSelf(u)">
                        {{ u.active ? 'Disable' : 'Enable' }}
                    </button>
                    <button class="btn btn-sm btn-outline-warning me-1" @click="pwFor = (pwFor === u.id ? null : u.id); pwVal = ''">Reset PW</button>
                    <button class="btn btn-sm btn-outline-danger" @click="del(u)" :disabled="isSelf(u)">Delete</button>
                    <div v-if="pwFor === u.id" class="mt-1 d-flex">
                        <input type="password" class="form-control form-control-sm me-1" placeholder="new password" v-model="pwVal">
                        <button class="btn btn-sm btn-primary" @click="resetPw(u)">Set</button>
                    </div>
                </td>
            </tr>
        </tbody>
    </table>
    </div>
</div>
</template>
