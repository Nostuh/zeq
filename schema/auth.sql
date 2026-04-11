-- zeq auth/role schema. Idempotent.
-- Extends the legacy `users` table with role + active columns and
-- introduces bcrypt-hashed passwords in a new column while preserving
-- the old md5 `password` column so legacy inserts do not break.

SET NAMES utf8mb4;

-- Legacy users table pre-exists (MyISAM). Add new columns if missing.
-- MariaDB supports IF NOT EXISTS on ALTER TABLE ADD COLUMN (10.0+).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'viewer',
    ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS created DATETIME NULL;

-- Index for role lookups / admin counting.
-- (MyISAM: no FK, no IF NOT EXISTS on ADD KEY — tolerate duplicate-key error.)
-- Run manually if needed:
--   ALTER TABLE users ADD KEY ix_users_role (role);

CREATE TABLE IF NOT EXISTS sessions (
    id            VARCHAR(64) NOT NULL,
    user_id       INT NOT NULL,
    created       DATETIME NOT NULL,
    expires       DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_sessions_user (user_id),
    KEY ix_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
