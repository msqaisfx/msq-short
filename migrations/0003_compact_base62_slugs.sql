-- D1 runs migrations in an implicit transaction with foreign keys enabled.
-- Deferral delays validation but does not suppress ON DELETE CASCADE actions.
-- Preserve and remove the child table before replacing its parent.
PRAGMA defer_foreign_keys=ON;

CREATE TABLE links_base62 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL COLLATE BINARY UNIQUE,
  target_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  click_count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO links_base62 (id,slug,target_url,created_at,expires_at,disabled,click_count)
SELECT id,slug,target_url,created_at,expires_at,disabled,click_count FROM links;

CREATE TABLE clicks_base62_backup (
  id INTEGER PRIMARY KEY,
  link_id INTEGER NOT NULL,
  clicked_at TEXT NOT NULL,
  referrer_host TEXT,
  country TEXT,
  user_agent_family TEXT
);
INSERT INTO clicks_base62_backup (id,link_id,clicked_at,referrer_host,country,user_agent_family)
SELECT id,link_id,clicked_at,referrer_host,country,user_agent_family FROM clicks;

DROP TABLE clicks;
DROP TABLE links;
ALTER TABLE links_base62 RENAME TO links;
CREATE INDEX idx_links_created_at ON links(created_at DESC);

CREATE TABLE clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  clicked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  referrer_host TEXT,
  country TEXT,
  user_agent_family TEXT,
  FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
);
INSERT INTO clicks (id,link_id,clicked_at,referrer_host,country,user_agent_family)
SELECT id,link_id,clicked_at,referrer_host,country,user_agent_family FROM clicks_base62_backup;
DROP TABLE clicks_base62_backup;
CREATE INDEX idx_clicks_link_time ON clicks(link_id, clicked_at DESC);

CREATE TABLE IF NOT EXISTS slug_tombstones (
  slug TEXT PRIMARY KEY COLLATE BINARY,
  deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER IF NOT EXISTS keep_deleted_slug
AFTER DELETE ON links
BEGIN
  INSERT OR IGNORE INTO slug_tombstones (slug) VALUES (OLD.slug);
END;

PRAGMA defer_foreign_keys=OFF;
