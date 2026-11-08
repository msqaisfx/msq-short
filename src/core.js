const RESERVED = new Set(['api', 'admin', 'health', 'r', 'assets']);

export function normalizeSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,48}$/.test(slug) || RESERVED.has(slug)) {
    throw new Error('INVALID_SLUG');
  }
  return slug;
}

export function validateTarget(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('INVALID_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('INVALID_URL');
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) throw new Error('PRIVATE_URL');
  return url.toString();
}

export function randomSlug(bytes = 6, random = crypto.getRandomValues.bind(crypto)) {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const data = new Uint8Array(bytes);
  random(data);
  return [...data].map(v => alphabet[v % alphabet.length]).join('');
}

export function clientAddress(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
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
