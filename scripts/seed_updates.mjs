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
    // 2026-04-11 — reinc engine math corrections
    {
        created: '2026-04-11 10:00:00', kind: 'fix', bug_id: 12,
        title: 'Level-exp totals on maxed builds corrected',
        body: 'The Total Exp readout was wildly inflated for any build with max levels. The engine now mirrors the in-game Zcreator formula exactly: a single loop from level 0, QP discount applied to every level, and the Guild bucket adding only on guild levels. The phantom "Free Levels" exp bucket is gone, replaced by a "QPs Left" readout.',
    },
    {
        created: '2026-04-11 10:05:00', kind: 'feature', bug_id: 13,
        title: 'Per-guild skill/spell unlock preview',
        body: 'Every guild row now has an ⓘ button that opens a modal listing every skill and spell the guild teaches, with a level slider so you can preview unlocks at any level before committing to the pick.',
    },
    {
        created: '2026-04-11 10:10:00', kind: 'fix', bug_id: 14,
        title: 'High-cost skills no longer blow up Total Exp',
        body: 'Skills with a high start cost (e.g. gestalt conjuration) were pushing per-bucket cost well past the race cap, inflating Total Exp roughly 48× on a maxed Devil build. Per-bucket cost is now correctly capped against the race skill-cost multiplier.',
    },

    // 2026-04-11 — C# parity audit catches
    {
        created: '2026-04-11 12:00:00', kind: 'fix',
        title: 'Skill-cost bucket rounding off by one tier',
        body: 'A floating-point ordering bug in the skill-cost calculator was nudging some buckets a full tier higher than they should be, costing the planner an extra 100 exp on every skill that hit one of those buckets. Verified against 10,000 randomly-generated builds and the Zcreator desktop anchor.',
    },
    {
        created: '2026-04-11 12:05:00', kind: 'fix',
        title: 'Over-100% skills no longer under-counted',
        body: 'Guild skills trainable past 100% (the 105/110/120% caps that some guilds unlock) were silently dropping the exp cost for the portion above 100%, undercounting Total Exp by 4–5 buckets of cost per affected skill. The full cost now flows through.',
    },

    // 2026-04-11 — Bugs #15–#20 pass
    {
        created: '2026-04-11 15:00:00', kind: 'feature', bug_id: 15,
        title: 'Race picker now shows skill/spell caps at a glance',
        body: 'The old race dropdown was replaced with a column list that shows each race\'s Skill Max, Skill Cost, Spell Max, and Spell Cost right-aligned next to the name, so you can compare races without clicking through every one.',
    },
    {
        created: '2026-04-11 15:05:00', kind: 'tweak', bug_id: 16,
        title: 'Free Levels input + readouts moved into the header',
        body: 'Free Levels is now a direct input clamped to the remaining level budget, and the level/exp readouts live in the summary bar so they stay visible on every tab instead of only the General tab.',
    },
    {
        created: '2026-04-11 15:10:00', kind: 'feature', bug_id: 17,
        title: 'New Export tab for Zcreator commands',
        body: 'A new Export tab emits the classic Zcreator character summary plus guild-grouped train/study commands, each with a copy-to-clipboard button so you can paste straight into ZombieMUD.',
    },
    {
        created: '2026-04-11 15:15:00', kind: 'tweak', bug_id: 18,
        title: 'Misc / Wishes / Boons folded into one Extras tab',
        body: 'Three lightly-used tabs were merged into a single Extras tab to cut tab clutter and keep related selections together.',
    },
    {
        created: '2026-04-11 15:20:00', kind: 'tweak',
        title: 'Resistances shown as chips in the summary bar',
        body: 'Guild-granted and wish-granted resistances now appear as labelled chips in the summary bar so you can see your resist picture without leaving the current tab.',
    },
    {
        created: '2026-04-11 15:25:00', kind: 'fix', bug_id: 19,
        title: 'Users admin: last-login dates are now readable',
        body: 'The Users admin page was showing raw ISO timestamps for last login; it now uses the same friendly date format as the rest of the admin.',
    },
    {
        created: '2026-04-11 15:30:00', kind: 'fix', bug_id: 20,
        title: 'Bug report modal: paste-image and navbar fixes',
        body: 'Pasting a screenshot into the bug report modal now works in more browsers and shows a clear error when no image is detected. The modal backdrop was also darkened so the sticky navbar no longer bleeds through the overlay.',
    },
    {
        created: '2026-04-11 18:00:00', kind: 'feature',
        title: 'New Recent Updates page',
        body: 'There is now a /updates page (linked from the header) listing every user-visible fix, tweak, and new feature. Entries that came from a "Report Bug / Idea" submission cite the bug number so reporters can see their feedback turn into shipped changes.',
    },
    {
        created: '2026-04-11 18:05:00', kind: 'fix',
        title: 'Logged-in users can get back to the admin area from the planner',
        body: 'Previously, once you opened the reinc planner there was no nav link back to the admin pages you landed on after sign-in. The header now shows an "Admin" link for editors/admins (and a "My Equipment" link for other signed-in users) while on the planner.',
    },

    // 2026-04-11 evening — Gimdori mode + export polish
    {
        created: '2026-04-11 20:00:00', kind: 'feature',
        title: 'Gimdori Mode: one-click "everything maxed"',
        body: 'The General tab has a new ⚡ GIMDORI MODE button that picks every guild (parents then their subs, respecting the parent-at-max-level and 120-level restrictions), maxes every unlocked skill and spell, selects every wish and boon, and tops up TP and Quest Points to cover the cost. One click to see the ceiling of a race.',
    },
    {
        created: '2026-04-11 20:05:00', kind: 'tweak',
        title: 'Stat training removed from the planner',
        body: 'ZombieMUD no longer has a stat room, so the Stat Training inputs on the Extras tab and the Stat XP readout in the header were removed. The underlying math is still there for the day it (maybe) comes back.',
    },
    {
        created: '2026-04-11 20:10:00', kind: 'tweak',
        title: 'Wishes and Boons get select-all / clear-all buttons',
        body: 'Each section on the Extras tab now has a small "All" and "None" button next to its header so you can stop click-farming checkboxes when you want to sample or reset a full pick.',
    },
    {
        created: '2026-04-11 20:15:00', kind: 'tweak',
        title: 'Export tab: per-guild train blocks and a new Select Wishes copy box',
        body: 'Train and study commands are now split into one block per guild, each with its own Copy button — the button copies only the command line (not the guild name above it), so you can paste while standing in that guildhall without a paste error on the header. A new "Select Wishes" block emits `select <wish>` commands for every wish you picked, joined by semicolons for a single-line paste.',
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
