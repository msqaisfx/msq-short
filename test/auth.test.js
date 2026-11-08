import test from 'node:test';
import assert from 'node:assert/strict';
import { constantTimeEqual, isAuthRequired, isSafeReturnPath, issueLoginCsrf, parseCookies, secureCookie, sha256, verifyLoginCsrf, verifyPassword } from '../src/auth.js';
import { verifyTurnstile } from '../src/worker.js';

test('cookie parser and secure session attributes', () => {
  assert.deepEqual(parseCookies('a=1; session=abc'), { a: '1', session: 'abc' });
  const cookie = secureCookie('__Host-test', 'value', 60, true, true);
  for (const attribute of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=60']) assert.match(cookie, new RegExp(attribute));
});

test('staging authentication is opt-in and never applied to production', () => {
  assert.equal(isAuthRequired({ STAGING_AUTH_REQUIRED: 'true', APP_ENV: 'staging' }), true);
  assert.equal(isAuthRequired({ STAGING_AUTH_REQUIRED: 'true', APP_ENV: 'production' }), false);
  assert.equal(isAuthRequired({ STAGING_AUTH_REQUIRED: 'false', APP_ENV: 'staging' }), false);
});

test('return paths cannot become external redirects', () => {
  assert.equal(isSafeReturnPath('/admin?x=1'), true);
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', 'admin']) assert.equal(isSafeReturnPath(value), false);
});

test('constant-time comparison and password derivation validation', async () => {
  assert.equal(constantTimeEqual('same', 'same'), true);
  assert.equal(constantTimeEqual('same', 'different'), false);
  const salt = 'c2FsdC1mb3ItdGVzdHM';
  const password = 'local-test-password';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob('c2FsdC1mb3ItdGVzdHM='), c => c.charCodeAt(0)), iterations: 100000 }, key, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  assert.equal(await verifyPassword(password, { salt, hash, iterations: 100000 }), true);
  assert.equal(await verifyPassword('wrong', { salt, hash, iterations: 100000 }), false);
});

test('csrf hashes differ when tokens differ', async () => {
  assert.notEqual(await sha256('one'), await sha256('two'));
});

test('login csrf is signed, client-bound, and expires', async () => {
  const headers = { 'CF-Connecting-IP': '192.0.2.1', 'user-agent': 'test-agent' };
  const request = new Request('https://staging.example/auth/login', { headers });
  const now = 1700000000000;
  const token = await issueLoginCsrf(request, 'test-hmac-secret', now);
  assert.equal(await verifyLoginCsrf(request, token, 'test-hmac-secret', now + 1000), true);
  assert.equal(await verifyLoginCsrf(new Request(request.url, { headers: { ...headers, 'user-agent': 'other' } }), token, 'test-hmac-secret', now + 1000), false);
  assert.equal(await verifyLoginCsrf(request, token, 'test-hmac-secret', now + 600001), false);
});

test('Turnstile rejects missing token and accepts only successful verification', async () => {
  const request = new Request('https://staging.example/api/links');
  const env = { TURNSTILE_REQUIRED: 'true', TURNSTILE_SECRET_KEY: crypto.randomUUID() };
  assert.equal(await verifyTurnstile(request, env, ''), false);
  assert.equal(await verifyTurnstile(request, env, 'valid', async () => new Response('{"success":true}', { headers: { 'content-type': 'application/json' } })), true);
  for (const token of ['invalid', 'expired', 'reused']) {
    assert.equal(await verifyTurnstile(request, env, token, async () => new Response('{"success":false,"error-codes":["timeout-or-duplicate"]}', { headers: { 'content-type': 'application/json' } })), false);
  }
});
