<script>
// Save-a-build modal. Injected into Reinc.vue when the user hits the
// "Share Build" button in the summary bar. On submit, POSTs the current
// planner state to /api/builds and either emits `saved` (with the new
// build id) or a flash error.
//
// The modal collects three fields the user asked for — title, author,
// description — and trusts the parent to have built a valid state
// snapshot via `reinc.buildSnapshot()`. The snapshot is stored as the
// `state` JSON blob; the display-metadata fields are trusted for the
// list view only (the planner re-runs the engine from scratch when a
// build is opened, so math drift in an old build corrects itself).
import axios from 'axios';

export default {
    name: 'SaveBuildModal',
    inject: ['reinc'],
    props: {
        show: { type: Boolean, default: false },
    },
    emits: ['close', 'saved'],
    data() {
        return {
            title: '',
            author: '',
            description: '',
            saving: false,
        };
    },
    watch: {
        show(v) {
            if (v) {
                this.title = '';
                this.author = '';
                this.description = '';
                this.saving = false;
                this.$nextTick(() => {
                    const el = this.$refs.titleInput;
                    if (el) el.focus();
                });
            }
        },
    },
    methods: {
        async submit() {
            if (this.saving) return;
            const title = (this.title || '').trim();
            const author = (this.author || '').trim();
            if (!title) { this.reinc.$root.flashMsg('Title required', 'danger'); return; }
            if (!author) { this.reinc.$root.flashMsg('Your name required', 'danger'); return; }
            const snap = this.reinc.buildSnapshot();
            if (!snap) { this.reinc.$root.flashMsg('Pick a race first', 'danger'); return; }
            this.saving = true;
            try {
                const payload = {
                    title, author,
                    description: (this.description || '').trim(),
                    state: snap.state,
                    race_name: snap.race_name,
                    guild_summary: snap.guild_summary,
                    total_levels: snap.total_levels,
                    total_exp: snap.total_exp,
                    gold: snap.gold,
                    hp: snap.hp,
                    sp: snap.sp,
                };
                const r = await axios.post('/api/builds', payload);
                const id = r.data && r.data.data && r.data.data.id;
                this.reinc.$root.flashMsg('Build saved — view it on the Builds page');
                this.$emit('saved', id);
                this.$emit('close');
            } catch (e) {
                this.reinc.$root.flashError(e);
            } finally {
                this.saving = false;
            }
        },
    },
};
</script>

<template>
<div v-if="show" class="reinc-modal-backdrop" @click.self="$emit('close')">
    <div class="reinc-modal-panel save-modal-panel" role="dialog" aria-modal="true">
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="m-0">Share this build</h5>
            <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')"></button>
        </div>
        <p class="text-muted small mb-3">
            Saves the current planner state to the public
            <router-link :to="{name:'builds'}">Builds page</router-link>
            so other players can open it, inspect it, and vote on it.
            Builds can't be edited after saving — change your mind? Tweak
            the planner and save again.
        </p>
        <form @submit.prevent="submit">
            <div class="mb-2">
                <label class="form-label small mb-0">Build title</label>
                <input ref="titleInput" v-model="title" maxlength="128"
                       class="form-control form-control-sm"
                       placeholder="e.g. Gimdori's Tankier Cousin" />
            </div>
            <div class="mb-2">
                <label class="form-label small mb-0">Your name</label>
                <input v-model="author" maxlength="64"
                       class="form-control form-control-sm"
                       placeholder="Shown with the build" />
            </div>
            <div class="mb-3">
                <label class="form-label small mb-0">Description (optional)</label>
                <textarea v-model="description" maxlength="1024" rows="3"
                          class="form-control form-control-sm"
                          placeholder="What's the idea behind this build?"></textarea>
            </div>
            <div class="d-flex gap-2 justify-content-end">
                <button type="button" class="btn btn-sm btn-outline-secondary"
                        @click="$emit('close')" :disabled="saving">Cancel</button>
                <button type="submit" class="btn btn-sm btn-primary" :disabled="saving">
                    {{ saving ? 'Saving…' : 'Save build' }}
                </button>
            </div>
        </form>
    </div>
</div>
</template>

<style>
.save-modal-panel { max-width: 28rem; }
</style>
