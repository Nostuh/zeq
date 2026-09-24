// Bugs #40 (slot filter) and #43 (ΣRes total column) on the equipment
// catalog, plus the "how scoring works" explainer that ships with #43 and
// the Misc-dropdown layout shift in the header.
//
// The equipment screens are flag-gated, so — exactly like responsive.mjs —
// this BORROWS an existing active admin and mints a short-lived session
// row, injecting the zeq_sid cookie. No users row is created; the session
// is deleted at the end.

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
console.log(`(borrowed admin "${admins[0].name}" for a temporary session)`);

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
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
    await page.setCookie({ name: 'zeq_sid', value: sid, domain: 'nostuh.com', path: '/', secure: true });

    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

    // networkidle2, not networkidle0 — some pages keep a lingering connection
    // that never fully idles (same reason responsive.mjs uses it).
    await page.goto(`${BASE}/#/equipment-all`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('table.table tbody tr', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));

    // Read the table as {header: value} rows.
    await page.evaluate(() => {
        window.__table = () => {
            const heads = [...document.querySelectorAll('table.table thead th')].map(
                (th) => th.textContent.trim());
            return [...document.querySelectorAll('table.table tbody tr')].map((tr) => {
                const cells = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
                return Object.fromEntries(heads.map((h, i) => [h, cells[i]]));
            });
        };
        window.__headers = () => [...document.querySelectorAll('table.table thead th')]
            .map((th) => th.textContent.trim());
    });

    // --- Bug #43: ΣRes column -------------------------------------------
    console.log('\n#43 — total resist column');
    const headers = await page.evaluate(() => window.__headers());
    check('ΣRes column rendered', headers.some((h) => h.includes('ΣRes')), JSON.stringify(headers));

    const RES = ['Phys', 'Psi', 'Elec', 'Mag', 'Poi', 'Fire', 'Cold', 'Acid', 'Asph', 'Shdw'];
    const totals = await page.evaluate((RES) => {
        return window.__table().slice(0, 400).map((r) => {
            const key = Object.keys(r).find((k) => k.includes('ΣRes'));
            const sum = RES.reduce((a, c) => a + (Number(r[c]) || 0), 0);
            return { name: r.Name, shown: r[key], expected: sum ? String(sum) : '' };
        });
    }, RES);
    const wrong = totals.filter((t) => t.shown !== t.expected);
    check(`ΣRes equals the sum of all 10 resists (${totals.length} rows checked)`,
        wrong.length === 0, JSON.stringify(wrong.slice(0, 3)));
    const withRes = totals.filter((t) => t.expected !== '');
    check('at least some rows carry a non-zero total', withRes.length > 0,
        `${withRes.length} rows`);
    // Shadow must be inside the total (Ben: include it).
    const shadowRows = await page.evaluate(() => window.__table().slice(0, 400)
        .filter((r) => Number(r.Shdw) > 0)
        .map((r) => ({ name: r.Name, shdw: Number(r.Shdw), tot: Number(r[Object.keys(r).find((k) => k.includes('ΣRes'))]) })));
    check('shadow resist is included in the total',
        shadowRows.every((r) => r.tot >= r.shdw), JSON.stringify(shadowRows.slice(0, 3)));

    // --- Bug #40: slot filter -------------------------------------------
    console.log('\n#40 — slot multiselect filter');
    const bar = await page.evaluate(() => {
        const b = document.querySelector('.eq-slotbar');
        if (!b) return null;
        return [...b.querySelectorAll('button')].map((x) => x.textContent.trim().split(/\s+/)[0]);
    });
    check('slot filter bar rendered', !!bar, String(bar));
    check('offers an amulet chip', bar && bar.includes('amulet'), JSON.stringify(bar));

    const clickSlot = async (slot) => page.evaluate(async (slot) => {
        const b = [...document.querySelectorAll('.eq-slotbar button')]
            .find((x) => x.textContent.trim().split(/\s+/)[0] === slot);
        if (!b) throw new Error(`no chip: ${slot}`);
        b.click();
        await new Promise((r) => setTimeout(r, 400));
    }, slot);

    await clickSlot('amulet');
    let rows = await page.evaluate(() => window.__table());
    check('amulet filter returns rows', rows.length > 0, `${rows.length}`);
    check('every row is an amulet',
        rows.every((r) => (r.Slot || '').startsWith('amulet')),
        JSON.stringify(rows.filter((r) => !(r.Slot || '').startsWith('amulet')).slice(0, 3).map((r) => r.Slot)));

    // Multi-select: add a second slot, both must be present.
    await clickSlot('neck');
    rows = await page.evaluate(() => window.__table());
    const slots = new Set(rows.map((r) => (r.Slot || '').split(' ')[0]));
    check('amulet + neck both selected', slots.has('amulet') && slots.has('neck'),
        JSON.stringify([...slots]));
    check('no third slot leaked in', slots.size === 2, JSON.stringify([...slots]));

    // Search composes with the slot filter (the reporter's actual ask:
    // "filter between stats/resists and it only pulls amulets").
    await clickSlot('neck'); // back to amulet only
    const sortedOk = await page.evaluate(async () => {
        const th = [...document.querySelectorAll('table.table thead th')]
            .find((x) => x.textContent.includes('ΣRes'));
        th.click();
        await new Promise((r) => setTimeout(r, 400));
        const rows = window.__table();
        return rows.every((r) => (r.Slot || '').startsWith('amulet'));
    });
    check('sorting inside a slot filter keeps the filter', sortedOk);

    // "All" clears back to the full catalog.
    await page.evaluate(async () => {
        [...document.querySelectorAll('.eq-slotbar button')]
            .find((x) => x.textContent.trim() === 'All').click();
        await new Promise((r) => setTimeout(r, 500));
    });
    const afterClear = await page.evaluate(() => window.__table().length);
    check('“All” restores the full list', afterClear > rows.length, `${afterClear} rows`);

    // --- #43 explainer ---------------------------------------------------
    console.log('\n#43 — adjective scoring explainer');
    const help = await page.evaluate(async () => {
        const link = [...document.querySelectorAll('a')]
            .find((a) => a.textContent.includes('How these numbers work'));
        if (!link) return { opened: false };
        link.click();
        await new Promise((r) => setTimeout(r, 800));
        const panel = document.querySelector('.eqsh-panel');
        return {
            opened: !!panel,
            text: panel ? panel.textContent : '',
            tiers: panel ? panel.querySelectorAll('.eqsh-tier').length : 0,
        };
    });
    check('explainer opens', help.opened);
    check('says we are not computing the real value',
        /not calculating what the item actually gives/i.test(help.text));
    check('names the bound / race / rounding caveats',
        /bound/i.test(help.text) && /race/i.test(help.text) && /rounding/i.test(help.text));
    check('renders the adjective ladders from the parser', help.tiers > 30, `${help.tiers} tiers`);
    check('ladder carries Ben’s observed resist steps',
        /a bit/.test(help.text) && /somewhat/.test(help.text) && /tremendously/.test(help.text)
        && /unearthly/.test(help.text));
    await page.keyboard.press('Escape');

    // --- Header Misc dropdown must not reflow the navbar -----------------
    console.log('\nHeader — Misc dropdown layout shift');
    const shift = await page.evaluate(async () => {
        const nav = document.querySelector('header.zeq-navbar');
        const before = nav.getBoundingClientRect().height;
        const toggle = [...nav.querySelectorAll('.misc-menu .nav-link')][0];
        toggle.click();
        await new Promise((r) => setTimeout(r, 350));
        const menu = document.querySelector('.misc-menu .dropdown-menu.show');
        const after = nav.getBoundingClientRect().height;
        const pos = menu ? getComputedStyle(menu).position : null;
        const item = menu ? menu.querySelector('.dropdown-item') : null;
        const navBottom = nav.getBoundingClientRect().bottom;
        const menuTop = menu ? menu.getBoundingClientRect().top : 0;
        return {
            before, after, pos,
            visible: !!menu,
            label: item ? item.textContent.trim() : null,
            below: menu ? menuTop >= navBottom - 2 : false,
        };
    });
    check('menu opens', shift.visible);
    check('menu is absolutely positioned', shift.pos === 'absolute', String(shift.pos));
    check('navbar height unchanged when opened',
        shift.before === shift.after, `${shift.before} → ${shift.after}`);
    check('menu hangs below the navbar', shift.below);
    check('Chest Sorter item present', shift.label === 'Chest Sorter', String(shift.label));

    // And it actually navigates.
    await page.evaluate(async () => {
        document.querySelector('.misc-menu .dropdown-menu.show .dropdown-item').click();
        await new Promise((r) => setTimeout(r, 900));
    });
    const landed = await page.evaluate(() => location.hash);
    check('Chest Sorter navigates', landed.includes('chest-sorter'), landed);

    if (errors.length) {
        console.log('\nBrowser errors:');
        for (const e of errors) console.log('  ' + e);
    }
} finally {
    await browser.close();
    await db.query('DELETE FROM sessions WHERE id=?', [sid]);
    await db.end();
}

if (fails.length) {
    console.log(`\n${fails.length} check(s) FAILED`);
    process.exit(1);
}
console.log('\nAll checks passed.');
