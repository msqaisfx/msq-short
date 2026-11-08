#!/bin/sh
set -eu

export PATH="/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export WRANGLER_LOG_PATH="work/wrangler-10d-expiry.log"
export WRANGLER_SEND_METRICS=false
token=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")
token_hash=$(TOKEN="$token" node -e "const c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(process.env.TOKEN).digest('base64url'))")
csrf_hash=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")

cleanup(){
  ./node_modules/.bin/wrangler d1 execute msq-short-staging-db --env staging --remote --command "DELETE FROM auth_sessions WHERE username='_expiry_test_10d'" >/dev/null 2>&1 || true
  unset token token_hash csrf_hash
}
trap cleanup EXIT INT TERM

./node_modules/.bin/wrangler d1 execute msq-short-staging-db --env staging --remote --command "DELETE FROM auth_sessions WHERE username='_expiry_test_10d'; INSERT INTO auth_sessions (token_hash,username,role,csrf_hash,expires_at) VALUES ('$token_hash','_expiry_test_10d','tester','$csrf_hash','2000-01-01T00:00:00.000Z')" >/dev/null
status=$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: __Host-msq_session=$token" "${MSQ_STAGING_URL:?MSQ_STAGING_URL must be supplied at runtime}/")
[ "$status" = 303 ]
printf 'live expired session rejection: PASS\n'
