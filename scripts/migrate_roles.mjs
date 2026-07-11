#!/usr/bin/env node
// One-shot, idempotent migration from the legacy role model
// (users.role ∈ {viewer,editor,admin} + user_roles ∈ {eq_viewer,eq_editor})
// to the flag model (users.role ∈ {viewer,admin} + user_roles capability
// flags). See docs/auth.md. Chosen policy: PRESERVE current access.
//
//   viewer/editor/admin roles                stay as the DB has them until step 4
//   eq_viewer                             → eqmobs
//   eq_editor                             → eqmobs + eqmobs_edit
//   role='editor'                         → planner_admin flag, role downgraded to viewer
//   every active non-admin user           → equipment + equipment_edit + lookups
//                                           (today ANY logged-in user can reach
//                                            those areas, so this is lossless)
//   role='admin'                          → unchanged (admin implies every flag)
//
// Idempotent: INSERT IGNORE against the (user_id, role) PK and guarded
// UPDATEs mean re-running is a no-op. The first --apply run snapshots the
// pristine state into *_premigration tables; later runs leave them intact.
//
//   node migrate_roles.mjs            # DRY-RUN: report only, write nothing
//   node migrate_roles.mjs --apply    # back up, then migrate

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/classes/config.json'), 'utf8')).zeq;
const APPLY = process.argv.includes('--apply');

// Capability flags granted to every active non-admin account so nobody
// loses the equipment/lookups access they have today.
const BROAD_FLAGS = ['equipment', 'equipment_edit', 'lookups'];

async function main() {
    const db = await mysql.createConnection({
        host: CONFIG.host, user: CONFIG.user, password: CONFIG.password,
        database: CONFIG.database, charset: 'utf8mb4', multipleStatements: false,
    });
    const q = async (sql) => (await db.query(sql))[0];
    const scalar = async (sql) => Object.values((await q(sql))[0])[0];

    console.log(`\n=== role → flag migration (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

    // --- Report the work each step would do (read-only) ---
    const eqViewer = await scalar(`SELECT COUNT(*) c FROM user_roles WHERE role='eq_viewer'`);
    const eqEditor = await scalar(`SELECT COUNT(*) c FROM user_roles WHERE role='eq_editor'`);
    const editors  = await scalar(`SELECT COUNT(*) c FROM users WHERE role='editor'`);
    const broadTargets = await scalar(
        `SELECT COUNT(*) c FROM users WHERE active=1 AND role<>'admin'`);
    const admins = await scalar(`SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1`);

    console.log(`  eq_viewer rows → eqmobs .................. ${eqViewer}`);
    console.log(`  eq_editor rows → eqmobs + eqmobs_edit ... ${eqEditor}`);
    console.log(`  editor accounts → planner_admin (→viewer) ${editors}`);
    console.log(`  active non-admin users → ${BROAD_FLAGS.join(', ')}`);
    console.log(`      (${broadTargets} user(s))`);
    console.log(`  active admins (unchanged, implicit all) . ${admins}`);

    if (!APPLY) {
        console.log(`\nDRY-RUN — nothing written. Re-run with --apply to migrate.\n`);
        await db.end();
        return;
    }

    // --- 1. Snapshot pristine state (first apply only) ---
    const hasBackup = await scalar(
        `SELECT COUNT(*) c FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = 'user_roles_premigration'`);
    if (hasBackup) {
        console.log(`\n[backup] *_premigration tables already exist — keeping them.`);
    } else {
        await q(`CREATE TABLE user_roles_premigration LIKE user_roles`);
        await q(`INSERT INTO user_roles_premigration SELECT * FROM user_roles`);
        await q(`CREATE TABLE users_role_premigration (
                     id INT PRIMARY KEY, role VARCHAR(16), active TINYINT(1))`);
        await q(`INSERT INTO users_role_premigration (id, role, active)
                 SELECT id, role, active FROM users`);
        console.log(`\n[backup] snapshotted user_roles + users.role into *_premigration tables.`);
    }

    // --- 2. Migrate inside a transaction ---
    await db.beginTransaction();
    try {
        // eq_viewer / eq_editor → eqmobs / eqmobs_edit
        await q(`INSERT IGNORE INTO user_roles (user_id, role)
                 SELECT user_id, 'eqmobs' FROM user_roles WHERE role IN ('eq_viewer','eq_editor')`);
        await q(`INSERT IGNORE INTO user_roles (user_id, role)
                 SELECT user_id, 'eqmobs_edit' FROM user_roles WHERE role='eq_editor'`);
        await q(`DELETE FROM user_roles WHERE role IN ('eq_viewer','eq_editor')`);

        // editors → planner_admin flag
        await q(`INSERT IGNORE INTO user_roles (user_id, role)
                 SELECT id, 'planner_admin' FROM users WHERE role='editor'`);

        // active non-admins → equipment + equipment_edit + lookups
        for (const flag of BROAD_FLAGS) {
            await q(`INSERT IGNORE INTO user_roles (user_id, role)
                     SELECT id, '${flag}' FROM users WHERE active=1 AND role<>'admin'`);
        }

        // editor role is retired — collapse to viewer now that the flag is set
        await q(`UPDATE users SET role='viewer' WHERE role='editor'`);

        await db.commit();
        console.log(`[migrate] committed.`);
    } catch (e) {
        await db.rollback();
        console.error(`[migrate] ROLLED BACK:`, e.message);
        await db.end();
        process.exit(1);
    }

    // --- 3. Report resulting distribution ---
    const dist = await q(`SELECT role, COUNT(*) c FROM user_roles GROUP BY role ORDER BY role`);
    console.log(`\n[result] user_roles flag distribution:`);
    for (const r of dist) console.log(`    ${r.role.padEnd(16)} ${r.c}`);
    const roleDist = await q(`SELECT role, COUNT(*) c FROM users GROUP BY role ORDER BY role`);
    console.log(`[result] users.role distribution:`);
    for (const r of roleDist) console.log(`    ${(r.role || '(null)').padEnd(16)} ${r.c}`);
    console.log(`\nMigration complete. Backup in user_roles_premigration / users_role_premigration.\n`);

    await db.end();
}

main().catch((e) => { console.error(e); process.exit(2); });
