PRAGMA foreign_keys=OFF;

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

DROP TABLE links;
ALTER TABLE links_base62 RENAME TO links;
CREATE INDEX idx_links_created_at ON links(created_at DESC);

CREATE TABLE IF NOT EXISTS slug_tombstones (
  slug TEXT PRIMARY KEY COLLATE BINARY,
  deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER IF NOT EXISTS keep_deleted_slug
AFTER DELETE ON links
BEGIN
  INSERT OR IGNORE INTO slug_tombstones (slug) VALUES (OLD.slug);
END;

PRAGMA foreign_keys=ON;
