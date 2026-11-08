import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('official MSQAISFX logo matches the owner-supplied reference', async () => {
  const logo = await readFile(new URL('../public/brand/msqaisfx-logo.png', import.meta.url));
  assert.equal(createHash('sha256').update(logo).digest('hex'), '9879d5e3bd1b754f9658655eaac9cd34936870c7b488168d08d0f389dd3ea2fb');
});

test('official logo is wired to public, admin, login, PWA, social, and README surfaces', async () => {
  const [home, admin, worker, manifest, readme] = await Promise.all([
    read('public/index.html'), read('public/admin/index.html'), read('src/worker.js'),
    read('public/manifest.webmanifest'), read('README.md')
  ]);
  for (const source of [home, admin, worker, manifest, readme]) assert.match(source, /msqaisfx-logo\.png/);
  assert.match(home, /<html lang="ar" dir="rtl">/);
  assert.match(admin, /<html lang="en" dir="ltr">/);
  assert.match(admin, /class="table-wrap"/);
  assert.match(home, /property="og:image" content="\/brand\/msqaisfx-logo\.png"/);
  assert.match(worker, /url\.pathname === '\/brand\/msqaisfx-logo\.png'/);
});
