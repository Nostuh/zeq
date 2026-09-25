// Sidebar rail + Mob KB right column — layout regression test.
//
//  1. The admin sidebar used to be a fixed `calc(100vh - 65px)` box with no
//     overflow rule, so the bottom links spilled past the painted panel on
//     shorter windows. It is now a sticky rail exactly one viewport tall
//     that scrolls itself only if it must.
//  2. MobDetail's right column (Guilds/Loot) was sticky + height-capped +
//     overflow-y:auto, giving long loot lists a second scrollbar. It is now
//     plain page flow.
//  3. The rail collapses to an ~80px icon strip via an obvious toggle,
//     persisted in localStorage; mobile keeps the full-label hamburger menu.
//  4. (--part=header) The header used to be a fixed 65px, so when its links
//     wrapped (phones; tablets when signed in) the extra rows overflowed the
//     dark bar — Log out and the theme toggle went white-on-white behind the
//     page. Every header control must now sit inside the bar, uncovered.
//
// LIGHT BY DESIGN — this host has 1 CPU / 765MB RAM (docs/testing.md
// "Server load"): one browser, a few viewports, run it niced and on its own:
//   nice -n 19 node repro_sidebar_layout.mjs [--shots=<dir>] [--mob=<id>]
// Borrows an admin session like responsive.mjs and deletes it at the end.

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const BASE = 'https://nostuh.com';
const SHOTS = args.shots || null;
// --part=desktop,mob,mobile runs only those sections (default: all). Use it
// to re-check one area without paying for a whole browser session.
const PARTS = args.part ? String(args.part).split(',').map((x) => x.trim()) : ['desktop', 'mob', 'mobile', 'header'];
const want = (p) => PARTS.includes(p);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const CONFIG = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'classes', 'config.json'), 'utf8')).zeq;

const db = await mysql.createConnection({
    host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
    database: CONFIG.database, charset: 'utf8mb4',
});
const [admins] = await db.query(
    "SELECT id, name FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1");
if (!admins.length) { await db.end(); throw new Error('no active admin to borrow a session from'); }
let mobId = parseInt(args.mob, 10) || null;
if (!mobId) {
    // A realistic long-loot mob (skip pseudo-mobs with hundreds of rows).
    const [m] = await db.query(
        `SELECT mob_id FROM mob_loot GROUP BY mob_id HAVING COUNT(*) BETWEEN 15 AND 60
         ORDER BY COUNT(*) DESC LIMIT 1`);
    mobId = m.length ? m[0].mob_id : null;
}
const sid = crypto.randomBytes(32).toString('hex');
await db.query(
    `INSERT INTO sessions (id, user_id, created, expires)
     VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR))`, [sid, admins[0].id]);

const fails = [];
const check = (label, cond, detail = '') => {
    if (cond) console.log(`  ok   ${label}`);
    else { console.log(`  FAIL ${label} ${detail}`); fails.push(label); }
};
const shot = async (page, name) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

// Geometry of the rail + its links, read in the page.
const railState = () => {
    const nav = document.querySelector('#sidebarMenu');
    const r = nav.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    const labels = [...nav.querySelectorAll('.side-link .side-label')];
    const links = [...nav.querySelectorAll('.side-link')];
    const toggle = nav.querySelector('.side-toggle');
    return {
        visible: cs.display !== 'none' && r.width > 0,
        width: Math.round(r.width),
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        vh: window.innerHeight, vw: window.innerWidth,
        overflowY: cs.overflowY,
        scrolls: nav.scrollHeight > nav.clientHeight + 1,
        contentH: nav.scrollHeight,
        linkCount: links.length,
        labelsShown: labels.filter((l) => getComputedStyle(l).display !== 'none').length,
        iconsShown: links.filter((l) => {
            const i = l.querySelector('.bi'); return i && i.getBoundingClientRect().width > 0;
        }).length,
        titled: links.filter((l) => l.getAttribute('title') && l.getAttribute('aria-label')).length,
        toggleShown: !!toggle && getComputedStyle(toggle).display !== 'none',
        activeLabel: (nav.querySelector('.side-link.router-link-active') || {}).textContent?.trim() || null,
        // The original bug: any link painted outside the rail's own box.
        spilled: links.filter((l) => {
            const lr = l.getBoundingClientRect();
            return cs.overflowY === 'visible' && lr.bottom > r.bottom + 1;
        }).length,
    };
};

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors',
        '--disable-dev-shm-usage'],
});
try {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setCookie({ name: 'zeq_sid', value: sid, domain: 'nostuh.com', path: '/', secure: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    const go = async (hash) => {
        await page.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('#sidebarMenu', { timeout: 30000 });
        await new Promise((r) => setTimeout(r, 500));
    };
    const setTheme = (t) => page.evaluate((t) => {
        try { localStorage.setItem('zeq_theme', t); } catch (e) {}
        document.documentElement.setAttribute('data-bs-theme', t);
    }, t);

    let s;
    if (want('desktop')) {
    // ---- Desktop, expanded ------------------------------------------------
    console.log('\nDesktop 1600x900 — expanded (condensed) rail');
    await page.setViewport({ width: 1600, height: 900 });
    await go('#/equipment-all');
    await page.evaluate(() => { try { localStorage.removeItem('zeq_side_collapsed'); } catch (e) {} });
    await go('#/equipment-all');
    await setTheme('light');
    s = await page.evaluate(railState);
    check('rail rendered', s.visible);
    check('expanded width ≈ 12.5rem (200px)', Math.abs(s.width - 200) <= 2, `${s.width}px`);
    check('rail reaches the bottom of the window', Math.abs(s.bottom - s.vh) <= 1, `bottom=${s.bottom} vh=${s.vh}`);
    check('rail has an overflow plan (overflow-y:auto)', s.overflowY === 'auto', s.overflowY);
    check('no link painted outside the rail', s.spilled === 0, `${s.spilled}`);
    check('all admin links fit at 900px tall — no rail scrollbar', !s.scrolls, `content=${s.contentH}`);
    check('every label visible', s.labelsShown === s.linkCount, `${s.labelsShown}/${s.linkCount}`);
    check('collapse toggle visible', s.toggleShown);
    check('current page highlighted', s.activeLabel === 'All Equipment', String(s.activeLabel));
    await shot(page, 'desk-light-expanded');
    await setTheme('dark');
    await shot(page, 'desk-dark-expanded');

    // ---- Short window: the case that used to spill ------------------------
    console.log('\nShort window 1280x560 — the case that used to spill');
    await page.setViewport({ width: 1280, height: 560 });
    await new Promise((r) => setTimeout(r, 400));
    s = await page.evaluate(railState);
    check('rail still reaches the bottom of the window', Math.abs(s.bottom - s.vh) <= 1, `bottom=${s.bottom} vh=${s.vh}`);
    check('no link painted outside the rail', s.spilled === 0, `${s.spilled}`);
    const lastReachable = await page.evaluate(() => {
        const nav = document.querySelector('#sidebarMenu');
        nav.scrollTop = nav.scrollHeight;
        const links = [...nav.querySelectorAll('.side-link')];
        const last = links[links.length - 1].getBoundingClientRect();
        const r = nav.getBoundingClientRect();
        const ok = last.bottom <= r.bottom + 1 && last.top >= r.top - 1;
        nav.scrollTop = 0;
        return ok;
    });
    check('last link reachable inside the rail (scrolls if it must)', lastReachable);
    await shot(page, 'short-dark-expanded');

    // ---- Collapse ------------------------------------------------------------
    console.log('\nCollapse to icon rail');
    await page.setViewport({ width: 1600, height: 900 });
    await page.click('#sidebarMenu .side-toggle');
    await new Promise((r) => setTimeout(r, 400));
    s = await page.evaluate(railState);
    check('collapsed width ≈ 5rem (80px)', Math.abs(s.width - 80) <= 2, `${s.width}px`);
    check('labels hidden', s.labelsShown === 0, `${s.labelsShown} shown`);
    check('every link shows its icon', s.iconsShown === s.linkCount, `${s.iconsShown}/${s.linkCount}`);
    check('every link has a tooltip + aria-label', s.titled === s.linkCount, `${s.titled}/${s.linkCount}`);
    check('collapsed rail still reaches the bottom', Math.abs(s.bottom - s.vh) <= 1);
    check('collapsed rail fits at 900px tall', !s.scrolls, `content=${s.contentH}`);
    const mainGrew = await page.evaluate(() => Math.round(document.querySelector('.app-shell main').getBoundingClientRect().width));
    check('main content widened to fill the space', mainGrew >= 1600 - 80 - 2, `${mainGrew}px`);
    await shot(page, 'desk-dark-collapsed');
    await setTheme('light');
    await shot(page, 'desk-light-collapsed');

    await go('#/equipment-all');
    s = await page.evaluate(railState);
    check('collapsed state survives a reload', Math.abs(s.width - 80) <= 2, `${s.width}px`);

    await page.click('#sidebarMenu .side-toggle');
    await new Promise((r) => setTimeout(r, 400));
    s = await page.evaluate(railState);
    check('toggle back → condensed expanded rail', Math.abs(s.width - 200) <= 2 && s.labelsShown === s.linkCount,
        `${s.width}px, ${s.labelsShown} labels`);
    await go('#/equipment-all');
    s = await page.evaluate(railState);
    check('expanded state survives a reload', Math.abs(s.width - 200) <= 2, `${s.width}px`);
    } // desktop

    // ---- Mob detail right column -------------------------------------------
    if (want('mob') && mobId) {
        await page.setViewport({ width: 1600, height: 900 });
        console.log(`\nMob detail #${mobId} — right column`);
        await go(`#/mobs/${mobId}`);
        await page.waitForSelector('.mob-sidebar', { timeout: 30000 });
        await new Promise((r) => setTimeout(r, 600));
        const m = await page.evaluate(() => {
            const col = document.querySelector('.mob-sidebar');
            const cs = getComputedStyle(col);
            // Any element on the page that scrolls vertically on its own
            // (other than the sidebar rail and the page itself).
            const inner = [...document.querySelectorAll('.app-shell main *')].filter((el) => {
                const c = getComputedStyle(el);
                return /(auto|scroll)/.test(c.overflowY) && el.scrollHeight > el.clientHeight + 1;
            }).map((el) => el.className || el.tagName);
            return {
                position: cs.position, overflowY: cs.overflowY,
                clipped: col.scrollHeight > col.clientHeight + 1,
                inner,
            };
        });
        check('right column is plain flow (not sticky)', m.position === 'static', m.position);
        check('right column has no inner scroll', m.overflowY === 'visible' && !m.clipped,
            `${m.overflowY}, clipped=${m.clipped}`);
        check('no nested vertical scrollbars inside main', m.inner.length === 0, JSON.stringify(m.inner));
        await shot(page, 'mob-detail');
    } else if (want('mob')) {
        console.log('\n(skip) no mob with 15–60 loot rows found');
    }

    if (want('mobile')) {
    // ---- Mobile: hamburger menu keeps full labels ----------------------------
    // Plain narrow viewport, NOT isMobile/hasTouch emulation: toggling those
    // makes Puppeteer reload the page, which races the next navigation on
    // this 1-CPU host. The layout switch is width-based (@media), so width
    // is what matters here.
    console.log('\nMobile 390x844 — hamburger menu');
    await page.setViewport({ width: 390, height: 844 });
    await go('#/equipment-all');
    await page.evaluate(() => { try { localStorage.setItem('zeq_side_collapsed', '1'); } catch (e) {} });
    await go('#/equipment');
    s = await page.evaluate(railState);
    check('rail hidden until the hamburger is tapped', !s.visible);
    await page.click('header .navbar-toggler');
    await new Promise((r) => setTimeout(r, 400));
    s = await page.evaluate(railState);
    check('hamburger opens the menu', s.visible);
    check('full labels on mobile even when desktop is collapsed', s.labelsShown === s.linkCount,
        `${s.labelsShown}/${s.linkCount}`);
    check('collapse toggle hidden on mobile', !s.toggleShown);
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check('no horizontal page scroll', !hscroll);
    await shot(page, 'mobile-menu');
    await page.evaluate(() => { try { localStorage.removeItem('zeq_side_collapsed'); } catch (e) {} });
    } // mobile

    if (want('header')) {
    // ---- Header: every control inside the bar, on top, at every width ----
    console.log('\nHeader — controls inside the bar at narrow widths');
    const anonCtx = await browser.createBrowserContext();
    const anon = await anonCtx.newPage();
    const headerState = () => {
        const h = document.querySelector('header.zeq-navbar');
        const hr = h.getBoundingClientRect();
        const navh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zeq-navh')) || 0;
        const controls = [...h.querySelectorAll('a, button')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        });
        const bad = [];
        for (const el of controls) {
            const r = el.getBoundingClientRect();
            const label = (el.textContent.trim() || el.getAttribute('aria-label') || el.className).slice(0, 24);
            if (r.top < hr.top - 1 || r.bottom > hr.bottom + 1) { bad.push(`${label}: outside bar`); continue; }
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!hit || !(hit === el || el.contains(hit))) bad.push(`${label}: covered`);
        }
        return {
            height: Math.round(hr.height), navh: Math.round(navh), count: controls.length, bad,
            hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
            logout: controls.some((el) => /log out/i.test(el.textContent)),
        };
    };
    const cases = [
        { who: 'signed-in', pg: page, hash: '#/equipment', widths: [360, 414, 800, 1024] },
        { who: 'signed-in', pg: page, hash: '#/', widths: [360, 800] },
        { who: 'anonymous', pg: anon, hash: '#/', widths: [360, 800] },
    ];
    for (const c of cases) {
        for (const w of c.widths) {
            await c.pg.setViewport({ width: w, height: w < 700 ? 800 : 900 });
            await c.pg.goto(`${BASE}/${c.hash}`, { waitUntil: 'networkidle2', timeout: 60000 });
            await c.pg.waitForSelector('header.zeq-navbar', { timeout: 30000 });
            await new Promise((r) => setTimeout(r, 500));
            const h = await c.pg.evaluate(headerState);
            const tag = `${c.who} ${c.hash} @${w}px`;
            check(`${tag}: all ${h.count} header controls inside the bar and clickable`, h.bad.length === 0, JSON.stringify(h.bad));
            check(`${tag}: --zeq-navh matches the real header (${h.height}px)`, Math.abs(h.height - h.navh) <= 1, `navh=${h.navh}`);
            if (c.who === 'signed-in') check(`${tag}: Log out reachable`, h.logout);
            if (w < 700) check(`${tag}: header stays compact (≤ 110px, was unbounded overflow)`, h.height <= 110, `${h.height}px`);
            check(`${tag}: no horizontal page scroll`, !h.hscroll);
            if (w === 360 || (w === 414 && c.hash === '#/equipment')) await shot(c.pg, `header-${c.who}-${c.hash.replace(/\W+/g, '') || 'home'}-${w}`);
        }
    }
    await anonCtx.close();
    } // header

    if (errors.length) { console.log('\nBrowser errors:'); for (const e of errors) console.log('  ' + e); }
} finally {
    await browser.close();
    await db.query('DELETE FROM sessions WHERE id=?', [sid]);
    await db.end();
}
if (fails.length) { console.log(`\n${fails.length} check(s) FAILED`); process.exit(1); }
console.log('\nAll checks passed.');
