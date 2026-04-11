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
