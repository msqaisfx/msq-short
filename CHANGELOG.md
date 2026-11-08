# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Replaced the previously inferred MSQAISFX logo asset with the owner-supplied official reference.
- Added an automated official-logo fingerprint and surface-wiring regression test.
- Made the administration table horizontally scrollable on narrow screens.

## [1.0.0] - 2026-11-08

### Added

- Bilingual Arabic/English URL-shortening interface with RTL/LTR support.
- Cloudflare Workers Static Assets, D1 storage, Turnstile validation, QR generation, redirects, analytics, and administration.
- Optional application-level staging gate with PBKDF2 credentials, hashed sessions, CSRF defenses, secure cookies, expiry, logout revocation, and login rate limiting.
- Official MSQAISFX branding, PWA metadata, security documentation, tests, and deployment guidance.
