#!/usr/bin/env node
// One-time (but re-runnable) bootstrap of the equipment ↔ Mob KB link:
//
//   Pass A — eq_items.eqmob_id → eqmobs.name → mob_monsters (case-
//            insensitive exact name match) → mob_loot rows with
//            equipment_id set (reuse-or-insert via bindLootToItem).
//   Pass B — unlinked mob_loot.item_name → eq_items by loose key
//            (lootLooseKey strips worn-location prefixes and decay
//            markers). Only keys that map to EXACTLY ONE catalog item
//            are linked; ambiguous keys are reported, never guessed.
//
// Expect a large unmatched remainder — legacy names are typo-ridden and
// many loot rows are junk ("a rope", strategy notes). The report's
// near-miss suggestions guide manual cleanup via the inline binder UI.
// No stub mob_monsters rows are ever created (a typo and a new mob are
// indistinguishable here; the KB stays curated).
//
// Idempotent: every write is guarded by an existence check inside
// bindLootToItem / the Pass-B update. History: ONE mob_history row per
// mob per run (user 'init'), not one per item. --dry-run reports only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { looseKey, lootLooseKey } from '../api/classes/eq_match.mjs';
import { bindLootToItem, recordMobHistory, bumpMobVersion } from '../api/classes/mob_kb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;
const DRY = process.argv.includes('--dry-run');

async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database, charset: 'utf8mb4',
    });

    // Adapter with the @name placeholder semantics of api/db.mjs so the
    // shared bind logic (api/classes/mob_kb.mjs) runs unchanged here.
    // Same substitution rules as api/classes/mysql.mjs (replaceAll; no
    // param name may be a substring of another).
    const q = {
        query: async (sql, params = false) => {
            let s = sql;
            if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll('@' + k, db.escape(v));
            const [rows] = await db.query(s);
            return rows;
        },
    };

    console.log(DRY ? '== DRY RUN — nothing will be written ==' : '== LIVE RUN ==');

    // ---------- Load reference data ----------
    const mobs = await q.query('SELECT id, name, short_name FROM mob_monsters');
    const mobByName = new Map();
    for (const m of mobs) {
        mobByName.set(m.name.trim().toLowerCase(), m);
        if (m.short_name) {
            const k = m.short_name.trim().toLowerCase();
            if (!mobByName.has(k)) mobByName.set(k, m);
        }
    }
    const items = await q.query('SELECT id, name, wear_slot FROM eq_items');
    // Loose-key index of the catalog; ambiguous keys (>1 item) are tracked
    // so Pass B can refuse to guess.
    const itemByLoose = new Map();
    const ambiguousKeys = new Set();
    for (const it of items) {
        const k = looseKey(it.name);
        if (!k) continue;
        if (itemByLoose.has(k)) ambiguousKeys.add(k);
        else itemByLoose.set(k, it);
    }

    // ---------- Pass A: eqmob labels → Mob KB loot links ----------
    const labeled = await q.query(
        `SELECT i.id, i.name, i.wear_slot, e.id AS eqmob_id, e.name AS eqmob_name
         FROM eq_items i JOIN eqmobs e ON e.id = i.eqmob_id`);
    const unmatchedEqmobs = new Map();   // eqmob_name → item count
    const perMobLinked = new Map();      // mob_id → [item names] (for one history row per mob)
    const counts = { aExists: 0, aReused: 0, aInserted: 0 };
    const aConflicts = [];               // single-source rule: never steal a link

    for (const row of labeled) {
        const mob = mobByName.get(row.eqmob_name.trim().toLowerCase());
        if (!mob) {
            unmatchedEqmobs.set(row.eqmob_name, (unmatchedEqmobs.get(row.eqmob_name) || 0) + 1);
            continue;
        }
        if (DRY) {
            const linked = await q.query(
                'SELECT id FROM mob_loot WHERE mob_id = @vm AND equipment_id = @vi',
                { vm: mob.id, vi: row.id });
            if (linked[0]) { counts.aExists++; continue; }
            const elsewhere = await q.query(
                `SELECT m.name FROM mob_loot l JOIN mob_monsters m ON m.id = l.mob_id
                 WHERE l.equipment_id = @vi LIMIT 1`, { vi: row.id });
            if (elsewhere[0]) { aConflicts.push(`${row.name} — already sourced from ${elsewhere[0].name}, label says ${row.eqmob_name}`); continue; }
            counts.aInserted++;
            (perMobLinked.get(mob.id) || perMobLinked.set(mob.id, []).get(mob.id)).push(row.name);
            continue;
        }
        // onConflict 'skip': one source mob per item — the migration never
        // steals a link that already exists on another mob.
        const r = await bindLootToItem(q,
            { mobId: mob.id, item: { id: row.id, name: row.name, wear_slot: row.wear_slot } },
            { history: false, onConflict: 'skip' });
        if (r.action === 'conflict') {
            aConflicts.push(`${row.name} — already sourced from ${r.linked_mob}, label says ${row.eqmob_name}`);
            continue;
        }
        counts['a' + r.action[0].toUpperCase() + r.action.slice(1)]++;
        if (r.action !== 'exists') {
            (perMobLinked.get(mob.id) || perMobLinked.set(mob.id, []).get(mob.id)).push(row.name);
        }
    }

    // ---------- Pass B: unlinked loot free text → catalog items ----------
    // Single-source rule: an item already linked ANYWHERE is never linked
    // again — first match wins, later text matches are reported as
    // conflicts for a human to sort out.
    const alreadyLinked = new Set(
        (await q.query('SELECT DISTINCT equipment_id FROM mob_loot WHERE equipment_id IS NOT NULL'))
            .map(r => r.equipment_id));
    const unlinked = await q.query(
        'SELECT id, mob_id, item_name FROM mob_loot WHERE equipment_id IS NULL');
    const bLinked = [];
    const bAmbiguous = [];
    const bUnmatched = [];
    const bConflicts = [];
    for (const l of unlinked) {
        const k = lootLooseKey(l.item_name);
        if (!k) { bUnmatched.push(l.item_name); continue; }
        if (ambiguousKeys.has(k)) { bAmbiguous.push(l.item_name); continue; }
        const it = itemByLoose.get(k);
        if (!it) { bUnmatched.push(l.item_name); continue; }
        if (alreadyLinked.has(it.id)) { bConflicts.push(`${l.item_name} — ${it.name} (#${it.id}) already has a source mob`); continue; }
        if (!DRY) {
            await q.query('UPDATE mob_loot SET equipment_id = @vi WHERE id = @vl AND equipment_id IS NULL',
                { vi: it.id, vl: l.id });
        }
        alreadyLinked.add(it.id);
        bLinked.push(`${l.item_name}  →  ${it.name} (#${it.id})`);
        (perMobLinked.get(l.mob_id) || perMobLinked.set(l.mob_id, []).get(l.mob_id)).push(it.name);
    }

    // ---------- History: one row + one version bump per touched mob ----------
    if (!DRY) {
        for (const [mobId, names] of perMobLinked) {
            await recordMobHistory(q, mobId, null, 'update', 'loot', { linked: names }, null);
            await bumpMobVersion(q, mobId, null);
        }
    }

    // ---------- Report ----------
    console.log('\n-- Pass A (eqmob label → Mob KB) --');
    console.log(`items with eqmob label: ${labeled.length}`);
    console.log(`  already linked: ${counts.aExists}, reused loot row: ${counts.aReused}, inserted loot row: ${counts.aInserted}`);
    if (unmatchedEqmobs.size) {
        console.log(`\nunmatched eqmob names (${unmatchedEqmobs.size}) — items stay legacy-labeled:`);
        const sorted = [...unmatchedEqmobs.entries()].sort((a, b) => b[1] - a[1]);
        for (const [name, n] of sorted) {
            // Near-miss suggestions: KB names sharing a prefix (suggestions
            // only — NEVER auto-applied).
            const pref = name.trim().toLowerCase().slice(0, 4);
            const cand = mobs.filter(m => m.name.toLowerCase().startsWith(pref)).map(m => m.name);
            console.log(`  ${name} (${n} item${n > 1 ? 's' : ''})${cand.length ? `  — did you mean: ${cand.join(' / ')}?` : ''}`);
        }
    }

    if (aConflicts.length) {
        console.log(`\nsingle-source conflicts (label disagrees with an existing link — fix by hand):`);
        for (const s of aConflicts) console.log(`  ! ${s}`);
    }

    console.log('\n-- Pass B (loot free text → catalog) --');
    console.log(`unlinked loot rows scanned: ${unlinked.length}`);
    console.log(`  linked: ${bLinked.length}, ambiguous (skipped): ${bAmbiguous.length}, conflicts (skipped): ${bConflicts.length}, no match: ${bUnmatched.length}`);
    for (const s of bLinked) console.log(`  + ${s}`);
    if (bAmbiguous.length) {
        console.log('\nambiguous loot names (same loose key maps to >1 catalog item):');
        for (const s of [...new Set(bAmbiguous)]) console.log(`  ? ${s}`);
    }
    if (bConflicts.length) {
        console.log('\nsingle-source conflicts (text matches an item already sourced elsewhere):');
        for (const s of [...new Set(bConflicts)]) console.log(`  ! ${s}`);
    }

    console.log(`\nmobs touched: ${perMobLinked.size}${DRY ? ' (dry run — nothing written)' : ''}`);
    await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
