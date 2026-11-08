export const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const RESERVED = new Set([
  'api', 'admin', 'auth', 'brand', 'health', 'r', 'assets',
  'login', 'logout', 'robots', 'static', 'support'
]);
const BLOCKED = new Set([
  'abuse', 'fuck', 'fucker', 'nazi', 'porn', 'scam', 'sex', 'spam', 'terror'
]);

function assertAllowed(slug) {
  const folded = slug.toLowerCase();
  if (RESERVED.has(folded) || BLOCKED.has(folded)) throw new Error('INVALID_SLUG');
  return slug;
}

export function normalizeSlug(value) {
  const slug = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{3,48}$/.test(slug)) throw new Error('INVALID_SLUG');
  return assertAllowed(slug);
}

export function normalizeCustomSlug(value) {
  const slug = String(value || '').trim();
  if (!/^[a-zA-Z0-9]{3,48}$/.test(slug)) throw new Error('INVALID_SLUG');
  return assertAllowed(slug);
}

export function validateTarget(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('INVALID_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('INVALID_URL');
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) throw new Error('PRIVATE_URL');
  return url.toString();
}

export function randomSlug(length = 4, random = crypto.getRandomValues.bind(crypto)) {
  if (!Number.isInteger(length) || length < 3 || length > 48) throw new Error('INVALID_SLUG_LENGTH');
  let slug = '';
  while (slug.length < length) {
    const data = new Uint8Array(Math.max(8, (length - slug.length) * 2));
    random(data);
    for (const value of data) {
      // Rejection sampling avoids modulo bias: 248 is the largest multiple of 62 below 256.
      if (value >= 248) continue;
      slug += BASE62[value % BASE62.length];
      if (slug.length === length) break;
    }
  }
  return slug;
}

export async function allocateSlug(insert, { generator = randomSlug, lengths = [4, 5, 6], attemptsPerLength = 8 } = {}) {
  for (const length of lengths) {
    for (let attempt = 0; attempt < attemptsPerLength; attempt += 1) {
      let slug;
      try { slug = normalizeCustomSlug(generator(length)); }
      catch { continue; }
      if (await insert(slug)) return slug;
    }
  }
  throw new Error('SLUG_EXHAUSTED');
}

export function clientAddress(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

export async function pseudonymousClientKey(request, secret) {
  if (!secret) throw new Error('RATE_LIMIT_NOT_CONFIGURED');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(clientAddress(request)));
  return [...new Uint8Array(signature)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

export function safeReferrer(value) {
  try { return value ? new URL(value).hostname.slice(0, 255) : null; } catch { return null; }
}

export function userAgentFamily(value) {
  const ua = value || '';
  for (const name of ['Firefox', 'Edg', 'Chrome', 'Safari']) if (ua.includes(name)) return name === 'Edg' ? 'Edge' : name;
  return ua ? 'Other' : null;
}
