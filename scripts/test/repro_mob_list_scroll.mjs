// Mob list keeps its place: scroll down the EQ Mobs list, open a mob
// (e.g. Medusa), come back — the list must be where it was, not at the top.
//
// Checks, at desktop (table) and phone (cards) widths:
//   - the detail page's "← Back" button returns to the same scroll offset,
//     with the clicked mob still on screen
//   - the browser's back button does the same
//   - an active search survives the round trip (box text + filtered rows)
//   - reaching the list any other way (sidebar, a different page) does
//     not restore the old offset or search
// Read-only: only opens pages and clicks rows / Back.
//
// Same borrowed-admin session trick as responsive.mjs: no users row is
// created and the session row is deleted at the end.

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://nostuh.com';
const CONFIG = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'classes', 'config.json'), 'utf8')).zeq;

const db = await mysql.createConnection({
    host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
    database: CONFIG.database, charset: 'utf8mb4',
});
const [admins] = await db.query(
    "SELECT id, name FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1");
if (!admins.length) { await db.end(); throw new Error('no active admin to borrow a session from'); }
const sid = crypto.randomBytes(32).toString('hex');
await db.query(
    `INSERT INTO sessions (id, user_id, created, expires)
     VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR))`, [sid, admins[0].id]);
console.log(`(borrowed admin "${admins[0].name}")`);

const fails = [];
const check = (label, cond, detail = '') => {
    if (cond) console.log(`  ok   ${label}`);
    else { console.log(`  FAIL ${label} ${detail}`); fails.push(label); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
});
try {
    const errors = [];
    for (const vp of [{ name: 'desktop', width: 1280, height: 800, sel: '.mob-list-table tbody tr' },
                      { name: 'phone', width: 390, height: 844, sel: '.d-md-none > .card' }]) {
        console.log(`\n${vp.name} ${vp.width}x${vp.height}`);
        // Fresh page per viewport: nothing carries over between the two runs.
        const ctx = await browser.createBrowserContext();
        const page = await ctx.newPage();
        await page.setCookie({ name: 'zeq_sid', value: sid, domain: 'nostuh.com', path: '/', secure: true });
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/#/mobs`, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector(vp.sel, { timeout: 30000 });

        // Park on Medusa if the list has her, else a row ~70% down. Returns
        // the row's name and the resulting scroll offset. 'instant' because
        // Bootstrap sets `scroll-behavior: smooth` on :root.
        const park = () => page.evaluate((sel) => {
            const rows = [...document.querySelectorAll(sel)];
            const name = (el) => (el.querySelector('td, strong')?.textContent || '').trim();
            const row = rows.find((r) => /^medusa\b/i.test(name(r))) || rows[Math.floor(rows.length * 0.7)];
            row.scrollIntoView({ block: 'center', behavior: 'instant' });
            return { name: name(row), y: window.scrollY, idx: rows.indexOf(row) };
        }, vp.sel);
        const clickRow = (idx) => page.evaluate((sel, i) =>
            document.querySelectorAll(sel)[i].click(), vp.sel, idx);
        const openDetail = async (idx) => {
            await clickRow(idx);
            await page.waitForSelector('.mob-detail h2', { timeout: 30000 });
            await sleep(300);
        };
        // Wait for rows, then past the quiet background refresh.
        const backOnList = async () => {
            await page.waitForSelector(vp.sel, { timeout: 30000 });
            await sleep(1500);
        };
        const where = (mobName) => page.evaluate((sel, n) => {
            const row = [...document.querySelectorAll(sel)]
                .find((r) => (r.querySelector('td, strong')?.textContent || '').trim() === n);
            const box = row && row.getBoundingClientRect();
            return {
                y: window.scrollY,
                onScreen: !!box && box.top >= 0 && box.bottom <= window.innerHeight,
                hash: location.hash,
                q: document.querySelector('input.form-control')?.value,
                rows: document.querySelectorAll(sel).length,
            };
        }, vp.sel, mobName);
        const near = (a, b) => Math.abs(a - b) <= 2;

        const p = await park();
        check(`${vp.name}: list is long enough to scroll (parked at ${p.y}px on "${p.name}")`, p.y > 200);

        await openDetail(p.idx);
        await page.evaluate(() => [...document.querySelectorAll('.mob-detail a.btn')]
            .find((a) => a.textContent.includes('Back')).click());
        await backOnList();
        let w = await where(p.name);
        check(`${vp.name}: "← Back" button restores scroll (${w.y}px vs ${p.y}px)`, near(w.y, p.y));
        check(`${vp.name}: "${p.name}" still on screen after "← Back"`, w.onScreen);

        await openDetail(p.idx);
        await page.goBack();
        await backOnList();
        w = await where(p.name);
        check(`${vp.name}: browser back restores scroll (${w.y}px vs ${p.y}px)`, near(w.y, p.y));
        check(`${vp.name}: "${p.name}" still on screen after browser back`, w.onScreen);

        // Search survives the round trip.
        const term = p.name.slice(0, 3).toLowerCase();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.click('input.form-control', { clickCount: 3 });
        await page.type('input.form-control', term);
        await sleep(1500);
        const filtered = await page.evaluate((sel) => document.querySelectorAll(sel).length, vp.sel);
        await openDetail(0);
        await page.goBack();
        await backOnList();
        w = await where('');
        check(`${vp.name}: search "${term}" kept (box="${w.q}", ${w.rows} rows vs ${filtered})`,
              w.q === term && w.rows === filtered);

        // Other ways in don't restore. Clear the search first. The app never
        // resets scroll between pages (a page inherits the last one's offset,
        // clamped), so park the in-between page at the top: landing anywhere
        // but 0 then means the list restored itself when it shouldn't have.
        await page.click('input.form-control', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await sleep(1500);
        const p2 = await park();
        await openDetail(p2.idx);
        await page.evaluate(() => { location.hash = '#/kya'; });
        await sleep(1500);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.evaluate(() => { location.hash = '#/mobs'; });
        await backOnList();
        w = await where(p2.name);
        check(`${vp.name}: mob -> other page -> list not restored (${w.y}px, search="${w.q}")`,
              w.y === 0 && w.q === '');
        await ctx.close();
    }

    check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
    await browser.close();
    await db.query('DELETE FROM sessions WHERE id = ?', [sid]);
    await db.end();
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok');
process.exit(fails.length ? 1 : 0);
