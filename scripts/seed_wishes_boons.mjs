#!/usr/bin/env node
// Seed wishes + boons based on the decompiled Zcreator C# reference and,
// for boons, the live game's `list` / `booncost` / `info` output (which
// is the actual source of truth for what boons exist and what they do).
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
// Sourced directly from the live `booncost` / `list <cat>` / `info <cat> N`
// game commands. Five categories match what `list` reports: racial,
// power, minor, lesser, greater. PP costs are the level-1 costs shown
// by `booncost`:
//   lesser level 1  = 100 PP
//   greater level 1 = 200 PP
// racial is 50 PP (Human is 77 PP). power damage types are 50 PP;
// power weapon proficiencies are 75 PP. minor is 100 PP (Mystic
// prowess is 250 PP). Descriptions are copied verbatim from
// `info <cat> N`.
const BOONS = [
    // Racial — 16 real ZombieMUD races (Human is 77 PP, all others 50 PP).
    { name: 'Boon of Devil',           category: 'racial', pp_cost: 50, sort: 1,
      description: 'Exprate: +5%\nStrength: +3%\nHP regen: +8\nSP regen: +8\nSword proficiency: +10%\nFire damage: +5%\nNo water allergy' },
    { name: 'Boon of Dwarf',           category: 'racial', pp_cost: 50, sort: 2,
      description: 'Exprate: +10%\nStrength: +10%\nDexterity: +10%\nConstitution: +10%\nHP regen: +25\nAxe proficiency: +25%' },
    { name: 'Boon of Elf',             category: 'racial', pp_cost: 50, sort: 3,
      description: 'Exprate: +10%\nStrength: +8%\nDexterity: +8%\nConstitution: +8%\nSP regen: +15\nMagical damage: +15%' },
    { name: 'Boon of Ghast',           category: 'racial', pp_cost: 50, sort: 4,
      description: 'Exprate: +15%\nAll stats: +6%\nAll regen: +40\nSpellmax: +5%\nFurther increased sword and dagger proficiency.\nMagical damage: +20%' },
    { name: 'Boon of Ghoul',           category: 'racial', pp_cost: 50, sort: 5,
      description: 'Exprate: +10%\nStrength: +15%\nDexterity: +15%\nHP regen: +50\nSpellmax: +15%\nGreatly increased armour class.\nGreatly increased unarmed proficiency.\nCold damage: +20%\nElectric damage: +20%' },
    { name: 'Boon of Gnome',           category: 'racial', pp_cost: 50, sort: 6,
      description: 'Exprate: +10%\nWisdom: +15%\nCharisma: +15%\nSP regen: +20\nIncreased staff proficiency: +15%\nIncreased bludgeon proficiency: +15%\nMagical damage: +10%\nElectric damage: +10%' },
    { name: 'Boon of Highland dwarf',  category: 'racial', pp_cost: 50, sort: 7,
      description: 'Exprate: +10%\nStrength: +5%\nDexterity: +5%\nHP regen: +20\nAmbidexterity\nTrue seeing' },
    { name: 'Boon of Human',           category: 'racial', pp_cost: 77, sort: 8,
      description: 'Exprate: +7%\nAll stats: +7%\nAll regen: +7\nAmbidexterity' },
    { name: 'Boon of Kobold',          category: 'racial', pp_cost: 50, sort: 9,
      description: 'Dexterity: +10%\nWisdom: +10%\nAll maxes: +10%\nAll regen: +20\nAll resist: +3%\nGreat stamina.\nFurther increased staff and bludgeon proficiency.' },
    { name: 'Boon of Melarni',         category: 'racial', pp_cost: 50, sort: 10,
      description: 'Exprate: +10%\nAll stats: +6%\nAll regen: +6\nFurther increased sword proficiency.\nFurther increased ancient proficiency.' },
    { name: 'Boon of Mind flayer',     category: 'racial', pp_cost: 50, sort: 11,
      description: 'Exprate: +10%\nConstitution: +10%\nCharisma: +25%\nSP regen: +20\nPhysical resistance: +10%\nPsionic damage: +20%\nNo song penalty' },
    { name: 'Boon of Mountain dwarf',  category: 'racial', pp_cost: 50, sort: 12,
      description: 'Exprate: +10%\nStrength: +10%\nDexterity: +10%\nHP regen: +20\nPhysical resistance: +5%\nIncreased armour class.\nNo outdoor penalty.' },
    { name: 'Boon of Revenant',        category: 'racial', pp_cost: 50, sort: 13,
      description: 'Exprate: +5%\nStrength: +5%\nConstitution: +10%\nSpellmax: +20%\nHP regen: +50\nPhysical resistance: +5%\nIncreased armour class.\nFurther increased weapon proficiencies.\nNo sunlight allergy.' },
    { name: 'Boon of Sea elf',         category: 'racial', pp_cost: 50, sort: 14,
      description: 'Exprate: +10%\nStrength: +10%\nDexterity: +10%\nConstitution: +10%\nAll regen: +10\nPhysical resistance: +5%\nMagical resistance: +5%\nAsphyxiation damage: +15%\nCold damage: +15%' },
    { name: 'Boon of Wolfman',         category: 'racial', pp_cost: 50, sort: 15,
      description: 'Exprate: +10%\nStrength: +15%\nDexterity: +15%\nHP regen: +25\nSword proficiency: +15%\nAncient proficiency: +15%\nCold damage: +15%\nFire damage: +15%\nAcid damage: +15%' },
    { name: 'Boon of Wood elf',        category: 'racial', pp_cost: 50, sort: 16,
      description: 'Exprate: +10%\nConstitution: +10%\nDexterity: +20%\nGreat stamina.\nMagical damage: +15%\nFurther increased staff proficiency.\nFurther increased bow proficiency.' },

    // Power — damage types at 50 PP, weapon proficiencies at 75 PP.
    { name: 'Acid damage',          category: 'power', pp_cost: 50, sort: 1,
      description: 'Improves the ability to deal acid damage.' },
    { name: 'Ancient proficiency',  category: 'power', pp_cost: 75, sort: 2,
      description: 'Improves damage of skills and spells when wielding an ancient in the right hand or both hands.' },
    { name: 'Asphyxiation damage',  category: 'power', pp_cost: 50, sort: 3,
      description: 'Improves the ability to deal asphyxiation damage.' },
    { name: 'Axe proficiency',      category: 'power', pp_cost: 75, sort: 4,
      description: 'Improves damage of skills and spells when wielding an ax in the right hand or both hands.' },
    { name: 'Bludgeon proficiency', category: 'power', pp_cost: 75, sort: 5,
      description: 'Improves damage of skills and spells when wielding a bludgeon in the right hand or both hands.' },
    { name: 'Cold damage',          category: 'power', pp_cost: 50, sort: 6,
      description: 'Improves the ability to deal cold damage.' },
    { name: 'Dagger proficiency',   category: 'power', pp_cost: 75, sort: 7,
      description: 'Improves damage of skills and spells when wielding a dagger in the right hand or both hands.' },
    { name: 'Electric damage',      category: 'power', pp_cost: 50, sort: 8,
      description: 'Improves the ability to deal electric damage.' },
    { name: 'Fire damage',          category: 'power', pp_cost: 50, sort: 9,
      description: 'Improves the ability to deal fire damage.' },
    { name: 'Magical damage',       category: 'power', pp_cost: 50, sort: 10,
      description: 'Improves the ability to deal magical damage.' },
    { name: 'Poison damage',        category: 'power', pp_cost: 50, sort: 11,
      description: 'Improves the ability to deal poison damage.' },
    { name: 'Polearm proficiency',  category: 'power', pp_cost: 75, sort: 12,
      description: 'Improves damage of skills and spells when wielding a polearm in the right hand or both hands.' },
    { name: 'Psionic damage',       category: 'power', pp_cost: 50, sort: 13,
      description: 'Improves the ability to deal psionic damage.' },
    { name: 'Staff proficiency',    category: 'power', pp_cost: 75, sort: 14,
      description: 'Improves damage of skills and spells when wielding a staff in the right hand or both hands.' },
    { name: 'Sword proficiency',    category: 'power', pp_cost: 75, sort: 15,
      description: 'Improves damage of skills and spells when wielding a sword in the right hand or both hands.' },

    // Minor — 100 PP each, except Mystic prowess which is 250 PP.
    { name: 'Anatomy',               category: 'minor', pp_cost: 100, sort: 1,
      description: "This boon teaches the skill 'anatomy'." },
    { name: 'Boon of boxes',         category: 'minor', pp_cost: 100, sort: 2,
      description: 'Increases the amount of boxes dropped by monsters.' },
    { name: 'Boon of fragments',     category: 'minor', pp_cost: 100, sort: 3,
      description: 'Increases the amount of fragments dropped by monsters.' },
    { name: 'Boon of gold',          category: 'minor', pp_cost: 100, sort: 4,
      description: 'Increases the amount of gold dropped by monsters.' },
    { name: 'Boon of scrolls',       category: 'minor', pp_cost: 100, sort: 5,
      description: 'Increases the amount of scrolls dropped by monsters.' },
    { name: 'Defend',                category: 'minor', pp_cost: 100, sort: 6,
      description: "This boon teaches the skill 'defend'." },
    { name: 'Mystic prowess',        category: 'minor', pp_cost: 250, sort: 7,
      description: 'Increases the nonphysical percentage of samurai and monk weapons.' },
    { name: 'Offensive efficiency',  category: 'minor', pp_cost: 100, sort: 8,
      description: "This boon teaches the skill 'offensive efficiency'." },
    { name: 'Parry',                 category: 'minor', pp_cost: 100, sort: 9,
      description: "This boon teaches the skill 'parry'." },
    { name: 'Resurrect',             category: 'minor', pp_cost: 100, sort: 10,
      description: "This boon teaches the spell 'resurrect'." },
    { name: 'Spot weakness',         category: 'minor', pp_cost: 100, sort: 11,
      description: "This boon teaches the skill 'spot weakness'." },
    { name: 'Stun resistance',       category: 'minor', pp_cost: 100, sort: 12,
      description: "This boon teaches the spell 'stun resistance'." },
    { name: 'Summon bag of holding', category: 'minor', pp_cost: 100, sort: 13,
      description: "This boon teaches the spell 'summon bag of holding'." },

    // Lesser — 100 PP for level 1 per `booncost`.
    { name: 'Boneskull',             category: 'lesser', pp_cost: 100, sort: 1,
      description: 'Decreases the chance to get stunned.' },
    { name: 'Lesser caster focus',   category: 'lesser', pp_cost: 100, sort: 2,
      description: 'Increases spell damage with a cost to strength and dexterity.' },
    { name: 'Lesser hitter focus',   category: 'lesser', pp_cost: 100, sort: 3,
      description: 'Increases skill damage with a cost to intelligence and wisdom.' },
    { name: 'Lesser party critical', category: 'lesser', pp_cost: 100, sort: 4,
      description: 'Increases the chance of critical hits in parties.' },
    { name: 'Regeneration',          category: 'lesser', pp_cost: 100, sort: 5,
      description: 'Increases health regeneration.' },
    { name: 'Restoration',           category: 'lesser', pp_cost: 100, sort: 6,
      description: 'Increases spellpoint regeneration.' },
    { name: 'Weapon expert',         category: 'lesser', pp_cost: 100, sort: 7,
      description: 'Increases the rate of weapon familiarity gain.' },

    // Greater — 200 PP for level 1 per `booncost`.
    { name: 'Chromatic resistance',  category: 'greater', pp_cost: 200, sort: 1,
      description: 'Increases resistance against all types of damage.' },
    { name: 'Greater caster focus',  category: 'greater', pp_cost: 200, sort: 2,
      description: 'Greatly increases spell damage with a cost to strength and dexterity.' },
    { name: 'Greater hitter focus',  category: 'greater', pp_cost: 200, sort: 3,
      description: 'Greatly increases skill damage with a cost to intelligence and wisdom.' },
    { name: 'Greater party critical',category: 'greater', pp_cost: 200, sort: 4,
      description: 'Greatly increases the chance of critical hits in parties.' },
    { name: 'Skilldamage',           category: 'greater', pp_cost: 200, sort: 5,
      description: 'Increases the damage of skills.' },
    { name: 'Spelldamage',           category: 'greater', pp_cost: 200, sort: 6,
      description: 'Increases the damage of spells.' },
    { name: 'Steelmind',             category: 'greater', pp_cost: 200, sort: 7,
      description: 'Greatly decreases the chance to get stunned.' },
    { name: 'Weapon master',         category: 'greater', pp_cost: 200, sort: 8,
      description: 'Greatly increases the rate of weapon familiarity gain.' },
];

// Legacy boon names from earlier (pre-game-verification) seeds that are
// NOT present in the live game's `list` output. Removed on each run so
// the planner stays in sync. Safe because no saved reincs referenced
// any boon ids at the time this cleanup was added.
const BOONS_TO_DELETE = [
    'Boon of Catfolk', 'Boon of Cromagnon', 'Boon of Cyclops',
    'Boon of Djinni', 'Boon of Drow',
    'Bag of holding',
];

async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database,
    });
    // Ensure description column exists on game_boons. Older installs
    // didn't have it; we thread per-boon game-verified info text through
    // this column so the planner UI can show the same copy as `info`.
    await db.query(`ALTER TABLE game_boons ADD COLUMN IF NOT EXISTS description MEDIUMTEXT NULL`);

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
            `INSERT INTO game_boons (name, category, pp_cost, effect_key, effect_value, sort_order, description)
             VALUES (?, ?, ?, 'flag', 1, ?, ?)
             ON DUPLICATE KEY UPDATE category=VALUES(category), pp_cost=VALUES(pp_cost),
               effect_key=VALUES(effect_key), effect_value=VALUES(effect_value),
               sort_order=VALUES(sort_order), description=VALUES(description)`,
            [b.name, b.category, b.pp_cost, b.sort, b.description || null]);
    }
    for (const name of BOONS_TO_DELETE) {
        await db.query(`DELETE FROM game_boons WHERE name = ?`, [name]);
    }
    console.log(`[seed] ${WISHES.length} wishes, ${BOONS.length} boons, ${BOONS_TO_DELETE.length} legacy boons pruned`);
    await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
