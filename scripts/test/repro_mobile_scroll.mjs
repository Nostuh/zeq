#!/usr/bin/env node
// Reproduce the "mobile: can't scroll down in guild list after picking"
// report. Loads the planner at 360x780, picks a guild, then probes
// the scroll/clip state of the guild list and the tab body.

import puppeteer from 'puppeteer';

async function main() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 780, hasTouch: true, isMobile: true });
    await page.goto('https://nostuh.com/#/reinc', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 500));

    async function probe(label) {
        console.log(`\n=== ${label} ===`);
        const d = await page.evaluate(() => {
            const query = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return {
                    h: r.height, w: r.width, top: r.top, bottom: r.bottom,
                    scrollH: el.scrollHeight, clientH: el.clientHeight,
                    canScroll: el.scrollHeight > el.clientHeight,
                    overflowY: cs.overflowY,
                    display: cs.display,
                };
            };
            return {
                window: { scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight },
                tab_body: query('.tab-body'),
                general_grid: query('.general-grid'),
                col_races: query('.col-races'),
                race_select: query('.list-select'),
                guild_list: query('.guild-list'),
            };
        });
        console.log(JSON.stringify(d, null, 2));
    }

    await probe('initial load');

    // Click a top-level guild
    await page.evaluate(() => {
        const row = Array.from(document.querySelectorAll('.guild-row'))
            .find((r) => !r.classList.contains('locked') && !r.classList.contains('sub') && !r.classList.contains('picked'));
        if (row) row.querySelector('label').click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await probe('after picking one guild');

    // Try to scroll the tab-body to the bottom and check if it moves
    const scrollResult = await page.evaluate(() => {
        const tb = document.querySelector('.tab-body');
        if (!tb) return { ok: false };
        const before = tb.scrollTop;
        tb.scrollTop = 9999;
        const after = tb.scrollTop;
        return { before, after, scrollH: tb.scrollHeight, clientH: tb.clientHeight };
    });
    console.log('\n=== tab-body scrollTop probe ===');
    console.log(scrollResult);

    // Try window scroll too
    const windowScroll = await page.evaluate(() => {
        const before = window.scrollY;
        window.scrollTo(0, 9999);
        const after = window.scrollY;
        return { before, after, docH: document.documentElement.scrollHeight };
    });
    console.log('\n=== window.scrollY probe ===');
    console.log(windowScroll);

    await page.screenshot({ path: '/srv/zeq/scripts/test/out/repro_mobile_after_pick.png', fullPage: false });

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
