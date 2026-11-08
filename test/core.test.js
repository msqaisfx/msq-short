import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSlug, BASE62, normalizeCustomSlug, normalizeSlug, randomSlug, safeReferrer, userAgentFamily, validateTarget } from '../src/core.js';

test('normalizes legacy and Base62 slugs without changing case', () => {
  assert.equal(normalizeSlug(' My-Link_2 '), 'My-Link_2');
  assert.equal(normalizeCustomSlug('aZ9'), 'aZ9');
});
test('rejects reserved, short, and unsafe slugs', () => {
  for (const value of ['api', 'ADMIN', 'ab', 'bad/slash', 'مرحبا', 'spam']) assert.throws(() => normalizeSlug(value));
  for (const value of ['a-b', 'a_b']) assert.throws(() => normalizeCustomSlug(value));
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
  assert.equal(slug, 'hhhhhhhh');
  assert.equal(BASE62.length, 62);
});
test('allocates 1,000 compact codes without duplicates after collision retries', async () => {
  const slugs = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const slug = await allocateSlug(async candidate => {
      if (slugs.has(candidate)) return false;
      slugs.add(candidate);
      return true;
    });
    assert.match(slug, /^[a-zA-Z0-9]{4,6}$/);
  }
  assert.equal(slugs.size, 1000);
});
test('retries collisions and grows from 4 to 5 then 6 characters', async () => {
  const attempts = [];
  const slug = await allocateSlug(async candidate => {
    attempts.push(candidate);
    return candidate.length === 6;
  }, { generator: length => 'A'.repeat(length), attemptsPerLength: 2 });
  assert.equal(slug, 'AAAAAA');
  assert.deepEqual(attempts.map(value => value.length), [4, 4, 5, 5, 6]);
});
test('stops after the explicit collision retry budget', async () => {
  await assert.rejects(
    allocateSlug(async () => false, { generator: length => 'Z'.repeat(length), attemptsPerLength: 2 }),
    /SLUG_EXHAUSTED/
  );
});
test('skips reserved or offensive generated codes', async () => {
  const values = ['porn', 'admin', 'aB9Z'];
  const slug = await allocateSlug(async () => true, { generator: () => values.shift(), lengths: [4], attemptsPerLength: 3 });
  assert.equal(slug, 'aB9Z');
});
test('minimizes referrer and user-agent data', () => {
  assert.equal(safeReferrer('https://news.example/path?q=secret'), 'news.example');
  assert.equal(safeReferrer('not a url'), null);
  assert.equal(userAgentFamily('Mozilla Chrome/130'), 'Chrome');
});
