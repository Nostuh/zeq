-- Equipment catalog schema. Idempotent; safe to re-apply.
-- Tables prefixed `eq_` for the redesigned equipment subsystem.
-- Supersedes the legacy `eq`/`eqmobs` parse-on-load model — those stay
-- live until cutover (no-drop rule). See docs/equipment-redesign.md.
-- Do NOT place user/auth tables here; those live in schema/auth.sql.

SET NAMES utf8mb4;

-- ---------- CATALOG ----------
-- One row per DISTINCT item. Stats are parsed once at add time
-- (api/classes/eq_parse.mjs) and stored as columns so the EQ Builder is
-- a plain SELECT. Identity is the normalized (name, wear_slot) — that
-- unique key is what dedups the legacy copies. `raw_info` keeps the full
-- identify text for audit + future re-parse.
CREATE TABLE IF NOT EXISTS eq_items (
    id                 INT NOT NULL AUTO_INCREMENT,
    -- identity / classification
    name               VARCHAR(191) NOT NULL,           -- normalized (noise stripped)
    name_raw           VARCHAR(255) NULL,               -- original first line as captured
    wear_slot          VARCHAR(16) NOT NULL,            -- head..feet, held, finger, wield
    weapon_class       VARCHAR(16) NULL,                -- sword/dagger/axe/bow/polearm/bludgeon/staff/ancient (NOT multi)
    is_shield          TINYINT(1) NOT NULL DEFAULT 0,
    hands              TINYINT NOT NULL DEFAULT 1,       -- 2 = two-handed (builder decides slot occupancy)
    slot_raw           VARCHAR(64) NULL,                -- legacy slot value, for audit
    bound              TINYINT(1) NOT NULL DEFAULT 0,    -- had <Bound>
    needs_review       TINYINT(1) NOT NULL DEFAULT 0,    -- ambiguous slot / parse, flag for a human
    -- stats
    str  SMALLINT NOT NULL DEFAULT 0,
    con  SMALLINT NOT NULL DEFAULT 0,
    dex  SMALLINT NOT NULL DEFAULT 0,
    `int` SMALLINT NOT NULL DEFAULT 0,
    wis  SMALLINT NOT NULL DEFAULT 0,
    cha  SMALLINT NOT NULL DEFAULT 0,
    hpr  SMALLINT NOT NULL DEFAULT 0,                    -- hitpoint regeneration
    spr  SMALLINT NOT NULL DEFAULT 0,                    -- spellpoint regeneration
    hp   SMALLINT NOT NULL DEFAULT 0,                    -- max hitpoints
    sp   SMALLINT NOT NULL DEFAULT 0,                    -- max spellpoints
    -- resistances
    rphys  SMALLINT NOT NULL DEFAULT 0,
    rpsi   SMALLINT NOT NULL DEFAULT 0,
    relec  SMALLINT NOT NULL DEFAULT 0,
    rmag   SMALLINT NOT NULL DEFAULT 0,
    rpoi   SMALLINT NOT NULL DEFAULT 0,
    rfire  SMALLINT NOT NULL DEFAULT 0,
    rcold  SMALLINT NOT NULL DEFAULT 0,
    racid  SMALLINT NOT NULL DEFAULT 0,
    rasphx SMALLINT NOT NULL DEFAULT 0,
    -- combat
    ac                  SMALLINT NOT NULL DEFAULT 0,
    weapon_class_value  SMALLINT NOT NULL DEFAULT 0,     -- replaces the hard-coded 40
    dmg_pct             SMALLINT NOT NULL DEFAULT 0,      -- elemental damage %
    dmg_type            VARCHAR(8) NULL,                  -- fire/cold/acid/psi/elec/poi/mag/asph
    -- provenance
    raw_info  TEXT NULL,
    note      TEXT NULL,
    eqmob_id  INT NULL,
    version   INT NOT NULL DEFAULT 1,
    created   DATETIME NOT NULL,
    updated   DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_eqi_name_slot (name, wear_slot),
    KEY ix_eqi_slot (wear_slot),
    KEY ix_eqi_eqmob (eqmob_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- OPEN-ENDED BONUSES ----------
-- Skill/spell bonus lines ("gives tiny bonus to triple thrust") that
-- don't fit fixed columns. One row per (item, bonus_name).
CREATE TABLE IF NOT EXISTS eq_item_bonuses (
    id         INT NOT NULL AUTO_INCREMENT,
    item_id    INT NOT NULL,
    bonus_name VARCHAR(64) NOT NULL,
    amount     SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_eqib (item_id, bonus_name),
    CONSTRAINT fk_eqib_item FOREIGN KEY (item_id)
        REFERENCES eq_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- OWNERSHIP ----------
-- "I have this item" — a tag, NOT a row copy. Many owners per item.
-- Replaces the legacy copy_to_user duplication.
CREATE TABLE IF NOT EXISTS eq_ownership (
    id       INT NOT NULL AUTO_INCREMENT,
    user_id  INT NOT NULL,
    item_id  INT NOT NULL,
    note     VARCHAR(255) NULL,
    created  DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_eqo (user_id, item_id),
    KEY ix_eqo_user (user_id),
    CONSTRAINT fk_eqo_item FOREIGN KEY (item_id)
        REFERENCES eq_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
