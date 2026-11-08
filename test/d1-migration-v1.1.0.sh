#!/bin/sh
set -eu

project_dir=$(pwd)
wrangler="$project_dir/node_modules/.bin/wrangler"
test_root=$(mktemp -d "${TMPDIR:-/tmp}/msq-short-d1-migration.XXXXXX")
trap 'rm -rf "$test_root"' EXIT INT TERM
export PATH="/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export WRANGLER_SEND_METRICS=false
export WRANGLER_LOG_PATH="$test_root/wrangler.log"

prepare_case() {
  case_dir=$1
  mkdir -p "$case_dir/migrations" "$case_dir/state"
  cp test/fixtures/wrangler-migration.jsonc "$case_dir/wrangler.jsonc"
  cp migrations/0001_initial.sql migrations/0002_staging_auth.sql "$case_dir/migrations/"
  CI=true "$wrangler" d1 migrations apply msq-short-migration-test --local --config "$case_dir/wrangler.jsonc" --persist-to "$case_dir/state" >/dev/null
  "$wrangler" d1 execute msq-short-migration-test --local --config "$case_dir/wrangler.jsonc" --persist-to "$case_dir/state" --command "
    INSERT INTO links(id,slug,target_url,created_at,disabled,click_count) VALUES(10,'legacy-old_1','https://example.com/old','2026-01-01T01:02:03.000Z',0,3);
    INSERT INTO links(id,slug,target_url,created_at,disabled,click_count) VALUES(11,'Disabled_OLD','https://example.com/disabled','2026-01-02T01:02:03.000Z',1,2);
    INSERT INTO clicks(id,link_id,clicked_at,referrer_host,country,user_agent_family) VALUES(20,10,'2026-02-01T10:00:00.000Z','ref.example','DE','Chrome');
    INSERT INTO clicks(id,link_id,clicked_at,referrer_host,country,user_agent_family) VALUES(21,10,'2026-02-01T11:00:00.000Z',NULL,'YE','Firefox');
    INSERT INTO clicks(id,link_id,clicked_at,referrer_host,country,user_agent_family) VALUES(22,11,'2026-02-02T11:00:00.000Z',NULL,NULL,NULL);
    CREATE TABLE slug_tombstones(slug TEXT PRIMARY KEY COLLATE BINARY, deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    INSERT INTO slug_tombstones(slug,deleted_at) VALUES('Gone_1','2026-01-03T00:00:00.000Z');" >/dev/null
}

copy_local_db() {
  case_dir=$1
  output=$2
  source_db=$(find "$case_dir/state" -type f -name '*.sqlite' ! -name 'metadata.sqlite' | head -n 1)
  [ -n "$source_db" ]
  /usr/bin/sqlite3 "$source_db" ".backup '$output'"
}

success_dir="$test_root/success"
prepare_case "$success_dir"
cp migrations/0003_compact_base62_slugs.sql "$success_dir/migrations/"
CI=true "$wrangler" d1 migrations apply msq-short-migration-test --local --config "$success_dir/wrangler.jsonc" --persist-to "$success_dir/state" >/dev/null
copy_local_db "$success_dir" "$success_dir/verify.sqlite"
[ "$(/usr/bin/sqlite3 "$success_dir/verify.sqlite" 'SELECT COUNT(*) FROM links;')" = 2 ]
[ "$(/usr/bin/sqlite3 "$success_dir/verify.sqlite" 'SELECT COUNT(*) FROM clicks;')" = 3 ]
[ "$(/usr/bin/sqlite3 "$success_dir/verify.sqlite" 'SELECT SUM(click_count) FROM links;')" = 5 ]
[ "$(/usr/bin/sqlite3 "$success_dir/verify.sqlite" "SELECT COUNT(*) FROM slug_tombstones WHERE slug='Gone_1';")" = 1 ]
[ -z "$(/usr/bin/sqlite3 "$success_dir/verify.sqlite" 'PRAGMA foreign_key_check;')" ]
[ "$(/usr/bin/sqlite3 "$success_dir/verify.sqlite" "SELECT COUNT(*) FROM d1_migrations WHERE name='0003_compact_base62_slugs.sql';")" = 1 ]
[ "$(/usr/bin/sqlite3 "$success_dir/verify.sqlite" "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('links_base62','clicks_base62_backup');")" = 0 ]

failure_dir="$test_root/failure"
prepare_case "$failure_dir"
{ /bin/cat migrations/0003_compact_base62_slugs.sql; printf '\nSELECT * FROM forced_mid_migration_failure;\n'; } >"$failure_dir/migrations/0003_compact_base62_slugs.sql"
set +e
CI=true "$wrangler" d1 migrations apply msq-short-migration-test --local --config "$failure_dir/wrangler.jsonc" --persist-to "$failure_dir/state" >/dev/null 2>&1
failure_status=$?
set -e
[ "$failure_status" -ne 0 ]
copy_local_db "$failure_dir" "$failure_dir/verify.sqlite"
[ "$(/usr/bin/sqlite3 "$failure_dir/verify.sqlite" 'SELECT COUNT(*) FROM links;')" = 2 ]
[ "$(/usr/bin/sqlite3 "$failure_dir/verify.sqlite" 'SELECT COUNT(*) FROM clicks;')" = 3 ]
[ "$(/usr/bin/sqlite3 "$failure_dir/verify.sqlite" "SELECT COUNT(*) FROM d1_migrations WHERE name='0003_compact_base62_slugs.sql';")" = 0 ]
[ "$(/usr/bin/sqlite3 "$failure_dir/verify.sqlite" "SELECT instr(sql,'COLLATE NOCASE') FROM sqlite_master WHERE name='links';")" -gt 0 ]
[ "$(/usr/bin/sqlite3 "$failure_dir/verify.sqlite" "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('links_base62','clicks_base62_backup','keep_deleted_slug');")" = 0 ]
[ -z "$(/usr/bin/sqlite3 "$failure_dir/verify.sqlite" 'PRAGMA foreign_key_check;')" ]

printf 'D1-compatible v1.1.0 migration: PASS\n'
