// Reproduces the screenshot from bug #14: Devil race with the maxed
// Abjurer / Masters of magic / Masters of the elements / Bard / Actors /
// Gallants / Minstrels stack. Sets every skill to its max, then asserts
// "Total Exp for all Skills" lands close to the Zcreator desktop value
// (~3.3B), not the broken ~158B from the buggy buildSkillCostArray.

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

// Pick Devil race.
await page.evaluate(() => {
    const sel = document.querySelector('select.list-select');
    const opt = [...sel.options].find((o) => o.textContent.trim() === 'Devil');
    if (!opt) throw new Error('Devil not in race list');
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 400));

// Debug: dump all guild row labels.
const labels = await page.evaluate(() => [...document.querySelectorAll('.guild-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
console.log('guild rows:', labels.slice(0, 30).join(' | '));

// Pick the seven guilds in the screenshot. Subguilds appear after their
// parent is at max_level, so order matters.
const guildOrder = ['Abjurer', 'Masters of magic', 'Masters of the elements', 'Bard', 'Actors', 'Gallants', 'Minstrels'];
for (const name of guildOrder) {
    await page.evaluate(async (n) => {
        const rows = [...document.querySelectorAll('.guild-row')];
        const r = rows.find((row) => {
            // Row text is e.g. "Abjurerⓘ" or "- Masters of magic🔒ⓘ" — strip
            // the dash prefix, the lock emoji, and the trailing info icon.
            const txt = row.textContent
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase()
                .replace(/^-\s*/, '')
                .replace(/[🔒ⓘ\s]+$/u, '')
                .trim();
            return txt === n.toLowerCase();
        });
        if (!r) throw new Error(`row not found: ${n}`);
        if (r.classList.contains('locked')) throw new Error(`row locked: ${n}`);
        r.querySelector('label').click();
    }, name);
    await new Promise((r) => setTimeout(r, 350));
}

// Switch to Skills tab and Max All.
await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.nav-link, .tab-btn, button, a')]
        .find((el) => el.textContent.trim() === 'Skills');
    if (!tab) throw new Error('Skills tab not found');
    tab.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Max All');
    if (!btn) throw new Error('Max All not found');
    btn.click();
});
await new Promise((r) => setTimeout(r, 500));

// Switch to Spells, Max All there too.
await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.nav-link, .tab-btn, button, a')]
        .find((el) => el.textContent.trim() === 'Spells');
    if (tab) tab.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Max All');
    if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 400));

// Back to General to read the totals.
await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.nav-link, .tab-btn, button, a')]
        .find((el) => el.textContent.trim() === 'General');
    if (tab) tab.click();
});
await new Promise((r) => setTimeout(r, 300));

const totals = await page.evaluate(() => {
    const out = {};
    for (const r of document.querySelectorAll('.exp-table tr')) {
        const cells = r.querySelectorAll('td');
        if (cells.length === 2) out[cells[0].textContent.trim()] = cells[1].textContent.trim();
    }
    return out;
});
console.log('Totals (Devil, 7 guilds maxed, all skills/spells maxed):');
console.log(JSON.stringify(totals, null, 2));

const skillRaw = totals['Experience for Skills:'].replace(/,/g, '');
const spellRaw = totals['Experience for Spells:'].replace(/,/g, '');
const skill = Number(skillRaw);
const spell = Number(spellRaw);

// Zcreator desktop: Total Exp for all Skills ~3.31B (and a similar order
// for spells). Anything in the tens-of-billions range is the old bug.
const billion = 1_000_000_000;
if (skill > 30 * billion) throw new Error(`skill exp ${skill} too high — expected ~3-10B range`);
if (spell > 30 * billion) throw new Error(`spell exp ${spell} too high — expected ~3-10B range`);
if (skill < 100_000_000) throw new Error(`skill exp ${skill} suspiciously low`);

console.log(`\nskill exp: ${(skill / billion).toFixed(2)}B  (zcreator: ~3.31B)`);
console.log(`spell exp: ${(spell / billion).toFixed(2)}B`);

await page.screenshot({ path: 'out/repro_bug_14.png', fullPage: false });

if (errors.length) {
    console.error('Console/page errors:');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
}
console.log('OK');
await browser.close();
