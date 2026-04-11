#!/usr/bin/env node
// Reproduce the "guild selection + total levels not updating" report.
// Drives the live planner at https://nostuh.com/#/reinc and watches
// how the summary bar Level cell, Guild Levels, Free Levels, and
// Total Levels input respond to guild picks + level edits.

import puppeteer from 'puppeteer';

const BASE = 'https://nostuh.com/#/reinc';

function log(...a) { console.log('[repro]', ...a); }

async function readState(page) {
    return page.evaluate(() => {
        const txt = (sel) => {
            const el = document.querySelector(sel);
            return el ? el.textContent.trim() : null;
        };
        // summary-bar Level cell — find the .sb-cell whose label is LEVEL
        const cells = Array.from(document.querySelectorAll('.sb-cell'));
        // Labels are title-case in the DOM; text-transform: uppercase is cosmetic only.
        const lowerEq = (c, s) => (c.querySelector('.sb-label')?.textContent.trim().toLowerCase() === s);
        const levelCell = cells.find((c) => lowerEq(c, 'level'));
        const totalXpCell = cells.find((c) => lowerEq(c, 'total xp'));

        // levels grid rows
        const lgRows = Array.from(document.querySelectorAll('.lg-row'));
        const readLg = (label) => {
            const row = lgRows.find((r) => r.textContent.trim().toLowerCase().startsWith(label.toLowerCase()));
            if (!row) return null;
            const input = row.querySelector('input');
            if (input) return { input: input.value };
            const readout = row.querySelector('.readout');
            return readout ? readout.textContent.trim() : null;
        };

        // picked-guild chips
        const chips = Array.from(document.querySelectorAll('.sb-chip')).map((c) => c.textContent.trim());

        return {
            summary_level: levelCell ? levelCell.querySelector('.sb-value')?.textContent.trim() : null,
            summary_total_xp: totalXpCell ? totalXpCell.querySelector('.sb-value')?.textContent.trim() : null,
            totalLevels: readLg('Total Levels'),
            guildLevels: readLg('Guild Levels'),
            freeLevels: readLg('Free Levels'),
            guildChips: chips,
        };
    });
}

async function clickFirstGuild(page) {
    // Click the first (non-locked, non-picked) guild label
    return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.guild-row'));
        for (const r of rows) {
            if (r.classList.contains('locked')) continue;
            if (r.classList.contains('picked')) continue;
            if (r.classList.contains('sub')) continue;
            const label = r.querySelector('label');
            if (label) {
                const name = label.textContent.trim();
                label.click();
                return { clicked: true, name };
            }
        }
        return { clicked: false };
    });
}

async function main() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    page.on('console', (msg) => { if (msg.type() === 'error') console.log('[browser error]', msg.text()); });
    page.on('pageerror', (err) => console.log('[browser pageerror]', err.message));

    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 500));

    log('--- INITIAL (no guild picked) ---');
    log(JSON.stringify(await readState(page)));

    log('\n--- clicking first top-level guild ---');
    const r1 = await clickFirstGuild(page);
    log('click result:', r1);
    await new Promise((r) => setTimeout(r, 400));
    log(JSON.stringify(await readState(page)));

    log('\n--- clicking another top-level guild ---');
    const r2 = await clickFirstGuild(page);
    log('click result:', r2);
    await new Promise((r) => setTimeout(r, 400));
    log(JSON.stringify(await readState(page)));

    log('\n--- lowering first pick via level input ---');
    // Find the first .guild-row.picked and set its level input to 5
    const r3 = await page.evaluate(() => {
        const row = document.querySelector('.guild-row.picked');
        if (!row) return { ok: false };
        const inp = row.querySelector('input[type="number"]');
        if (!inp) return { ok: false };
        inp.value = '5';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, new_value: inp.value };
    });
    log('edit result:', r3);
    await new Promise((r) => setTimeout(r, 400));
    log(JSON.stringify(await readState(page)));

    log('\n--- unchecking first pick ---');
    const r4 = await page.evaluate(() => {
        const row = document.querySelector('.guild-row.picked');
        if (!row) return { ok: false };
        row.querySelector('label')?.click();
        return { ok: true };
    });
    log('uncheck result:', r4);
    await new Promise((r) => setTimeout(r, 400));
    log(JSON.stringify(await readState(page)));

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
