import http from 'node:http';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csrf = randomBytes(24).toString('base64url');
const port = 8898;
let busy = false;

const headers = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
};

function page(message = '', isError = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MSQ Short — Secure Staging Provisioning</title><style>body{font:16px Arial,sans-serif;background:#edf5ff;color:#08234d;display:grid;place-items:center;min-height:100vh;margin:0}.box{background:#fff;width:min(90%,520px);padding:30px;border-radius:16px;box-shadow:0 20px 60px #075bd822}label{display:block;font-weight:700;margin-top:16px}input{box-sizing:border-box;width:100%;padding:12px;margin-top:6px;border:1px solid #b9cbe2;border-radius:8px}button{width:100%;padding:13px;margin-top:22px;background:#075bd8;color:white;border:0;border-radius:8px;font-weight:700}.message{color:${isError ? '#b42318' : '#087443'};font-weight:700}.note{color:#60708a;font-size:14px}</style></head><body><main class="box"><p>LOCAL SECURE PROVISIONING</p><h1>MSQ Short Staging</h1><p class="message">${message}</p>${busy ? '<p>Deployment is running. Do not close this page.</p>' : `<form method="post" action="/provision" autocomplete="off"><input type="hidden" name="csrf" value="${csrf}"><label>Administrator username<input name="username" value="msqaisfx-admin" required minlength="3" maxlength="80" pattern="[a-zA-Z0-9_.@-]+"></label><label>Administrator password<input name="password" type="password" required minlength="20" maxlength="1024"></label><label>Repeat password<input name="repeat" type="password" required minlength="20" maxlength="1024"></label><label>Turnstile secret key<input name="turnstile" type="password" required minlength="20" maxlength="512"></label><button type="submit">Provision secrets and deploy protected staging</button></form><p class="note">Values remain in process memory only. No plaintext secret is written to disk or logs.</p>`}</main></body></html>`;
}

function send(res, status, html) {
  res.writeHead(status, { ...headers, 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function deploy(secrets) {
  return new Promise(resolve => {
    const child = spawn('./node_modules/.bin/wrangler', ['deploy', '--env', 'staging', '--secrets-file', '/dev/stdin', '--keep-vars'], {
      cwd: projectDir,
      env: {
        ...process.env,
        PATH: `/Users/mohammedqais/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:${process.env.PATH}`,
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_LOG_PATH: path.join(projectDir, 'work/wrangler-10d-deploy.log'),
        CI: 'true'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => process.stdout.write(chunk));
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.on('close', code => resolve(code));
    child.stdin.end(JSON.stringify(secrets));
  });
}

const server = http.createServer((req, res) => {
  if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') return send(res, 403, page('Local access only.', true));
  if (req.method === 'GET' && req.url === '/') return send(res, 200, page());
  if (req.method !== 'POST' || req.url !== '/provision' || busy) return send(res, 404, page('Not found.', true));
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 4096) req.destroy();
  });
  req.on('end', async () => {
    const form = new URLSearchParams(raw);
    const username = form.get('username') || '';
    const password = form.get('password') || '';
    const repeat = form.get('repeat') || '';
    const turnstile = form.get('turnstile') || '';
    if (form.get('csrf') !== csrf || !/^[a-zA-Z0-9_.@-]{3,80}$/.test(username) || password.length < 20 || password !== repeat || password.toLowerCase().includes(username.toLowerCase()) || turnstile.length < 20) {
      raw = '';
      return send(res, 400, page('Validation failed. Use a unique 20+ character password and the correct Turnstile secret.', true));
    }
    busy = true;
    const salt = randomBytes(16);
    const credentials = [{ username, role: 'admin', iterations: 100000, salt: salt.toString('base64url'), hash: pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64url') }];
    const secrets = {
      STAGING_AUTH_CREDENTIALS: JSON.stringify(credentials),
      LOGIN_RATE_LIMIT_SECRET: randomBytes(48).toString('base64url'),
      TURNSTILE_SECRET_KEY: turnstile
    };
    raw = '';
    form.delete('password'); form.delete('repeat'); form.delete('turnstile');
    const code = await deploy(secrets);
    for (const key of Object.keys(secrets)) secrets[key] = '';
    if (code === 0) {
      send(res, 200, page('Protected staging deployment completed successfully.'));
      console.log('PROVISION_RESULT=PASS');
    } else {
      busy = false;
      send(res, 500, page('Deployment failed. No successful deployment was reported.', true));
      console.log(`PROVISION_RESULT=FAIL code=${code}`);
    }
  });
});

server.listen(port, '127.0.0.1', () => console.log(`PROVISION_UI_READY=http://127.0.0.1:${port}/`));
setTimeout(() => { if (!busy) server.close(); }, 15 * 60 * 1000);
