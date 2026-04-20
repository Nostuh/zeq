-- EQ Mob Knowledge Base schema. Idempotent; safe to re-apply.
-- Tables prefixed `mob_` for the mob knowledge base feature.
-- Do NOT place user/auth tables here; those live in schema/auth.sql.

SET NAMES utf8mb4;

-- ---------- SUPPLEMENTARY ROLES ----------
-- Additional roles beyond users.role (admin/editor/viewer).
-- Used for feature-gating (eq_viewer, eq_editor).
CREATE TABLE IF NOT EXISTS user_roles (
    user_id  INT NOT NULL,
    role     VARCHAR(32) NOT NULL,
    PRIMARY KEY (user_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- MONSTERS ----------
CREATE TABLE IF NOT EXISTS mob_monsters (
    id              INT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(128) NOT NULL,
    short_name      VARCHAR(64) NULL,
    area            VARCHAR(128) NULL,
    exp_value       BIGINT NULL,
    is_undead       TINYINT(1) NOT NULL DEFAULT 0,
    is_aggro        TINYINT(1) NOT NULL DEFAULT 0,
    directions      MEDIUMTEXT NULL,
    directions_back MEDIUMTEXT NULL,
    kill_strategy   MEDIUMTEXT NULL,
    notes           MEDIUMTEXT NULL,
    version         INT NOT NULL DEFAULT 1,
    created_by      INT NULL,
    updated_by      INT NULL,
    created         DATETIME NOT NULL,
    updated         DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mob_name (name),
    KEY ix_mob_area (area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- RESISTANCES ----------
-- One row per (mob, damage_type). value is the 1-8 kya scale; NULL = unknown.
CREATE TABLE IF NOT EXISTS mob_resistances (
    id          INT NOT NULL AUTO_INCREMENT,
    mob_id      INT NOT NULL,
    damage_type VARCHAR(16) NOT NULL,
    value       INT NULL,
    notes       VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mob_resist (mob_id, damage_type),
    CONSTRAINT fk_mr_mob FOREIGN KEY (mob_id)
        REFERENCES mob_monsters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PROTECTIONS ----------
CREATE TABLE IF NOT EXISTS mob_prots (
    id        INT NOT NULL AUTO_INCREMENT,
    mob_id    INT NOT NULL,
    prot_type VARCHAR(32) NOT NULL,
    priority  VARCHAR(16) NOT NULL DEFAULT 'required',
    notes     VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mob_prot (mob_id, prot_type),
    CONSTRAINT fk_mp_mob FOREIGN KEY (mob_id)
        REFERENCES mob_monsters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- GUILDS NEEDED ----------
CREATE TABLE IF NOT EXISTS mob_guilds (
    id         INT NOT NULL AUTO_INCREMENT,
    mob_id     INT NOT NULL,
    guild_name VARCHAR(64) NOT NULL,
    role       VARCHAR(32) NULL,
    notes      VARCHAR(255) NULL,
    PRIMARY KEY (id),
    KEY ix_mg_mob (mob_id),
    CONSTRAINT fk_mg_mob FOREIGN KEY (mob_id)
        REFERENCES mob_monsters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- LOOT ----------
CREATE TABLE IF NOT EXISTS mob_loot (
    id           INT NOT NULL AUTO_INCREMENT,
    mob_id       INT NOT NULL,
    item_name    VARCHAR(128) NOT NULL,
    slot         VARCHAR(32) NULL,
    equipment_id INT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY ix_ml_mob (mob_id),
    CONSTRAINT fk_ml_mob FOREIGN KEY (mob_id)
        REFERENCES mob_monsters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- IMAGES ----------
CREATE TABLE IF NOT EXISTS mob_images (
    id         INT NOT NULL AUTO_INCREMENT,
    mob_id     INT NOT NULL,
    section    VARCHAR(32) NOT NULL DEFAULT 'general',
    filename   VARCHAR(255) NOT NULL,
    mime_type  VARCHAR(64) NOT NULL,
    size_bytes INT NOT NULL,
    path       VARCHAR(512) NOT NULL,
    caption    VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created    DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_mi_mob (mob_id),
    CONSTRAINT fk_mi_mob FOREIGN KEY (mob_id)
        REFERENCES mob_monsters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- ASCII MAPS ----------
CREATE TABLE IF NOT EXISTS mob_maps (
    id            INT NOT NULL AUTO_INCREMENT,
    mob_id        INT NULL,
    area_name     VARCHAR(128) NULL,
    title         VARCHAR(128) NOT NULL,
    ascii_content MEDIUMTEXT NOT NULL,
    notes         MEDIUMTEXT NULL,
    created_by    INT NULL,
    updated       DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_mm_mob (mob_id),
    CONSTRAINT fk_mm_mob FOREIGN KEY (mob_id)
        REFERENCES mob_monsters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- EDIT HISTORY ----------
CREATE TABLE IF NOT EXISTS mob_history (
    id         INT NOT NULL AUTO_INCREMENT,
    mob_id     INT NOT NULL,
    user_name  VARCHAR(64) NOT NULL,
    user_id    INT NULL,
    action     VARCHAR(16) NOT NULL,
    section    VARCHAR(32) NOT NULL,
    diff_json  MEDIUMTEXT NULL,
    snapshot   MEDIUMTEXT NULL,
    created    DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_mh_mob (mob_id, created),
    CONSTRAINT fk_mh_mob FOREIGN KEY (mob_id)
        REFERENCES mob_monsters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
