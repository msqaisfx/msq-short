#!/bin/sh
set -eu

: "${MSQ_TEST_PASSWORD:?MSQ_TEST_PASSWORD must be supplied at runtime}"
: "${MSQ_TEST_RATE_SECRET:?MSQ_TEST_RATE_SECRET must be supplied at runtime}"
export PATH="/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export WRANGLER_LOG_PATH="work/wrangler-security.log"
export WRANGLER_SEND_METRICS=false
credentials=$(node scripts/make-test-credential.js)

./node_modules/.bin/wrangler dev --local --port 8800 --var STAGING_AUTH_REQUIRED:true --var STAGING_AUTH_CREDENTIALS:"$credentials" --var LOGIN_RATE_LIMIT_SECRET:"$MSQ_TEST_RATE_SECRET" >work/security-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

attempt=0
until curl -s -o /dev/null http://127.0.0.1:8800/auth/login; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 30 ] || { cat work/security-server.log; exit 1; }; sleep 1
done

status(){ curl -sS -o /dev/null -w '%{http_code}' "$@"; }
[ "${MSQ_TEST_DEBUG:-false}" != true ] || curl -sS -i http://127.0.0.1:8800/
[ "$(status http://127.0.0.1:8800/)" = 303 ]
[ "$(status http://127.0.0.1:8800/styles.css)" = 303 ]
[ "$(status http://127.0.0.1:8800/brand/msqaisfx-logo.png)" = 200 ]
curl -sS -D - -o /dev/null http://127.0.0.1:8800/brand/msqaisfx-logo.png | grep -qi '^content-type: image/png'
[ "$(status http://127.0.0.1:8800/health)" = 303 ]
[ "$(status http://127.0.0.1:8800/unknown-short)" = 303 ]
[ "$(status http://127.0.0.1:8800/admin/api/stats)" = 401 ]
[ "$(status -X POST http://127.0.0.1:8800/api/links -H 'content-type: application/json' --data '{}')" = 401 ]
[ "$(status --path-as-is http://127.0.0.1:8800/admin/../styles.css)" = 303 ]

curl -sS http://127.0.0.1:8800/auth/login >work/login.html
login_csrf=$(sed -n 's/.*name="csrf" value="\([^"]*\)".*/\1/p' work/login.html)
[ "$(status -X POST http://127.0.0.1:8800/auth/login -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'username=security-admin' --data-urlencode "password=$MSQ_TEST_PASSWORD" --data-urlencode 'csrf=wrong')" = 403 ]

curl -sS http://127.0.0.1:8800/auth/login >work/login.html
login_csrf=$(sed -n 's/.*name="csrf" value="\([^"]*\)".*/\1/p' work/login.html)
code=$(curl -sS -D work/session.headers -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8800/auth/login -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'username=security-admin' --data-urlencode "password=$MSQ_TEST_PASSWORD" --data-urlencode "csrf=$login_csrf" --data-urlencode 'returnTo=/admin/')
[ "$code" = 303 ]
session_cookie=$(sed -n 's/^set-cookie: \(__Host-msq_session=[^;]*\).*/\1/ip' work/session.headers)
csrf_cookie=$(sed -n 's/^set-cookie: \(__Host-msq_csrf=[^;]*\).*/\1/ip' work/session.headers)
auth_cookies="$session_cookie; $csrf_cookie"
csrf=${csrf_cookie#*=}
[ -n "$csrf" ]
[ "$(status -H "Cookie: $auth_cookies" http://127.0.0.1:8800/)" = 200 ]
[ "$(status -H "Cookie: $auth_cookies" http://127.0.0.1:8800/admin/api/stats)" = 200 ]
[ "$(status -H "Cookie: $auth_cookies" -X PATCH http://127.0.0.1:8800/admin/api/links/1 -H 'content-type: application/json' --data '{"disabled":true}')" = 403 ]

slug="secure$(date +%s)"
payload="{\"url\":\"https://example.com/security\",\"slug\":\"$slug\"}"
code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: $auth_cookies" -X POST http://127.0.0.1:8800/api/links -H 'content-type: application/json' -H "X-CSRF-Token: $csrf" --data "$payload")
[ "$code" = 201 ]
[ "$(status http://127.0.0.1:8800/$slug)" = 303 ]
[ "$(status -H "Cookie: $auth_cookies" http://127.0.0.1:8800/$slug)" = 302 ]
[ "$(status -H "Cookie: $auth_cookies" -X POST http://127.0.0.1:8800/auth/logout)" = 403 ]
[ "$(status -H "Cookie: $auth_cookies" -X POST http://127.0.0.1:8800/auth/logout -H "X-CSRF-Token: $csrf")" = 303 ]
[ "$(status -H "Cookie: $auth_cookies" http://127.0.0.1:8800/)" = 303 ]

i=1
while [ "$i" -le 6 ]; do
  curl -sS -H 'CF-Connecting-IP: 192.0.2.44' http://127.0.0.1:8800/auth/login >work/rate.html
  rate_csrf=$(sed -n 's/.*name="csrf" value="\([^"]*\)".*/\1/p' work/rate.html)
  code=$(status -X POST http://127.0.0.1:8800/auth/login -H 'CF-Connecting-IP: 192.0.2.44' -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'username=security-admin' --data-urlencode 'password=incorrect' --data-urlencode "csrf=$rate_csrf")
  if [ "$i" -le 5 ]; then [ "$code" = 401 ]; else [ "$code" = 429 ]; fi
  i=$((i + 1))
done

printf 'security integration: PASS\n'
