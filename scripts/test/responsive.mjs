#!/usr/bin/env node
// Headless-browser responsive test harness for the zeq UI.
//
// For each (route, viewport) combination it:
//   1. Navigates to the page
//   2. Waits for network idle
//   3. Measures body vs viewport dimensions and checks for horizontal overflow
//   4. Checks that key interactive elements are present, visible, and inside
//      the viewport (not clipped by 0-width columns, etc.)
//   5. Captures a screenshot to scripts/test/out/<label>.png
//   6. Emits a pass/fail line per case
//
// Usage:
//   cd scripts/test && node responsive.mjs [--base=https://nostuh.com]
//
// Exit code 0 if every case passes, non-zero otherwise.

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
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

// Each case: { route, mustExist: [selectors], label }
// `mustExist` selectors must resolve to *visible* elements fully inside the
// viewport. Empty list = no interaction-visibility requirements.
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
];

function fail(msg) { console.log('  ✗ ' + msg); }
function pass(msg) { console.log('  ✓ ' + msg); }

async function runCase(browser, vp, tc) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

    const label = `${tc.label}_${vp.label}_${vp.width}x${vp.height}`;
    const errors = [];

    try {
        const url = BASE + tc.route;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
        // Let any mounted lifecycle / fetches settle.
        await new Promise((r) => setTimeout(r, 400));

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
                let scrollable = false;
                for (let n = el.parentElement; n; n = n.parentElement) {
                    const s2 = getComputedStyle(n);
                    if (/(auto|scroll)/.test(s2.overflowY) && n.scrollHeight > n.clientHeight) {
                        scrollable = true; break;
                    }
                }
                return {
                    found: true,
                    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0,
                    w: r.width, h: r.height,
                    top: r.top, left: r.left,
                    right: r.right, bottom: r.bottom,
                    vw: window.innerWidth, vh: window.innerHeight,
                    scrollable,
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
            if (info.right > info.vw + 1) {
                errors.push(`selector clipped horizontally: ${sel} (right=${info.right.toFixed(1)} > vw=${info.vw})`);
                continue;
            }
        }

        await page.screenshot({ path: path.join(OUT, label + '.png'), fullPage: false });

        // 4) Walk each tab. For each one: re-check horizontal overflow at the
        //    body level, and check that the tab-body's direct grid children
        //    don't visually overlap each other (bug #23 — Wishes section
        //    overflowed its grid row and rendered on top of Boons).
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
            // If any two children's bounding rects intersect by more than 4px
            // in both axes, that's an overlap bug.
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

        // 5) Modal sweep — open every modal the planner can show, and for
        //    each one check that the panel fits the viewport horizontally,
        //    the close button is reachable, and the primary action button
        //    (Submit / Save / Close) is in the visible viewport without a
        //    page-level scroll. Bug #29-companion: on small phones the
        //    bug-report modal had its Submit button hidden below the iOS
        //    keyboard area; the panel now scrolls internally with a sticky
        //    footer, so the action row should always be visible.
        if (tc.modals && tc.modals.length) {
            for (const modal of tc.modals) {
                // Each modal definition is { name, setup, panelSel,
                // primarySel, closeSel }. `setup` is an in-page function
                // expression that opens the modal (returns true on
                // success); we eval it inside page.evaluate.
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
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    let allOk = true;
    for (const tc of CASES) {
        for (const vp of VIEWPORTS) {
            const ok = await runCase(browser, vp, tc);
            if (!ok) allOk = false;
        }
    }

    await browser.close();
    console.log(allOk ? '\nall passed' : '\nfailures present');
    process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
