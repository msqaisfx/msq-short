# Cloudflare deployment

These instructions create resources in your own Cloudflare account. They do not authorize deployment to MSQAISFX infrastructure.

1. Authenticate with `npx wrangler login` and confirm the intended account using `npx wrangler whoami`.
2. Create a D1 database, then replace the placeholder database name/ID in your private deployment configuration.
3. Apply migrations to that database: `npx wrangler d1 migrations apply <database-name> --remote --env staging`.
4. Create a Turnstile widget and set its public site key in non-secret environment variables.
5. Provision `STAGING_AUTH_CREDENTIALS`, `LOGIN_RATE_LIMIT_SECRET`, and `TURNSTILE_SECRET_KEY` with `npx wrangler secret put <NAME> --env staging`. Never place values in Git.
6. Confirm `APP_ENV=staging`, `STAGING_AUTH_REQUIRED=true`, `TURNSTILE_REQUIRED=true`, and a staging-only `APP_BASE_URL`.
7. Run `npm run verify`, inspect `npx wrangler deploy --dry-run --env staging`, then deploy only after explicit approval.

Use Cloudflare's published Turnstile test keys only for local automated tests. Production and staging secrets must be distinct. A missing security secret must fail closed. Before public production deployment, separately review custom domains, observability, retention, abuse controls, and account limits.
