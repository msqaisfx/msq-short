const enc = new TextEncoder();

export const SESSION_COOKIE = '__Host-msq_session';
export const CSRF_COOKIE = '__Host-msq_csrf';
export const LOGIN_CSRF_COOKIE = '__Host-msq_login_csrf';

function bytesToBase64Url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64ToBytes(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256(value) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))));
}

export async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(value))));
}

export async function issueLoginCsrf(request, secret, now = Date.now()) {
  if (!secret) throw new Error('INVALID_AUTH_CONFIGURATION');
  const expires = now + 10 * 60 * 1000;
  const nonce = randomToken(18);
  const address = request.headers.get('CF-Connecting-IP') || 'local';
  const agent = request.headers.get('user-agent') || 'unknown';
  const payload = `${expires}.${nonce}`;
  const signature = await hmac(`${payload}.${address}.${agent}`, secret);
  return `${payload}.${signature}`;
}

export async function verifyLoginCsrf(request, token, secret, now = Date.now()) {
  if (!secret || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || Number(parts[0]) < now) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const address = request.headers.get('CF-Connecting-IP') || 'local';
  const agent = request.headers.get('user-agent') || 'unknown';
  return constantTimeEqual(parts[2], await hmac(`${payload}.${address}.${agent}`, secret));
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

export function secureCookie(name, value, maxAge, secure = true, httpOnly = true) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure ? '; Secure' : ''}${httpOnly ? '; HttpOnly' : ''}`;
}

export function expiredCookie(name, secure = true, httpOnly = true) {
  return secureCookie(name, '', 0, secure, httpOnly);
}

export function constantTimeEqual(left, right) {
  const a = enc.encode(String(left));
  const b = enc.encode(String(right));
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let i = 0; i < length; i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
}

export async function verifyPassword(password, credential) {
  if (!credential || !credential.salt || !credential.hash || !Number.isInteger(credential.iterations) || credential.iterations < 100000) return false;
  let salt;
  try { salt = base64ToBytes(credential.salt); } catch { return false; }
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: credential.iterations }, key, 256);
  return constantTimeEqual(bytesToBase64Url(new Uint8Array(bits)), credential.hash);
}

export function readCredentials(secret) {
  let parsed;
  try { parsed = JSON.parse(secret || '[]'); } catch { throw new Error('INVALID_AUTH_CONFIGURATION'); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) throw new Error('INVALID_AUTH_CONFIGURATION');
  return parsed;
}

export function isAuthRequired(env) {
  return env.STAGING_AUTH_REQUIRED === 'true' && env.APP_ENV !== 'production';
}

export function isProductionAdminAuthRequired(env) {
  return env.APP_ENV === 'production';
}

export function productionAdminAuthConfigured(env) {
  return env.PRODUCTION_ADMIN_AUTH_REQUIRED === 'true'
    && Boolean(env.PRODUCTION_ADMIN_CREDENTIALS)
    && Boolean(env.PRODUCTION_LOGIN_RATE_LIMIT_SECRET);
}

export function credentialSecret(env) {
  return isProductionAdminAuthRequired(env) ? env.PRODUCTION_ADMIN_CREDENTIALS : env.STAGING_AUTH_CREDENTIALS;
}

export function loginRateLimitSecret(env) {
  return isProductionAdminAuthRequired(env) ? env.PRODUCTION_LOGIN_RATE_LIMIT_SECRET : env.LOGIN_RATE_LIMIT_SECRET;
}

export function isSafeReturnPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

export async function getSession(request, env) {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare("SELECT token_hash,username,role,csrf_hash,expires_at FROM auth_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(tokenHash).first();
  return row ? { ...row, tokenHash } : null;
}

export async function requireCsrf(request, session) {
  const cookieToken = parseCookies(request.headers.get('cookie'))[CSRF_COOKIE] || '';
  const headerToken = request.headers.get('X-CSRF-Token') || '';
  if (!cookieToken || !headerToken || !constantTimeEqual(cookieToken, headerToken)) return false;
  return constantTimeEqual(await sha256(cookieToken), session.csrf_hash);
}

export async function rateLimitLogin(request, env) {
  const secret = loginRateLimitSecret(env);
  if (!secret) throw new Error('INVALID_AUTH_CONFIGURATION');
  const address = request.headers.get('CF-Connecting-IP') || 'local';
  const key = await hmac(address, secret);
  const windowSeconds = 900;
  const limit = 5;
  const row = await env.DB.prepare("INSERT INTO auth_login_attempts (client_key,attempt_count,window_started_at) VALUES (?,1,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(client_key) DO UPDATE SET attempt_count=CASE WHEN window_started_at <= datetime('now','-15 minutes') THEN 1 ELSE attempt_count+1 END, window_started_at=CASE WHEN window_started_at <= datetime('now','-15 minutes') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE window_started_at END RETURNING attempt_count").bind(key).first();
  return { allowed: row.attempt_count <= limit, key, count: row.attempt_count, windowSeconds };
}

export async function clearLoginFailures(env, key) {
  await env.DB.prepare('DELETE FROM auth_login_attempts WHERE client_key=?').bind(key).run();
}
