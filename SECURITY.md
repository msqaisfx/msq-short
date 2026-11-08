# Security Policy

## Supported version

Security fixes are maintained for the latest release line. This repository is not a statement that any particular deployment is production-ready.

## Reporting a vulnerability

Report suspected vulnerabilities privately to the project owner or repository security contact. Do not open a public issue containing exploit details, credentials, live short-link targets, or personal data. Include the affected version, reproduction steps, and impact without including secrets.

## Deployment requirements

- Keep all credentials in Cloudflare Secrets or an ignored local `.dev.vars` file.
- Enable `STAGING_AUTH_REQUIRED=true` only for private staging; production is intentionally public.
- Enable `TURNSTILE_REQUIRED=true` outside local development and verify tokens on the server.
- Keep D1 bindings, Turnstile widgets, hostnames, and secrets environment-specific.
- Preserve `run_worker_first=true` so application security executes before protected assets.
- Configure `REDIRECT_RATE_LIMITER`, provision a distinct `REDIRECT_RATE_LIMIT_SECRET`, and set `REDIRECT_RATE_LIMIT_REQUIRED=true` for public deployments.
- Treat compact short codes as public identifiers. Rate limiting reduces scanning but does not authorize access to sensitive targets.
- Never log passwords, verifier records, Turnstile tokens, session tokens, complete cookies, or authorization headers.
- Rotate any credential suspected of exposure before publishing history.

The application-level staging gate is independent from the final public product. It does not replace a deployment-specific security review, observability, abuse controls, backups, or Cloudflare account governance.
