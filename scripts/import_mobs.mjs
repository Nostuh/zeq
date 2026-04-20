#!/usr/bin/env node
// Import EQ mob data from docs/Zombiemud.pdf into the mob_* tables.
// Uses pdftotext (poppler-utils) for text extraction and pdfimages for images.
// Idempotent: skips mobs that already exist by name.
//
// Strategy: ALL text goes into `notes`. Directions are extracted as a bonus
// into the `directions` field when detected. Everything else is manual cleanup.
//
// Usage: node scripts/import_mobs.mjs [--force]

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dbs from '../api/db.mjs';

const zeq = dbs.get('zeq');
const PDF_PATH = path.resolve('docs/Zombiemud.pdf');
const UPLOAD_ROOT = '/srv/zeq/api/uploads/mobs';
const FORCE = process.argv.includes('--force');

// --- Extract text from PDF ---
function extractText() {
    console.log('[import] Extracting text from PDF...');
    return execSync(`pdftotext "${PDF_PATH}" -`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
}

// --- Detect a new mob entry ---
// OneNote exports each mob page as:
//   <Title>
//   <Day>, <Month> <DD>, <YYYY>        (blank lines may separate)
//   <HH:MM AM/PM>
//
// We require: the FIRST non-empty line after the candidate must be a
// full date, and the NEXT non-empty after that must be a time. This
// avoids matching random text that just happens to sit above a page
// break with a date on the next page.
function detectMobStart(lines, idx) {
    const name = lines[idx].trim();
    if (!name || name.length < 2) return null;

    // Hard reject patterns that are never mob names
    if (name.length > 90) return null;
    if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/i.test(name)) return null;
    if (/^\d+:\d+\s*(AM|PM)?$/i.test(name)) return null;
    if (/^EQ Mobs Page/i.test(name)) return null;
    if (/^(Quests Page|Token Mobs)/i.test(name)) return null;
    if (/^[^a-zA-Z]/.test(name)) return null;           // must start with a letter
    if (name.includes(';') && name.includes(' ')) return null;  // direction lines
    if (/^[a-z]/.test(name) && name.length > 20) return null;  // sentence fragments

    // Find first non-empty line after name
    let j = idx + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j >= lines.length) return null;
    const dateLine = lines[j].trim();
    // Must be "Dayname, Month DD, YYYY"
    if (!/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\w+\s+\d{1,2},\s+\d{4}$/i.test(dateLine)) return null;

    // Find next non-empty line — must be time
    let k = j + 1;
    while (k < lines.length && !lines[k].trim()) k++;
    if (k >= lines.length) return null;
    const timeLine = lines[k].trim();
    if (!/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(timeLine)) return null;

    // Return the index to start reading content from (after the time)
    return { name, contentStart: k + 1 };
}

// --- Split text into mob entries ---
// Each mob entry in the OneNote export starts with: Name\nDay, Date\nTime
// We merge continuation pages into the same mob — any content between two
// detected mob headers belongs to the previous mob.
function splitIntoMobs(text) {
    const lines = text.split('\n');
    const mobs = [];
    let current = null;
    let inEqSection = false;
    let pastResistTable = false;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        // Track section boundaries
        if (/^EQ Mobs Page \d+$/.test(trimmed)) {
            const pageNum = parseInt(trimmed.match(/\d+/)[0], 10);
            inEqSection = true;
            if (pageNum >= 3) pastResistTable = true;
            continue;
        }
        if (/^(Quests Page|Token Mobs)/.test(trimmed)) {
            if (current) mobs.push(current);
            break;
        }
        if (!inEqSection || !pastResistTable) continue;

        // Try to detect a new mob entry at this line
        const det = detectMobStart(lines, i);
        if (det) {
            if (current) mobs.push(current);
            current = { name: det.name, lines: [] };
            i = det.contentStart - 1; // -1 because for loop increments
            continue;
        }

        // Accumulate content into current mob
        if (current) {
            current.lines.push(lines[i]);
        }
    }
    if (current) mobs.push(current);
    return mobs;
}

// --- Extract directions from content ---
// Lines with compass-semicolon patterns like "6 e;17 n;forest;4 s;sw;n;well"
function extractDirections(contentLines) {
    const dirLines = [];
    const dirBackLines = [];
    let inBack = false;

    for (const line of contentLines) {
        const trimmed = line.trim();
        if (!trimmed) { inBack = false; continue; }

        if (/^back\s*:/i.test(trimmed)) {
            inBack = true;
            const rest = trimmed.replace(/^back\s*:\s*/i, '').trim();
            if (rest && rest.includes(';')) dirBackLines.push(rest);
            continue;
        }

        // Detect direction lines: must have semicolons + compass words
        const hasCompass = /(?:^|\d\s*)[nsewud](?:\s*;|$)/i.test(trimmed);
        const hasSemicolons = (trimmed.match(/;/g) || []).length >= 2;
        if (hasCompass && hasSemicolons) {
            if (inBack) {
                dirBackLines.push(trimmed);
            } else {
                dirLines.push(trimmed);
            }
            continue;
        }

        // "From cs go:" prefix line
        if (/^From cs\b/i.test(trimmed)) {
            // Next line is probably the direction
            continue;
        }

        inBack = false;
    }

    return {
        directions: dirLines.length ? dirLines.join('\n') : null,
        directions_back: dirBackLines.length ? dirBackLines.join('\n') : null,
    };
}

// --- Extract loot from content ---
function extractLoot(contentLines) {
    const items = [];
    let inDrops = false;

    for (const line of contentLines) {
        const trimmed = line.trim();
        if (!trimmed) { inDrops = false; continue; }

        if (/^(Drops|Loots)\s*:/i.test(trimmed)) {
            inDrops = true;
            continue;
        }

        // Bullet-pointed items
        if (/^[\u2022\-\*]\s/.test(trimmed)) {
            const item = trimmed.replace(/^[\u2022\-\*]\s*/, '').trim();
            const slotMatch = item.match(/^([\w\s]+?):\s*(.+)/);
            if (slotMatch) {
                items.push({ item_name: slotMatch[2].trim().replace(/\.$/, ''), slot: guessSlot(slotMatch[1].trim()) });
            } else {
                items.push({ item_name: item.replace(/\.$/, ''), slot: guessSlot(item) });
            }
            continue;
        }

        // Lines after "Drops:" that look like item names (short, no semicolons)
        if (inDrops && trimmed.length < 80 && !trimmed.includes(';') && !/^\d/.test(trimmed)) {
            items.push({ item_name: trimmed.replace(/\.$/, ''), slot: guessSlot(trimmed) });
            continue;
        }

        if (inDrops) inDrops = false;
    }
    return items;
}

const SLOT_KEYWORDS = {
    'amulet': 'amulet', 'necklace': 'amulet',
    'cloak': 'cloak',
    'torso': 'torso', 'body': 'torso', 'chest': 'torso', 'brigandine': 'torso', 'robe': 'torso',
    'legs': 'legs', 'leggings': 'legs',
    'feet': 'feet', 'boots': 'feet',
    'head': 'head', 'helm': 'head', 'helmet': 'head',
    'arms': 'arms', 'armguard': 'arms', 'armwrap': 'arms',
    'hands': 'hands', 'gloves': 'hands', 'gauntlet': 'hands',
    'finger': 'finger', 'ring': 'finger', 'right finger': 'finger', 'left finger': 'finger',
    'wielded': 'weapon', 'weapon': 'weapon', 'sword': 'weapon', 'axe': 'weapon',
    'scythe': 'weapon', 'whip': 'weapon', 'dagger': 'weapon', 'staff': 'weapon',
    'shield': 'shield',
    'belt': 'belt', 'sash': 'belt',
    'light': 'light',
};

function guessSlot(text) {
    const lower = (text || '').toLowerCase();
    for (const [kw, slot] of Object.entries(SLOT_KEYWORDS)) {
        if (lower.includes(kw)) return slot;
    }
    return null;
}

// --- Extract images from PDF ---
function extractImages() {
    console.log('[import] Extracting images from PDF...');
    const imgDir = '/tmp/mob_imgs';
    fs.mkdirSync(imgDir, { recursive: true });
    for (const f of fs.readdirSync(imgDir)) fs.unlinkSync(path.join(imgDir, f));

    try {
        execSync(`pdfimages -j "${PDF_PATH}" "${imgDir}/img"`, { encoding: 'utf8' });
    } catch (e) {
        console.warn('[import] pdfimages failed:', e.message);
        return [];
    }

    const listOutput = execSync(`pdfimages -list "${PDF_PATH}"`, { encoding: 'utf8' });
    const imgInfo = [];
    for (const line of listOutput.split('\n').slice(2)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const pageNum = parseInt(parts[0], 10);
        const imgNum = parseInt(parts[1], 10);
        const type = parts[2];
        const width = parseInt(parts[3], 10);
        const height = parseInt(parts[4], 10);
        if (isNaN(pageNum) || isNaN(imgNum)) continue;
        if (type === 'smask' || width < 50 || height < 50) continue;
        const prefix = `img-${String(imgNum).padStart(3, '0')}`;
        const candidates = fs.readdirSync(imgDir).filter(f => f.startsWith(prefix));
        if (candidates.length) {
            imgInfo.push({ pageNum, imgNum, width, height, file: path.join(imgDir, candidates[0]) });
        }
    }
    console.log(`[import] Found ${imgInfo.length} usable images in PDF`);
    return imgInfo;
}

// --- Parse kya results from the Quests section ---
function parseKyaResults(text) {
    const kyaMap = {};
    const nameRe = /kya results from (.+)/;
    let currentMob = null;

    for (const line of text.split('\n')) {
        const nameMatch = line.match(nameRe);
        if (nameMatch) {
            currentMob = nameMatch[1].trim();
            if (!kyaMap[currentMob]) kyaMap[currentMob] = {};
            continue;
        }
        if (!currentMob) continue;
        const kyaMatch = line.match(/\[party\]:\s*(.+)/);
        if (!kyaMatch) continue;
        const pairs = kyaMatch[1].trim().matchAll(/(\w+)\s+(\d+)/g);
        for (const [, dtype, val] of pairs) {
            const normalized = normalizeKyaDamageType(dtype);
            if (normalized) kyaMap[currentMob][normalized] = parseInt(val, 10);
        }
    }
    return kyaMap;
}

function normalizeKyaDamageType(raw) {
    const map = {
        'acid': 'acid', 'asph': 'asphyxiation', 'asphyx': 'asphyxiation',
        'phys': 'physical', 'cold': 'cold', 'pois': 'poison',
        'psio': 'psionic', 'psi': 'psionic', 'fire': 'fire',
        'elec': 'electric', 'magi': 'magical', 'mag': 'magical',
    };
    return map[raw.toLowerCase()] || null;
}

// --- Main import ---
async function main() {
    console.log('[import] Starting mob import from PDF...');

    if (FORCE) {
        console.log('[import] --force: clearing existing mob data...');
        await zeq.query(`DELETE FROM mob_monsters`);
        if (fs.existsSync(UPLOAD_ROOT)) {
            fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
        }
    }

    const text = extractText();
    const kyaMap = parseKyaResults(text);
    const mobEntries = splitIntoMobs(text);
    const images = extractImages();

    console.log(`[import] Parsed ${mobEntries.length} mob entries from PDF`);
    console.log(`[import] Found ${Object.keys(kyaMap).length} mobs with kya results`);

    let imported = 0, skipped = 0;
    const warnings = [];
    const pageMobs = [];

    for (const entry of mobEntries) {
        const name = entry.name;
        const contentLines = entry.lines;
        // ALL text goes into notes
        const allText = contentLines.join('\n').trim();

        // Bonus: try to extract directions
        const { directions, directions_back } = extractDirections(contentLines);

        // Bonus: extract loot
        const lootItems = extractLoot(contentLines);

        // Detect flags
        const is_undead = /\bundead\b/i.test(allText) ? 1 : 0;
        const is_aggro = /\bagro\b|\baggro\b|\baggressive\b/i.test(allText) ? 1 : 0;

        // Try to extract exp value
        let exp_value = null;
        const expMatch = allText.match(/(\d{4,})\s*:\s*\S/);
        if (expMatch) exp_value = parseInt(expMatch[1], 10);
        if (!exp_value) {
            const expMatch2 = allText.match(/(\d+(?:\.\d+)?)\s*[Mm]\s*(mob|xp|exp)?/i);
            if (expMatch2) exp_value = Math.round(parseFloat(expMatch2[1]) * 1000000);
        }

        // Check if already exists
        const existing = await zeq.query(`SELECT id FROM mob_monsters WHERE name = @xn`, { xn: name });
        if (existing.length) { skipped++; continue; }

        try {
            // GOTCHA: param names must not be substrings of each other
            const r = await zeq.query(
                `INSERT INTO mob_monsters (name, short_name, area, exp_value, is_undead, is_aggro,
                    directions, directions_back, kill_strategy, notes, version,
                    created_by, updated_by, created, updated)
                 VALUES (@xn, @xs, @xa, @xe, @xu, @xg,
                    @xd, @xr, @xk, @xo, 1,
                    NULL, NULL, NOW(), NOW())`,
                {
                    xn: name,
                    xs: null,
                    xa: null,
                    xe: exp_value,
                    xu: is_undead,
                    xg: is_aggro,
                    xd: directions,
                    xr: directions_back,
                    xk: null,
                    xo: allText || null,
                });
            const mobId = r.insertId;
            pageMobs.push({ mobId, name });

            // Insert kya resistances
            let kyaData = kyaMap[name];
            if (!kyaData) {
                for (const [kyaName, data] of Object.entries(kyaMap)) {
                    if (name.toLowerCase().includes(kyaName.toLowerCase()) ||
                        kyaName.toLowerCase().includes(name.toLowerCase())) {
                        kyaData = data;
                        break;
                    }
                }
            }
            if (kyaData) {
                for (const [dtype, val] of Object.entries(kyaData)) {
                    await zeq.query(
                        `INSERT INTO mob_resistances (mob_id, damage_type, value, notes)
                         VALUES (@id, @dt, @vl, NULL)`,
                        { id: mobId, dt: dtype, vl: val });
                }
            }

            // Insert loot
            let sortIdx = 0;
            for (const item of lootItems) {
                sortIdx++;
                await zeq.query(
                    `INSERT INTO mob_loot (mob_id, item_name, slot, sort_order)
                     VALUES (@id, @it, @sl, @so)`,
                    { id: mobId, it: item.item_name, sl: item.slot, so: sortIdx });
            }

            // History
            await zeq.query(
                `INSERT INTO mob_history (mob_id, user_name, user_id, action, section, diff_json, snapshot, created)
                 VALUES (@id, 'init', NULL, 'create', 'info', NULL, @sn, NOW())`,
                { id: mobId, sn: JSON.stringify({ name, source: 'pdf_import' }) });

            imported++;
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                skipped++;
                warnings.push(`[warn] Duplicate: ${name}`);
            } else {
                warnings.push(`[error] Failed "${name}": ${e.message}`);
            }
        }
    }

    // Assign images to mobs by order (rough proximity)
    if (images.length && pageMobs.length) {
        console.log(`[import] Assigning ${images.length} images to mobs...`);
        for (const img of images) {
            // Simple: assign to nearest mob by index ratio
            const ratio = img.pageNum / 400; // ~400 PDF pages total
            const mobIdx = Math.min(Math.floor(ratio * pageMobs.length), pageMobs.length - 1);
            const bestMob = pageMobs[mobIdx];
            if (!bestMob) continue;

            const destDir = path.join(UPLOAD_ROOT, String(bestMob.mobId));
            fs.mkdirSync(destDir, { recursive: true });
            const ext = img.file.endsWith('.png') ? 'png' : 'jpg';
            const buf = fs.readFileSync(img.file);
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            const stored = `1_${crypto.randomBytes(4).toString('hex')}.${ext}`;
            fs.writeFileSync(path.join(destDir, stored), buf);
            const relPath = `${bestMob.mobId}/${stored}`;

            await zeq.query(
                `INSERT INTO mob_images (mob_id, section, filename, mime_type, size_bytes, path, caption, sort_order, created)
                 VALUES (@id, 'general', @fn, @mi, @sz, @pa, @ca, 0, NOW())`,
                {
                    id: bestMob.mobId,
                    fn: `pdf_page_${img.pageNum}.${ext}`,
                    mi: mime,
                    sz: buf.length,
                    pa: relPath,
                    ca: `Extracted from PDF page ${img.pageNum}`,
                });
            console.log(`  Image PDF page ${img.pageNum} -> ${bestMob.name}`);
        }
    }

    console.log('\n=== Import Summary ===');
    console.log(`Imported: ${imported}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Warnings: ${warnings.length}`);
    if (warnings.length) {
        for (const w of warnings.slice(0, 30)) console.log('  ' + w);
        if (warnings.length > 30) console.log(`  ... and ${warnings.length - 30} more`);
    }
    process.exit(0);
}

main().catch(e => { console.error('[import] Fatal:', e); process.exit(1); });
