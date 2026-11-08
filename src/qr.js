const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function uint32(value) { return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]); }

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function chunk(type, data = new Uint8Array()) {
  const name = new TextEncoder().encode(type);
  const body = concat([name, data]);
  return concat([uint32(data.length), body, uint32(crc32(body))]);
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function createQrPng(qr, size = 1024, quietModules = 4) {
  const modules = qr.getModuleCount();
  if (!Number.isInteger(size) || size < 128 || !Number.isInteger(quietModules) || quietModules < 4) throw new Error('INVALID_QR_PNG_OPTIONS');
  const scale = Math.floor(size / (modules + quietModules * 2));
  if (scale < 1) throw new Error('QR_TOO_LARGE');
  const offset = Math.floor((size - modules * scale) / 2);
  const stride = size + 1;
  const pixels = new Uint8Array(stride * size);
  pixels.fill(255);
  for (let y = 0; y < size; y += 1) pixels[y * stride] = 0;
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!qr.isDark(row, column)) continue;
      const left = offset + column * scale;
      const top = offset + row * scale;
      for (let y = top; y < top + scale; y += 1) pixels.fill(0, y * stride + 1 + left, y * stride + 1 + left + scale);
    }
  }
  const ihdr = concat([uint32(size), uint32(size), new Uint8Array([8, 0, 0, 0, 0])]);
  return concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', await deflate(pixels)), chunk('IEND')]);
}
