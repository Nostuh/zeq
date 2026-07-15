// Chest Sorter stat lookup — PUBLIC, read-only.
//
// The Chest Sorter (public page at /chest-sorter) lets anyone paste in-game
// chest contents. When they export the item index to CSV it calls here to
// enrich each item with stats from the equipment catalog (eq_items).
//
// This is deliberately public (product decision): it takes a list of item
// names and returns stats ONLY for names that match. It does not browse the
// catalog and exposes no ownership data. Unmatched names come back null so the
// CSV shows blank stat columns.
//
// Matching reuses eq_parse.normalizeName so incoming names are normalized the
// same way the catalog names were at store time ((1h)/(2h) + <tags> stripped,
// whitespace collapsed). A leading count word ("Two Maces…") is dropped first.

import express from 'express';
import dbs from '../../db.mjs';
import { normalizeName } from '../../classes/eq_parse.mjs';

const router = express.Router();
const zeq = dbs.get('zeq');

const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, data });

const NUMBER_RE = /^(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+/i;

// Reduce a raw chest item name to the same key the catalog stores under.
function lookupKey(raw) {
    const noCount = String(raw || '').replace(NUMBER_RE, '');
    return normalizeName(noCount).name.toLowerCase();
}

// POST /api/chestlookup  { names: ["Tower shield", ...] }
// → { data: { "<original name>": {stats}|null, ... } }
router.post('/', async function(req, res) {
    try {
        const names = Array.isArray(req.body && req.body.names) ? req.body.names.slice(0, 5000) : [];
        if (!names.length) return ok(res, {});

        // Unique normalized keys → one param each. Fixed-width padded names so
        // no placeholder is a prefix of another (mysql.mjs binds via
        // replaceAll — see docs/gotchas.md param-prefix-collision).
        const keys = [...new Set(names.map(lookupKey).filter(Boolean))];
        const params = {};
        const ph = keys.map((k, i) => { const p = 'nm' + String(i).padStart(4, '0'); params[p] = k; return '@' + p; });

        const rows = ph.length ? await zeq.query(
            `SELECT name, wear_slot, weapon_class, is_shield, hands, ac,
                    str, con, dex, \`int\`, wis, cha, hp, sp, hpr, spr,
                    rphys, rmag, rfire, rcold, relec, racid, rpoi, rasphx, rpsi, rshadow,
                    dmg_pct, dmg_type
             FROM eq_items WHERE LOWER(name) IN (${ph.join(',')})`, params) : [];

        // First match wins per key (an item can exist in >1 wear slot).
        const byKey = {};
        for (const r of rows) { const k = String(r.name).toLowerCase(); if (!(k in byKey)) byKey[k] = r; }

        // Echo back keyed by the exact strings the client sent.
        const out = {};
        for (const raw of names) out[raw] = byKey[lookupKey(raw)] || null;
        ok(res, out);
    } catch (e) { console.error('[chestlookup]', e); fail(res, 'lookup failed', 500); }
});

export const chestlookup = router;
