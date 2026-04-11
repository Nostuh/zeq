#!/usr/bin/env node
// Seed wishes + boons based on the decompiled Zcreator C# reference.
// Idempotent: uses INSERT ... ON DUPLICATE KEY UPDATE.
// Run once (or repeatedly) to refresh the default catalog. Admins can
// then edit individual entries through the UI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;

// ---- Wishes ----
// category: 'generic' (individual stat), 'lesser', 'greater', 'resist', 'other'
// effect_key values interpreted by the reinc engine:
//   stat_pct_{str,dex,con,int,wis,cha}  — add N% to that max stat
//   stat_pct_all                        — add N% to every max stat
//   skill_max / spell_max               — flat +N to cap
//   hp_regen / sp_regen / hp / sp       — flat adds
//   resist                              — flag (value stored in name for display)
//   flag                                — purely informational
const WISHES = [
    // Generic (individual stat wishes, 40 TP each, +10% max)
    { name: 'Improved strength',    category: 'generic', tp_cost: 40, effect_key: 'stat_pct_str', effect_value: 10, sort: 1 },
    { name: 'Improved dexterity',   category: 'generic', tp_cost: 40, effect_key: 'stat_pct_dex', effect_value: 10, sort: 2 },
    { name: 'Improved constitution',category: 'generic', tp_cost: 40, effect_key: 'stat_pct_con', effect_value: 10, sort: 3 },
    { name: 'Improved intelligence',category: 'generic', tp_cost: 40, effect_key: 'stat_pct_int', effect_value: 10, sort: 4 },
    { name: 'Improved wisdom',      category: 'generic', tp_cost: 40, effect_key: 'stat_pct_wis', effect_value: 10, sort: 5 },
    { name: 'Improved charisma',    category: 'generic', tp_cost: 40, effect_key: 'stat_pct_cha', effect_value: 10, sort: 6 },
    { name: 'Thick skin',           category: 'generic', tp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 7 },
    { name: 'True seeing',          category: 'generic', tp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 8 },
    { name: 'Lucky',                category: 'generic', tp_cost: 75,  effect_key: 'flag', effect_value: 1, sort: 9 },
    { name: 'Ambidexterity',        category: 'generic', tp_cost: 500, effect_key: 'flag', effect_value: 1, sort: 10 },
    { name: 'Elemental attunement', category: 'generic', tp_cost: 250, effect_key: 'flag', effect_value: 1, sort: 11 },
    { name: 'Giant size',           category: 'generic', tp_cost: 500, effect_key: 'flag', effect_value: 1, sort: 12 },

    // Resistances — 150 TP each, informational (detailed effect lives in game engine)
    { name: 'Resist acid',        category: 'resist', tp_cost: 150, effect_key: 'resist', effect_value: 1, sort: 20 },
    { name: 'Resist asphyxiation',category: 'resist', tp_cost: 150, effect_key: 'resist', effect_value: 1, sort: 21 },
    { name: 'Resist cold',        category: 'resist', tp_cost: 150, effect_key: 'resist', effect_value: 1, sort: 22 },
    { name: 'Resist electric',    category: 'resist', tp_cost: 150, effect_key: 'resist', effect_value: 1, sort: 23 },
    { name: 'Resist fire',        category: 'resist', tp_cost: 150, effect_key: 'resist', effect_value: 1, sort: 24 },
    { name: 'Resist magical',     category: 'resist', tp_cost: 150, effect_key: 'resist', effect_value: 1, sort: 25 },
    { name: 'Resist poison',      category: 'resist', tp_cost: 150, effect_key: 'resist', effect_value: 1, sort: 26 },
    { name: 'Resist psionic',     category: 'resist', tp_cost: 150, effect_key: 'resist', effect_value: 1, sort: 27 },

    // Lesser
    { name: 'Lesser stats',                category: 'lesser', tp_cost: 15, effect_key: 'stat_pct_all', effect_value: 5, sort: 40 },
    { name: 'Better knowledge',            category: 'lesser', tp_cost: 5,  effect_key: 'skill_max',    effect_value: 5, sort: 41 },
    { name: 'Lesser casting haste',        category: 'lesser', tp_cost: 10, effect_key: 'flag', effect_value: 1, sort: 42 },
    { name: 'Lesser critical blow',        category: 'lesser', tp_cost: 10, effect_key: 'flag', effect_value: 1, sort: 43 },
    { name: 'Lesser magical improvement',  category: 'lesser', tp_cost: 10, effect_key: 'mag_wish',   effect_value: 1, sort: 44 },
    { name: 'Lesser physical improvement', category: 'lesser', tp_cost: 10, effect_key: 'phys_wish',  effect_value: 1, sort: 45 },
    { name: 'Improved battle regeneration',category: 'lesser', tp_cost: 10, effect_key: 'battle_regen', effect_value: 1, sort: 46 },
    { name: 'Improved endurance',          category: 'lesser', tp_cost: 10, effect_key: 'flag', effect_value: 1, sort: 47 },
    { name: 'Improved reserves',           category: 'lesser', tp_cost: 10, effect_key: 'flag', effect_value: 1, sort: 48 },
    { name: 'Improved spell damage',       category: 'lesser', tp_cost: 10, effect_key: 'flag', effect_value: 1, sort: 49 },

    // Greater
    { name: 'Superior stats',              category: 'greater', tp_cost: 30, effect_key: 'stat_pct_all', effect_value: 10, sort: 60 },
    { name: 'Superior knowledge',          category: 'greater', tp_cost: 10, effect_key: 'skill_max',   effect_value: 10, sort: 61 },
    { name: 'Greater casting haste',       category: 'greater', tp_cost: 20, effect_key: 'flag', effect_value: 1, sort: 62 },
    { name: 'Greater critical blow',       category: 'greater', tp_cost: 20, effect_key: 'flag', effect_value: 1, sort: 63 },
    { name: 'Greater magical improvement', category: 'greater', tp_cost: 20, effect_key: 'mag_wish',   effect_value: 2, sort: 64 },
    { name: 'Greater physical improvement',category: 'greater', tp_cost: 20, effect_key: 'phys_wish',  effect_value: 2, sort: 65 },
    { name: 'Superior battle regeneration',category: 'greater', tp_cost: 20, effect_key: 'battle_regen', effect_value: 2, sort: 66 },
    { name: 'Superior endurance',          category: 'greater', tp_cost: 20, effect_key: 'flag', effect_value: 1, sort: 67 },
    { name: 'Superior reserves',           category: 'greater', tp_cost: 20, effect_key: 'flag', effect_value: 1, sort: 68 },
    { name: 'Superior spell damage',       category: 'greater', tp_cost: 20, effect_key: 'flag', effect_value: 1, sort: 69 },
];

// ---- Boons ----
// The C# decompile does not hardcode a complete boon list; the desktop
// screenshot shows categories. We seed a representative set that admins
// can edit/extend. Categories observed: racial, minor, preference,
// knowledge, weapon, lesser, greater.
const BOONS = [
    // Racial 50PP — one per common race (admins can extend)
    { name: 'Boon of Catfolk',   category: 'racial', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 1 },
    { name: 'Boon of Cromagnon', category: 'racial', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 2 },
    { name: 'Boon of Cyclops',   category: 'racial', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 3 },
    { name: 'Boon of Devil',     category: 'racial', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 4 },
    { name: 'Boon of Djinni',    category: 'racial', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 5 },
    { name: 'Boon of Drow',      category: 'racial', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 6 },
    { name: 'Boon of Dwarf',     category: 'racial', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 7 },
    { name: 'Boon of Elf',       category: 'racial', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 8 },

    // Minor 100PP
    { name: 'Boon of boxes',     category: 'minor', pp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 1 },
    { name: 'Boon of fragments', category: 'minor', pp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 2 },
    { name: 'Boon of gold',      category: 'minor', pp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 3 },
    { name: 'Boon of scrolls',   category: 'minor', pp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 4 },

    // Preference 50PP (damage type preferences)
    { name: 'Acid damage',        category: 'preference', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 1 },
    { name: 'Asphyxiation damage',category: 'preference', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 2 },
    { name: 'Cold damage',        category: 'preference', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 3 },
    { name: 'Electric damage',    category: 'preference', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 4 },
    { name: 'Fire damage',        category: 'preference', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 5 },
    { name: 'Magical damage',     category: 'preference', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 6 },
    { name: 'Poison damage',      category: 'preference', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 7 },
    { name: 'Psionic damage',     category: 'preference', pp_cost: 50, effect_key: 'flag', effect_value: 1, sort: 8 },

    // Knowledge 100PP
    { name: 'Anatomy',        category: 'knowledge', pp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 1 },
    { name: 'Bag of holding', category: 'knowledge', pp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 2 },
    { name: 'Defend',         category: 'knowledge', pp_cost: 100, effect_key: 'flag', effect_value: 1, sort: 3 },

    // Weapon 75PP
    { name: 'Ancient proficiency',  category: 'weapon', pp_cost: 75, effect_key: 'flag', effect_value: 1, sort: 1 },
    { name: 'Axe proficiency',      category: 'weapon', pp_cost: 75, effect_key: 'flag', effect_value: 1, sort: 2 },
    { name: 'Bludgeon proficiency', category: 'weapon', pp_cost: 75, effect_key: 'flag', effect_value: 1, sort: 3 },
    { name: 'Dagger proficiency',   category: 'weapon', pp_cost: 75, effect_key: 'flag', effect_value: 1, sort: 4 },
    { name: 'Polearm proficiency',  category: 'weapon', pp_cost: 75, effect_key: 'flag', effect_value: 1, sort: 5 },
    { name: 'Staff proficiency',    category: 'weapon', pp_cost: 75, effect_key: 'flag', effect_value: 1, sort: 6 },
    { name: 'Sword proficiency',    category: 'weapon', pp_cost: 75, effect_key: 'flag', effect_value: 1, sort: 7 },

    // Lesser
    { name: 'Boneskull',    category: 'lesser', pp_cost: 200, effect_key: 'flag', effect_value: 1, sort: 1 },
    { name: 'Regeneration', category: 'lesser', pp_cost: 200, effect_key: 'flag', effect_value: 1, sort: 2 },
    { name: 'Restoration',  category: 'lesser', pp_cost: 200, effect_key: 'flag', effect_value: 1, sort: 3 },
    { name: 'Weapon expert',category: 'lesser', pp_cost: 200, effect_key: 'flag', effect_value: 1, sort: 4 },

    // Greater
    { name: 'Chromatic resistance', category: 'greater', pp_cost: 400, effect_key: 'flag', effect_value: 1, sort: 1 },
    { name: 'Skilldamage',          category: 'greater', pp_cost: 400, effect_key: 'flag', effect_value: 1, sort: 2 },
    { name: 'Spelldamage',          category: 'greater', pp_cost: 400, effect_key: 'flag', effect_value: 1, sort: 3 },
    { name: 'Steelmind',            category: 'greater', pp_cost: 400, effect_key: 'flag', effect_value: 1, sort: 4 },
    { name: 'Weapon master',        category: 'greater', pp_cost: 400, effect_key: 'flag', effect_value: 1, sort: 5 },
];

async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database,
    });
    for (const w of WISHES) {
        await db.query(
            `INSERT INTO game_wishes (name, category, tp_cost, effect_key, effect_value, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE category=VALUES(category), tp_cost=VALUES(tp_cost),
               effect_key=VALUES(effect_key), effect_value=VALUES(effect_value), sort_order=VALUES(sort_order)`,
            [w.name, w.category, w.tp_cost, w.effect_key, w.effect_value, w.sort]);
    }
    for (const b of BOONS) {
        await db.query(
            `INSERT INTO game_boons (name, category, pp_cost, effect_key, effect_value, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE category=VALUES(category), pp_cost=VALUES(pp_cost),
               effect_key=VALUES(effect_key), effect_value=VALUES(effect_value), sort_order=VALUES(sort_order)`,
            [b.name, b.category, b.pp_cost, b.effect_key, b.effect_value, b.sort]);
    }
    console.log(`[seed] ${WISHES.length} wishes, ${BOONS.length} boons`);
    await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
