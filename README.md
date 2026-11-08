<p align="center"><img src="public/brand/msqaisfx-logo.png" alt="MSQAISFX" width="160"></p>

# MSQ Short

[العربية](README.ar.md) · English

MSQ Short is an open-source, bilingual URL shortener by MSQAISFX. It runs on Cloudflare Workers with Static Assets, D1, and Turnstile. Application logic is domain-independent; `APP_BASE_URL` selects the environment hostname.

## Features

- Arabic and English UI with RTL/LTR switching.
- Short-link generation, copy action, SVG QR codes, redirects, and privacy-minimized statistics.
- D1-backed link administration and analytics.
- Server-side Turnstile verification.
- Optional staging-only authentication gate covering pages, APIs, redirects, and non-public assets.
- HttpOnly/Secure/SameSite cookies, hashed sessions, CSRF protection, expiry, revocation, PBKDF2 credentials, and login rate limiting.

## Interface

The core flow remains: **paste → shorten → copy**. Screenshots may be added after a separately authorized deployment; this repository does not expose private staging or administration URLs.

## Stack

Cloudflare Workers, Workers Static Assets, D1, Turnstile, JavaScript modules, and `qrcode-generator`.

## Local development

Requirements: Node.js 20+ and npm.

```sh
npm install
npx wrangler d1 migrations apply msq-short --local
npx wrangler dev
npm run verify
```

Copy `.env.example` only as a reference. For local secrets, use an ignored `.dev.vars` file. Do not commit real credentials.

## Configuration

| Variable | Secret | Purpose |
|---|---:|---|
| `APP_BASE_URL` | No | Base URL used in generated short links |
| `APP_ENV` | No | `local`, `staging`, or `production` |
| `TURNSTILE_SITE_KEY` | No | Public Turnstile widget key |
| `TURNSTILE_REQUIRED` | No | Enables mandatory server validation |
| `TURNSTILE_SECRET_KEY` | Yes | Turnstile server secret |
| `STAGING_AUTH_REQUIRED` | No | Enables the staging-only gate |
| `STAGING_AUTH_CREDENTIALS` | Yes | JSON PBKDF2 verifier records; no plaintext passwords |
| `LOGIN_RATE_LIMIT_SECRET` | Yes | Pseudonymizes login client addresses |

The credential JSON is a limited array of records containing `username`, `role`, `salt`, `iterations`, and `hash`. Generate records offline using an approved password-management process. Never reuse production passwords.

## Cloudflare setup

Create your own D1 database, update a private deployment configuration with its ID, apply `migrations/`, and provision secrets using `wrangler secret put`. Create a Turnstile widget and configure its public site key separately from the secret key. Full, safety-focused steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); design details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

The Worker validates HTTP(S) targets, rejects credential-bearing and local-loopback URLs, verifies Turnstile on the server, applies security headers, and minimizes analytics data. Staging authentication is independent of the final public product. See [SECURITY.md](SECURITY.md) for reporting and supported-version information.

## Tests

```sh
npm test
npm run test:integration
npm run test:security
npm run verify
```

Live Cloudflare tests require an explicitly approved environment and are not part of the default verification command.

## License and trademarks

Code is available under the [MIT License](LICENSE). MSQAISFX names, logos, and identity assets are not automatically licensed under MIT; see [TRADEMARKS.md](TRADEMARKS.md).
