#!/bin/sh
set -eu

export PATH="/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export WRANGLER_LOG_PATH="work/wrangler-10d-api-test.log"
export WRANGLER_SEND_METRICS=false
session_token=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")
csrf_token=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")
session_hash=$(TOKEN="$session_token" node -e "const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(process.env.TOKEN).digest('base64url'))")
csrf_hash=$(TOKEN="$csrf_token" node -e "const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(process.env.TOKEN).digest('base64url'))")

cleanup(){
  ./node_modules/.bin/wrangler d1 execute msq-short-staging-db --env staging --remote --command "DELETE FROM auth_sessions WHERE username='_api_test_10d'" >/dev/null 2>&1 || true
  unset session_token csrf_token session_hash csrf_hash
}
trap cleanup EXIT INT TERM

./node_modules/.bin/wrangler d1 execute msq-short-staging-db --env staging --remote --command "DELETE FROM auth_sessions WHERE username='_api_test_10d'; INSERT INTO auth_sessions (token_hash,username,role,csrf_hash,expires_at) VALUES ('$session_hash','_api_test_10d','admin','$csrf_hash',strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes'))" >/dev/null
base="${MSQ_STAGING_URL:?MSQ_STAGING_URL must be supplied at runtime}"
cookies="__Host-msq_session=$session_token; __Host-msq_csrf=$csrf_token"
status(){ curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: $cookies" "$@"; }

code=$(status "$base/api/config"); printf 'authenticated_config=%s\n' "$code"; [ "$code" = 200 ]
code=$(status "$base/admin/api/stats"); printf 'admin_stats=%s\n' "$code"; [ "$code" = 200 ]
code=$(status -X POST "$base/api/links" -H 'content-type: application/json' --data '{"url":"https://example.com/missing-csrf"}'); printf 'missing_csrf=%s\n' "$code"; [ "$code" = 403 ]
code=$(status -X POST "$base/api/links" -H 'content-type: application/json' -H "X-CSRF-Token: $csrf_token" --data '{"url":"https://example.com/missing-turnstile"}'); printf 'missing_turnstile=%s\n' "$code"; [ "$code" = 403 ]
code=$(status -X POST "$base/api/links" -H 'content-type: application/json' -H "X-CSRF-Token: $csrf_token" --data '{"url":"https://example.com/invalid-turnstile","turnstileToken":"invalid-live-token"}'); printf 'invalid_turnstile=%s\n' "$code"; [ "$code" = 403 ]

printf 'live authenticated API, CSRF, missing and invalid Turnstile: PASS\n'
