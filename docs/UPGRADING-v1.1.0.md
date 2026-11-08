# Upgrading MSQ Short from v1.0.1 to v1.1.0

This upgrade introduces compact case-sensitive Base62 codes, deletion tombstones, and redirect rate limiting. It does not rename or rewrite existing links.

## Required preparation

1. Export or back up the target D1 database.
2. Test `0003_compact_base62_slugs.sql` against a disposable copy of current data.
3. Confirm `PRAGMA foreign_key_check` returns no rows and compare row counts before and after migration.
4. Configure a Workers Rate Limiting binding named `REDIRECT_RATE_LIMITER` with a unique positive integer namespace, a limit of 60, and period of 60 seconds.
5. Provision a distinct random `REDIRECT_RATE_LIMIT_SECRET` through Cloudflare Secrets. Never store it in Git.
6. Set `REDIRECT_RATE_LIMIT_REQUIRED=true` only when the binding and secret are present. The Worker fails closed with 503 if required protection is unavailable.

## Safe order

Apply the reviewed D1 migration during an approved maintenance window, verify legacy redirects against the migrated database, then deploy the matching v1.1.0 code and configuration. Do not deploy the code against an unmigrated database because link creation requires `slug_tombstones`.

## Rollback warning

The v1.0.1 code can read the migrated `links` table, but it lowercases incoming slugs and therefore cannot safely serve new case-sensitive v1.1.0 codes. Once v1.1.0 has created mixed-case codes, application rollback requires a compatibility patch rather than simply restoring v1.0.1. Database rollback should use the verified pre-migration backup; do not drop tombstones or migrated data without review.

## Security limitations

Four-character codes have 14,776,336 combinations and are enumerable. Rate limiting reduces automated discovery but does not make links private. Cloudflare's Workers Rate Limiting API is approximate and counters are local to a Cloudflare location, so distributed scans or short bursts can exceed the nominal limit. Sensitive destinations require their own authorization.
