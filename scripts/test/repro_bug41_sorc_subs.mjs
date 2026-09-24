// Bug #41 — "Sorc subs (order/chaos) not displayed".
//
// The sorcerer tree is the only THREE-deep branch in the catalog:
//   Sorcerers 45 → Faction of Balance 5 → Faction of Chaos 10 / Faction of Order 10
// (sorcerers.chr `Subguilds:` → faction_of_balance.chr `Subguilds:`).
// The picker used to render only primaries + their direct children, so the
// two factions were unreachable. This asserts they render, lock/unlock
// correctly, and share ONE 15-level subguild budget with Balance under
// Sorcerers (5 + 10 = 15 exactly).
//
// Kept as a regression test — run it after any change to guildTree /
// subRoomFor / dropDependentsOf in Reinc.vue.

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
await new Promise((r) => setTimeout(r, 800));

// Helpers evaluated in the page: rows are .guild-row, the name lives in the
// clickable span, and the level <input> only exists once a guild is picked.
await page.evaluate(() => {
    window.__rows = () => [...document.querySelectorAll('.guild-row')].map((el) => {
        const span = el.querySelector('span');
        const input = el.querySelector('input[type="number"]');
        return {
            el,
            name: (span ? span.textContent : '').replace(/[-\s]+/g, ' ').replace(/\/\d+$/, '').trim(),
            depth: el.classList.contains('sub2') ? 2 : (el.classList.contains('sub') ? 1 : 0),
            picked: el.classList.contains('picked'),
            locked: el.classList.contains('locked'),
            level: input ? Number(input.value) : null,
        };
    });
    window.__find = (n) => window.__rows().find((r) => r.name.toLowerCase() === n.toLowerCase());
    window.__click = async (n) => {
        const r = window.__find(n);
        if (!r) throw new Error(`row not found: ${n}`);
        r.el.querySelector('div[class*="d-flex"]').click();
        await new Promise((res) => setTimeout(res, 350));
    };
    window.__setLevel = async (n, v) => {
        const r = window.__find(n);
        const input = r.el.querySelector('input[type="number"]');
        if (!input) throw new Error(`${n} is not picked, no level input`);
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, String(v));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((res) => setTimeout(res, 350));
    };
});

const fails = [];
const check = (label, cond, detail = '') => {
    if (cond) console.log(`  ok   ${label}`);
    else { console.log(`  FAIL ${label} ${detail}`); fails.push(label); }
};

// 1. Search surfaces all three factions, at the right depths.
console.log('\n1. Search "faction" reveals the whole sorcerer branch');
const searched = await page.evaluate(async () => {
    const box = document.querySelector('.col-guilds input[type="search"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(box, 'faction');
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return window.__rows().map((r) => ({ name: r.name, depth: r.depth }));
});
check('Sorcerers shown as the path to its factions', searched.some((r) => r.name === 'Sorcerers' && r.depth === 0));
check('Faction of Balance at depth 1', searched.some((r) => r.name === 'Faction of Balance' && r.depth === 1));
check('Faction of Chaos at depth 2', searched.some((r) => r.name === 'Faction of Chaos' && r.depth === 2),
    JSON.stringify(searched));
check('Faction of Order at depth 2', searched.some((r) => r.name === 'Faction of Order' && r.depth === 2));

// 2. Lock chain: factions locked until Balance is picked AT ITS MAX (5).
console.log('\n2. Lock chain');
await page.evaluate(async () => {
    const box = document.querySelector('.col-guilds input[type="search"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(box, 'sorc');
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
});
let s = await page.evaluate(() => ({
    balance: window.__find('Faction of Balance'),
    chaos: window.__find('Faction of Chaos'),
}));
check('Balance locked before Sorcerers picked', s.balance.locked);
check('Chaos locked before Balance picked', s.chaos.locked);

await page.evaluate(async () => { await window.__click('Sorcerers'); });
s = await page.evaluate(() => ({
    sorc: window.__find('Sorcerers'),
    balance: window.__find('Faction of Balance'),
    chaos: window.__find('Faction of Chaos'),
}));
check('Sorcerers picked at 45', s.sorc.picked && s.sorc.level === 45, `level=${s.sorc.level}`);
check('Balance unlocked once Sorcerers is maxed', !s.balance.locked);
check('Chaos still locked (Balance not picked)', s.chaos.locked);

await page.evaluate(async () => { await window.__click('Faction of Balance'); });
s = await page.evaluate(() => ({
    balance: window.__find('Faction of Balance'),
    chaos: window.__find('Faction of Chaos'),
    order: window.__find('Faction of Order'),
}));
check('Balance picked at 5', s.balance.picked && s.balance.level === 5, `level=${s.balance.level}`);
check('Chaos unlocked once Balance is maxed', !s.chaos.locked);
check('Order unlocked once Balance is maxed', !s.order.locked);

// 3. The 15-level subguild budget is pooled at the PRIMARY guild:
//    Balance 5 + Chaos 10 = 15, and Order must then be refused.
console.log('\n3. 15-level budget pooled under Sorcerers');
await page.evaluate(async () => { await window.__click('Faction of Chaos'); });
s = await page.evaluate(() => ({
    chaos: window.__find('Faction of Chaos'),
    order: window.__find('Faction of Order'),
    total: Number(document.querySelector('.sb-chip')?.textContent.replace(/\D+/g, '') || 0),
}));
check('Chaos picked at its full 10 (5 + 10 = 15)', s.chaos.picked && s.chaos.level === 10, `level=${s.chaos.level}`);

await page.evaluate(async () => { await window.__click('Faction of Order'); });
s = await page.evaluate(() => ({ order: window.__find('Faction of Order') }));
check('Order refused — subguild budget exhausted', !s.order.picked);

// 4. Cascade: un-maxing Balance must drop Chaos with it.
console.log('\n4. Cascade drop through the middle tier');
await page.evaluate(async () => { await window.__setLevel('Faction of Balance', 3); });
s = await page.evaluate(() => ({
    balance: window.__find('Faction of Balance'),
    chaos: window.__find('Faction of Chaos'),
}));
check('Balance lowered to 3', s.balance.level === 3, `level=${s.balance.level}`);
check('Chaos dropped when Balance fell below max', !s.chaos.picked);
check('Chaos re-locked', s.chaos.locked);

// 5. Dropping Sorcerers clears the entire branch.
console.log('\n5. Dropping the primary clears the branch');
await page.evaluate(async () => { await window.__setLevel('Faction of Balance', 5); });
await page.evaluate(async () => { await window.__click('Faction of Chaos'); });
await page.evaluate(async () => { await window.__click('Sorcerers'); });
s = await page.evaluate(() => ({
    sorc: window.__find('Sorcerers'),
    balance: window.__find('Faction of Balance'),
    chaos: window.__find('Faction of Chaos'),
}));
check('Sorcerers dropped', !s.sorc.picked);
check('Balance dropped with it', !s.balance.picked);
check('Chaos dropped with it (grandchild)', !s.chaos.picked);

await browser.close();

if (errors.length) {
    console.log('\nBrowser errors:');
    for (const e of errors) console.log('  ' + e);
}
if (fails.length) {
    console.log(`\n${fails.length} check(s) FAILED`);
    process.exit(1);
}
console.log('\nAll checks passed.');
