import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import qrcode from 'qrcode-generator';
import { createQrPng } from '../src/qr.js';

function chunks(png) {
  const result = [];
  for (let offset = 8; offset < png.length;) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    result.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
  }
  return result;
}

test('creates a genuine 1024px PNG with a white quiet zone and black QR modules', async () => {
  const qr = qrcode(0, 'M'); qr.addData('https://go.msqaisfxlimited.com/aB19'); qr.make();
  const png = await createQrPng(qr);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const parsed = chunks(png);
  const ihdr = parsed.find(part => part.type === 'IHDR').data;
  const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  assert.equal(view.getUint32(0), 1024);
  assert.equal(view.getUint32(4), 1024);
  assert.equal(ihdr[8], 8);
  assert.equal(ihdr[9], 0);
  const raw = inflateSync(Buffer.concat(parsed.filter(part => part.type === 'IDAT').map(part => Buffer.from(part.data))));
  assert.equal(raw.length, 1025 * 1024);
  assert.equal(raw[1], 255);
  assert.equal(raw[1024], 255);
  assert.ok(raw.includes(0));
  const modules = qr.getModuleCount();
  const scale = Math.floor(1024 / (modules + 8));
  const offset = Math.floor((1024 - modules * scale) / 2);
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      const x = offset + column * scale + Math.floor(scale / 2);
      const y = offset + row * scale + Math.floor(scale / 2);
      assert.equal(raw[y * 1025 + 1 + x], qr.isDark(row, column) ? 0 : 255);
    }
  }
  for (let x = 0; x < 1024; x += 1) {
    assert.equal(raw[1 + x], 255);
    assert.equal(raw[1023 * 1025 + 1 + x], 255);
  }
});

test('the bilingual UI makes PNG primary and retains a separate SVG download', async () => {
  const { readFile } = await import('node:fs/promises');
  const [html, app] = await Promise.all([readFile('public/index.html', 'utf8'), readFile('public/app.js', 'utf8')]);
  assert.match(html, /id="download-png" class="download download-primary" download="MSQ-Short-QR\.png"/);
  assert.match(html, /id="download-svg" class="download download-secondary" download="MSQ-Short-QR\.svg"/);
  assert.match(app, /تحميل رمز QR بصيغة PNG/);
  assert.match(app, /تحميل بصيغة SVG/);
  assert.match(app, /Download QR as PNG/);
  assert.match(app, /Download as SVG/);
  assert.match(app, /downloadPng\.href=qrUrl\+'&format=png'/);
});
