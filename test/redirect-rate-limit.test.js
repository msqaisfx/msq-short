import test from 'node:test';
import assert from 'node:assert/strict';
import { pseudonymousClientKey } from '../src/core.js';
import { enforceRedirectRateLimit } from '../src/worker.js';

const request = ip => new Request('https://short.example/aB9Z', { headers: { 'CF-Connecting-IP': ip } });

test('redirect rate limiting is opt-in for local development', async () => {
  assert.deepEqual(await enforceRedirectRateLimit(request('192.0.2.1'), {}), { allowed: true });
});

test('redirect rate limiting fails closed when required configuration is missing', async () => {
  assert.deepEqual(
    await enforceRedirectRateLimit(request('192.0.2.1'), { REDIRECT_RATE_LIMIT_REQUIRED: 'true' }),
    { allowed: false, unavailable: true }
  );
});

test('pseudonymous client keys are stable, secret-bound, and do not reveal the address', async () => {
  const first = await pseudonymousClientKey(request('192.0.2.10'), 'test-secret-one');
  const same = await pseudonymousClientKey(request('192.0.2.10'), 'test-secret-one');
  const otherSecret = await pseudonymousClientKey(request('192.0.2.10'), 'test-secret-two');
  assert.equal(first, same);
  assert.notEqual(first, otherSecret);
  assert.doesNotMatch(first, /192\.0\.2\.10/);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('repeated and sequential redirect probes stop at the binding decision', async () => {
  let calls = 0;
  const keys = new Set();
  const env = {
    REDIRECT_RATE_LIMIT_REQUIRED: 'true',
    REDIRECT_RATE_LIMIT_SECRET: 'local-test-rate-limit-secret',
    REDIRECT_RATE_LIMITER: {
      async limit({ key }) {
        calls += 1;
        keys.add(key);
        return { success: calls <= 60 };
      }
    }
  };
  const decisions = [];
  for (let index = 0; index < 65; index += 1) {
    decisions.push(await enforceRedirectRateLimit(request('198.51.100.20'), env));
  }
  assert.equal(decisions.filter(value => value.allowed).length, 60);
  assert.equal(decisions.filter(value => !value.allowed).length, 5);
  assert.equal(keys.size, 1);
});
