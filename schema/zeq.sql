-- zeq game-data schema. Idempotent; safe to re-apply.
-- All game-data tables are prefixed `game_` and are fully rebuildable
-- from /srv/zeq/data via scripts/import_zcreator.mjs.
-- Do NOT place user/auth tables here; those live in schema/auth.sql.

SET NAMES utf8mb4;

-- ---------- RACES ----------
CREATE TABLE IF NOT EXISTS game_races (
    id            INT NOT NULL AUTO_INCREMENT,
    name          VARCHAR(64) NOT NULL,
    parent_id     INT NULL,              -- set for subraces
    max_str       INT NOT NULL DEFAULT 0,
    max_dex       INT NOT NULL DEFAULT 0,
    max_con       INT NOT NULL DEFAULT 0,
    max_int       INT NOT NULL DEFAULT 0,
    max_wis       INT NOT NULL DEFAULT 0,
    max_cha       INT NOT NULL DEFAULT 0,
    size          INT NOT NULL DEFAULT 0,
    exp_rate      INT NOT NULL DEFAULT 100,
    sp_regen      INT NOT NULL DEFAULT 0,
    hp_regen      INT NOT NULL DEFAULT 0,
    skill_max     INT NOT NULL DEFAULT 100,
    spell_max     INT NOT NULL DEFAULT 100,
    skill_cost    INT NOT NULL DEFAULT 100,
    spell_cost    INT NOT NULL DEFAULT 100,
    enabled       TINYINT(1) NOT NULL DEFAULT 1,
    help_text     MEDIUMTEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_game_races_name (name),
    KEY ix_game_races_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-apply safety: add `enabled` if the table existed before this column.
ALTER TABLE game_races
    ADD COLUMN IF NOT EXISTS enabled TINYINT(1) NOT NULL DEFAULT 1;

-- ---------- WISHES / BOONS (admin-editable reinc planner data) ----------
CREATE TABLE IF NOT EXISTS game_wishes (
    id          INT NOT NULL AUTO_INCREMENT,
    name        VARCHAR(64) NOT NULL,
    category    VARCHAR(16) NOT NULL,
    tp_cost     INT NOT NULL DEFAULT 0,
    effect_key  VARCHAR(32) NULL,
    effect_value INT NOT NULL DEFAULT 0,
    sort_order  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_game_wishes_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_boons (
    id          INT NOT NULL AUTO_INCREMENT,
    name        VARCHAR(64) NOT NULL,
    category    VARCHAR(16) NOT NULL,
    pp_cost     INT NOT NULL DEFAULT 0,
    effect_key  VARCHAR(32) NULL,
    effect_value INT NOT NULL DEFAULT 0,
    sort_order  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_game_boons_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- BUG REPORTS ----------
CREATE TABLE IF NOT EXISTS bug_reports (
    id            INT NOT NULL AUTO_INCREMENT,
    title         VARCHAR(255) NOT NULL,
    description   MEDIUMTEXT NOT NULL,
    severity      VARCHAR(16) NOT NULL DEFAULT 'normal',
    page_url      VARCHAR(512) NULL,
    user_agent    VARCHAR(512) NULL,
    screen_size   VARCHAR(32) NULL,
    reporter_name VARCHAR(128) NULL,
    reporter_contact VARCHAR(255) NULL,
    user_id       INT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'open',
    app_state     MEDIUMTEXT NULL,       -- JSON: route, user, page-specific state, console log tail
    dom_snapshot  MEDIUMTEXT NULL,       -- truncated outerHTML of <main> for visual context
    console_log   MEDIUMTEXT NULL,       -- NDJSON tail of last ~100 console entries
    created       DATETIME NOT NULL,
    resolved      DATETIME NULL,
    PRIMARY KEY (id),
    KEY ix_bug_reports_status (status),
    KEY ix_bug_reports_created (created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-apply safety for existing installations.
ALTER TABLE bug_reports
    ADD COLUMN IF NOT EXISTS app_state MEDIUMTEXT NULL,
    ADD COLUMN IF NOT EXISTS dom_snapshot MEDIUMTEXT NULL,
    ADD COLUMN IF NOT EXISTS console_log MEDIUMTEXT NULL;

-- ---------- BUG ATTACHMENTS ----------
-- JPG/PNG uploads attached to a bug report. Files live on disk under
-- /srv/zeq/api/uploads/bugs/{bug_id}/; this table stores metadata and
-- the relative path. Cascades on bug delete; admin-only read endpoint.
CREATE TABLE IF NOT EXISTS bug_attachments (
    id         INT NOT NULL AUTO_INCREMENT,
    bug_id     INT NOT NULL,
    filename   VARCHAR(255) NOT NULL,
    mime_type  VARCHAR(64) NOT NULL,
    size_bytes INT NOT NULL,
    path       VARCHAR(512) NOT NULL,
    created    DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_bug_attachments_bug (bug_id),
    CONSTRAINT fk_bug_attachments_bug FOREIGN KEY (bug_id)
        REFERENCES bug_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SKILLS / SPELLS ----------
CREATE TABLE IF NOT EXISTS game_skills (
    id            INT NOT NULL AUTO_INCREMENT,
    name          VARCHAR(128) NOT NULL,
    start_cost    INT NOT NULL DEFAULT 0,
    help_text     MEDIUMTEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_game_skills_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_spells (
    id            INT NOT NULL AUTO_INCREMENT,
    name          VARCHAR(128) NOT NULL,
    start_cost    INT NOT NULL DEFAULT 0,
    help_text     MEDIUMTEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_game_spells_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- GUILDS / SUBGUILDS ----------
CREATE TABLE IF NOT EXISTS game_guilds (
    id            INT NOT NULL AUTO_INCREMENT,
    name          VARCHAR(128) NOT NULL,  -- display name, spaces
    file_name     VARCHAR(128) NOT NULL,  -- underscored stem
    parent_id     INT NULL,               -- set for subguilds
    max_level     INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_game_guilds_name (name),
    KEY ix_game_guilds_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-level guild stat/attribute bonuses.
CREATE TABLE IF NOT EXISTS game_guild_bonuses (
    id            INT NOT NULL AUTO_INCREMENT,
    guild_id      INT NOT NULL,
    level         INT NOT NULL,
    bonus_name    VARCHAR(64) NOT NULL,
    value         INT NOT NULL,
    PRIMARY KEY (id),
    KEY ix_game_guild_bonuses_guild_level (guild_id, level),
    CONSTRAINT fk_gb_guild FOREIGN KEY (guild_id)
        REFERENCES game_guilds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-level skill unlocks (join). `max_percent` is the trainable cap at that level.
CREATE TABLE IF NOT EXISTS game_guild_skills (
    id            INT NOT NULL AUTO_INCREMENT,
    guild_id      INT NOT NULL,
    skill_id      INT NOT NULL,
    level         INT NOT NULL,
    max_percent   INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ggs (guild_id, skill_id, level),
    KEY ix_ggs_guild_level (guild_id, level),
    CONSTRAINT fk_ggs_guild FOREIGN KEY (guild_id)
        REFERENCES game_guilds(id) ON DELETE CASCADE,
    CONSTRAINT fk_ggs_skill FOREIGN KEY (skill_id)
        REFERENCES game_skills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_guild_spells (
    id            INT NOT NULL AUTO_INCREMENT,
    guild_id      INT NOT NULL,
    spell_id      INT NOT NULL,
    level         INT NOT NULL,
    max_percent   INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ggsp (guild_id, spell_id, level),
    KEY ix_ggsp_guild_level (guild_id, level),
    CONSTRAINT fk_ggsp_guild FOREIGN KEY (guild_id)
        REFERENCES game_guilds(id) ON DELETE CASCADE,
    CONSTRAINT fk_ggsp_spell FOREIGN KEY (spell_id)
        REFERENCES game_spells(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- COST TABLES ----------
-- Flat per-level cost arrays (levelcosts, statcost, questpoints).
-- `kind` discriminates which table the row belongs to.
CREATE TABLE IF NOT EXISTS game_level_costs (
    id            INT NOT NULL AUTO_INCREMENT,
    kind          VARCHAR(32) NOT NULL,   -- 'level','stat','quest'
    level         INT NOT NULL,
    cost          BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_glc (kind, level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- wishcost.chr: two blocks (lesser, greater) of 9 tiers each.
CREATE TABLE IF NOT EXISTS game_wish_costs (
    id            INT NOT NULL AUTO_INCREMENT,
    kind          VARCHAR(16) NOT NULL,   -- 'lesser','greater'
    tier          INT NOT NULL,
    cost          BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_gwc (kind, tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- costs.txt: skill/spell training cost by percent-range.
CREATE TABLE IF NOT EXISTS game_ss_costs (
    id            INT NOT NULL AUTO_INCREMENT,
    from_pct      INT NOT NULL,
    to_pct        INT NOT NULL,
    multiplier    INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_gssc (from_pct, to_pct)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
