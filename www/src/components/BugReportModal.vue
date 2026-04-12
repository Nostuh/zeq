<script>
import axios from 'axios';

const MAX_ATTACHMENTS = 6;
const MAX_BYTES_PER_FILE = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png'];

export default {
    name: 'BugReportModal',
    emits: ['close'],
    data() {
        return {
            form: {
                title: '',
                description: '',
                reporter_name: '',
            },
            // { file, previewUrl, data_base64 }
            attachments: [],
            attachmentError: '',
            busy: false,
            submitted: false,
            dragover: false,
            isMac: /Mac|iPhone|iPad|iPod/.test(navigator.platform || ''),
        };
    },
    methods: {
        onFilePick(ev) {
            const files = Array.from(ev.target.files || []);
            this.addFiles(files);
            ev.target.value = '';
        },
        onDrop(ev) {
            this.dragover = false;
            const files = Array.from(ev.dataTransfer.files || []);
            this.addFiles(files);
        },
        async addFiles(files) {
            this.attachmentError = '';
            for (const f of files) {
                if (this.attachments.length >= MAX_ATTACHMENTS) {
                    this.attachmentError = `Up to ${MAX_ATTACHMENTS} attachments.`;
                    break;
                }
                if (!ALLOWED.includes(f.type)) {
                    this.attachmentError = `Only JPG / PNG accepted (got ${f.type || 'unknown'}).`;
                    continue;
                }
                if (f.size > MAX_BYTES_PER_FILE) {
                    this.attachmentError = `"${f.name}" is too large (max ${MAX_BYTES_PER_FILE / 1024 / 1024} MB).`;
                    continue;
                }
                try {
                    const data_base64 = await this.fileToBase64(f);
                    this.attachments.push({
                        file: f,
                        previewUrl: URL.createObjectURL(f),
                        data_base64,
                    });
                } catch (e) {
                    this.attachmentError = `Could not read "${f.name}".`;
                }
            }
        },
        fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onerror = () => reject(fr.error);
                fr.onload = () => {
                    const s = String(fr.result || '');
                    const idx = s.indexOf(',');
                    resolve(idx >= 0 ? s.slice(idx + 1) : s);
                };
                fr.readAsDataURL(file);
            });
        },
        removeAttachment(i) {
            const a = this.attachments[i];
            if (a && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
            this.attachments.splice(i, 1);
        },
        // Clipboard paste handler — Ctrl+V / Cmd+V while the modal is open
        // routes any image/* item through the same pipeline as file-picker
        // and drag-drop. Text paste in the title/description inputs is
        // untouched because we only react to items whose `kind === 'file'`.
        onPaste(e) {
            const cd = e.clipboardData;
            if (!cd) return;
            const items = cd.items || [];
            const files = [];
            let sawImageItem = false;
            for (const it of items) {
                if (it.kind === 'file' && /^image\//.test(it.type)) {
                    sawImageItem = true;
                    const f = it.getAsFile();
                    if (f) files.push(f);
                }
            }
            // Some browsers / screenshot tools expose the image only through
            // cd.files rather than cd.items — fall back to that before giving
            // up so a Ctrl+V still grabs the screenshot.
            if (!files.length && cd.files && cd.files.length) {
                for (const f of cd.files) if (/^image\//.test(f.type)) files.push(f);
            }
            if (files.length) {
                e.preventDefault();
                this.addFiles(files);
                return;
            }
            // If we saw an image item we couldn't read, or the user pasted
            // something outside an input (likely aiming at the dropzone),
            // surface a visible error instead of silently doing nothing.
            const tag = (e.target && e.target.tagName) || '';
            const inField = tag === 'INPUT' || tag === 'TEXTAREA';
            if (sawImageItem) {
                this.attachmentError = 'Could not read pasted image — try drag-and-drop or the file picker.';
            } else if (!inField) {
                this.attachmentError = 'No image in clipboard. Copy a screenshot first, then paste.';
            }
        },
        async submit() {
            if (!this.form.title || !this.form.description) {
                this.$root.flashMsg('Title and description are required', 'danger');
                return;
            }
            this.busy = true;
            try {
                let app_state = null, dom_snapshot = null, console_log = null;
                try { app_state = JSON.stringify(this.$root.collectBugContext()); } catch (e) { app_state = JSON.stringify({ capture_error: String(e) }); }
                try { dom_snapshot = this.$root.collectDomSnapshot(); } catch (e) { dom_snapshot = null; }
                try { console_log = this.$root.collectConsoleLog(); } catch (e) { console_log = null; }

                await axios.post('/api/bugs', {
                    ...this.form,
                    page_url: window.location.href,
                    user_agent: navigator.userAgent,
                    screen_size: `${window.innerWidth}x${window.innerHeight}`,
                    app_state,
                    dom_snapshot,
                    console_log,
                    attachments: this.attachments.map((a) => ({
                        filename: a.file.name,
                        mime: a.file.type,
                        data_base64: a.data_base64,
                    })),
                });
                this.submitted = true;
                this.$root.flashMsg('Thanks — got it!');
                setTimeout(() => this.$emit('close'), 1500);
            } catch (e) { this.$root.flashError(e); }
            finally { this.busy = false; }
        },
    },
    mounted() {
        this._boundPaste = (e) => this.onPaste(e);
        window.addEventListener('paste', this._boundPaste);
    },
    beforeUnmount() {
        if (this._boundPaste) window.removeEventListener('paste', this._boundPaste);
        for (const a of this.attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    },
};
</script>
<template>
<div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-panel">
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h4 class="m-0">Report a Bug or Idea</h4>
            <button class="btn-close" @click="$emit('close')"></button>
        </div>
        <p class="small text-muted mb-3">
            Found a bug or have an idea for something new? Tell me here — this is the
            best way to report anything. Describe what you were doing, what you
            expected, and what happened (or what you wish would happen). Screenshots
            help a ton. The current page URL, your browser, and screen size are
            attached automatically so I can reproduce the exact state.
        </p>

        <div v-if="submitted" class="alert alert-success">Thanks — got it.</div>
        <form v-else @submit.prevent="submit">
            <div class="mb-2">
                <label class="form-label small">Title <span class="text-danger">*</span></label>
                <input class="form-control form-control-sm" v-model="form.title" maxlength="255" placeholder="Short summary of the bug or idea">
            </div>
            <div class="mb-2">
                <label class="form-label small">Details <span class="text-danger">*</span></label>
                <textarea class="form-control form-control-sm" rows="6" v-model="form.description"
                    placeholder="Bug:  Steps to reproduce, expected vs actual.&#10;Idea: What you'd like to see, and why."></textarea>
            </div>

            <div class="mb-2">
                <label class="form-label small">
                    Screenshots <span class="text-muted">(optional, JPG/PNG, up to 6 files, 5 MB each)</span>
                </label>
                <div class="dropzone" :class="{ dragover }"
                     @dragenter.prevent="dragover = true"
                     @dragover.prevent="dragover = true"
                     @dragleave.prevent="dragover = false"
                     @drop.prevent="onDrop">
                    <input type="file" accept="image/jpeg,image/png" multiple @change="onFilePick" class="dz-input">
                    <div class="small text-muted">
                        Drop images here, click to pick,
                        <strong>or paste from clipboard ({{ isMac ? '⌘V' : 'Ctrl+V' }})</strong>
                    </div>
                </div>
                <div v-if="attachmentError" class="small text-danger mt-1">{{ attachmentError }}</div>
                <div class="d-flex flex-wrap gap-2 mt-2" v-if="attachments.length">
                    <div v-for="(a, i) in attachments" :key="i" class="thumb-wrap">
                        <img :src="a.previewUrl" :alt="a.file.name">
                        <button type="button" class="thumb-remove" @click="removeAttachment(i)" :aria-label="'Remove ' + a.file.name">×</button>
                        <div class="small text-muted text-truncate">{{ a.file.name }}</div>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <label class="form-label small">Your name <span class="text-muted">(optional)</span></label>
                <input class="form-control form-control-sm" v-model="form.reporter_name">
            </div>
            <div class="text-end modal-actions">
                <button type="button" class="btn btn-sm btn-secondary me-2" @click="$emit('close')">Cancel</button>
                <button type="submit" class="btn btn-sm btn-primary" :disabled="busy">Submit</button>
            </div>
        </form>
    </div>
</div>
</template>
<style scoped>
.modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.75);
    /* Bootstrap's sticky-top navbar is z-index 1020. We have to sit above
       both it AND its ::before shadow, so 2000 is plenty — the darker
       backdrop obscures the navbar text so it no longer visually bleeds
       through the translucent overlay. */
    z-index: 2000;
    display: flex; align-items: flex-start; justify-content: center;
    padding: 1rem;
}
.modal-panel {
    background: #fff;
    padding: 1.25rem;
    border-radius: 0.5rem;
    width: 100%;
    max-width: 38rem;
    box-shadow: 0 1rem 3rem rgba(0,0,0,0.35);
    /* Cap to the visual viewport so the panel itself scrolls instead of
       relying on the fixed backdrop. iOS doesn't resize position:fixed
       elements when the virtual keyboard opens, so a backdrop scroll
       leaves the submit button stuck below the keyboard with no way to
       reach it. `100dvh` follows the visible viewport on browsers that
       support it; the `100vh` line is the fallback. */
    max-height: 100vh;
    max-height: calc(100dvh - 2rem);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}
/* Pin the Cancel/Submit row to the bottom of the (now scrollable) panel
   so the submit button is always reachable, even with a long form and a
   virtual keyboard occupying half the screen. */
.modal-actions {
    position: sticky;
    bottom: 0;
    background: inherit;
    padding-top: 0.5rem;
    margin-top: auto;
}
.dropzone {
    position: relative;
    border: 2px dashed #adb5bd;
    border-radius: 0.35rem;
    padding: 1rem;
    text-align: center;
    transition: border-color 120ms, background 120ms;
    cursor: pointer;
}
.dropzone.dragover { border-color: #0d6efd; background: #e7f1ff; }
.dz-input {
    position: absolute; inset: 0;
    opacity: 0; cursor: pointer;
}
.thumb-wrap {
    position: relative;
    width: 5rem;
}
.thumb-wrap img {
    width: 5rem; height: 5rem;
    object-fit: cover;
    border-radius: 0.25rem;
    border: 1px solid #dee2e6;
}
.thumb-remove {
    position: absolute;
    top: -0.4rem; right: -0.4rem;
    width: 1.25rem; height: 1.25rem;
    border-radius: 50%;
    border: none;
    background: #dc3545;
    color: #fff;
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
}

[data-bs-theme="dark"] .modal-panel {
    background: #1b1f23;
    color: #e9ecef;
}
[data-bs-theme="dark"] .dropzone { border-color: #3a3f48; }
[data-bs-theme="dark"] .dropzone.dragover {
    background: #1e2a3e;
    border-color: #6ea8fe;
}
[data-bs-theme="dark"] .thumb-wrap img { border-color: #2a2f36; }
</style>
