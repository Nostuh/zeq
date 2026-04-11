// Browser smoke for bug #12 (qps actually consumed) and bug #13 (info modal).
// Reproduces the reporter's build, asserts the new Race/Guild values, opens
// the per-guild info modal, and verifies it lists skills/spells.

import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

await page.goto('https://nostuh.com/#/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));

// Pick Abjurer (the reporter's build) and crank Quest Points to 9000.
const picked = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll('.guild-row')];
    const find = (name) => rows.find((r) => r.textContent.trim().toLowerCase().startsWith(name.toLowerCase()));
    const click = async (name) => {
        const r = find(name);
        if (!r) throw new Error(`row not found: ${name}`);
        r.querySelector('label').click();
        await new Promise((res) => setTimeout(res, 250));
    };
    await click('Abjurer');
    return !!find('Abjurer')?.classList.contains('picked');
});
if (!picked) throw new Error('Abjurer pick failed');

// Wait for guild data to land.
await new Promise((r) => setTimeout(r, 400));

// Set Quest Points to 9000.
const qpInputs = await page.$$('.lg-row input[type="number"]');
// Two number inputs in this grid: Total Levels (first), Quest Points (second).
await qpInputs[1].click({ clickCount: 3 });
await qpInputs[1].type('9000');
await qpInputs[1].press('Tab');
await new Promise((r) => setTimeout(r, 300));

const exp = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.exp-table tr')];
    const out = {};
    for (const r of rows) {
        const cells = r.querySelectorAll('td');
        if (cells.length === 2) out[cells[0].textContent.trim()] = cells[1].textContent.trim();
    }
    const lg = [...document.querySelectorAll('.lg-row')]
        .reduce((a, r) => (a[r.querySelector('span').textContent.trim()] = r.querySelector('.readout, input')?.value ?? r.querySelector('.readout')?.textContent?.trim(), a), {});
    return { exp: out, lg };
});
console.log('After 9000 QPs on Abjurer 45:');
console.log(JSON.stringify(exp, null, 2));
const race = exp.exp['Experience for Race Levels:'];
const left = exp.lg['QPs Left:'];
const needed = exp.lg['QPs Needed:'];
const hasFreeRow = 'Experience for Free Levels:' in exp.exp;
if (hasFreeRow) throw new Error('Free Levels row should be removed');
if (!left || left === '9,000') throw new Error(`QPs Left should have decreased from 9000, got ${left}`);
if (!needed || needed === '0') throw new Error(`QPs Needed should be > 0 after picking guild, got ${needed}`);
console.log(`Race=${race}, QPs Needed=${needed}, QPs Left=${left}`);

// Open the info modal on Abjurer.
const opened = await page.evaluate(async () => {
    const row = [...document.querySelectorAll('.guild-row')].find((r) => r.textContent.trim().toLowerCase().startsWith('abjurer'));
    row.querySelector('.guild-info-btn').click();
    await new Promise((res) => setTimeout(res, 600));
    return !!document.querySelector('.reinc-modal-backdrop');
});
if (!opened) throw new Error('info modal did not open');

const modal = await page.evaluate(() => {
    const skills = [...document.querySelectorAll('.reinc-modal-panel table')][0]?.querySelectorAll('tbody tr').length || 0;
    const spells = [...document.querySelectorAll('.reinc-modal-panel table')][1]?.querySelectorAll('tbody tr').length || 0;
    const title = document.querySelector('.reinc-modal-panel h5')?.textContent.trim();
    return { title, skills, spells };
});
console.log('Modal:', modal);
if (!modal.title?.toLowerCase().includes('abjurer')) throw new Error(`title wrong: ${modal.title}`);
if (modal.skills + modal.spells === 0) throw new Error('modal should list at least one skill or spell');

await page.screenshot({ path: 'out/repro_bug_12_13_modal.png', fullPage: false });

if (errors.length) {
    console.error('Console/page errors:');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
}
console.log('OK');
await browser.close();
