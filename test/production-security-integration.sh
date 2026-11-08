#!/bin/sh
set -eu

: "${MSQ_TEST_PASSWORD:?MSQ_TEST_PASSWORD must be supplied at runtime}"
: "${MSQ_TEST_RATE_SECRET:?MSQ_TEST_RATE_SECRET must be supplied at runtime}"
export PATH="/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export WRANGLER_LOG_PATH="work/wrangler-production-security.log"
export WRANGLER_SEND_METRICS=false
credentials=$(node scripts/make-test-credential.js)

./node_modules/.bin/wrangler dev --local --port 8802 \
  --var APP_ENV:production \
  --var STAGING_AUTH_REQUIRED:false \
  --var PRODUCTION_ADMIN_AUTH_REQUIRED:true \
  --var PRODUCTION_ADMIN_CREDENTIALS:"$credentials" \
  --var PRODUCTION_LOGIN_RATE_LIMIT_SECRET:"$MSQ_TEST_RATE_SECRET" \
  --var TURNSTILE_REQUIRED:false \
  --var REDIRECT_RATE_LIMIT_REQUIRED:false >work/production-security-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

attempt=0
until curl -fsS http://127.0.0.1:8802/ >/dev/null; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 30 ] || { cat work/production-security-server.log; exit 1; }; sleep 1
done

status(){ curl -sS -o /dev/null -w '%{http_code}' "$@"; }

# Public production experience stays anonymous.
[ "$(status http://127.0.0.1:8802/)" = 200 ]
[ "$(status http://127.0.0.1:8802/styles.css)" = 200 ]
[ "$(status http://127.0.0.1:8802/app.js)" = 200 ]
[ "$(status http://127.0.0.1:8802/api/config)" = 200 ]
[ "$(status 'http://127.0.0.1:8802/api/qr?value=https%3A%2F%2Fexample.com')" = 200 ]
create=$(curl -fsS -X POST http://127.0.0.1:8802/api/links -H 'content-type: application/json' --data '{"url":"https://example.com/public-production-test"}')
slug=$(printf '%s' "$create" | sed -n 's/.*"slug":"\([a-zA-Z0-9]*\)".*/\1/p')
[ "${#slug}" = 4 ]
[ "$(status "http://127.0.0.1:8802/$slug")" = 302 ]

# Admin pages, APIs, and admin-only static assets are server-protected.
[ "$(status http://127.0.0.1:8802/admin/)" = 303 ]
[ "$(status http://127.0.0.1:8802/admin/admin.js)" = 303 ]
[ "$(status http://127.0.0.1:8802/admin/api/stats)" = 401 ]
[ "$(status http://127.0.0.1:8802/admin/api/stats -H 'Cf-Access-Authenticated-User-Email: forged@example.com')" = 401 ]

curl -sS http://127.0.0.1:8802/auth/login >work/production-login.html
login_csrf=$(sed -n 's/.*name="csrf" value="\([^"]*\)".*/\1/p' work/production-login.html)
[ "$(status -X POST http://127.0.0.1:8802/auth/login -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'username=unauthorized' --data-urlencode 'password=wrong' --data-urlencode "csrf=$login_csrf")" = 401 ]

curl -sS http://127.0.0.1:8802/auth/login >work/production-login.html
login_csrf=$(sed -n 's/.*name="csrf" value="\([^"]*\)".*/\1/p' work/production-login.html)
code=$(curl -sS -D work/production-session.headers -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8802/auth/login -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'username=security-admin' --data-urlencode "password=$MSQ_TEST_PASSWORD" --data-urlencode "csrf=$login_csrf" --data-urlencode 'returnTo=/admin/')
[ "$code" = 303 ]
session_cookie=$(sed -n 's/^set-cookie: \(__Host-msq_session=[^;]*\).*/\1/ip' work/production-session.headers)
csrf_cookie=$(sed -n 's/^set-cookie: \(__Host-msq_csrf=[^;]*\).*/\1/ip' work/production-session.headers)
auth_cookies="$session_cookie; $csrf_cookie"
csrf=${csrf_cookie#*=}
[ -n "$session_cookie" ] && [ -n "$csrf" ]
[ "$(status -H "Cookie: $auth_cookies" http://127.0.0.1:8802/admin/)" = 200 ]
[ "$(status -H "Cookie: $auth_cookies" http://127.0.0.1:8802/admin/admin.js)" = 200 ]
curl -sS -D - -o /dev/null -H "Cookie: $auth_cookies" http://127.0.0.1:8802/admin/admin.js | grep -qi '^cache-control: no-store'
[ "$(status -H "Cookie: $auth_cookies" http://127.0.0.1:8802/admin/api/stats)" = 200 ]
[ "$(status -H "Cookie: $auth_cookies" -X PATCH http://127.0.0.1:8802/admin/api/links/1 -H 'content-type: application/json' --data '{"disabled":true}')" = 403 ]
[ "$(status -H "Cookie: $auth_cookies" -X PATCH http://127.0.0.1:8802/admin/api/links/1 -H 'content-type: application/json' -H "X-CSRF-Token: $csrf" --data '{"disabled":true}')" = 200 ]
[ "$(status -H "Cookie: $auth_cookies" -X PATCH http://127.0.0.1:8802/admin/api/links/1 -H 'content-type: application/json' -H "X-CSRF-Token: $csrf" --data '{"disabled":false}')" = 200 ]
[ "$(status -H "Cookie: $auth_cookies" -X POST http://127.0.0.1:8802/auth/logout)" = 403 ]
[ "$(status -H "Cookie: $auth_cookies" -X POST http://127.0.0.1:8802/auth/logout -H "X-CSRF-Token: $csrf")" = 303 ]
[ "$(status -H "Cookie: $auth_cookies" http://127.0.0.1:8802/admin/)" = 303 ]
[ "$(status http://127.0.0.1:8802/)" = 200 ]

# Expired sessions are rejected.
expired_token=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")
expired_hash=$(TOKEN="$expired_token" node -e "const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(process.env.TOKEN).digest('base64url'))")
./node_modules/.bin/wrangler d1 execute msq-short --local --command "INSERT OR REPLACE INTO auth_sessions(token_hash,username,role,csrf_hash,expires_at) VALUES('$expired_hash','expired-admin','admin','expired','2000-01-01T00:00:00.000Z')" >/dev/null
[ "$(status -H "Cookie: __Host-msq_session=$expired_token" http://127.0.0.1:8802/admin/)" = 303 ]

# A valid non-admin session cannot reach admin pages or APIs.
tester_token=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")
tester_hash=$(TOKEN="$tester_token" node -e "const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(process.env.TOKEN).digest('base64url'))")
./node_modules/.bin/wrangler d1 execute msq-short --local --command "INSERT OR REPLACE INTO auth_sessions(token_hash,username,role,csrf_hash,expires_at) VALUES('$tester_hash','unauthorized-tester','tester','tester',strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes'))" >/dev/null
[ "$(status -H "Cookie: __Host-msq_session=$tester_token" http://127.0.0.1:8802/admin/)" = 403 ]
[ "$(status -H "Cookie: __Host-msq_session=$tester_token" http://127.0.0.1:8802/admin/api/stats)" = 403 ]

# Repeated failed logins are rate-limited without affecting public access.
i=1
while [ "$i" -le 6 ]; do
  curl -sS -H 'CF-Connecting-IP: 192.0.2.88' http://127.0.0.1:8802/auth/login >work/production-rate.html
  rate_csrf=$(sed -n 's/.*name="csrf" value="\([^"]*\)".*/\1/p' work/production-rate.html)
  code=$(status -X POST http://127.0.0.1:8802/auth/login -H 'CF-Connecting-IP: 192.0.2.88' -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'username=security-admin' --data-urlencode 'password=incorrect' --data-urlencode "csrf=$rate_csrf")
  if [ "$i" -le 5 ]; then [ "$code" = 401 ]; else [ "$code" = 429 ]; fi
  i=$((i + 1))
done
[ "$(status http://127.0.0.1:8802/)" = 200 ]

printf 'production security integration: PASS\n'
