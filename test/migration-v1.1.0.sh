#!/bin/sh
set -eu

db_dir=$(mktemp -d "${TMPDIR:-/tmp}/msq-short-migration.XXXXXX")
db="$db_dir/success.sqlite"
failure_db="$db_dir/failure.sqlite"
trap 'rm -f "$db" "$failure_db"; rmdir "$db_dir" 2>/dev/null || true' EXIT INT TERM

create_fixture() {
  fixture_db=$1
  /usr/bin/sqlite3 "$fixture_db" <migrations/0001_initial.sql
  /usr/bin/sqlite3 "$fixture_db" <migrations/0002_staging_auth.sql
  /usr/bin/sqlite3 "$fixture_db" "PRAGMA foreign_keys=ON;
    INSERT INTO links(id,slug,target_url,created_at,disabled,click_count) VALUES(10,'legacy-old_1','https://example.com/old','2026-01-01T01:02:03.000Z',0,3);
    INSERT INTO links(id,slug,target_url,created_at,disabled,click_count) VALUES(11,'Disabled_OLD','https://example.com/disabled','2026-01-02T01:02:03.000Z',1,2);
    INSERT INTO clicks(id,link_id,clicked_at,referrer_host,country,user_agent_family) VALUES(20,10,'2026-02-01T10:00:00.000Z','ref.example','DE','Chrome');
    INSERT INTO clicks(id,link_id,clicked_at,referrer_host,country,user_agent_family) VALUES(21,10,'2026-02-01T11:00:00.000Z',NULL,'YE','Firefox');
    INSERT INTO clicks(id,link_id,clicked_at,referrer_host,country,user_agent_family) VALUES(22,11,'2026-02-02T11:00:00.000Z',NULL,NULL,NULL);
    CREATE TABLE slug_tombstones(slug TEXT PRIMARY KEY COLLATE BINARY, deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    INSERT INTO slug_tombstones(slug,deleted_at) VALUES('Gone_1','2026-01-03T00:00:00.000Z');"
}

apply_in_transaction() {
  target_db=$1
  { printf 'BEGIN IMMEDIATE;\n'; /bin/cat migrations/0003_compact_base62_slugs.sql; printf '\nCOMMIT;\n'; } | /usr/bin/sqlite3 -bail "$target_db"
}

create_fixture "$db"

before_links=$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM links;')
before_clicks=$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM clicks;')
before_click_sum=$(/usr/bin/sqlite3 "$db" 'SELECT COALESCE(SUM(click_count),0) FROM links;')
before_daily=$(/usr/bin/sqlite3 "$db" "SELECT substr(clicked_at,1,10)||':'||COUNT(*) FROM clicks GROUP BY substr(clicked_at,1,10) ORDER BY 1;")
apply_in_transaction "$db"

[ "$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM links;')" = "$before_links" ]
[ "$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM clicks;')" = "$before_clicks" ]
[ "$(/usr/bin/sqlite3 "$db" 'SELECT COALESCE(SUM(click_count),0) FROM links;')" = "$before_click_sum" ]
[ "$(/usr/bin/sqlite3 "$db" "SELECT substr(clicked_at,1,10)||':'||COUNT(*) FROM clicks GROUP BY substr(clicked_at,1,10) ORDER BY 1;")" = "$before_daily" ]
[ "$(/usr/bin/sqlite3 "$db" 'SELECT id||"|"||slug||"|"||target_url||"|"||created_at||"|"||disabled||"|"||click_count FROM links WHERE id=10;')" = '10|legacy-old_1|https://example.com/old|2026-01-01T01:02:03.000Z|0|3' ]
[ "$(/usr/bin/sqlite3 "$db" 'SELECT id||"|"||link_id||"|"||clicked_at||"|"||country||"|"||user_agent_family FROM clicks WHERE id=20;')" = '20|10|2026-02-01T10:00:00.000Z|DE|Chrome' ]
[ -z "$(/usr/bin/sqlite3 "$db" 'PRAGMA foreign_key_check;')" ]
[ "$(/usr/bin/sqlite3 "$db" "SELECT COUNT(*) FROM slug_tombstones WHERE slug='Gone_1';")" = 1 ]
[ "$(/usr/bin/sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('links_base62','clicks_base62_backup');")" = 0 ]

# Binary collation permits distinct Base62 codes that differ only by case.
/usr/bin/sqlite3 "$db" "INSERT INTO links(slug,target_url) VALUES('aBc1','https://example.com/one'); INSERT INTO links(slug,target_url) VALUES('Abc1','https://example.com/two');"
[ "$(/usr/bin/sqlite3 "$db" "SELECT COUNT(*) FROM links WHERE slug IN ('aBc1','Abc1');")" = 2 ]

# The trigger retains deleted identifiers for application-level non-reuse checks.
/usr/bin/sqlite3 "$db" "DELETE FROM links WHERE slug='aBc1';"
[ "$(/usr/bin/sqlite3 "$db" "SELECT COUNT(*) FROM slug_tombstones WHERE slug='aBc1';")" = 1 ]

# UNIQUE BINARY and tombstones remain effective.
if /usr/bin/sqlite3 "$db" "INSERT INTO links(slug,target_url) VALUES('Abc1','https://example.com/duplicate');" 2>/dev/null; then exit 1; fi

# Reapplying the SQL is data-preserving; Wrangler normally prevents this via d1_migrations.
repeat_links=$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM links;')
repeat_clicks=$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM clicks;')
apply_in_transaction "$db"
[ "$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM links;')" = "$repeat_links" ]
[ "$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM clicks;')" = "$repeat_clicks" ]
[ -z "$(/usr/bin/sqlite3 "$db" 'PRAGMA foreign_key_check;')" ]
[ "$(/usr/bin/sqlite3 "$db" "SELECT COUNT(*) FROM slug_tombstones WHERE slug IN ('Gone_1','aBc1');")" = 2 ]

# A failure inside the implicit-migration transaction rolls back every schema/data change.
create_fixture "$failure_db"
failure_schema=$(/usr/bin/sqlite3 "$failure_db" "SELECT sql FROM sqlite_master WHERE type='table' AND name='links';")
set +e
{ printf 'BEGIN IMMEDIATE;\n'; /bin/cat migrations/0003_compact_base62_slugs.sql; printf '\nSELECT * FROM forced_mid_migration_failure;\nCOMMIT;\n'; } | /usr/bin/sqlite3 -bail "$failure_db" >/dev/null 2>&1
failure_status=$?
set -e
[ "$failure_status" -ne 0 ]
[ "$(/usr/bin/sqlite3 "$failure_db" "SELECT sql FROM sqlite_master WHERE type='table' AND name='links';")" = "$failure_schema" ]
[ "$(/usr/bin/sqlite3 "$failure_db" 'SELECT COUNT(*) FROM links;')" = 2 ]
[ "$(/usr/bin/sqlite3 "$failure_db" 'SELECT COUNT(*) FROM clicks;')" = 3 ]
[ -z "$(/usr/bin/sqlite3 "$failure_db" 'PRAGMA foreign_key_check;')" ]
[ "$(/usr/bin/sqlite3 "$failure_db" "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('links_base62','clicks_base62_backup','keep_deleted_slug');")" = 0 ]

printf 'v1.1.0 migration safety: PASS\n'
