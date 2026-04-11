<script>
import axios from 'axios';
export default {
    name: 'Login',
    data() { return { name: '', password: '', busy: false, err: '' }; },
    methods: {
        async submit() {
            this.busy = true; this.err = '';
            try {
                const r = await axios.post('/api/auth/login', { name: this.name, password: this.password });
                if (r.data.ok) {
                    this.$root.user = r.data.data;
                    this.$root.flashMsg('Logged in');
                    const role = r.data.data.role;
                    const dest = (role === 'admin' || role === 'editor') ? 'races' : 'home';
                    this.$router.push({ name: dest });
                } else {
                    this.err = r.data.error || 'login failed';
                }
            } catch (e) {
                this.err = 'login failed';
            } finally { this.busy = false; }
        },
    },
};
</script>
<template>
<div v-if="$root.isAuthed">
    <h2>Welcome, {{ $root.user.name }}</h2>
    <p>Role: <span class="badge bg-secondary">{{ $root.user.role }}</span></p>
    <p>Use the sidebar to manage game data.</p>
</div>
<div v-else style="max-width:28em;">
    <h2>Sign in</h2>
    <form @submit.prevent="submit">
        <div class="mb-3"><label class="form-label">Username</label>
            <input type="text" class="form-control" v-model="name" autofocus></div>
        <div class="mb-3"><label class="form-label">Password</label>
            <input type="password" class="form-control" v-model="password"></div>
        <button type="submit" class="btn btn-primary" :disabled="busy">Sign in</button>
        <div class="text-danger mt-2" v-if="err">{{ err }}</div>
    </form>
</div>
</template>
