<script>
import axios from 'axios';
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
        async setRole(u, role) {
            try {
                const r = await axios.post('/api/users/' + u.id + '/role', { role });
                if (r.data.ok) { this.$root.flashMsg('Role updated'); await this.load(); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
        async toggleActive(u) {
            try {
                const r = await axios.post('/api/users/' + u.id + '/active', { active: !u.active });
                if (r.data.ok) { this.$root.flashMsg('Updated'); await this.load(); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
        async resetPw(u) {
            if (!this.pwVal) return;
            try {
                const r = await axios.post('/api/users/' + u.id + '/password', { password: this.pwVal });
                if (r.data.ok) { this.$root.flashMsg('Password reset'); this.pwFor = null; this.pwVal = ''; }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
        },
        async toggleEqRole(u, role) {
            const current = u.eqRoles || [];
            let newRoles;
            if (current.includes(role)) {
                newRoles = current.filter(r => r !== role);
            } else {
                newRoles = [...current, role];
                // eq_editor implies eq_viewer
                if (role === 'eq_editor' && !newRoles.includes('eq_viewer')) {
                    newRoles.push('eq_viewer');
                }
            }
            // Removing eq_viewer also removes eq_editor
            if (role === 'eq_viewer' && !newRoles.includes('eq_viewer')) {
                newRoles = newRoles.filter(r => r !== 'eq_editor');
            }
            try {
                const r = await axios.post('/api/users/' + u.id + '/eq-roles', { roles: newRoles });
                if (r.data.ok) { this.$root.flashMsg('EQ roles updated'); await this.load(); }
                else this.$root.flashMsg(r.data.error, 'danger');
            } catch (e) { this.$root.flashError(e); }
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

    <div class="card mb-3">
        <div class="card-body">
            <h5 class="card-title">Add user</h5>
            <div class="row g-2">
                <div class="col-md-3"><input class="form-control form-control-sm" placeholder="name" v-model="newUser.name"></div>
                <div class="col-md-3"><input type="password" class="form-control form-control-sm" placeholder="password" v-model="newUser.password"></div>
                <div class="col-md-2">
                    <select class="form-select form-select-sm" v-model="newUser.role">
                        <option value="viewer">viewer</option>
                        <option value="editor">editor</option>
                        <option value="admin">admin</option>
                    </select>
                </div>
                <div class="col-md-2"><button class="btn btn-sm btn-primary" @click="add">Create</button></div>
            </div>
        </div>
    </div>

    <table class="table table-sm table-striped align-middle">
        <thead><tr><th>Name</th><th>Role</th><th>EQ Access</th><th>Status</th><th>Last login</th><th style="width:30em;">Actions</th></tr></thead>
        <tbody>
            <tr v-for="u in rows" :key="u.id">
                <td>{{ u.name }} <span v-if="isSelf(u)" class="badge bg-warning text-dark">you</span></td>
                <td>
                    <select class="form-select form-select-sm" :value="u.role" @change="setRole(u, $event.target.value)" :disabled="isSelf(u)">
                        <option value="viewer">viewer</option>
                        <option value="editor">editor</option>
                        <option value="admin">admin</option>
                    </select>
                </td>
                <td>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="checkbox"
                               :checked="(u.eqRoles || []).includes('eq_viewer')"
                               @change="toggleEqRole(u, 'eq_viewer')"
                               :disabled="u.role === 'admin'">
                        <label class="form-check-label small">Viewer</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="checkbox"
                               :checked="(u.eqRoles || []).includes('eq_editor')"
                               @change="toggleEqRole(u, 'eq_editor')"
                               :disabled="u.role === 'admin'">
                        <label class="form-check-label small">Editor</label>
                    </div>
                    <span v-if="u.role === 'admin'" class="text-muted small">(auto)</span>
                </td>
                <td>
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
</template>
