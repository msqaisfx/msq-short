#!/bin/sh
set -eu

: "${MSQ_TEST_RATE_SECRET:?MSQ_TEST_RATE_SECRET must be supplied at runtime}"
export PATH="/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export WRANGLER_LOG_PATH="work/wrangler-redirect-rate-limit.log"
export WRANGLER_SEND_METRICS=false

./node_modules/.bin/wrangler dev --local --port 8801 \
  --var REDIRECT_RATE_LIMIT_REQUIRED:true \
  --var REDIRECT_RATE_LIMIT_SECRET:"$MSQ_TEST_RATE_SECRET" >work/redirect-rate-limit-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

attempt=0
until curl -fsS http://127.0.0.1:8801/health >/dev/null; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 30 ] || { cat work/redirect-rate-limit-server.log; exit 1; }; sleep 1
done

i=1
while [ "$i" -le 60 ]; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -H 'CF-Connecting-IP: 198.51.100.25' "http://127.0.0.1:8801/A$(printf '%03d' "$i")")
  [ "$code" = 404 ]
  i=$((i + 1))
done

code=$(curl -sS -D work/redirect-rate-limit.headers -o /dev/null -w '%{http_code}' -H 'CF-Connecting-IP: 198.51.100.25' http://127.0.0.1:8801/Z999)
[ "$code" = 429 ]
grep -qi '^retry-after: 60' work/redirect-rate-limit.headers

# A different client key is not blocked by the first client's budget.
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H 'CF-Connecting-IP: 198.51.100.26' http://127.0.0.1:8801/Z999)" = 404 ]

printf 'redirect rate limit integration: PASS\n'
