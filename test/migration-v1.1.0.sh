#!/bin/sh
set -eu

db_dir=$(mktemp -d "${TMPDIR:-/tmp}/msq-short-migration.XXXXXX")
db="$db_dir/test.sqlite"
trap 'rm -f "$db"; rmdir "$db_dir" 2>/dev/null || true' EXIT INT TERM

/usr/bin/sqlite3 "$db" <migrations/0001_initial.sql
/usr/bin/sqlite3 "$db" <migrations/0002_staging_auth.sql
/usr/bin/sqlite3 "$db" "PRAGMA foreign_keys=ON; INSERT INTO links(slug,target_url,click_count) VALUES('legacy_old','https://example.com/old',3); INSERT INTO clicks(link_id,referrer_host) VALUES(last_insert_rowid(),'example.org');"

before_links=$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM links;')
before_clicks=$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM clicks;')
/usr/bin/sqlite3 "$db" <migrations/0003_compact_base62_slugs.sql

[ "$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM links;')" = "$before_links" ]
[ "$(/usr/bin/sqlite3 "$db" 'SELECT COUNT(*) FROM clicks;')" = "$before_clicks" ]
[ "$(/usr/bin/sqlite3 "$db" 'SELECT target_url FROM links WHERE slug="legacy_old";')" = 'https://example.com/old' ]
[ -z "$(/usr/bin/sqlite3 "$db" 'PRAGMA foreign_key_check;')" ]

# Binary collation permits distinct Base62 codes that differ only by case.
/usr/bin/sqlite3 "$db" "INSERT INTO links(slug,target_url) VALUES('aBc1','https://example.com/one'); INSERT INTO links(slug,target_url) VALUES('Abc1','https://example.com/two');"
[ "$(/usr/bin/sqlite3 "$db" "SELECT COUNT(*) FROM links WHERE slug IN ('aBc1','Abc1');")" = 2 ]

# The trigger retains deleted identifiers for application-level non-reuse checks.
/usr/bin/sqlite3 "$db" "DELETE FROM links WHERE slug='aBc1';"
[ "$(/usr/bin/sqlite3 "$db" "SELECT COUNT(*) FROM slug_tombstones WHERE slug='aBc1';")" = 1 ]

printf 'v1.1.0 migration safety: PASS\n'
