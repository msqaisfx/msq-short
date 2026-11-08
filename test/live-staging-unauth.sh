#!/bin/sh
set -eu

base="${MSQ_STAGING_URL:?MSQ_STAGING_URL must be supplied at runtime}"
status(){ curl -sS -o /dev/null -w '%{http_code}' "$@"; }

[ "$(status "$base/")" = 303 ]
[ "$(status "$base/styles.css")" = 303 ]
[ "$(status "$base/health")" = 303 ]
[ "$(status "$base/not-a-real-short-link")" = 303 ]
[ "$(status "$base/api/config")" = 401 ]
[ "$(status "$base/api/qr?value=https%3A%2F%2Fexample.com")" = 401 ]
[ "$(status "$base/admin/api/stats")" = 401 ]
[ "$(status -X POST "$base/api/links" -H 'content-type: application/json' --data '{}')" = 401 ]
[ "$(status --path-as-is "$base/admin/../styles.css")" = 303 ]

login_response=$(curl -sS -i "$base/auth/login")
printf '%s' "$login_response" | grep -i '^HTTP/.* 200' >/dev/null
printf '%s' "$login_response" | grep -i '^content-security-policy:' >/dev/null
login_csrf=$(printf '%s' "$login_response" | sed -n 's/.*name="csrf" value="\([^"]*\)".*/\1/p')
[ -n "$login_csrf" ]
wrong_status=$(status -X POST "$base/auth/login" -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'username=invalid-live-test' --data-urlencode 'password=invalid-live-test-password' --data-urlencode "csrf=$login_csrf")
[ "$wrong_status" = 401 ]
unset login_response login_csrf

times=''
i=1
while [ "$i" -le 5 ]; do
  value=$(curl -sS -o /dev/null -w '%{time_total}' "$base/auth/login")
  times="$times $value"
  i=$((i + 1))
done
average=$(printf '%s\n' "$times" | awk '{for(i=1;i<=NF;i++)s+=$i; print s/NF}')
printf 'live unauthenticated security: PASS\n'
printf 'login response average (5 requests): %ss\n' "$average"
