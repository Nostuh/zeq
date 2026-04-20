<script>
export default {
    name: 'MobAsciiEditor',
    props: {
        initial: { type: Object, default: () => ({ title: '', ascii_content: '', notes: '', area_name: '' }) },
    },
    data() {
        return {
            title: this.initial.title || '',
            content: this.initial.ascii_content || '',
            notes: this.initial.notes || '',
            area_name: this.initial.area_name || '',
            cursorLine: 1,
            cursorCol: 1,
        };
    },
    computed: {
        preview() {
            // Strip non-7-bit-ASCII for preview
            return this.content.replace(/[^\x20-\x7E\n\r\t]/g, '');
        },
        lineCount() {
            return (this.content.match(/\n/g) || []).length + 1;
        },
    },
    methods: {
        onInput(e) {
            // Auto-sanitize on paste: replace curly quotes, em dashes, etc.
            let val = e.target.value;
            val = val.replace(/[\u2018\u2019\u201A]/g, "'");
            val = val.replace(/[\u201C\u201D\u201E]/g, '"');
            val = val.replace(/[\u2013\u2014]/g, '--');
            val = val.replace(/[\u2026]/g, '...');
            val = val.replace(/[^\x20-\x7E\n\r\t]/g, '');
            this.content = val;
        },
        updateCursor(e) {
            const ta = e.target;
            const text = ta.value.substring(0, ta.selectionStart);
            const lines = text.split('\n');
            this.cursorLine = lines.length;
            this.cursorCol = lines[lines.length - 1].length + 1;
        },
        save() {
            this.$emit('save', {
                title: this.title,
                ascii_content: this.content.replace(/[^\x20-\x7E\n\r\t]/g, ''),
                notes: this.notes,
                area_name: this.area_name,
            });
        },
        cancel() { this.$emit('cancel'); },
    },
};
</script>
<template>
<div class="card mb-3 mob-ascii-editor">
    <div class="card-body">
        <h5 class="card-title">{{ initial.id ? 'Edit Map' : 'New Map' }}</h5>
        <div class="row g-2 mb-2">
            <div class="col-md-5">
                <input class="form-control form-control-sm" v-model="title" placeholder="Map title">
            </div>
            <div class="col-md-5">
                <input class="form-control form-control-sm" v-model="area_name" placeholder="Area name (optional)">
            </div>
        </div>
        <div class="row g-2 mb-2">
            <div class="col-md-6">
                <label class="form-label small">Editor (7-bit ASCII only)</label>
                <textarea class="form-control form-control-sm font-monospace mob-ascii-textarea"
                          rows="15" :value="content"
                          @input="onInput"
                          @click="updateCursor"
                          @keyup="updateCursor"
                          spellcheck="false"></textarea>
                <div class="small text-muted mt-1">Line {{ cursorLine }}, Col {{ cursorCol }} | {{ lineCount }} lines</div>
            </div>
            <div class="col-md-6">
                <label class="form-label small">Preview</label>
                <pre class="mob-ascii-map mob-ascii-preview">{{ preview }}</pre>
            </div>
        </div>
        <div class="mb-2">
            <input class="form-control form-control-sm" v-model="notes" placeholder="Notes about this map">
        </div>
        <button class="btn btn-sm btn-primary me-2" @click="save">Save Map</button>
        <button class="btn btn-sm btn-secondary" @click="cancel">Cancel</button>
    </div>
</div>
</template>
