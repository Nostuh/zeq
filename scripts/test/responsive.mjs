#!/usr/bin/env node
// Headless-browser responsive test harness for the zeq UI.
//
// For each (route, viewport) combination it:
//   1. Navigates to the page (injecting an auth session for gated routes)
//   2. Waits for network idle + the page's data-loaded marker
//   3. Measures body vs viewport dimensions and checks for horizontal overflow
//   4. Checks that key interactive elements are present, visible, and inside
//      the viewport (not clipped by 0-width columns, etc.)
//   5. Walks tabs and opens the global Report-Bug modal, re-checking fit
//   6. Captures a screenshot to scripts/test/out/<label>.png
//   7. Emits a pass/fail line per case
//
// Usage:
//   cd scripts/test && node responsive.mjs [--base=https://nostuh.com]
//
// Authenticated routes (equipment, mobs, admin, …) need a session. The
// harness mints one for a dedicated test admin (see ensureAuthSession) and
// injects the cookie into an isolated browser context; it needs DB access
// via api/classes/config.json. If that fails, authed cases are skipped and
// the public cases still run.
//
// Exit code 0 if every case passes, non-zero otherwise.

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));

// Default to https://nostuh.com — after SSL setup, nginx's port-80 vhost
// returns 404 for any host other than nostuh.com. /etc/hosts already maps
// nostuh.com -> 127.0.0.1 on this box, and the cert is valid for that
// name, so this hits the correct vhost without leaving the host.
const BASE = args.base || 'https://nostuh.com';

const VIEWPORTS = [
    { label: 'mobile',       width: 360,  height: 780  }, // iPhone-ish
    { label: 'mobile-wide',  width: 414,  height: 900  }, // larger phone
    { label: 'tablet',       width: 800,  height: 1100 }, // portrait tablet
    { label: 'short-laptop', width: 1024, height: 654  }, // bug #25 — General tab clipped guild list below search input
    { label: 'small-laptop', width: 1032, height: 703  }, // bug #23 — wishes/boons overlapped at this size
    { label: 'laptop',       width: 1280, height: 800  },
    { label: 'desktop',      width: 1600, height: 900  },
    { label: 'desktop-wide', width: 1920, height: 1080 },
];

// --- Authenticated-run support ------------------------------------------
// Rather than drive the login form, mint a session row for a dedicated,
// clearly-named test admin and inject the zeq_sid cookie into an isolated
// browser context. The admin can't be password-logged-in (no password
// hash), and the session is deleted when the run ends.
const CONFIG = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'classes', 'config.json'), 'utf8')).zeq;
const TEST_USER = '__responsive_test';

// Legacy cleanup: earlier versions of this harness created a throwaway
// `__responsive_test` admin row (which burned a users.id every run and
// lingered in the Users list). We no longer create a user at all — remove
// any such row that a prior run left behind.
async function purgeLegacyTestUser(db) {
    await db.query('DELETE s FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.name=?', [TEST_USER]);
    await db.query('DELETE r FROM user_roles r JOIN users u ON u.id=r.user_id WHERE u.name=?', [TEST_USER]);
    await db.query('DELETE FROM users WHERE name=?', [TEST_USER]);
}

async function ensureAuthSession() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database, charset: 'utf8mb4',
    });
    await purgeLegacyTestUser(db);
    // Borrow an existing active admin: we only mint a short-lived SESSION for
    // read-only test navigation. No `users` row is inserted (no users.id
    // burned, nothing left in the Users list) and last_login is untouched.
    // The sessions PK is a random hex string, so nothing auto-increments.
    const [admins] = await db.query(
        "SELECT id, name FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1");
    if (!admins.length) { await db.end(); throw new Error('no active admin to borrow a test session from'); }
    const uid = admins[0].id;
    const sid = crypto.randomBytes(32).toString('hex');
    await db.query(
        `INSERT INTO sessions (id, user_id, created, expires)
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR))`, [sid, uid]);
    return { sid, who: admins[0].name, cleanup: async () => {
        try { await db.query('DELETE FROM sessions WHERE id=?', [sid]); } finally { await db.end(); }
    } };
}

async function apiJson(sid, apiPath) {
    try {
        const r = await fetch(BASE + apiPath, { headers: { Cookie: `zeq_sid=${sid}` } });
        return r.ok ? await r.json() : null;
    } catch { return null; }
}

// Detail routes need a real id; resolve the first available via the API and
// patch the placeholder cases (skip them if the table is empty).
async function resolveDetailRoutes(sid) {
    const mobs = await apiJson(sid, '/api/mobs/');
    const guilds = await apiJson(sid, '/api/game/guilds');
    const mobId = mobs && mobs.data && mobs.data[0] && mobs.data[0].id;
    const guildId = guilds && guilds.data && guilds.data[0] && guilds.data[0].id;
    for (const tc of CASES) {
        if (tc.detail === 'mob') { if (mobId) tc.route = `/#/mobs/${mobId}`; else tc.skip = 'no mobs in DB'; }
        if (tc.detail === 'guild') { if (guildId) tc.route = `/#/guilds/${guildId}`; else tc.skip = 'no guilds in DB'; }
    }
}

// The global Report-Bug/Idea overlay (App.vue) is the only true modal in the
// SPA; it's reachable on every page via the persistent FAB. Swept per authed
// page so we validate it fits over each layout at every viewport.
const BUG_MODAL = {
    name: 'bug-report',
    setupSrc: `(async () => { const f = document.querySelector('.fab-report'); if (!f) return false; f.click(); return true; })()`,
    panelSel: '.modal-panel',
    primarySel: '.modal-panel button[type="submit"]',
    closeSel: '.modal-panel .btn-close',
    teardownSrc: `(() => { const x = document.querySelector('.modal-panel .btn-close'); if (x) x.click(); })()`,
};

// Each case: { route, label, mustExist: [selectors], auth?, waitFor?, ... }
// `mustExist` selectors must resolve to *visible* elements fully inside the
// viewport. `auth: true` runs the case in a session-injected context.
const CASES = [
    {
        route: '/#/',
        label: 'reinc-home',
        // On first load (no scrolling) the summary bar, tabs, race picker
        // and guild search must all be in the initial viewport.
        mustBeVisibleOnLoad: [
            '.summary-bar',
            '.nav-tabs',
            '.race-list',
            'input[type="search"]',
        ],
        // Anywhere-reachable elements — OK to be scroll-into-view.
        mustExist: [
            '.summary-bar',
            '.nav-tabs',
            '.race-list',
            'input[type="search"]',
            '.guild-list',
            'button.btn-danger',
        ],
        // Reinc page is explicitly locked to the viewport; body should not
        // scroll at all.
        expectNoPageScroll: true,
        // After the initial checks, walk every tab and run the same overflow
        // checks plus a sibling-overlap check on the tab body. Bug #23
        // shipped because the harness only ever inspected the General tab.
        tabs: ['General', 'Skills/Spells', 'Extras', 'Export'],
        // Modals: open each one, check the panel/primary action stay inside
        // the viewport. setupSrc is a function-source string that runs
        // inside page.evaluate; it must return true on success and leave
        // the modal open. teardownSrc closes it again.
        modals: [
            {
                name: 'bug-report',
                setupSrc: `(async () => {
                    // The persistent FAB is the canonical entry point on
                    // every viewport (the header button hides at <560px).
                    const fab = document.querySelector('.fab-report');
                    if (!fab) return false;
                    fab.click();
                    return true;
                })()`,
                panelSel: '.modal-panel',
                primarySel: '.modal-panel button[type="submit"]',
                closeSel: '.modal-panel .btn-close',
                teardownSrc: `(() => {
                    const x = document.querySelector('.modal-panel .btn-close');
                    if (x) x.click();
                })()`,
            },
            {
                name: 'share-build',
                setupSrc: `(async () => {
                    const btn = document.querySelector('.sb-share-btn');
                    if (!btn) return false;
                    btn.click();
                    return true;
                })()`,
                // SaveBuildModal renders into a .reinc-modal-backdrop with a
                // .reinc-modal-panel inside (separate class namespace from
                // BugReportModal so the two can co-exist).
                panelSel: '.reinc-modal-panel',
                primarySel: '.reinc-modal-panel button[type="submit"], .reinc-modal-panel .btn-primary',
                closeSel: '.reinc-modal-panel .btn-close',
                teardownSrc: `(() => {
                    const x = document.querySelector('.reinc-modal-panel .btn-close');
                    if (x) x.click();
                })()`,
            },
            {
                name: 'guild-info',
                // The ⓘ button is on every guild row in the picker. Pick
                // the first one regardless of guild — every row has the
                // same handler. Need to be on the General tab, which the
                // harness leaves the page on after the tab walk (last
                // tab clicked is Export, so re-click General).
                setupSrc: `(async () => {
                    const tabs = [...document.querySelectorAll('.nav-tabs .nav-link')];
                    const gen = tabs.find((a) => a.textContent.trim() === 'General');
                    if (gen) gen.click();
                    // Wait for the General tab body to render — the tab
                    // walk leaves us on Export, and Vue's v-if swap is
                    // synchronous-but-renders-next-tick.
                    await new Promise((r) => setTimeout(r, 200));
                    const btn = document.querySelector('.guild-list .info-btn:not([disabled])');
                    if (!btn) return false;
                    btn.click();
                    return true;
                })()`,
                panelSel: '.reinc-modal-panel',
                closeSel: '.reinc-modal-panel .btn-close',
                teardownSrc: `(() => {
                    const x = document.querySelector('.reinc-modal-panel .btn-close');
                    if (x) x.click();
                })()`,
            },
            {
                name: 'boon-info',
                // Switch to Extras, find the first boon ⓘ button.
                setupSrc: `(async () => {
                    const tabs = [...document.querySelectorAll('.nav-tabs .nav-link')];
                    const ex = tabs.find((a) => a.textContent.trim() === 'Extras');
                    if (!ex) return false;
                    ex.click();
                    return new Promise((res) => setTimeout(() => {
                        const btn = document.querySelector('.boon-item .info-btn, .boons-grid .info-btn, .ex-section .info-btn');
                        if (!btn) { res(false); return; }
                        btn.click();
                        res(true);
                    }, 200));
                })()`,
                panelSel: '.reinc-modal-panel',
                closeSel: '.reinc-modal-panel .btn-close',
                teardownSrc: `(() => {
                    const x = document.querySelector('.reinc-modal-panel .btn-close');
                    if (x) x.click();
                })()`,
            },
        ],
    },
    {
        route: '/#/login',
        label: 'login',
        mustExist: ['input[type="text"]', 'input[type="password"]', 'button[type="submit"]'],
    },
    {
        // Public Misc tool. Load the built-in sample and open the header "Misc"
        // dropdown, so the checks exercise the populated two-column grid AND
        // confirm the dropdown is anchored in-viewport (the menu-position fix).
        route: '/#/chest-sorter',
        label: 'chest-sorter',
        waitFor: '.chest-input',
        setupSrc: `(async () => {
            const btns = [...document.querySelectorAll('.chest-page button')];
            const load = btns.find((b) => b.textContent.trim() === 'Load sample');
            if (load) load.click();
            await new Promise((r) => setTimeout(r, 200));
            const misc = document.querySelector('.misc-menu .nav-link');
            if (misc) misc.click();
            return true;
        })()`,
        mustBeVisibleOnLoad: ['.chest-page h2', '.chest-input'],
        mustExist: [
            '.chest-grid',
            'th.sortable',
            '.chest-pill',
            '.chest-col-head button',
            '.misc-menu .dropdown-menu.show .dropdown-item',
        ],
        modals: [BUG_MODAL],
    },

    // ---- Authenticated pages (session injected; see ensureAuthSession) ----
    // Every authed page sweeps the global BUG_MODAL to confirm the overlay
    // fits over that layout. Deletes/edits are inline v-if reveals (not
    // modals) so there is nothing else to sweep. See docs/testing.md.
    { route: '/#/equipment', label: 'equipment-mine', auth: true,
      waitFor: '.zSimpleTable table tbody tr', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', '.zSimpleTable .DougSearch input.form-control', '.zSimpleTable table.table-condensed'],
      modals: [BUG_MODAL] },
    { route: '/#/equipment-all', label: 'equipment-all', auth: true,
      waitFor: '.zSimpleTable table tbody tr', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', '.zSimpleTable .DougSearch input.form-control', '.zSimpleTable table.table-condensed'],
      modals: [BUG_MODAL] },
    { route: '/#/equipment-add', label: 'equipment-add', auth: true,
      waitFor: 'textarea#exampleFormControlTextarea1', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', 'textarea#exampleFormControlTextarea1', '.multiselect'],
      modals: [BUG_MODAL] },
    { route: '/#/equipment-build', label: 'equipment-build', auth: true,
      waitFor: '.weight-grid', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', '.weight-grid', '.weight-cell input[type="number"]'],
      modals: [BUG_MODAL] },
    { route: '/#/kya', label: 'kya', auth: true,
      waitFor: 'input.form-control', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', 'input.form-control'],
      modals: [BUG_MODAL] },
    { route: '/#/mobs', label: 'mobs-list', auth: true,
      waitFor: 'input.form-control', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', 'input.form-control'],
      modals: [BUG_MODAL] },
    { route: '/#/mobs', label: 'mob-detail', auth: true, detail: 'mob',
      waitFor: '.mob-detail',
      mustExist: ['.app-content main h2', '.mob-detail', 'a.btn-outline-secondary'],
      modals: [BUG_MODAL] },
    { route: '/#/races', label: 'races', auth: true,
      waitFor: 'table.table-hover tbody tr', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', 'input.form-control', 'table.table'],
      modals: [BUG_MODAL] },
    { route: '/#/guilds', label: 'guilds', auth: true,
      waitFor: 'table.table-hover tbody tr', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', 'input.form-control', 'table.table', 'a.btn-outline-primary'],
      modals: [BUG_MODAL] },
    { route: '/#/guilds', label: 'guild-detail', auth: true, detail: 'guild',
      waitFor: '.nav-tabs .nav-link', sweepTabs: true,
      mustExist: ['.app-content main h2', '.nav-tabs .nav-link', '.tab-content table.table'],
      modals: [BUG_MODAL] },
    { route: '/#/skills', label: 'skills', auth: true,
      waitFor: 'table.table-hover tbody tr', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', 'input.form-control', 'table.table'],
      modals: [BUG_MODAL] },
    { route: '/#/spells', label: 'spells', auth: true,
      waitFor: 'table.table-hover tbody tr', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', 'input.form-control', 'table.table'],
      modals: [BUG_MODAL] },
    { route: '/#/costs', label: 'costs', auth: true,
      waitFor: '.nav-tabs .nav-link', sweepTabs: true, mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', '.nav-tabs .nav-link', 'table.table'],
      modals: [BUG_MODAL] },
    { route: '/#/users', label: 'users', auth: true,
      waitFor: 'table.users-table tbody tr', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', '.users-table', '.card .btn-primary'],
      modals: [BUG_MODAL] },
    { route: '/#/bugs', label: 'bugs', auth: true,
      waitFor: 'select.form-select', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', 'select.form-select'],
      modals: [BUG_MODAL] },
    { route: '/#/updates', label: 'updates', auth: true,
      waitFor: '.upd-list', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', '.upd-list'],
      modals: [BUG_MODAL] },
    { route: '/#/builds', label: 'builds', auth: true,
      waitFor: '.bl-list', mustBeVisibleOnLoad: ['.app-content main h2'],
      mustExist: ['.app-content main h2', '.bl-search input[type="search"]', '.bl-list'],
      modals: [BUG_MODAL] },
];

function fail(msg) { console.log('  ✗ ' + msg); }
function pass(msg) { console.log('  ✓ ' + msg); }

async function runCase(ctx, vp, tc, cookie) {
    const page = await ctx.newPage();
    if (tc.auth && cookie) await page.setCookie(cookie);
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

    const label = `${tc.label}_${vp.label}_${vp.width}x${vp.height}`;
    const errors = [];

    try {
        const url = BASE + tc.route;
        // networkidle2 (≤2 in-flight) rather than networkidle0 — some pages
        // keep a lingering connection that never fully idles. One retry with a
        // generous timeout absorbs the slow, swap-bound host.
        let navErr = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try { await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); navErr = null; break; }
            catch (e) { navErr = e; }
        }
        if (navErr) throw navErr;
        // Let any mounted lifecycle / fetches settle.
        await new Promise((r) => setTimeout(r, 600));
        // Wait for the page's data-loaded marker if declared (non-fatal).
        if (tc.waitFor) await page.waitForSelector(tc.waitFor, { timeout: 12000 }).catch(() => {});

        // Optional per-case interaction before the checks (e.g. load sample
        // data, open a header menu). Runs in-page; return value ignored.
        if (tc.setupSrc) {
            await page.evaluate(tc.setupSrc).catch(() => {});
            await new Promise((r) => setTimeout(r, 250));
        }

        // 1) Horizontal overflow at body/html level.
        const dims = await page.evaluate(() => ({
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth,
            bodyScrollH: document.body.scrollHeight,
            clientH: document.documentElement.clientHeight,
            bodyOverflowY: getComputedStyle(document.body).overflowY,
        }));
        if (dims.scrollW > dims.clientW + 1) {
            errors.push(`horizontal overflow: scrollWidth=${dims.scrollW} > clientWidth=${dims.clientW}`);
        }

        // 2) No page scroll when required.
        if (tc.expectNoPageScroll) {
            if (dims.bodyScrollH > dims.clientH + 1) {
                errors.push(`page vertically scrollable: bodyScrollHeight=${dims.bodyScrollH} > clientHeight=${dims.clientH}`);
            }
        }

        // 2b) Capture the initial viewport screenshot BEFORE any
        //     scrollIntoView calls so the default mobile/desktop state is
        //     preserved in out/.
        await page.screenshot({ path: path.join(OUT, label + '_initial.png'), fullPage: false });

        // 2c) Page-load elements — things that must be visible on first
        //     render without any user scrolling, e.g. the summary bar.
        for (const sel of (tc.mustBeVisibleOnLoad || [])) {
            const info = await page.evaluate((s) => {
                const el = document.querySelector(s);
                if (!el) return { found: false };
                const r = el.getBoundingClientRect();
                return { found: true, top: r.top, bottom: r.bottom, vh: window.innerHeight };
            }, sel);
            if (!info.found) { errors.push(`on-load selector missing: ${sel}`); continue; }
            if (info.top >= info.vh || info.bottom <= 0) {
                errors.push(`on-load selector not in initial viewport: ${sel} (top=${info.top.toFixed(0)}, vh=${info.vh})`);
            }
        }

        // 3) Required elements exist, are visible, have non-zero size, and
        //    are REACHABLE by the user — either in the viewport already, or
        //    scrollable-into-view via a scrollable ancestor. An element that
        //    is simply off-screen with no scrollable container is a failure.
        for (const sel of (tc.mustExist || [])) {
            const info = await page.evaluate((s) => {
                const el = document.querySelector(s);
                if (!el) return { found: false };
                // Try to scroll it into view (honours scrollable ancestors).
                el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                // Walk up the DOM looking for any scrollable ancestor — if
                // one exists, being off-screen isn't fatal.
                let scrollable = false, scrollableX = false;
                for (let n = el.parentElement; n; n = n.parentElement) {
                    const s2 = getComputedStyle(n);
                    if (!scrollable && /(auto|scroll)/.test(s2.overflowY) && n.scrollHeight > n.clientHeight) {
                        scrollable = true;
                    }
                    // A horizontal-scroll ancestor (e.g. .table-responsive or the
                    // equipment zSimpleTable) legitimately holds content wider than
                    // the viewport — the page itself must not scroll sideways, but a
                    // wide table reachable via its own scrollbar is fine, not clipped.
                    if (!scrollableX && /(auto|scroll)/.test(s2.overflowX) && n.scrollWidth > n.clientWidth) {
                        scrollableX = true;
                    }
                    if (scrollable && scrollableX) break;
                }
                return {
                    found: true,
                    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0,
                    w: r.width, h: r.height,
                    top: r.top, left: r.left,
                    right: r.right, bottom: r.bottom,
                    vw: window.innerWidth, vh: window.innerHeight,
                    scrollable, scrollableX,
                };
            }, sel);
            if (!info.found) {
                errors.push(`selector missing: ${sel}`);
                continue;
            }
            if (!info.visible) {
                errors.push(`selector hidden (display/visibility/opacity): ${sel}`);
                continue;
            }
            if (info.w === 0 || info.h === 0) {
                errors.push(`selector zero-sized: ${sel} (${info.w}x${info.h})`);
                continue;
            }
            const inViewport = info.right > 0 && info.bottom > 0 && info.left < info.vw && info.top < info.vh;
            if (!inViewport && !info.scrollable) {
                errors.push(`selector off-screen and not scroll-reachable: ${sel} (rect ${info.left.toFixed(0)},${info.top.toFixed(0)} vs ${info.vw}x${info.vh})`);
                continue;
            }
            if (info.right > info.vw + 1 && !info.scrollableX) {
                errors.push(`selector clipped horizontally: ${sel} (right=${info.right.toFixed(1)} > vw=${info.vw})`);
                continue;
            }
        }

        await page.screenshot({ path: path.join(OUT, label + '.png'), fullPage: false });

        // 4) Walk each named tab (reinc). For each: re-check horizontal
        //    overflow at the body level, and check that the tab-body's direct
        //    grid children don't visually overlap (bug #23).
        for (const tabName of (tc.tabs || [])) {
            const clicked = await page.evaluate((name) => {
                const tabs = [...document.querySelectorAll('.nav-tabs .nav-link')];
                const t = tabs.find((a) => a.textContent.trim() === name);
                if (!t) return false;
                t.click();
                return true;
            }, tabName);
            if (!clicked) { errors.push(`tab not found: ${tabName}`); continue; }
            await new Promise((r) => setTimeout(r, 200));

            const tabDims = await page.evaluate(() => ({
                scrollW: document.documentElement.scrollWidth,
                clientW: document.documentElement.clientWidth,
                bodyScrollH: document.body.scrollHeight,
                clientH: document.documentElement.clientHeight,
            }));
            if (tabDims.scrollW > tabDims.clientW + 1) {
                errors.push(`[${tabName}] horizontal overflow: scrollWidth=${tabDims.scrollW} > clientWidth=${tabDims.clientW}`);
            }
            if (tc.expectNoPageScroll && tabDims.bodyScrollH > tabDims.clientH + 1) {
                errors.push(`[${tabName}] page vertically scrollable: bodyScrollHeight=${tabDims.bodyScrollH} > clientHeight=${tabDims.clientH}`);
            }

            // Sibling-overlap check on every grid container inside .tab-body.
            const overlaps = await page.evaluate(() => {
                const out = [];
                const grids = document.querySelectorAll('.tab-body .extras-grid, .tab-body .general-grid, .tab-body .skills-grid, .tab-body .export-grid');
                for (const g of grids) {
                    const kids = [...g.children].filter((c) => {
                        const cs = getComputedStyle(c);
                        return cs.display !== 'none' && cs.visibility !== 'hidden';
                    });
                    const rects = kids.map((c) => c.getBoundingClientRect());
                    for (let i = 0; i < rects.length; i++) {
                        for (let j = i + 1; j < rects.length; j++) {
                            const a = rects[i], b = rects[j];
                            const xOv = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                            const yOv = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                            if (xOv > 4 && yOv > 4) {
                                out.push(`${g.className} children ${i}/${j} overlap by ${xOv.toFixed(0)}x${yOv.toFixed(0)}`);
                            }
                        }
                    }
                }
                return out;
            });
            for (const ov of overlaps) errors.push(`[${tabName}] ${ov}`);

            const tabSlug = tabName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            await page.screenshot({ path: path.join(OUT, label + '_tab-' + tabSlug + '.png'), fullPage: false });
        }

        // 4b) Generic tab sweep (index-based) for pages whose tab labels are
        //     dynamic — Costs ("Level XP"/…), GuildDetail ("Stat bonuses (N)"
        //     …). Click each tab and re-check horizontal overflow.
        if (tc.sweepTabs) {
            const tabCount = await page.evaluate(() => document.querySelectorAll('.nav-tabs .nav-link').length);
            for (let i = 0; i < tabCount; i++) {
                await page.evaluate((idx) => {
                    const t = document.querySelectorAll('.nav-tabs .nav-link')[idx];
                    if (t) t.click();
                }, i);
                await new Promise((r) => setTimeout(r, 200));
                const d = await page.evaluate(() => ({
                    scrollW: document.documentElement.scrollWidth,
                    clientW: document.documentElement.clientWidth,
                }));
                if (d.scrollW > d.clientW + 1) {
                    errors.push(`[tab ${i}] horizontal overflow: scrollWidth=${d.scrollW} > clientWidth=${d.clientW}`);
                }
                await page.screenshot({ path: path.join(OUT, label + '_tab' + i + '.png'), fullPage: false });
            }
        }

        // 5) Modal sweep — open every modal the page can show, and for each
        //    one check that the panel fits the viewport horizontally, the
        //    close button is reachable, and the primary action button is in
        //    the visible viewport without a page-level scroll.
        if (tc.modals && tc.modals.length) {
            for (const modal of tc.modals) {
                const opened = await page.evaluate(modal.setupSrc);
                if (!opened) { errors.push(`[modal:${modal.name}] could not open`); continue; }
                await new Promise((r) => setTimeout(r, 250));

                const m = await page.evaluate((sel) => {
                    const panel = document.querySelector(sel.panelSel);
                    if (!panel) return { found: false };
                    const pr = panel.getBoundingClientRect();
                    const primary = sel.primarySel ? document.querySelector(sel.primarySel) : null;
                    const closeBtn = sel.closeSel ? document.querySelector(sel.closeSel) : null;
                    const r = (el) => el ? el.getBoundingClientRect() : null;
                    const visible = (rect) => rect && rect.width > 0 && rect.height > 0
                        && rect.top < window.innerHeight && rect.bottom > 0
                        && rect.left < window.innerWidth && rect.right > 0;
                    return {
                        found: true,
                        panel: { l: pr.left, r: pr.right, t: pr.top, b: pr.bottom, w: pr.width, h: pr.height },
                        vw: window.innerWidth, vh: window.innerHeight,
                        scrollW: document.documentElement.scrollWidth,
                        clientW: document.documentElement.clientWidth,
                        bodyScrollH: document.body.scrollHeight,
                        clientH: document.documentElement.clientHeight,
                        primaryFound: !!primary,
                        primaryVisible: visible(r(primary)),
                        primaryRect: primary ? r(primary) : null,
                        closeFound: !!closeBtn,
                        closeVisible: visible(r(closeBtn)),
                    };
                }, { panelSel: modal.panelSel, primarySel: modal.primarySel, closeSel: modal.closeSel });

                if (!m.found) { errors.push(`[modal:${modal.name}] panel not in DOM after open`); continue; }
                if (m.scrollW > m.clientW + 1) {
                    errors.push(`[modal:${modal.name}] horizontal page overflow: ${m.scrollW} > ${m.clientW}`);
                }
                if (m.panel.r > m.vw + 1 || m.panel.l < -1) {
                    errors.push(`[modal:${modal.name}] panel clipped horizontally (${m.panel.l.toFixed(0)}-${m.panel.r.toFixed(0)} vs vw ${m.vw})`);
                }
                if (modal.primarySel) {
                    if (!m.primaryFound) errors.push(`[modal:${modal.name}] primary action missing: ${modal.primarySel}`);
                    else if (!m.primaryVisible) {
                        errors.push(`[modal:${modal.name}] primary action not in viewport: ${modal.primarySel} (rect ${m.primaryRect.left.toFixed(0)},${m.primaryRect.top.toFixed(0)} vs ${m.vw}x${m.vh})`);
                    }
                }
                if (modal.closeSel) {
                    if (!m.closeFound) errors.push(`[modal:${modal.name}] close button missing: ${modal.closeSel}`);
                    else if (!m.closeVisible) errors.push(`[modal:${modal.name}] close button not in viewport: ${modal.closeSel}`);
                }

                await page.screenshot({ path: path.join(OUT, label + '_modal-' + modal.name + '.png'), fullPage: false });

                // Tear the modal down before opening the next one.
                if (modal.teardownSrc) {
                    await page.evaluate(modal.teardownSrc);
                    await new Promise((r) => setTimeout(r, 150));
                }
            }
        }
    } catch (e) {
        errors.push('exception: ' + (e.message || String(e)));
    }
    await page.close();

    const status = errors.length === 0 ? 'PASS' : 'FAIL';
    console.log(`${status}  ${label}`);
    for (const err of errors) fail(err);
    if (!errors.length) pass(`screenshot: out/${label}.png`);
    return errors.length === 0;
}

async function main() {
    // The host is resource-constrained (1 CPU, ~756MB RAM + swap), so
    // Chromium is slow to launch and CDP calls can lag under swap pressure.
    // --disable-dev-shm-usage avoids the tiny /dev/shm; the generous
    // timeouts stop spurious launch/navigation failures.
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        timeout: 60000,
        protocolTimeout: 180000,
    });

    // Set up an authenticated context if any case needs it.
    let auth = null, authCtx = null, cookie = null;
    if (CASES.some((c) => c.auth)) {
        try {
            auth = await ensureAuthSession();
            authCtx = await browser.createBrowserContext();
            const u = new URL(BASE);
            cookie = { name: 'zeq_sid', value: auth.sid, domain: u.hostname, path: '/',
                       httpOnly: true, secure: u.protocol === 'https:' };
            await resolveDetailRoutes(auth.sid);
            console.log(`[auth] borrowed a session for admin '${auth.who}' @ ${u.hostname}`);
        } catch (e) {
            console.error('[auth] could not set up authenticated session:', e.message);
            console.error('[auth] authenticated cases will be SKIPPED.');
        }
    }

    // --only=sub1,sub2 restricts the run to cases whose label contains any
    // listed substring (handy for re-verifying a fix without a full sweep).
    const only = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;

    let allOk = true;
    try {
        for (const tc of CASES) {
            if (only && !only.some((o) => tc.label.includes(o))) continue;
            if (tc.auth && !authCtx) { console.log(`SKIP  ${tc.label} (no auth session)`); continue; }
            if (tc.skip) { console.log(`SKIP  ${tc.label} (${tc.skip})`); continue; }
            const ctx = tc.auth ? authCtx : browser;
            for (const vp of VIEWPORTS) {
                const ok = await runCase(ctx, vp, tc, cookie);
                if (!ok) allOk = false;
            }
        }
    } finally {
        if (authCtx) await authCtx.close();
        await browser.close();
        if (auth) await auth.cleanup();
    }

    console.log(allOk ? '\nall passed' : '\nfailures present');
    process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
