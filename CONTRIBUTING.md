# Contributing to MSQ Short

Thank you for contributing. Open an issue before substantial changes, keep pull requests focused, and never include credentials or real user data.

## Development

1. Install Node.js 20+ and run `npm install`.
2. Apply local migrations with `npx wrangler d1 migrations apply msq-short --local`.
3. Start the local Worker with `npx wrangler dev`.
4. Run `npm run verify` before submitting.

Use Conventional Commit-style summaries where practical. Add tests for behavior changes and update both English and Arabic documentation when user-facing behavior changes.

By contributing, you agree that your code is licensed under MIT. Trademark and logo rights remain governed by [TRADEMARKS.md](TRADEMARKS.md).
