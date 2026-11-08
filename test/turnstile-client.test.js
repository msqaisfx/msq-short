import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTurnstileError, renderTurnstile } from '../public/turnstile-client.js';

test('classifies Turnstile errors without exposing exact diagnostic codes to users', () => {
  assert.equal(classifyTurnstileError('110200'), 'configuration');
  assert.equal(classifyTurnstileError('300010'), 'challenge');
  assert.equal(classifyTurnstileError('300030'), 'challenge');
  assert.equal(classifyTurnstileError('600001'), 'challenge');
  assert.equal(classifyTurnstileError('200500'), 'browser');
  assert.equal(classifyTurnstileError('not-a-code'), 'unknown');
});

test('wires success, expiry, timeout, retry, and sanitized errors', () => {
  const events = [];
  let options;
  const api = { render(selector, value) { assert.equal(selector, '#turnstile'); options = value; return 17; } };
  const widget = renderTurnstile(api, '#turnstile', 'public-site-key', {
    success: token => events.push(['success', token]),
    expired: () => events.push(['expired']),
    timeout: () => events.push(['timeout']),
    error: category => events.push(['error', category])
  });
  assert.equal(widget, 17);
  assert.equal(options.sitekey, 'public-site-key');
  assert.equal(options.retry, 'auto');
  options.callback('one-time-token');
  options['expired-callback']();
  options['timeout-callback']();
  assert.equal(options['error-callback']('300030'), true);
  assert.deepEqual(events, [
    ['success', 'one-time-token'], ['expired'], ['timeout'], ['error', 'challenge']
  ]);
});
