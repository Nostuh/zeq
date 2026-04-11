// Install a rolling console capture BEFORE anything else so we grab every
// early warning/error. The last ~100 entries are attached to bug reports
// via $root.collectBugContext(). Keep this tiny — no external deps.
(function installConsoleCapture() {
    if (window.__zeqConsoleBuffer) return;
    const buf = [];
    const MAX = 100;
    const safeStringify = (a) => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
    };
    for (const level of ['log', 'info', 'warn', 'error']) {
        const orig = console[level].bind(console);
        console[level] = (...args) => {
            try {
                buf.push({ t: new Date().toISOString(), level,
                           msg: args.map(safeStringify).join(' ').slice(0, 800) });
                if (buf.length > MAX) buf.shift();
            } catch (e) { /* swallow */ }
            orig(...args);
        };
    }
    window.addEventListener('error', (e) => {
        buf.push({ t: new Date().toISOString(), level: 'error',
                   msg: `[window.onerror] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}` });
        if (buf.length > MAX) buf.shift();
    });
    window.addEventListener('unhandledrejection', (e) => {
        buf.push({ t: new Date().toISOString(), level: 'error',
                   msg: `[unhandledrejection] ${e.reason && (e.reason.stack || e.reason.message || e.reason)}` });
        if (buf.length > MAX) buf.shift();
    });
    window.__zeqConsoleBuffer = buf;
})();

import { createApp } from 'vue/dist/vue.esm-bundler';
import { createRouter, createWebHashHistory } from 'vue-router';
// Import our custom CSS
import './scss/styles.scss';

// Import all of Bootstrap's JSS
import * as bootstrap from 'bootstrap';
//import icon css
import 'bootstrap-icons/font/bootstrap-icons.css';

import { routes } from './routes.js';

    
const router = createRouter({
    history: createWebHashHistory(),
    routes, // short for `routes: routes`
});
    
import App from './App.vue';

const app = createApp(App);

// Make sure to _use_ the router instance to make the
// whole app router-aware.
app.use(router);

app.mount('#app');
