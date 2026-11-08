import { allocateSlug, clientAddress, json, normalizeCustomSlug, normalizeSlug, pseudonymousClientKey, safeReferrer, userAgentFamily, validateTarget } from './core.js';
import { CSRF_COOKIE, LOGIN_CSRF_COOKIE, SESSION_COOKIE, clearLoginFailures, credentialSecret, expiredCookie, getSession, isAuthRequired, isProductionAdminAuthRequired, isSafeReturnPath, issueLoginCsrf, loginRateLimitSecret, parseCookies, productionAdminAuthConfigured, randomToken, rateLimitLogin, readCredentials, requireCsrf, secureCookie, sha256, verifyLoginCsrf, verifyPassword } from './auth.js';
import qrcode from 'qrcode-generator';

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};

function error(code, status = 400, headers = {}) { return json({ ok: false, error: code }, status, headers); }

export async function verifyTurnstile(request, env, token, fetcher = fetch) {
  if (env.TURNSTILE_REQUIRED !== 'true') return true;
  if (!env.TURNSTILE_SECRET_KEY || !token) return false;
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  form.set('remoteip', clientAddress(request));
  const res = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  return res.ok && Boolean((await res.json()).success);
}

function cookieSecurity(env) { return env.APP_ENV !== 'local'; }

function loginPage(env, csrf, returnTo = '/', message = '', status = 200) {
  const safeReturn = isSafeReturnPath(returnTo) ? returnTo : '/';
  const production = isProductionAdminAuthRequired(env);
  const pageTitle = production ? 'MSQ Short — Admin Login' : 'MSQ Short — Staging Login';
  const protectionLabel = production ? 'PROTECTED ADMIN' : 'PROTECTED STAGING';
  const introduction = production ? 'Sign in with an authorized administrator account.' : 'Sign in with an authorized testing account.';
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title><link rel="icon" type="image/png" href="/brand/msqaisfx-logo.png"><style>body{margin:0;background:#edf5ff;color:#08234d;font:16px Arial,sans-serif;display:grid;place-items:center;min-height:100vh}.box{width:min(90%,420px);background:white;padding:32px;border-radius:16px;box-shadow:0 20px 60px #075bd822}.logo{display:block;width:84px;height:84px;object-fit:contain;margin:0 auto 18px;border-radius:14px}h1{margin-top:0}label{display:block;font-weight:700;margin-top:16px}input{width:100%;box-sizing:border-box;padding:13px;margin-top:7px;border:1px solid #b9cbe2;border-radius:9px}button{width:100%;margin-top:22px;padding:13px;border:0;border-radius:9px;background:#075bd8;color:white;font-weight:700}.notice{color:#b42318;min-height:20px}.tag{color:#075bd8;font-weight:700}</style></head><body><main class="box"><img class="logo" src="/brand/msqaisfx-logo.png" alt="MSQAISFX"><p class="tag">${protectionLabel}</p><h1>MSQ Short</h1><p>${introduction}</p><p class="notice" role="alert">${escape(message)}</p><form method="post" action="/auth/login"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="returnTo" value="${escape(safeReturn)}"><label>Username<input name="username" autocomplete="username" required maxlength="80"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button type="submit">Sign in</button></form></main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

async function showLogin(request, env, message = '', status = 200) {
  const csrf = await issueLoginCsrf(request, loginRateLimitSecret(env));
  const returnTo = new URL(request.url).searchParams.get('returnTo') || '/';
  return loginPage(env, csrf, returnTo, message, status);
}

async function login(request, env) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('application/x-www-form-urlencoded')) return error('INVALID_CONTENT_TYPE', 415);
  const body = new URLSearchParams(await request.text());
  const csrf = body.get('csrf') || '';
  if (!(await verifyLoginCsrf(request, csrf, loginRateLimitSecret(env)))) return showLogin(request, env, 'Invalid or expired request. Try again.', 403);
  const limit = await rateLimitLogin(request, env);
  if (!limit.allowed) return showLogin(request, env, 'Too many attempts. Try again later.', 429);
  const credentials = readCredentials(credentialSecret(env));
  const username = (body.get('username') || '').trim();
  const candidate = credentials.find(item => item.username === username);
  const validPassword = await verifyPassword(body.get('password') || '', candidate || credentials[0]);
  const allowedRole = isProductionAdminAuthRequired(env) ? candidate?.role === 'admin' : ['admin', 'tester'].includes(candidate?.role);
  if (!candidate || !validPassword || !allowedRole) {
    return showLogin(request, env, 'Invalid username or password.', 401);
  }
  await clearLoginFailures(env, limit.key);
  const token = randomToken();
  const csrfToken = randomToken();
  const duration = 8 * 60 * 60;
  const expires = new Date(Date.now() + duration * 1000).toISOString();
  await env.DB.prepare('INSERT INTO auth_sessions (token_hash,username,role,csrf_hash,expires_at) VALUES (?,?,?,?,?)')
    .bind(await sha256(token), candidate.username, candidate.role, await sha256(csrfToken), expires).run();
  const location = isSafeReturnPath(body.get('returnTo')) ? body.get('returnTo') : '/';
  const response = new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });
  response.headers.append('set-cookie', secureCookie(SESSION_COOKIE, token, duration, cookieSecurity(env), true));
  response.headers.append('set-cookie', secureCookie(CSRF_COOKIE, csrfToken, duration, cookieSecurity(env), false));
  return response;
}

async function logout(request, env, session) {
  if (!(await requireCsrf(request, session))) return error('CSRF_FAILED', 403);
  await env.DB.prepare("UPDATE auth_sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?").bind(session.tokenHash).run();
  const response = new Response(null, { status: 303, headers: { location: '/auth/login', 'cache-control': 'no-store' } });
  response.headers.append('set-cookie', expiredCookie(SESSION_COOKIE, cookieSecurity(env), true));
  response.headers.append('set-cookie', expiredCookie(CSRF_COOKIE, cookieSecurity(env), false));
  return response;
}

async function authenticate(request, env, adminOnly = false) {
  const url = new URL(request.url);
  if (url.pathname === '/auth/login' && request.method === 'GET') return { response: await showLogin(request, env) };
  if (url.pathname === '/auth/login' && request.method === 'POST') return { response: await login(request, env) };
  if (url.pathname === '/brand/msqaisfx-logo.png' && request.method === 'GET') return { response: await env.ASSETS.fetch(request) };
  const session = await getSession(request, env);
  if (!session) {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/') || request.method !== 'GET') return { response: error('AUTHENTICATION_REQUIRED', 401) };
    const target = encodeURIComponent(url.pathname + url.search);
    return { response: Response.redirect(`${url.origin}/auth/login?returnTo=${target}`, 303) };
  }
  if (adminOnly && session.role !== 'admin') return { response: error('ADMIN_REQUIRED', 403) };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && url.pathname !== '/auth/logout' && !(await requireCsrf(request, session))) return { response: error('CSRF_FAILED', 403) };
  if (url.pathname === '/auth/logout') {
    if (request.method !== 'POST') return { response: error('METHOD_NOT_ALLOWED', 405) };
    return { response: await logout(request, env, session) };
  }
  return { session };
}

async function createLink(request, env) {
  let body;
  try { body = await request.json(); } catch { return error('INVALID_JSON'); }
  if (!(await verifyTurnstile(request, env, body.turnstileToken))) return error('TURNSTILE_FAILED', 403);
  let target;
  try { target = validateTarget(body.url); } catch (e) { return error(e.message); }
  const insert = async slug => {
    try {
      const result = await env.DB.prepare(`INSERT INTO links (slug,target_url)
        SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM slug_tombstones WHERE slug=? COLLATE BINARY)`)
        .bind(slug, target, slug).run();
      return Number(result?.meta?.changes ?? 1) === 1;
    } catch (e) {
      if (String(e).includes('UNIQUE')) return false;
      throw e;
    }
  };
  let slug;
  if (body.slug) {
    try { slug = normalizeCustomSlug(body.slug); } catch (e) { return error(e.message); }
    if (!(await insert(slug))) return error('SLUG_TAKEN', 409);
  } else {
    try { slug = await allocateSlug(insert); }
    catch (e) { return e.message === 'SLUG_EXHAUSTED' ? error('SLUG_CAPACITY_RETRY', 503) : error(e.message); }
  }
  const base = String(env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, '');
  return json({ ok: true, slug, shortUrl: `${base}/${slug}` }, 201);
}

export async function enforceRedirectRateLimit(request, env) {
  if (env.REDIRECT_RATE_LIMIT_REQUIRED !== 'true') return { allowed: true };
  if (!env.REDIRECT_RATE_LIMITER?.limit || !env.REDIRECT_RATE_LIMIT_SECRET) return { allowed: false, unavailable: true };
  try {
    const key = await pseudonymousClientKey(request, env.REDIRECT_RATE_LIMIT_SECRET);
    const result = await env.REDIRECT_RATE_LIMITER.limit({ key });
    return { allowed: Boolean(result?.success) };
  } catch {
    return { allowed: false, unavailable: true };
  }
}

async function redirect(request, env, slug) {
  const limit = await enforceRedirectRateLimit(request, env);
  if (!limit.allowed) {
    if (limit.unavailable) return error('SERVICE_UNAVAILABLE', 503);
    return error('RATE_LIMITED', 429, { 'retry-after': '60' });
  }
  let clean;
  try { clean = normalizeSlug(slug); } catch { return error('NOT_FOUND', 404); }
  const row = await env.DB.prepare("SELECT id,target_url,disabled,expires_at FROM links WHERE slug=?").bind(clean).first();
  if (!row || row.disabled || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return error('NOT_FOUND', 404);
  const cf = request.cf || {};
  const click = env.DB.prepare('INSERT INTO clicks (link_id,referrer_host,country,user_agent_family) VALUES (?,?,?,?)')
    .bind(row.id, safeReferrer(request.headers.get('referer')), cf.country || null, userAgentFamily(request.headers.get('user-agent')));
  const count = env.DB.prepare('UPDATE links SET click_count=click_count+1 WHERE id=?').bind(row.id);
  env.ctx.waitUntil(env.DB.batch([click, count]));
  return Response.redirect(row.target_url, 302);
}

async function adminApi(request, env, path, session) {
  if (!session) return error('AUTHENTICATION_REQUIRED', 401);
  if (session.role !== 'admin') return error('ADMIN_REQUIRED', 403);
  if (path === '/admin/api/links' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT id,slug,target_url,created_at,expires_at,disabled,click_count FROM links ORDER BY id DESC LIMIT 200').all();
    return json({ ok: true, links: result.results });
  }
  const match = path.match(/^\/admin\/api\/links\/(\d+)$/);
  if (match && request.method === 'PATCH') {
    const body = await request.json();
    if (typeof body.disabled !== 'boolean') return error('INVALID_STATE');
    await env.DB.prepare('UPDATE links SET disabled=? WHERE id=?').bind(body.disabled ? 1 : 0, match[1]).run();
    return json({ ok: true });
  }
  if (path === '/admin/api/stats' && request.method === 'GET') {
    const totals = await env.DB.prepare('SELECT COUNT(*) links, COALESCE(SUM(click_count),0) clicks FROM links').first();
    const daily = await env.DB.prepare("SELECT substr(clicked_at,1,10) day, COUNT(*) clicks FROM clicks WHERE clicked_at >= datetime('now','-30 days') GROUP BY day ORDER BY day").all();
    return json({ ok: true, totals, daily: daily.results });
  }
  return error('NOT_FOUND', 404);
}

export async function handle(request, env, ctx) {
  env.ctx = ctx;
  const url = new URL(request.url);
  let session = null;
  if (isAuthRequired(env)) {
    const auth = await authenticate(request, env);
    if (auth.response) return auth.response;
    session = auth.session;
  } else if (isProductionAdminAuthRequired(env)) {
    const adminRoute = url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/auth/');
    if (adminRoute) {
      if (!productionAdminAuthConfigured(env)) return error('ADMIN_AUTH_UNAVAILABLE', 503);
      const auth = await authenticate(request, env, true);
      if (auth.response) return auth.response;
      session = auth.session;
    }
  }
  if (url.pathname === '/health') return json({ ok: true, env: env.APP_ENV || 'unknown' });
  if (url.pathname === '/api/config') return json({ baseUrl: env.APP_BASE_URL || url.origin, turnstileSiteKey: env.TURNSTILE_SITE_KEY || '', turnstileRequired: env.TURNSTILE_REQUIRED === 'true' });
  if (url.pathname === '/api/links' && request.method === 'POST') return createLink(request, env);
  if (url.pathname === '/api/qr' && request.method === 'GET') {
    const value = url.searchParams.get('value') || '';
    if (!value || value.length > 2048) return error('INVALID_VALUE');
    const qr = qrcode(0, 'M'); qr.addData(value); qr.make();
    return new Response(qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true }), { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  }
  if (url.pathname.startsWith('/admin/api/')) return adminApi(request, env, url.pathname, session);
  if (request.method === 'GET' && /^\/[a-zA-Z0-9_-]{3,48}$/.test(url.pathname)) return redirect(request, env, url.pathname.slice(1));
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await handle(request, env, ctx);
      const out = new Response(response.body, response);
      for (const [key, value] of Object.entries(SECURITY)) out.headers.set(key, value);
      const pathname = new URL(request.url).pathname;
      if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/auth/')) out.headers.set('cache-control', 'no-store');
      else if (!out.headers.has('cache-control')) out.headers.set('cache-control', 'no-store');
      return out;
    } catch (e) {
      console.error('request_failed', e);
      return error('INTERNAL_ERROR', 500);
    }
  }
};
