#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
runtime_bin='/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin'
PATH="$runtime_bin:$PATH"
export PATH WRANGLER_SEND_METRICS=false CI=true
export WRANGLER_LOG_PATH="$project_dir/work/wrangler-10d-deploy.log"
admin_password=''
admin_password_repeat=''
turnstile_secret=''
secrets_json=''
trap 'stty echo 2>/dev/null || true; unset admin_password admin_password_repeat turnstile_secret secrets_json' EXIT INT TERM HUP

printf 'Administrator username: '
IFS= read -r admin_username
printf 'Administrator password (hidden, 20+ characters): '
stty -echo
IFS= read -r admin_password
stty echo
printf '\nRepeat administrator password: '
stty -echo
IFS= read -r admin_password_repeat
stty echo
printf '\nTurnstile secret key (hidden): '
stty -echo
IFS= read -r turnstile_secret
stty echo
printf '\n'

[ "$admin_password" = "$admin_password_repeat" ] || { printf 'Passwords do not match. Nothing was deployed.\n' >&2; exit 1; }

secrets_json=$(printf '%s\0%s\0%s' "$admin_username" "$admin_password" "$turnstile_secret" | node scripts/build-staging-secrets.js)
unset admin_password admin_password_repeat turnstile_secret

printf '%s' "$secrets_json" | ./node_modules/.bin/wrangler deploy --env staging --secrets-file /dev/stdin --keep-vars
unset secrets_json
printf 'Protected staging deployment completed.\n'
