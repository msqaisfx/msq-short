#!/bin/sh
set -eu

export PATH="/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export WRANGLER_LOG_PATH="work/wrangler-integration.log"
export WRANGLER_SEND_METRICS=false

./node_modules/.bin/wrangler dev --local --port 8799 >work/dev-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

attempt=0
until curl -fsS http://127.0.0.1:8799/health >/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { cat work/dev-server.log; exit 1; }
  sleep 1
done

create=$(curl -fsS -X POST http://127.0.0.1:8799/api/links -H 'content-type: application/json' --data '{"url":"https://example.com/a?x=1"}')
printf '%s' "$create" | grep '"ok":true' >/dev/null
slug=$(printf '%s' "$create" | sed -n 's/.*"slug":"\([a-zA-Z0-9]*\)".*/\1/p')
[ "${#slug}" = 4 ]
curl -fsS -o /dev/null -D work/redirect.headers "http://127.0.0.1:8799/$slug"
grep -i '^location: https://example.com/a?x=1' work/redirect.headers >/dev/null
curl -fsS "http://127.0.0.1:8799/api/qr?value=http%3A%2F%2Flocalhost%2F$slug" | grep '<svg' >/dev/null
unauthorized=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8799/admin/api/stats)
[ "$unauthorized" = "401" ]
[ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8799/admin/api/stats -H 'Cf-Access-Authenticated-User-Email: forged@example.com')" = "401" ]
curl -fsS http://127.0.0.1:8799/ | grep 'MSQ Short' >/dev/null

# Legacy path syntax remains routable.
legacy="legacy_$(date +%s)"
./node_modules/.bin/wrangler d1 execute msq-short --local --command "INSERT INTO links(slug,target_url) VALUES('$legacy','https://example.com/legacy');" >/dev/null
[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:8799/$legacy")" = 302 ]

# A deleted Base62 code is tombstoned and cannot be recreated.
deleted="T$(date +%s)"
./node_modules/.bin/wrangler d1 execute msq-short --local --command "INSERT INTO links(slug,target_url) VALUES('$deleted','https://example.com/deleted'); DELETE FROM links WHERE slug='$deleted';" >/dev/null
reuse=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8799/api/links -H 'content-type: application/json' --data "{\"url\":\"https://example.com/reuse\",\"slug\":\"$deleted\"}")
[ "$reuse" = 409 ]

reserved=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8799/api/links -H 'content-type: application/json' --data '{"url":"https://example.com/reserved","slug":"admin"}')
[ "$reserved" = 400 ]

# Three-character custom Base62 codes are supported when available.
custom=$(node -e "const a='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';const b=crypto.getRandomValues(new Uint8Array(3));process.stdout.write([...b].map(x=>a[x%62]).join(''))")
custom_status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8799/api/links -H 'content-type: application/json' --data "{\"url\":\"https://example.com/custom\",\"slug\":\"$custom\"}")
[ "$custom_status" = 201 ]
[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:8799/$custom")" = 302 ]

# Unknown, disabled, reserved, and alternate-path probes disclose only uniform not-found responses.
[ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8799/Zz9Y)" = 404 ]
disabled="D$(date +%s)"
./node_modules/.bin/wrangler d1 execute msq-short --local --command "INSERT INTO links(slug,target_url,disabled) VALUES('$disabled','https://example.com/disabled',1);" >/dev/null
[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:8799/$disabled")" = 404 ]
[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:8799/$custom/extra")" = 404 ]
[ "$(curl -sS --path-as-is -o /dev/null -w '%{http_code}' "http://127.0.0.1:8799/admin/../$custom/extra")" = 404 ]

printf 'integration: PASS\n'
