// Game-data API: races, guilds, skills, spells, costs.
// GET endpoints: require viewer+ (any authenticated user).
// Mutations: require editor+.

import express from 'express';
import dbs from '../../db.mjs';
import { requireEditor } from './auth.mjs';

// GET endpoints on game data are public — the reinc planner at `/reinc`
// is available to anonymous visitors. Mutations still require editor+.
const requireAuth = (req, res, next) => next();

const router = express.Router();
const zeq = dbs.get('zeq');

function fail(res, msg, code = 400) { res.status(code).json({ ok: false, error: msg }); }
const ok = (res, data) => res.json({ ok: true, data });

// ---------------- RACES ----------------
const RACE_FIELDS = [
    'name','parent_id','max_str','max_dex','max_con','max_int','max_wis','max_cha',
    'size','exp_rate','sp_regen','hp_regen','skill_max','spell_max','skill_cost','spell_cost',
    'enabled','help_text'
];

router.get('/races', requireAuth, async function(req, res) {
    const q = (req.query.q || '').trim();
    let sql = `SELECT r.*, p.name AS parent_name FROM game_races r
               LEFT JOIN game_races p ON p.id = r.parent_id`;
    const params = {};
    if (q) { sql += ` WHERE r.name LIKE @like`; params.like = `%${q}%`; }
    sql += ` ORDER BY COALESCE(p.name, r.name), r.parent_id IS NULL DESC, r.name`;
    ok(res, await zeq.query(sql, params));
});

router.get('/races/:id', requireAuth, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const rows = await zeq.query(`SELECT * FROM game_races WHERE id = @id`, { id });
    if (!rows.length) return fail(res, 'not found', 404);
    ok(res, rows[0]);
});

router.post('/races', requireEditor, async function(req, res) {
    const b = req.body || {};
    if (!b.name) return fail(res, 'name required');
    const cols = [], marks = [], params = {};
    for (const f of RACE_FIELDS) {
        if (f in b) { cols.push(f); marks.push('@' + f); params[f] = b[f]; }
    }
    try {
        const r = await zeq.query(
            `INSERT INTO game_races (${cols.join(',')}) VALUES (${marks.join(',')})`, params);
        ok(res, { id: r.insertId });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});

router.post('/races/:id', requireEditor, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const sets = [];
    const params = { id };
    for (const f of RACE_FIELDS) {
        if (f in b) { sets.push(`${f} = @${f}`); params[f] = b[f]; }
    }
    if (!sets.length) return fail(res, 'no fields');
    try {
        await zeq.query(`UPDATE game_races SET ${sets.join(', ')} WHERE id = @id`, params);
        ok(res, { id });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});

router.delete('/races/:id', requireEditor, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    await zeq.query(`UPDATE game_races SET parent_id = NULL WHERE parent_id = @id`, { id });
    await zeq.query(`DELETE FROM game_races WHERE id = @id`, { id });
    ok(res, {});
});

// ---------------- SKILLS / SPELLS (shared helpers) ----------------
function makeSimple(resource, table) {
    router.get(`/${resource}`, requireAuth, async function(req, res) {
        const q = (req.query.q || '').trim();
        let sql = `SELECT id, name, start_cost FROM ${table}`;
        const params = {};
        if (q) { sql += ` WHERE name LIKE @like`; params.like = `%${q}%`; }
        sql += ` ORDER BY name`;
        ok(res, await zeq.query(sql, params));
    });
    router.get(`/${resource}/:id`, requireAuth, async function(req, res) {
        const rows = await zeq.query(`SELECT * FROM ${table} WHERE id = @id`, { id: parseInt(req.params.id, 10) });
        if (!rows.length) return fail(res, 'not found', 404);
        ok(res, rows[0]);
    });
    router.post(`/${resource}`, requireEditor, async function(req, res) {
        const { name, start_cost = 0, help_text = null } = req.body || {};
        if (!name) return fail(res, 'name required');
        try {
            const r = await zeq.query(
                `INSERT INTO ${table} (name, start_cost, help_text) VALUES (@name, @start_cost, @help_text)`,
                { name, start_cost, help_text });
            ok(res, { id: r.insertId });
        } catch (e) { fail(res, e.sqlMessage || String(e)); }
    });
    router.post(`/${resource}/:id`, requireEditor, async function(req, res) {
        const id = parseInt(req.params.id, 10);
        const { name, start_cost, help_text } = req.body || {};
        try {
            await zeq.query(
                `UPDATE ${table} SET name = @name, start_cost = @start_cost, help_text = @help_text WHERE id = @id`,
                { id, name, start_cost, help_text });
            ok(res, { id });
        } catch (e) { fail(res, e.sqlMessage || String(e)); }
    });
    router.delete(`/${resource}/:id`, requireEditor, async function(req, res) {
        await zeq.query(`DELETE FROM ${table} WHERE id = @id`, { id: parseInt(req.params.id, 10) });
        ok(res, {});
    });
}
makeSimple('skills', 'game_skills');
makeSimple('spells', 'game_spells');

// ---------------- GUILDS ----------------
router.get('/guilds', requireAuth, async function(req, res) {
    const rows = await zeq.query(
        `SELECT g.id, g.name, g.file_name, g.parent_id, g.max_level, p.name AS parent_name
         FROM game_guilds g LEFT JOIN game_guilds p ON p.id = g.parent_id
         ORDER BY COALESCE(p.name, g.name), g.parent_id IS NULL DESC, g.name`);
    ok(res, rows);
});

router.get('/guilds/:id', requireAuth, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const gRows = await zeq.query(
        `SELECT g.*, p.name AS parent_name FROM game_guilds g
         LEFT JOIN game_guilds p ON p.id = g.parent_id
         WHERE g.id = @id`, { id });
    if (!gRows.length) return fail(res, 'not found', 404);
    const guild = gRows[0];
    const bonuses = await zeq.query(
        `SELECT id, level, bonus_name, value FROM game_guild_bonuses
         WHERE guild_id = @id ORDER BY level, bonus_name`, { id });
    const skills = await zeq.query(
        `SELECT gs.id, gs.level, gs.max_percent, s.id AS skill_id, s.name
         FROM game_guild_skills gs JOIN game_skills s ON s.id = gs.skill_id
         WHERE gs.guild_id = @id ORDER BY gs.level, s.name`, { id });
    const spells = await zeq.query(
        `SELECT gsp.id, gsp.level, gsp.max_percent, sp.id AS spell_id, sp.name
         FROM game_guild_spells gsp JOIN game_spells sp ON sp.id = gsp.spell_id
         WHERE gsp.guild_id = @id ORDER BY gsp.level, sp.name`, { id });
    const subguilds = await zeq.query(
        `SELECT id, name, max_level FROM game_guilds WHERE parent_id = @id ORDER BY name`, { id });
    ok(res, { guild, bonuses, skills, spells, subguilds });
});

router.post('/guilds', requireEditor, async function(req, res) {
    const { name, file_name, parent_id = null, max_level = 0 } = req.body || {};
    if (!name || !file_name) return fail(res, 'name and file_name required');
    try {
        const r = await zeq.query(
            `INSERT INTO game_guilds (name, file_name, parent_id, max_level)
             VALUES (@name, @file_name, @parent_id, @max_level)`,
            { name, file_name, parent_id, max_level });
        ok(res, { id: r.insertId });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});

router.post('/guilds/:id', requireEditor, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const sets = [];
    const params = { id };
    for (const f of ['name','file_name','parent_id','max_level']) {
        if (f in b) { sets.push(`${f} = @${f}`); params[f] = b[f]; }
    }
    if (!sets.length) return fail(res, 'no fields');
    try {
        await zeq.query(`UPDATE game_guilds SET ${sets.join(', ')} WHERE id = @id`, params);
        ok(res, { id });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});

router.delete('/guilds/:id', requireEditor, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    // Orphan any subguilds instead of cascading through them.
    await zeq.query(`UPDATE game_guilds SET parent_id = NULL WHERE parent_id = @id`, { id });
    await zeq.query(`DELETE FROM game_guilds WHERE id = @id`, { id });
    ok(res, {});
});

// ---- Guild bonuses ----
router.post('/guilds/:id/bonuses', requireEditor, async function(req, res) {
    const guild_id = parseInt(req.params.id, 10);
    const { level, bonus_name, value } = req.body || {};
    if (!bonus_name) return fail(res, 'bonus_name required');
    try {
        const r = await zeq.query(
            `INSERT INTO game_guild_bonuses (guild_id, level, bonus_name, value)
             VALUES (@guild_id, @level, @bonus_name, @value)`,
            { guild_id, level: parseInt(level, 10), bonus_name, value: parseInt(value, 10) });
        ok(res, { id: r.insertId });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.post('/guild-bonuses/:rowId', requireEditor, async function(req, res) {
    const id = parseInt(req.params.rowId, 10);
    const { level, bonus_name, value } = req.body || {};
    try {
        await zeq.query(
            `UPDATE game_guild_bonuses SET level = @level, bonus_name = @bonus_name, value = @value WHERE id = @id`,
            { id, level: parseInt(level, 10), bonus_name, value: parseInt(value, 10) });
        ok(res, { id });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.delete('/guild-bonuses/:rowId', requireEditor, async function(req, res) {
    await zeq.query(`DELETE FROM game_guild_bonuses WHERE id = @id`, { id: parseInt(req.params.rowId, 10) });
    ok(res, {});
});

// ---- Guild skill unlocks ----
router.post('/guilds/:id/skills', requireEditor, async function(req, res) {
    const guild_id = parseInt(req.params.id, 10);
    const { skill_id, level, max_percent } = req.body || {};
    if (!skill_id) return fail(res, 'skill_id required');
    try {
        const r = await zeq.query(
            `INSERT INTO game_guild_skills (guild_id, skill_id, level, max_percent)
             VALUES (@guild_id, @skill_id, @level, @max_percent)
             ON DUPLICATE KEY UPDATE max_percent = VALUES(max_percent)`,
            { guild_id, skill_id: parseInt(skill_id, 10), level: parseInt(level, 10), max_percent: parseInt(max_percent, 10) });
        ok(res, { id: r.insertId });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.post('/guild-skills/:rowId', requireEditor, async function(req, res) {
    const id = parseInt(req.params.rowId, 10);
    const { skill_id, level, max_percent } = req.body || {};
    try {
        await zeq.query(
            `UPDATE game_guild_skills SET skill_id = @skill_id, level = @level, max_percent = @max_percent WHERE id = @id`,
            { id, skill_id: parseInt(skill_id, 10), level: parseInt(level, 10), max_percent: parseInt(max_percent, 10) });
        ok(res, { id });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.delete('/guild-skills/:rowId', requireEditor, async function(req, res) {
    await zeq.query(`DELETE FROM game_guild_skills WHERE id = @id`, { id: parseInt(req.params.rowId, 10) });
    ok(res, {});
});

// ---- Guild spell unlocks ----
router.post('/guilds/:id/spells', requireEditor, async function(req, res) {
    const guild_id = parseInt(req.params.id, 10);
    const { spell_id, level, max_percent } = req.body || {};
    if (!spell_id) return fail(res, 'spell_id required');
    try {
        const r = await zeq.query(
            `INSERT INTO game_guild_spells (guild_id, spell_id, level, max_percent)
             VALUES (@guild_id, @spell_id, @level, @max_percent)
             ON DUPLICATE KEY UPDATE max_percent = VALUES(max_percent)`,
            { guild_id, spell_id: parseInt(spell_id, 10), level: parseInt(level, 10), max_percent: parseInt(max_percent, 10) });
        ok(res, { id: r.insertId });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.post('/guild-spells/:rowId', requireEditor, async function(req, res) {
    const id = parseInt(req.params.rowId, 10);
    const { spell_id, level, max_percent } = req.body || {};
    try {
        await zeq.query(
            `UPDATE game_guild_spells SET spell_id = @spell_id, level = @level, max_percent = @max_percent WHERE id = @id`,
            { id, spell_id: parseInt(spell_id, 10), level: parseInt(level, 10), max_percent: parseInt(max_percent, 10) });
        ok(res, { id });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.delete('/guild-spells/:rowId', requireEditor, async function(req, res) {
    await zeq.query(`DELETE FROM game_guild_spells WHERE id = @id`, { id: parseInt(req.params.rowId, 10) });
    ok(res, {});
});

// ---------------- COSTS ----------------
router.get('/costs', requireAuth, async function(req, res) {
    const level_costs = await zeq.query(
        `SELECT kind, level, cost FROM game_level_costs ORDER BY kind, level`);
    const wish_costs = await zeq.query(
        `SELECT kind, tier, cost FROM game_wish_costs ORDER BY kind, tier`);
    const ss_costs = await zeq.query(
        `SELECT id, from_pct, to_pct, multiplier FROM game_ss_costs ORDER BY from_pct`);
    ok(res, { level_costs, wish_costs, ss_costs });
});

router.post('/costs/level', requireEditor, async function(req, res) {
    const { kind, level, cost } = req.body || {};
    if (!['level','stat','quest'].includes(kind)) return fail(res, 'bad kind');
    await zeq.query(
        `INSERT INTO game_level_costs (kind, level, cost) VALUES (@kind, @level, @cost)
         ON DUPLICATE KEY UPDATE cost = VALUES(cost)`,
        { kind, level: parseInt(level, 10), cost: parseInt(cost, 10) });
    ok(res, {});
});
router.delete('/costs/level/:kind/:level', requireEditor, async function(req, res) {
    const { kind, level } = req.params;
    if (!['level','stat','quest'].includes(kind)) return fail(res, 'bad kind');
    await zeq.query(
        `DELETE FROM game_level_costs WHERE kind = @kind AND level = @level`,
        { kind, level: parseInt(level, 10) });
    ok(res, {});
});

router.post('/costs/wish', requireEditor, async function(req, res) {
    const { kind, tier, cost } = req.body || {};
    if (!['lesser','greater'].includes(kind)) return fail(res, 'bad kind');
    await zeq.query(
        `INSERT INTO game_wish_costs (kind, tier, cost) VALUES (@kind, @tier, @cost)
         ON DUPLICATE KEY UPDATE cost = VALUES(cost)`,
        { kind, tier: parseInt(tier, 10), cost: parseInt(cost, 10) });
    ok(res, {});
});
router.delete('/costs/wish/:kind/:tier', requireEditor, async function(req, res) {
    const { kind, tier } = req.params;
    if (!['lesser','greater'].includes(kind)) return fail(res, 'bad kind');
    await zeq.query(
        `DELETE FROM game_wish_costs WHERE kind = @kind AND tier = @tier`,
        { kind, tier: parseInt(tier, 10) });
    ok(res, {});
});

router.post('/costs/ss', requireEditor, async function(req, res) {
    const { from_pct, to_pct, multiplier } = req.body || {};
    await zeq.query(
        `INSERT INTO game_ss_costs (from_pct, to_pct, multiplier) VALUES (@from_pct, @to_pct, @multiplier)
         ON DUPLICATE KEY UPDATE multiplier = VALUES(multiplier)`,
        { from_pct: parseInt(from_pct, 10), to_pct: parseInt(to_pct, 10), multiplier: parseInt(multiplier, 10) });
    ok(res, {});
});
router.delete('/costs/ss/:id', requireEditor, async function(req, res) {
    await zeq.query(`DELETE FROM game_ss_costs WHERE id = @id`, { id: parseInt(req.params.id, 10) });
    ok(res, {});
});

// ---------------- WISHES ----------------
router.get('/wishes', requireAuth, async function(req, res) {
    ok(res, await zeq.query(
        `SELECT id, name, category, tp_cost, effect_key, effect_value, sort_order
         FROM game_wishes ORDER BY category, sort_order, name`));
});
router.post('/wishes', requireEditor, async function(req, res) {
    const { name, category, tp_cost, effect_key, effect_value, sort_order = 0 } = req.body || {};
    if (!name || !category) return fail(res, 'name and category required');
    try {
        const r = await zeq.query(
            `INSERT INTO game_wishes (name, category, tp_cost, effect_key, effect_value, sort_order)
             VALUES (@name, @category, @tp_cost, @effect_key, @effect_value, @sort_order)`,
            { name, category, tp_cost: parseInt(tp_cost, 10) || 0, effect_key: effect_key || null,
              effect_value: parseInt(effect_value, 10) || 0, sort_order: parseInt(sort_order, 10) || 0 });
        ok(res, { id: r.insertId });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.post('/wishes/:id', requireEditor, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, category, tp_cost, effect_key, effect_value, sort_order } = req.body || {};
    try {
        await zeq.query(
            `UPDATE game_wishes SET name=@name, category=@category, tp_cost=@tp_cost,
             effect_key=@effect_key, effect_value=@effect_value, sort_order=@sort_order WHERE id=@id`,
            { id, name, category, tp_cost: parseInt(tp_cost, 10) || 0, effect_key: effect_key || null,
              effect_value: parseInt(effect_value, 10) || 0, sort_order: parseInt(sort_order, 10) || 0 });
        ok(res, { id });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.delete('/wishes/:id', requireEditor, async function(req, res) {
    await zeq.query(`DELETE FROM game_wishes WHERE id = @id`, { id: parseInt(req.params.id, 10) });
    ok(res, {});
});

// ---------------- BOONS ----------------
router.get('/boons', requireAuth, async function(req, res) {
    ok(res, await zeq.query(
        `SELECT id, name, category, pp_cost, effect_key, effect_value, sort_order
         FROM game_boons ORDER BY category, sort_order, name`));
});
router.post('/boons', requireEditor, async function(req, res) {
    const { name, category, pp_cost, effect_key, effect_value, sort_order = 0 } = req.body || {};
    if (!name || !category) return fail(res, 'name and category required');
    try {
        const r = await zeq.query(
            `INSERT INTO game_boons (name, category, pp_cost, effect_key, effect_value, sort_order)
             VALUES (@name, @category, @pp_cost, @effect_key, @effect_value, @sort_order)`,
            { name, category, pp_cost: parseInt(pp_cost, 10) || 0, effect_key: effect_key || null,
              effect_value: parseInt(effect_value, 10) || 0, sort_order: parseInt(sort_order, 10) || 0 });
        ok(res, { id: r.insertId });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.post('/boons/:id', requireEditor, async function(req, res) {
    const id = parseInt(req.params.id, 10);
    const { name, category, pp_cost, effect_key, effect_value, sort_order } = req.body || {};
    try {
        await zeq.query(
            `UPDATE game_boons SET name=@name, category=@category, pp_cost=@pp_cost,
             effect_key=@effect_key, effect_value=@effect_value, sort_order=@sort_order WHERE id=@id`,
            { id, name, category, pp_cost: parseInt(pp_cost, 10) || 0, effect_key: effect_key || null,
              effect_value: parseInt(effect_value, 10) || 0, sort_order: parseInt(sort_order, 10) || 0 });
        ok(res, { id });
    } catch (e) { fail(res, e.sqlMessage || String(e)); }
});
router.delete('/boons/:id', requireEditor, async function(req, res) {
    await zeq.query(`DELETE FROM game_boons WHERE id = @id`, { id: parseInt(req.params.id, 10) });
    ok(res, {});
});

// ---------------- REINC BOOTSTRAP ----------------
// One call that gives the public planner everything it needs.
router.get('/reinc-bootstrap', async function(req, res) {
    try {
        const races = await zeq.query(
            `SELECT r.*, p.name AS parent_name FROM game_races r
             LEFT JOIN game_races p ON p.id = r.parent_id
             WHERE r.enabled = 1
             ORDER BY COALESCE(p.name, r.name), r.parent_id IS NULL DESC, r.name`);
        const guilds = await zeq.query(
            `SELECT g.id, g.name, g.file_name, g.parent_id, g.max_level, p.name AS parent_name
             FROM game_guilds g LEFT JOIN game_guilds p ON p.id = g.parent_id
             ORDER BY COALESCE(p.name, g.name), g.parent_id IS NULL DESC, g.name`);
        const skills = await zeq.query(`SELECT id, name, start_cost FROM game_skills ORDER BY name`);
        const spells = await zeq.query(`SELECT id, name, start_cost FROM game_spells ORDER BY name`);
        const wishes = await zeq.query(
            `SELECT id, name, category, tp_cost, effect_key, effect_value, sort_order
             FROM game_wishes ORDER BY category, sort_order, name`);
        const boons = await zeq.query(
            `SELECT id, name, category, pp_cost, effect_key, effect_value, sort_order
             FROM game_boons ORDER BY category, sort_order, name`);
        const level_costs = await zeq.query(
            `SELECT kind, level, cost FROM game_level_costs ORDER BY kind, level`);
        const ss_costs = await zeq.query(
            `SELECT from_pct, to_pct, multiplier FROM game_ss_costs ORDER BY from_pct`);
        ok(res, { races, guilds, skills, spells, wishes, boons, level_costs, ss_costs });
    } catch (e) { console.error(e); fail(res, String(e)); }
});

// Per-guild level data — used lazily when the user selects a guild.
router.get('/reinc-guild/:id', async function(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        const bonuses = await zeq.query(
            `SELECT level, bonus_name, value FROM game_guild_bonuses
             WHERE guild_id = @id ORDER BY level, bonus_name`, { id });
        const skills = await zeq.query(
            `SELECT level, skill_id, max_percent FROM game_guild_skills
             WHERE guild_id = @id ORDER BY level`, { id });
        const spells = await zeq.query(
            `SELECT level, spell_id, max_percent FROM game_guild_spells
             WHERE guild_id = @id ORDER BY level`, { id });
        ok(res, { id, bonuses, skills, spells });
    } catch (e) { fail(res, String(e)); }
});

export const game = router;
