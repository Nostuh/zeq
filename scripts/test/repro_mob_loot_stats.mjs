// Mob detail restructure (Discord ask from Falcore): the mob page shows
// resists / prots / guilds first, then EVERY drop with its catalog stats
// side by side, then directions / notes / maps / images folded away.
//
// Checks, on the mob with the most catalog-linked loot:
//   - the loot table has one row per drop, linked rows carry stats, and
//     only non-empty stat columns are rendered
//   - clicking a stat header sorts highest first
//   - reference sections start folded, and an opened one stays open after
//     a reload (per-browser localStorage)
//   - no page-level horizontal scroll at desktop or phone width, in light
//     AND dark; the table scrolls inside its own box on the phone
// Screenshots go to scripts/test/out/.
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
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const CONFIG = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'classes', 'config.json'), 'utf8')).zeq;

const db = await mysql.createConnection({
    host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
    database: CONFIG.database, charset: 'utf8mb4',
});
const [admins] = await db.query(
    "SELECT id, name FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1");
if (!admins.length) { await db.end(); throw new Error('no active admin to borrow a session from'); }
const [[target]] = await db.query(
    `SELECT mob_id, COUNT(*) AS n, SUM(equipment_id IS NOT NULL) AS linked
     FROM mob_loot GROUP BY mob_id ORDER BY linked DESC, n DESC LIMIT 1`);
const sid = crypto.randomBytes(32).toString('hex');
await db.query(
    `INSERT INTO sessions (id, user_id, created, expires)
     VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR))`, [sid, admins[0].id]);
console.log(`(borrowed admin "${admins[0].name}"; mob #${target.mob_id}: ${target.n} drops, ${target.linked} linked)`);

const fails = [];
const check = (label, cond, detail = '') => {
    if (cond) console.log(`  ok   ${label}`);
    else { console.log(`  FAIL ${label} ${detail}`); fails.push(label); }
};

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
});
try {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setCookie({ name: 'zeq_sid', value: sid, domain: 'nostuh.com', path: '/', secure: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

    const open = async (theme, width, height) => {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.evaluate((t) => localStorage.setItem('zeq_theme', t), theme);
        await page.goto(`${BASE}/#/mobs/${target.mob_id}`, { waitUntil: 'networkidle2', timeout: 60000 });
        // Hash-only navigation doesn't reload the SPA, so the stored theme
        // would never be re-read without this.
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForSelector('.mob-loot-table tbody tr', { timeout: 30000 });
        await new Promise((r) => setTimeout(r, 500));
    };
    const table = () => page.evaluate(() => {
        const heads = [...document.querySelectorAll('.mob-loot-table thead th')]
            .map((th) => th.textContent.replace(/[▲▼]/g, '').trim());
        const rows = [...document.querySelectorAll('.mob-loot-table tbody tr')].map((tr) =>
            Object.fromEntries([...tr.querySelectorAll('td')].map((td, i) => [heads[i], td.textContent.trim()])));
        return { heads, rows };
    });
    const overflow = () => page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        wrap: (() => { const w = document.querySelector('.mob-loot-table').parentElement;
            return w.scrollWidth - w.clientWidth; })(),
    }));

    // --- Desktop, light -------------------------------------------------
    console.log('\ndesktop 1600, light');
    await open('light', 1600, 1000);
    await page.evaluate(() => localStorage.removeItem('zeq_mob_folds'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.mob-loot-table tbody tr');
    let t = await table();
    // Compare against the API, not the count read at startup: people edit
    // the Mob KB live (a drop was added to the target mid-run once).
    const apiLoot = await page.evaluate(async (id) =>
        (await (await fetch(`/api/mobs/${id}`)).json()).data.loot.length, target.mob_id);
    check(`one row per drop (${apiLoot})`, t.rows.length === apiLoot, `got ${t.rows.length}`);
    const statHeads = t.heads.filter((h) => !['Item', 'Slot', 'Bonuses', ''].includes(h));
    check('stat columns rendered', statHeads.length > 0, JSON.stringify(t.heads));
    const emptyCols = statHeads.filter((h) => t.rows.every((r) => !r[h]));
    check('no all-blank stat column', !emptyCols.length, JSON.stringify(emptyCols));
    const withStats = t.rows.filter((r) => statHeads.some((h) => r[h]));
    check('linked drops show stats', withStats.length > 0);
    const ov = await overflow();
    check('no page-level horizontal scroll', ov.page <= 0, JSON.stringify(ov));

    const folds = await page.evaluate(() =>
        [...document.querySelectorAll('details.mob-fold')].map((d) => ({
            title: d.querySelector('summary').textContent.trim(), open: d.open })));
    check('reference sections present', folds.length > 0, JSON.stringify(folds));
    check('all folded by default', folds.every((f) => !f.open), JSON.stringify(folds));
    const orderOk = await page.evaluate(() => {
        const y = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top : null; };
        return y('.mob-overview') < y('.mob-loot-table') && y('.mob-loot-table') < y('details.mob-fold');
    });
    check('order: overview → loot → folds', orderOk);
    await page.screenshot({ path: path.join(OUT, 'mob_loot_desktop_light.png'), fullPage: true });

    // Sort: first stat column, highest first.
    const col = statHeads.find((h) => h !== 'Dmg') || statHeads[0];
    const idx = t.heads.indexOf(col);
    await page.evaluate((i) => document.querySelectorAll('.mob-loot-table thead th')[i].click(), idx);
    await new Promise((r) => setTimeout(r, 200));
    t = await table();
    const nums = t.rows.map((r) => Number(r[col]) || 0);
    check(`sort by ${col} desc`, nums.every((v, i) => i === 0 || nums[i - 1] >= v), JSON.stringify(nums));

    // Fold memory: open Notes (or the first fold), reload, still open.
    const which = await page.evaluate(() => {
        const ds = [...document.querySelectorAll('details.mob-fold')];
        const d = ds.find((x) => /notes/i.test(x.querySelector('summary').textContent)) || ds[0];
        d.querySelector('summary').click();
        return d.querySelector('summary').textContent.trim();
    });
    await new Promise((r) => setTimeout(r, 200));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.mob-loot-table tbody tr');
    const stillOpen = await page.evaluate((w) => [...document.querySelectorAll('details.mob-fold')]
        .find((x) => x.querySelector('summary').textContent.trim() === w).open, which);
    check(`"${which}" stays open after reload`, stillOpen);

    // --- Desktop, dark --------------------------------------------------
    console.log('\ndesktop 1600, dark');
    await open('dark', 1600, 1000);
    check('dark theme applied', await page.evaluate(() =>
        document.documentElement.getAttribute('data-bs-theme') === 'dark'));
    const bg = await page.evaluate(() => getComputedStyle(
        document.querySelector('.mob-loot-table tbody td.mob-loot-name')).backgroundColor);
    check('pinned Item cell has an opaque dark background', /^rgb\(/.test(bg) && !/rgba\(.*, 0\)/.test(bg), bg);
    check('no page-level horizontal scroll', (await overflow()).page <= 0);
    await page.screenshot({ path: path.join(OUT, 'mob_loot_desktop_dark.png'), fullPage: true });

    // --- Phone, both themes ---------------------------------------------
    for (const theme of ['light', 'dark']) {
        console.log(`\nphone 360, ${theme}`);
        await open(theme, 360, 780);
        const o = await overflow();
        check('no page-level horizontal scroll', o.page <= 0, JSON.stringify(o));
        check('table scrolls inside its own box', o.wrap > 0, JSON.stringify(o));
        // Scroll the table sideways: the Item cell should stay at the left edge.
        const pinned = await page.evaluate(() => {
            const w = document.querySelector('.mob-loot-table').parentElement;
            const cell = document.querySelector('.mob-loot-table tbody td.mob-loot-name');
            const before = cell.getBoundingClientRect().left;
            w.scrollLeft = 200;
            return Math.abs(cell.getBoundingClientRect().left - before) < 1;
        });
        check('Item column stays pinned while scrolling', pinned);
        await page.evaluate(() => { document.querySelector('.mob-loot-table').parentElement.scrollLeft = 0; });
        await page.screenshot({ path: path.join(OUT, `mob_loot_phone_${theme}.png`), fullPage: true });
    }

    // Resist editor: nine number inputs inside the tiles — the tight case
    // is the phone. Opened and cancelled, nothing is saved.
    console.log('\nphone 360, resist editor');
    await page.evaluate(() => [...document.querySelectorAll('.mob-panel-resists button')]
        .find((b) => b.textContent.trim() === 'Edit').click());
    await new Promise((r) => setTimeout(r, 200));
    const ed = await page.evaluate(() => {
        const ins = [...document.querySelectorAll('.mob-panel-resists input[type=number]')];
        const panel = document.querySelector('.mob-panel-resists').getBoundingClientRect();
        return { n: ins.length, minW: Math.min(...ins.map((i) => i.getBoundingClientRect().width)),
            inside: ins.every((i) => { const r = i.getBoundingClientRect(); return r.left >= panel.left && r.right <= panel.right; }) };
    });
    check('nine resist inputs', ed.n === 9, JSON.stringify(ed));
    check('inputs fit inside the panel', ed.inside && ed.minW >= 30, JSON.stringify(ed));
    check('no page-level horizontal scroll', (await overflow()).page <= 0);
    await (await page.$('.mob-panel-resists')).screenshot({ path: path.join(OUT, 'mob_resist_edit_phone.png') });
    await page.evaluate(() => [...document.querySelectorAll('.mob-panel-resists button')]
        .find((b) => b.textContent.trim() === 'Cancel').click());

    check('no console / page errors', !errors.length, errors.join('\n'));
} finally {
    await browser.close();
    await db.query('DELETE FROM sessions WHERE id = ?', [sid]);
    await db.end();
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok');
process.exit(fails.length ? 1 : 0);
