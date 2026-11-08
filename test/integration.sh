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

slug="test-$(date +%s)"
create=$(curl -fsS -X POST http://127.0.0.1:8799/api/links -H 'content-type: application/json' --data "{\"url\":\"https://example.com/a?x=1\",\"slug\":\"$slug\"}")
printf '%s' "$create" | grep '"ok":true' >/dev/null
curl -fsS -o /dev/null -D work/redirect.headers "http://127.0.0.1:8799/$slug"
grep -i '^location: https://example.com/a?x=1' work/redirect.headers >/dev/null
curl -fsS "http://127.0.0.1:8799/api/qr?value=http%3A%2F%2Flocalhost%2F$slug" | grep '<svg' >/dev/null
unauthorized=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8799/admin/api/stats)
[ "$unauthorized" = "401" ]
curl -fsS http://127.0.0.1:8799/admin/api/stats -H 'Cf-Access-Authenticated-User-Email: admin@example.com' | grep '"ok":true' >/dev/null
curl -fsS http://127.0.0.1:8799/ | grep 'MSQ Short' >/dev/null

printf 'integration: PASS\n'
