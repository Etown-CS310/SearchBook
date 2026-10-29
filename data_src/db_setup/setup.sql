-- =====================================================================
-- SearchBook database schema (SQLite)
--
-- Run:  sqlite3 searchbook.db < data_src/db_setup/setup.sql
--
-- The script is idempotent: every CREATE uses IF NOT EXISTS, so running
-- it again on an existing database is a no-op instead of an error. That
-- lets backend.py call it on every startup without checking first.
-- =====================================================================

-- SQLite ships with foreign key enforcement OFF for backwards
-- compatibility. This setting is per-connection, so the Flask app must
-- also run "PRAGMA foreign_keys = ON;" each time it opens a connection.
PRAGMA foreign_keys = ON;


-- ============ SECTION 1: CORE TABLES (ACTIVE) ============

-- ---------------------------------------------------------------------
-- users: one row per account, plus the running totals the profile page
-- shows (pings sent, total distance, time since joining).
--
-- * username and email are UNIQUE COLLATE NOCASE so "Ryder" and "ryder"
--   (or two differently-cased emails) can't register as separate people.
--   NOCASE also makes login lookups case-insensitive for free.
-- * pings_sent and total_distance_km are cached totals. They are bumped
--   on every lookup so the profile page and leaderboards never have to
--   add up history. The CHECKs stop a buggy update from driving them
--   negative.
-- * created_at is the sign-up time. "Days in SearchBook" is calculated
--   from it at read time instead of being stored, so it never goes stale.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    email             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    -- Holds ONLY the output of werkzeug.security.generate_password_hash().
    -- Never store the plain-text password. Check logins with
    -- check_password_hash(password_hash, submitted_password).
    password_hash     TEXT    NOT NULL,
    pings_sent        INTEGER NOT NULL DEFAULT 0 CHECK (pings_sent >= 0),
    total_distance_km REAL    NOT NULL DEFAULT 0 CHECK (total_distance_km >= 0),
    created_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP  -- UTC, 'YYYY-MM-DD HH:MM:SS'
);

-- ---------------------------------------------------------------------
-- domains: one row per unique hostname anyone has looked up, holding the
-- most recent resolved IP and server location plus a global ping count.
--
-- * domain_url is the natural key. It is UNIQUE so the record-a-ping
--   upsert (below) can use ON CONFLICT(domain_url) to either create the
--   row or update it. Store it already normalized by clean_domain() in
--   backend.py (lowercase, no scheme/path/trailing slash). NOCASE is a
--   safety net in case un-normalized input gets through.
--   Note: clean_domain() does not strip "www." or ":port", so
--   "www.example.com" and "example.com" become separate rows.
-- * Location is stored as separate columns instead of one text blob, so
--   the Leaflet map can read latitude/longitude directly and stats can
--   GROUP BY country. The CHECKs reject impossible coordinates. They
--   still allow NULL, because ip-api.com sometimes returns nothing.
-- * ip_address and location are overwritten on each lookup ("most
--   recent"), because CDNs and DNS changes can move a domain over time.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
    domain_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_url      TEXT    NOT NULL UNIQUE COLLATE NOCASE,  -- e.g. 'example.com'
    domain_name     TEXT,                                    -- display name, e.g. 'Example'
    ip_address      TEXT,                                    -- /lookup "ip"
    city            TEXT,                                    -- /lookup "city"
    region          TEXT,                                    -- /lookup "region" (ip-api regionName)
    country         TEXT,                                    -- /lookup "country"
    latitude        REAL    CHECK (latitude  BETWEEN -90  AND 90),   -- /lookup "lat"
    longitude       REAL    CHECK (longitude BETWEEN -180 AND 180),  -- /lookup "lon"
    isp             TEXT,                                    -- /lookup "isp"
    total_pings     INTEGER NOT NULL DEFAULT 0 CHECK (total_pings >= 0),
    first_pinged_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_pinged_at  TEXT
);

-- Leaderboard indexes. DESC matches the ORDER BY ... DESC LIMIT n
-- queries, so SQLite can read the top rows straight from the index
-- instead of sorting the whole table.
CREATE INDEX IF NOT EXISTS idx_users_pings_sent   ON users (pings_sent DESC);
CREATE INDEX IF NOT EXISTS idx_users_total_dist   ON users (total_distance_km DESC);
CREATE INDEX IF NOT EXISTS idx_domains_total_pings ON domains (total_pings DESC);

-- ---------------------------------------------------------------------
-- INTENDED QUERY PATTERN: recording one ping (documentation only, not run)
--
-- After /lookup succeeds, the app updates the domain's global stats and
-- the user's personal totals. Both statements go in ONE transaction:
-- if either fails, both roll back, so users.pings_sent and
-- domains.total_pings can never drift apart.
--
-- fiber_km is NULL when the server blocks ICMP (ping3 returns None).
-- The attempt still counts as a ping, but adds 0 km. If the team decides
-- failed pings shouldn't count, skip the users UPDATE when fiber_km is
-- NULL.
--
--   BEGIN;
--
--   -- Create the domain on first sight. Otherwise bump its counter and
--   -- refresh IP/location to the latest values. "excluded" refers to the
--   -- row we tried to insert.
--   INSERT INTO domains (domain_url, ip_address, city, region, country,
--                        latitude, longitude, isp, total_pings, last_pinged_at)
--   VALUES (:domain, :ip, :city, :region, :country,
--           :lat, :lon, :isp, 1, CURRENT_TIMESTAMP)
--   ON CONFLICT(domain_url) DO UPDATE SET
--       total_pings    = total_pings + 1,
--       ip_address     = excluded.ip_address,
--       city           = excluded.city,
--       region         = excluded.region,
--       country        = excluded.country,
--       latitude       = excluded.latitude,
--       longitude      = excluded.longitude,
--       isp            = excluded.isp,
--       last_pinged_at = excluded.last_pinged_at;
--
--   -- Only for logged-in users. Logged-out lookups skip this statement.
--   UPDATE users
--   SET pings_sent        = pings_sent + 1,
--       total_distance_km = total_distance_km + COALESCE(:fiber_km, 0)
--   WHERE user_id = :user_id;
--
--   COMMIT;
--
-- In Python, "with conn:" on a sqlite3 connection does the BEGIN/COMMIT
-- (and ROLLBACK on exception) for you.
-- ---------------------------------------------------------------------


-- ============ SECTION 2: PROPOSED TABLES (NOT ACTIVE) ============
-- Everything below is commented out. Running this file creates only the
-- Section 1 tables. To adopt a proposal, uncomment its block (and make
-- any Section 1 change its note mentions).

-- ---------------------------------------------------------------------
-- 2.1 pings: full lookup history, one row per /lookup call.
-- Feature: "recent pings" list on the profile, personal records
--   (fastest ping, farthest ping), and the countries-reached view (2.8).
-- Why separate: users/domains hold one row per entity. History is
--   one-to-many and grows without limit.
-- Section 1 impact: none required. Note that users.pings_sent,
--   users.total_distance_km and domains.total_pings become cached values
--   that could be recalculated from this table (COUNT/SUM). Insert the
--   ping row in the same transaction as the Section 1 upsert/update.
-- user_id is nullable so logged-out lookups are still recorded.
-- ON DELETE SET NULL keeps global history if an account is deleted.
-- ON DELETE CASCADE on domain_id: history for a removed domain is
-- meaningless.
-- ---------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS pings (
--     ping_id    INTEGER PRIMARY KEY AUTOINCREMENT,
--     user_id    INTEGER REFERENCES users (user_id)     ON DELETE SET NULL,
--     domain_id  INTEGER NOT NULL REFERENCES domains (domain_id) ON DELETE CASCADE,
--     ip_address TEXT,                       -- IP at the time of this ping
--     ping_ms    REAL CHECK (ping_ms  >= 0), -- NULL when no ICMP reply
--     fiber_km   REAL CHECK (fiber_km >= 0), -- NULL when no ICMP reply
--     success    INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
--     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );
-- -- "My recent pings": filter by user, newest first.
-- CREATE INDEX IF NOT EXISTS idx_pings_user_time ON pings (user_id, created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_pings_domain    ON pings (domain_id);

-- ---------------------------------------------------------------------
-- 2.2 user_domains: per-user, per-domain counters (junction table).
-- Feature: "your most-pinged sites" on the profile.
-- Why separate: it's a many-to-many relationship (users x domains). A
--   cached counter here avoids GROUP BY over the full pings history.
-- Section 1 impact: add a third statement to the record-a-ping
--   transaction: INSERT ... ON CONFLICT(user_id, domain_id) DO UPDATE SET
--   ping_count = ping_count + 1, last_pinged_at = CURRENT_TIMESTAMP.
-- The composite PK guarantees one row per pair and doubles as the
-- lookup index.
-- ---------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS user_domains (
--     user_id        INTEGER NOT NULL REFERENCES users (user_id)     ON DELETE CASCADE,
--     domain_id      INTEGER NOT NULL REFERENCES domains (domain_id) ON DELETE CASCADE,
--     ping_count     INTEGER NOT NULL DEFAULT 0 CHECK (ping_count >= 0),
--     last_pinged_at TEXT,
--     PRIMARY KEY (user_id, domain_id)
-- );
-- CREATE INDEX IF NOT EXISTS idx_user_domains_top ON user_domains (user_id, ping_count DESC);

-- ---------------------------------------------------------------------
-- 2.3 regional_servers: the Stats page's fixed test targets.
-- Feature: lets the target list be edited in the DB instead of being
--   hardcoded in js/regions.js. Also needed as an FK target for 2.4.
-- Why separate: these are curated reference data, not user-pinged
--   domains, and they need extra fields (is_active, fixed coordinates).
-- Section 1 impact: none.
-- region_name is UNIQUE so the seed INSERTs below can use OR IGNORE and
-- stay safe to re-run. is_active lets a dead target be hidden without
-- deleting its test history.
-- ---------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS regional_servers (
--     server_id   INTEGER PRIMARY KEY AUTOINCREMENT,
--     region_name TEXT NOT NULL UNIQUE,
--     url         TEXT NOT NULL,
--     latitude    REAL CHECK (latitude  BETWEEN -90  AND 90),
--     longitude   REAL CHECK (longitude BETWEEN -180 AND 180),
--     is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
-- );
-- -- Placeholder URLs/coordinates: replace with the real targets from js/regions.js.
-- INSERT OR IGNORE INTO regional_servers (region_name, url, latitude, longitude) VALUES
--     ('US Northeast', 'https://us-northeast.example.com', 40.71,  -74.01),
--     ('US Southeast', 'https://us-southeast.example.com', 33.75,  -84.39),
--     ('EU',           'https://eu.example.com',           50.11,    8.68),
--     ('China',        'https://china.example.com',        31.23,  121.47),
--     ('Brazil',       'https://brazil.example.com',      -23.55,  -46.63);

-- ---------------------------------------------------------------------
-- 2.4 network_tests + network_test_results: Stats page history.
-- Feature: latency history over time ("is my connection to the EU
--   getting worse?").
-- Why separate: one click produces several region results (one-to-many),
--   so the click (header) and the per-region rows (detail) are split.
--   Shared fields like user and baseline aren't repeated per region.
-- Section 1 impact: none. Requires 2.3.
-- Deleting a user cascades to their tests, which cascades to the
-- results. A regional server can't be deleted while results reference it
-- (RESTRICT is the default). Set is_active = 0 instead.
-- The composite PK on results allows one row per region per test.
-- ---------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS network_tests (
--     test_id            INTEGER PRIMARY KEY AUTOINCREMENT,
--     user_id            INTEGER REFERENCES users (user_id) ON DELETE CASCADE,
--     baseline_server_id INTEGER REFERENCES regional_servers (server_id) ON DELETE SET NULL,
--     created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );
-- CREATE INDEX IF NOT EXISTS idx_network_tests_user_time ON network_tests (user_id, created_at DESC);
--
-- CREATE TABLE IF NOT EXISTS network_test_results (
--     test_id         INTEGER NOT NULL REFERENCES network_tests (test_id) ON DELETE CASCADE,
--     server_id       INTEGER NOT NULL REFERENCES regional_servers (server_id),
--     median_ms       REAL CHECK (median_ms >= 0),        -- NULL when unreachable
--     jitter_ms       REAL CHECK (jitter_ms >= 0),
--     overhead_factor REAL CHECK (overhead_factor > 0),   -- measured / fiber minimum
--     failed_samples  INTEGER NOT NULL DEFAULT 0 CHECK (failed_samples >= 0),
--     status          TEXT NOT NULL CHECK (status IN ('ok', 'unreachable')),
--     PRIMARY KEY (test_id, server_id)
-- );

-- ---------------------------------------------------------------------
-- 2.5 badges + user_badges: gamification.
-- Feature: achievements such as 'First Ping', 'Ping 5 Continents',
--   '10,000 km Club'.
-- Why separate: badge definitions are shared reference data (badges).
--   Who earned what is many-to-many (user_badges). The composite PK
--   means a badge can be earned only once per user.
-- Section 1 impact: none. After the record-a-ping transaction, the app
--   compares users.pings_sent / total_distance_km against
--   badges.threshold and inserts any newly earned badges.
-- code is a stable identifier for app logic ('FIRST_PING'), so name and
-- description can be reworded freely.
-- ---------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS badges (
--     badge_id    INTEGER PRIMARY KEY AUTOINCREMENT,
--     code        TEXT NOT NULL UNIQUE,
--     name        TEXT NOT NULL,
--     description TEXT,
--     threshold   REAL CHECK (threshold >= 0)   -- meaning depends on code (pings, km, countries)
-- );
--
-- CREATE TABLE IF NOT EXISTS user_badges (
--     user_id   INTEGER NOT NULL REFERENCES users (user_id)   ON DELETE CASCADE,
--     badge_id  INTEGER NOT NULL REFERENCES badges (badge_id) ON DELETE CASCADE,
--     earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     PRIMARY KEY (user_id, badge_id)
-- );

-- ---------------------------------------------------------------------
-- 2.6 race_results: "race mode" (ping two domains, see which is faster).
-- Feature: head-to-head domain comparisons and their history.
-- Why separate: a race references two domains and one winner, which
--   doesn't fit the one-domain-per-row pings table.
-- Section 1 impact: none. Each side of a race could also be logged in
--   pings (2.1) and counted in the Section 1 totals.
-- The CHECKs stop racing a domain against itself and require the winner
-- to be one of the two racers (or NULL for a tie or both failing).
-- ---------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS race_results (
--     race_id          INTEGER PRIMARY KEY AUTOINCREMENT,
--     user_id          INTEGER REFERENCES users (user_id) ON DELETE SET NULL,
--     domain_a_id      INTEGER NOT NULL REFERENCES domains (domain_id) ON DELETE CASCADE,
--     domain_b_id      INTEGER NOT NULL REFERENCES domains (domain_id) ON DELETE CASCADE,
--     ping_a_ms        REAL CHECK (ping_a_ms >= 0),
--     ping_b_ms        REAL CHECK (ping_b_ms >= 0),
--     winner_domain_id INTEGER REFERENCES domains (domain_id) ON DELETE CASCADE,
--     created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     CHECK (domain_a_id <> domain_b_id),
--     CHECK (winner_domain_id IS NULL OR winner_domain_id IN (domain_a_id, domain_b_id))
-- );
-- CREATE INDEX IF NOT EXISTS idx_race_results_user ON race_results (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 2.7 shared_results: shareable result cards (/share/<share_code>).
-- Feature: share a single lookup result by link.
-- Why separate: most pings are never shared. Keeping the slug here
--   avoids a mostly-NULL column on pings.
-- Section 1 impact: none. Requires 2.1.
-- share_code is a random, unguessable slug (e.g. secrets.token_urlsafe(8)
-- in Python). UNIQUE guarantees each URL resolves to exactly one card.
-- Deleting the ping deletes its share link.
-- ---------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS shared_results (
--     share_id   INTEGER PRIMARY KEY AUTOINCREMENT,
--     share_code TEXT NOT NULL UNIQUE,
--     ping_id    INTEGER NOT NULL REFERENCES pings (ping_id) ON DELETE CASCADE,
--     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );

-- ---------------------------------------------------------------------
-- 2.8 v_countries_reached: a VIEW, not a table.
-- Feature: "countries visited" stat on the profile (from Ideation.md).
-- Why a view: the count is derived data. It can always be calculated
--   from pings + domains, so storing a copy would just be one more total
--   that could get out of sync. A view stores only the query.
-- Section 1 impact: none. Requires 2.1.
-- Caveat: it uses each domain's CURRENT country, so if a domain moves
--   countries, history is reattributed. Add a country column to pings
--   if that matters.
-- ---------------------------------------------------------------------
-- CREATE VIEW IF NOT EXISTS v_countries_reached AS
-- SELECT p.user_id,
--        COUNT(DISTINCT d.country) AS countries_reached
-- FROM pings p
-- JOIN domains d ON d.domain_id = p.domain_id
-- WHERE p.user_id IS NOT NULL
--   AND p.success = 1
--   AND d.country IS NOT NULL
-- GROUP BY p.user_id;
