import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('production secret builder emits verifier material without plaintext credentials', () => {
  const password = 'Synthetic-Production-Password-Only-For-Test';
  const output = execFileSync(process.execPath, ['scripts/build-production-admin-secrets.js'], {
    input: `production-admin\0${password}\0`,
    encoding: 'utf8'
  });
  assert.doesNotMatch(output, new RegExp(password));
  const secrets = JSON.parse(output);
  const credentials = JSON.parse(secrets.PRODUCTION_ADMIN_CREDENTIALS);
  assert.equal(credentials.length, 1);
  assert.equal(credentials[0].username, 'production-admin');
  assert.equal(credentials[0].role, 'admin');
  assert.ok(credentials[0].iterations >= 100000);
  assert.ok(credentials[0].salt.length >= 20);
  assert.ok(credentials[0].hash.length >= 40);
  assert.ok(secrets.PRODUCTION_LOGIN_RATE_LIMIT_SECRET.length >= 64);
});
