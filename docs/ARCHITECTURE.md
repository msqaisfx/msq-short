# Architecture

MSQ Short is a single Cloudflare Worker with Static Assets and D1. The Worker always runs before asset delivery.

```text
Browser → Worker security gate → route/API handler → D1
                         └──────→ Static Assets
Create link → server-side Turnstile verification → D1
Short slug → redirect handler → privacy-minimized click event → target URL
```

The application separates configuration from logic through environment bindings. `APP_BASE_URL` controls generated links; no production hostname is compiled into routing logic.

Staging may enable `STAGING_AUTH_REQUIRED=true`. Its gate protects pages, APIs, redirects, and application assets. The official logo is the only anonymous asset because it is needed by the login page and is public brand media. Production must set the gate to `false` so the public shortening experience does not require accounts.

D1 migrations define links, click events, staging sessions, and atomic login-attempt counters. Session tokens and CSRF tokens are stored only as SHA-256 hashes. Password verifier records use PBKDF2-SHA-256 and are supplied as a Worker secret.
