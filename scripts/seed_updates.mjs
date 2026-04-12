#!/usr/bin/env node
// Seed the site_updates table with the initial backlog of user-visible
// changes. Idempotent: skips any (created, title) pair already present,
// so re-running is safe. USER-VISIBLE ONLY — do not add refactors,
// build-system changes, or internal reorgs. See docs/updates.md.
//
// Usage: node scripts/seed_updates.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;

// Ordered newest-last so the UI's "newest first" ordering falls out of
// insertion order when created timestamps match. Each entry describes
// something a planner visitor would actually notice.
const SEED = [
    // Times are Eastern wall-clock (the project's home timezone — see
    // api/rest/api/updates.mjs). Stored verbatim, so the seed file and
    // the live `site_updates.created` column line up exactly.
    {
        created: '2026-04-11 07:30:00', kind: 'fix', bug_id: 12,
        title: 'Level-exp totals on maxed builds corrected',
        body: 'The Total Exp readout was wildly inflated for any build with max levels. The engine now mirrors the in-game Zcreator formula exactly: a single loop from level 0, QP discount applied to every level, and the Guild bucket adding only on guild levels. The phantom "Free Levels" exp bucket is gone, replaced by a "QPs Left" readout.',
    },
    {
        created: '2026-04-11 07:45:00', kind: 'feature', bug_id: 13,
        title: 'Per-guild skill/spell unlock preview',
        body: 'Every guild row now has an ⓘ button that opens a modal listing every skill and spell the guild teaches, with a level slider so you can preview unlocks at any level before committing to the pick.',
    },
    {
        created: '2026-04-11 08:00:00', kind: 'fix', bug_id: 14,
        title: 'High-cost skills no longer blow up Total Exp',
        body: 'Skills with a high start cost (e.g. gestalt conjuration) were pushing per-bucket cost well past the race cap, inflating Total Exp roughly 48× on a maxed Devil build. Per-bucket cost is now correctly capped against the race skill-cost multiplier.',
    },
    {
        created: '2026-04-11 08:15:00', kind: 'fix',
        title: 'Skill-cost bucket rounding off by one tier',
        body: 'A floating-point ordering bug in the skill-cost calculator was nudging some buckets a full tier higher than they should be, costing the planner an extra 100 exp on every skill that hit one of those buckets. Verified against 10,000 randomly-generated builds and the Zcreator desktop anchor.',
    },
    {
        created: '2026-04-11 08:30:00', kind: 'fix',
        title: 'Over-100% skills no longer under-counted',
        body: 'Guild skills trainable past 100% (the 105/110/120% caps that some guilds unlock) were silently dropping the exp cost for the portion above 100%, undercounting Total Exp by 4–5 buckets of cost per affected skill. The full cost now flows through.',
    },
    {
        created: '2026-04-11 08:45:00', kind: 'feature', bug_id: 15,
        title: 'Race picker now shows skill/spell caps at a glance',
        body: 'The old race dropdown was replaced with a column list that shows each race\'s Skill Max, Skill Cost, Spell Max, and Spell Cost right-aligned next to the name, so you can compare races without clicking through every one.',
    },
    {
        created: '2026-04-11 09:00:00', kind: 'tweak', bug_id: 16,
        title: 'Free Levels input + readouts moved into the header',
        body: 'Free Levels is now a direct input clamped to the remaining level budget, and the level/exp readouts live in the summary bar so they stay visible on every tab instead of only the General tab.',
    },
    {
        created: '2026-04-11 09:15:00', kind: 'feature', bug_id: 17,
        title: 'New Export tab for Zcreator commands',
        body: 'A new Export tab emits the classic Zcreator character summary plus guild-grouped train/study commands, each with a copy-to-clipboard button so you can paste straight into ZombieMUD.',
    },
    {
        created: '2026-04-11 09:30:00', kind: 'tweak', bug_id: 18,
        title: 'Misc / Wishes / Boons folded into one Extras tab',
        body: 'Three lightly-used tabs were merged into a single Extras tab to cut tab clutter and keep related selections together.',
    },
    {
        created: '2026-04-11 09:45:00', kind: 'tweak',
        title: 'Resistances shown as chips in the summary bar',
        body: 'Guild-granted and wish-granted resistances now appear as labelled chips in the summary bar so you can see your resist picture without leaving the current tab.',
    },
    {
        created: '2026-04-11 10:00:00', kind: 'fix', bug_id: 19,
        title: 'Users admin: last-login dates are now readable',
        body: 'The Users admin page was showing raw ISO timestamps for last login; it now uses the same friendly date format as the rest of the admin.',
    },
    {
        created: '2026-04-11 10:15:00', kind: 'fix', bug_id: 20,
        title: 'Bug report modal: paste-image and navbar fixes',
        body: 'Pasting a screenshot into the bug report modal now works in more browsers and shows a clear error when no image is detected. The modal backdrop was also darkened so the sticky navbar no longer bleeds through the overlay.',
    },
    {
        created: '2026-04-11 10:30:00', kind: 'feature',
        title: 'New Recent Updates page',
        body: 'There is now a /updates page (linked from the header) listing every user-visible fix, tweak, and new feature. Entries that came from a "Report Bug / Idea" submission cite the bug number so reporters can see their feedback turn into shipped changes.',
    },
    {
        created: '2026-04-11 10:45:00', kind: 'fix',
        title: 'Logged-in users can get back to the admin area from the planner',
        body: 'Previously, once you opened the reinc planner there was no nav link back to the admin pages you landed on after sign-in. The header now shows an "Admin" link for editors/admins (and a "My Equipment" link for other signed-in users) while on the planner.',
    },
    {
        created: '2026-04-11 11:00:00', kind: 'feature',
        title: 'Gimdori Mode: one-click "everything maxed"',
        body: 'The General tab has a new ⚡ GIMDORI MODE button that picks every guild (parents then their subs, respecting the parent-at-max-level and 120-level restrictions), maxes every unlocked skill and spell, selects every wish and boon, and tops up TP and Quest Points to cover the cost. One click to see the ceiling of a race.',
    },
    {
        created: '2026-04-11 11:15:00', kind: 'tweak',
        title: 'Stat training removed from the planner',
        body: 'ZombieMUD no longer has a stat room, so the Stat Training inputs on the Extras tab and the Stat XP readout in the header were removed. The underlying math is still there for the day it (maybe) comes back.',
    },
    {
        created: '2026-04-11 11:30:00', kind: 'tweak',
        title: 'Wishes and Boons get select-all / clear-all buttons',
        body: 'Each section on the Extras tab now has a small "All" and "None" button next to its header so you can stop click-farming checkboxes when you want to sample or reset a full pick.',
    },
    {
        created: '2026-04-11 11:45:00', kind: 'tweak',
        title: 'Export tab: per-guild train blocks and a new Select Wishes copy box',
        body: 'Train and study commands are now split into one block per guild, each with its own Copy button — the button copies only the command line (not the guild name above it), so you can paste while standing in that guildhall without a paste error on the header. A new "Select Wishes" block emits `select <wish>` commands for every wish you picked, joined by semicolons for a single-line paste.',
    },
    {
        created: '2026-04-11 12:00:00', kind: 'feature',
        title: 'Shared Reinc Builds page (/builds)',
        body: 'A new public page at /builds shows reincs other planner users have saved, each with a short summary, per-stat totals, and up/down votes. Hit the 💾 Share Build button in the planner\'s summary bar to save your current reinc with a title, your name, and an optional description. Click "Open in planner" on any build to rehydrate the exact state and inspect or tweak it. Builds can\'t be edited after saving — make changes and save again for a new version.',
    },
    {
        created: '2026-04-11 12:15:00', kind: 'tweak',
        title: 'Gimdori Mode is now a persistent toggle',
        body: 'Gimdori Mode used to be a one-shot "max everything right now" button. It now toggles ON or OFF: while ON, every guild change automatically re-maxes skills and spells and re-selects every wish and boon. Flip it off when you\'re done and the current selections freeze in place. Easier to experiment with guild combos without clicking the button ten times.',
    },
    {
        created: '2026-04-11 12:30:00', kind: 'fix',
        title: 'Export tab: later train/study blocks no longer clipped',
        body: 'The Train/Study Commands column on the Export tab was silently hiding blocks past the first two when a build had lots of guilds (Abjurer + both subguilds + a second parent, for instance). The list of per-guild blocks now lives in its own scroll region so every guild is reachable without the later ones falling off the bottom of the viewport.',
    },
    {
        created: '2026-04-11 12:45:00', kind: 'fix',
        title: 'Table headers no longer bleed across every page',
        body: 'The Equipment admin pages were styling every <th> in the app with a sticky outlined header, which leaked to the Bug Reports list, modals, and anywhere else a table appeared — showing harsh black bars with white outlines floating over content. The rule is now scoped to the Equipment pages only.',
    },
    {
        created: '2026-04-11 13:00:00', kind: 'feature',
        title: 'Dark mode toggle in the header',
        body: 'A sun/moon button in the top-right of the header flips the whole site between light and dark themes. Your choice is remembered across visits, and first-time visitors get whichever theme their OS prefers. Covers the planner, Builds, Updates, Bug Reports, and the admin pages.',
    },
    {
        created: '2026-04-11 20:15:00', kind: 'fix',
        title: 'Bug-report Submit button reachable on mobile',
        body: 'On phones, opening the keyboard in the bug-report form pushed the Submit button below the visible area with no way to scroll to it. The form now scrolls inside the modal and the Cancel/Submit row is pinned to the bottom so it stays visible no matter how much you type.',
    },
    {
        created: '2026-04-11 20:30:00', kind: 'fix', bug_id: 27,
        title: 'Guild checkboxes respond to clicks on the box itself',
        body: 'In the guild picker, clicking directly on a checkbox did nothing — you had to click the guild name for the selection to register. The row now handles clicks on both the checkbox and the name, so either spot toggles the pick.',
    },
    {
        created: '2026-04-11 20:31:00', kind: 'tweak', bug_id: 28,
        title: 'Guild picker shows each guild\u2019s max level at a glance',
        body: 'Every guild and subguild in the picker now shows its max level right next to the name (e.g. "Masters of magic /8") so you can see a subguild\u2019s ceiling without selecting it or opening the unlock modal.',
    },
    {
        created: '2026-04-11 20:32:00', kind: 'fix', bug_id: 29,
        title: 'Header fits on mobile screens',
        body: 'The top navigation bar was overflowing on small phones — brand, links, the Report button, and the theme toggle were all fighting for space. The brand shrinks to "Zorky\u2019s" under 560px, the header Report button hides (the red FAB bottom-right already covers that), and spacing tightens so the remaining links and theme toggle fit a 352px viewport.',
    },
    {
        created: '2026-04-11 20:55:00', kind: 'tweak',
        title: 'Compact summary bar on small phones',
        body: 'On viewports under 520px wide, the planner summary bar drops the secondary chips (Size, SkCost, SpCost, Exp rate, and the XP-breakdown row) and the race list shrinks its height cap, so the race picker, guild search, and first guild rows all fit on the initial screen without scrolling. Hidden values are still surfaced via the Extras and Export tabs and on larger viewports.',
    },
];

async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database,
    });
    console.log(`[seed_updates] connected to ${CONFIG.database}@${CONFIG.host}`);

    let inserted = 0, skipped = 0;
    for (const row of SEED) {
        const [existing] = await db.query(
            'SELECT id FROM site_updates WHERE created = ? AND title = ?',
            [row.created, row.title]);
        if (existing.length) { skipped++; continue; }
        await db.query(
            `INSERT INTO site_updates (kind, title, body, bug_id, created)
             VALUES (?, ?, ?, ?, ?)`,
            [row.kind, row.title, row.body || null, row.bug_id || null, row.created]);
        inserted++;
    }
    console.log(`[seed_updates] inserted ${inserted}, skipped ${skipped} (already present)`);
    await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
