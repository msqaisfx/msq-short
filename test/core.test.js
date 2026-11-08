import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSlug, randomSlug, safeReferrer, userAgentFamily, validateTarget } from '../src/core.js';

test('normalizes a valid slug', () => assert.equal(normalizeSlug(' My-Link_2 '), 'my-link_2'));
test('rejects reserved, short, and unsafe slugs', () => {
  for (const value of ['api', 'ab', 'bad/slash', 'مرحبا']) assert.throws(() => normalizeSlug(value));
});
test('accepts http and https targets', () => {
  assert.equal(validateTarget('https://example.com/a').startsWith('https://example.com/a'), true);
  assert.equal(validateTarget('http://example.org/'), 'http://example.org/');
});
test('rejects unsafe URL schemes, credentials and loopback', () => {
  for (const value of ['javascript:alert(1)', 'ftp://example.com', 'https://u:p@example.com', 'http://localhost/x', 'http://127.0.0.1']) assert.throws(() => validateTarget(value));
});
test('generates URL-safe slug at requested length', () => {
  const slug = randomSlug(8, data => data.fill(7));
  assert.match(slug, /^[a-zA-Z0-9]+$/); assert.equal(slug.length, 8);
});
test('minimizes referrer and user-agent data', () => {
  assert.equal(safeReferrer('https://news.example/path?q=secret'), 'news.example');
  assert.equal(safeReferrer('not a url'), null);
  assert.equal(userAgentFamily('Mozilla Chrome/130'), 'Chrome');
});
