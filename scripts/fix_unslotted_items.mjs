// Clean up eq_items rows whose wear_slot is blank.
//
// These rows came in through the legacy `eq` migration: identify pastes
// saved with no slot, so the parser could not classify them (they carry
// needs_review=1). Most were later re-added WITH a slot by the library
// onboarding, which — because the catalog dedups on (name, wear_slot) —
// created a second, correctly slotted "twin" row instead of merging. The
// blank rows kept the ownership tags and the mob-loot links, so the same
// item showed up twice in the catalog and twice in its mob's loot list.
//
// For each blank row:
//   * exactly one slotted twin (same name)  → MERGE into the twin:
//       - stats/flags via eq_merge.mjs's mergeRecord() — the same best-of
//         merge the app applies when an item is re-pasted, i.e. exactly
//         what would have happened had the slot been known at paste time;
//       - bonuses with the app's larger-magnitude rule;
//       - ownership tags moved (a user who owns both keeps one tag);
//       - mob-loot links: a duplicate row on a mob that already lists the
//         twin is removed; otherwise the link moves to the twin. Each is a
//         Mob KB edit, logged in mob_history ('update' / 'loot', user
//         'init') with a version bump, like scripts/migrate_mob_links.mjs.
//         A move that would give the twin a second source mob is refused
//         (one source mob per item) and reported;
//       - then the blank row is deleted.
//   * no twin → left alone unless the slot is given explicitly with
//     --slot=<id>:<slot>. The script never infers a slot from the name;
//     the evidence for each assignment belongs in the run notes / commit.
//   * several twins → reported, left for a human.
//
// Idempotent: a re-run finds nothing left to do. Uses the API's own DB
// layer (api/db.mjs, @name placeholders) and exits explicitly to close
// its pool.
//
//   node scripts/fix_unslotted_items.mjs --dry-run [--slot=139:feet]
//   node scripts/fix_unslotted_items.mjs [--slot=139:feet]

import dbs from '../api/db.mjs';
import { mergeRecord, WRITE_COLS } from '../api/classes/eq_merge.mjs';
import { classifySlot } from '../api/classes/eq_parse.mjs';
import { recordMobHistory, bumpMobVersion } from '../api/classes/mob_kb.mjs';

const DRY = process.argv.includes('--dry-run');
const SLOT_ARGS = new Map(process.argv.filter((a) => a.startsWith('--slot=')).map((a) => {
    const [id, slot] = a.slice('--slot='.length).split(':');
    return [parseInt(id, 10), String(slot || '').trim().toLowerCase()];
}));
const q = dbs.get('zeq');
const ident = (c) => (c === 'int' ? '`int`' : c);
const show = (v) => (v == null ? 'NULL' : String(v).length > 40 ? `${String(v).slice(0, 37)}…` : String(v));
const act = async (label, fn) => { console.log(`    ${DRY ? '[dry] ' : ''}${label}`); if (!DRY) await fn(); };

async function mergeInto(b, t) {
    console.log(`\nMERGE #${b.id} → #${t.id} "${b.name}" (${t.wear_slot})`);

    // 1. Catalog row: the app's best-of merge, with the blank row as the
    //    incoming record tagged with the twin's slot classification.
    const incoming = { ...b, wear_slot: t.wear_slot, slot_raw: t.slot_raw,
        weapon_class: t.weapon_class, is_shield: t.is_shield, hands: t.hands };
    const m = mergeRecord(t, incoming);
    const changed = WRITE_COLS.filter((c) => String(m[c] ?? '') !== String(t[c] ?? ''));
    for (const c of changed) console.log(`    ${c}: ${show(t[c])} → ${show(m[c])}`);
    if (changed.length) {
        const sets = WRITE_COLS.map((c) => `${ident(c)} = ${q.escape(m[c] ?? null)}`).join(', ');
        await act(`update #${t.id} (${changed.length} column${changed.length > 1 ? 's' : ''})`, () => q.query(
            `UPDATE eq_items SET ${sets}, version = version + 1, updated = NOW() WHERE id = ${q.escape(t.id)}`));
    } else {
        console.log('    catalog row unchanged (twin already has the best values)');
    }

    // 2. Bonuses — same larger-magnitude rule as upsertItemFromText.
    for (const x of await q.query('SELECT bonus_name, amount FROM eq_item_bonuses WHERE item_id = @id', { id: b.id })) {
        await act(`bonus ${x.bonus_name} ${x.amount} → #${t.id}`, () => q.query(
            `INSERT INTO eq_item_bonuses (item_id, bonus_name, amount) VALUES (@iid, @bn, @amt)
             ON DUPLICATE KEY UPDATE amount = IF(ABS(VALUES(amount)) > ABS(amount), VALUES(amount), amount)`,
            { iid: t.id, bn: x.bonus_name, amt: x.amount }));
    }

    // 3. Ownership tags (uk_eqo on user_id+item_id → IGNORE keeps one).
    const owners = await q.query('SELECT user_id FROM eq_ownership WHERE item_id = @id', { id: b.id });
    if (owners.length) {
        await act(`move ${owners.length} ownership tag(s) → #${t.id}`, () => q.query(
            `INSERT IGNORE INTO eq_ownership (user_id, item_id, note, created)
             SELECT user_id, @tid, note, created FROM eq_ownership WHERE item_id = @bid`,
            { tid: t.id, bid: b.id }));
    }

    // 4. Mob-loot links.
    let blocked = false;
    for (const r of await q.query('SELECT * FROM mob_loot WHERE equipment_id = @id', { id: b.id })) {
        const dup = await q.query(
            'SELECT id FROM mob_loot WHERE mob_id = @mid AND equipment_id = @tid', { mid: r.mob_id, tid: t.id });
        if (dup.length) {
            await act(`mob ${r.mob_id}: remove duplicate loot row ${r.id} (row ${dup[0].id} already lists #${t.id})`, async () => {
                await q.query('DELETE FROM mob_loot WHERE id = @id', { id: r.id });
                await recordMobHistory(q, r.mob_id, null, 'update', 'loot',
                    { merged_duplicate: { removed_loot_id: r.id, kept_loot_id: dup[0].id, item: b.name,
                        reason: `blank-slot catalog row #${b.id} merged into #${t.id}` } }, null);
                await bumpMobVersion(q, r.mob_id, null);
            });
            continue;
        }
        const elsewhere = await q.query(
            'SELECT mob_id FROM mob_loot WHERE equipment_id = @tid AND mob_id <> @mid', { tid: t.id, mid: r.mob_id });
        if (elsewhere.length) {
            console.log(`    ! mob ${r.mob_id}: NOT moved — #${t.id} is already dropped by mob ${elsewhere[0].mob_id} (one source mob per item)`);
            blocked = true;
            continue;
        }
        await act(`mob ${r.mob_id}: relink loot row ${r.id} → #${t.id}`, async () => {
            await q.query('UPDATE mob_loot SET equipment_id = @tid, slot = COALESCE(slot, @ws) WHERE id = @id',
                { tid: t.id, ws: t.wear_slot, id: r.id });
            await recordMobHistory(q, r.mob_id, null, 'update', 'loot',
                { relinked: { loot_id: r.id, item: b.name, from_item: b.id, to_item: t.id,
                    reason: `blank-slot catalog row #${b.id} merged into #${t.id}` } }, null);
            await bumpMobVersion(q, r.mob_id, null);
        });
    }

    // 5. Drop the blank row (bonuses/ownership cascade; loot handled above).
    if (blocked) { console.log(`    ! keeping #${b.id}: a loot link could not be moved — resolve by hand`); return; }
    await act(`delete blank row #${b.id}`, () => q.query('DELETE FROM eq_items WHERE id = @id', { id: b.id }));
}

async function assignSlot(b, slot) {
    const c = classifySlot(slot);
    console.log(`\nASSIGN #${b.id} "${b.name}" → ${c.wear_slot}${c.weapon_class ? ` (${c.weapon_class})` : ''}`);
    const clash = await q.query('SELECT id FROM eq_items WHERE name = @n AND wear_slot = @ws AND id <> @id',
        { n: b.name, ws: c.wear_slot, id: b.id });
    if (clash.length) { console.log(`    ! #${clash[0].id} already holds (name, ${c.wear_slot}) — skipped`); return; }
    await act(`set wear_slot=${c.wear_slot}, slot_raw=${slot}, needs_review=${c.needs_review}`, () => q.query(
        `UPDATE eq_items SET wear_slot = @ws, weapon_class = @wc, is_shield = @sh, slot_raw = @sraw,
                needs_review = @nr, version = version + 1, updated = NOW() WHERE id = @id`,
        { ws: c.wear_slot, wc: c.weapon_class, sh: c.is_shield, sraw: slot, nr: c.needs_review, id: b.id }));
    await act('fill slot on its loot rows', () => q.query(
        'UPDATE mob_loot SET slot = @ws WHERE equipment_id = @id AND slot IS NULL', { ws: c.wear_slot, id: b.id }));
}

async function main() {
    console.log(DRY ? '== DRY RUN — nothing will be written ==' : '== LIVE RUN ==');
    const blanks = await q.query(
        "SELECT * FROM eq_items WHERE wear_slot = '' OR wear_slot IS NULL ORDER BY id");
    console.log(`${blanks.length} blank-slot row(s)`);
    for (const b of blanks) {
        const twins = await q.query(
            "SELECT * FROM eq_items WHERE name = @name AND id <> @id AND wear_slot <> ''",
            { name: b.name, id: b.id });
        if (twins.length === 1) await mergeInto(b, twins[0]);
        else if (twins.length > 1) console.log(`\nSKIP #${b.id} "${b.name}": ${twins.length} slotted twins (${twins.map((t) => `#${t.id} ${t.wear_slot}`).join(', ')}) — resolve by hand`);
        else if (SLOT_ARGS.has(b.id)) await assignSlot(b, SLOT_ARGS.get(b.id));
        else console.log(`\nSKIP #${b.id} "${b.name}": no slotted twin; pass --slot=${b.id}:<slot> to assign one`);
    }
    const left = await q.query("SELECT COUNT(*) AS n FROM eq_items WHERE wear_slot = '' OR wear_slot IS NULL");
    console.log(`\n${DRY ? '(dry run) ' : ''}blank-slot rows remaining: ${left[0].n}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
