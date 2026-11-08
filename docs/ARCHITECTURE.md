# Architecture

MSQ Short is a single Cloudflare Worker with Static Assets and D1. The Worker always runs before asset delivery.

```text
Browser → Worker security gate → route/API handler → D1
                         └──────→ Static Assets
Create link → server-side Turnstile verification → D1
Short slug → edge-local rate limiter → D1 lookup → privacy-minimized click event → target URL
```

The application separates configuration from logic through environment bindings. `APP_BASE_URL` controls generated links; no production hostname is compiled into routing logic.

Staging may enable `STAGING_AUTH_REQUIRED=true`. Its gate protects pages, APIs, redirects, and application assets. The official logo is the only anonymous asset because it is needed by the login page and is public brand media.

Production keeps the home page, creation API, QR endpoint, redirects, and public assets anonymous. `APP_ENV=production` always treats `/admin`, `/admin/*`, `/admin/api/*`, and admin authentication routes as protected. `PRODUCTION_ADMIN_AUTH_REQUIRED=true` plus separate production credential and login-rate secrets are required; missing configuration fails closed. The Worker validates hashed application sessions and never trusts a client-supplied Cloudflare Access header.

D1 migrations define links, click events, deletion tombstones, application sessions, and atomic login-attempt counters. Link slugs use case-sensitive `COLLATE BINARY`; old rows are copied unchanged. Session tokens and CSRF tokens are stored only as SHA-256 hashes. Password verifier records use PBKDF2-SHA-256 and are supplied as environment-specific Worker secrets.

Before a short-code lookup, the Worker invokes Cloudflare's Rate Limiting binding with an HMAC-pseudonymized client key. This avoids D1 reads for locally rate-limited probes and does not log raw client addresses. The limit is approximate and local to each Cloudflare location, so it reduces enumeration but cannot make a public short code private or provide a strict global quota.
