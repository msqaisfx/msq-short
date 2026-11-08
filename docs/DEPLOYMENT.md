# Cloudflare deployment

These instructions create resources in your own Cloudflare account. They do not authorize deployment to MSQAISFX infrastructure.

1. Authenticate with `npx wrangler login` and confirm the intended account using `npx wrangler whoami`.
2. Create a D1 database, then replace the placeholder database name/ID in your private deployment configuration.
3. Apply migrations to that database: `npx wrangler d1 migrations apply <database-name> --remote --env staging`.
4. Create a Turnstile widget and set its public site key in non-secret environment variables.
5. Configure the `REDIRECT_RATE_LIMITER` Workers Rate Limiting binding with a unique integer namespace and the reviewed 60 requests/60 seconds policy.
6. Provision `STAGING_AUTH_CREDENTIALS`, `LOGIN_RATE_LIMIT_SECRET`, `REDIRECT_RATE_LIMIT_SECRET`, and `TURNSTILE_SECRET_KEY` with `npx wrangler secret put <NAME> --env staging`. Never place values in Git.
7. Confirm `APP_ENV=staging`, `STAGING_AUTH_REQUIRED=true`, `TURNSTILE_REQUIRED=true`, `REDIRECT_RATE_LIMIT_REQUIRED=true`, and a staging-only `APP_BASE_URL`.
8. Follow `docs/UPGRADING-v1.1.0.md` for migration order, then run `npm run verify`, inspect `npx wrangler deploy --dry-run --env staging`, and deploy only after explicit approval.

Use Cloudflare's published Turnstile test keys only for local automated tests. Production and staging secrets must be distinct. A missing security secret must fail closed. Before public production deployment, separately review custom domains, observability, retention, abuse controls, and account limits.

## Production admin authentication

Production deployment requires `APP_ENV=production`, `STAGING_AUTH_REQUIRED=false`, and `PRODUCTION_ADMIN_AUTH_REQUIRED=true`. Provision `PRODUCTION_ADMIN_CREDENTIALS` and `PRODUCTION_LOGIN_RATE_LIMIT_SECRET` as new Cloudflare Secrets; never copy the Staging values. Only `admin` verifier records are accepted in production.

`scripts/build-production-admin-secrets.js` accepts a NUL-delimited administrator username and password on standard input and emits only PBKDF2 verifier material plus a random login-rate secret. Pipe its output directly to an approved hidden-input provisioning flow; do not save it, echo it to logs, or pass a plaintext password as a command-line argument.

The public home page, link creation, QR, and redirects remain anonymous. The Worker protects `/admin`, all nested admin assets, and every `/admin/api/*` route with its own session and CSRF validation. Do not configure a client-supplied header as an authentication substitute. Missing production admin configuration intentionally returns `503` for admin routes while leaving public routes available.
