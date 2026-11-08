import { pbkdf2Sync, randomBytes } from 'node:crypto';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const values = Buffer.concat(chunks).toString('utf8').split('\0');
const [username, password, turnstileSecret] = values;

if (!username || !/^[a-zA-Z0-9_.@-]{3,80}$/.test(username)) throw new Error('Invalid administrator username');
if (!password || password.length < 20 || password.toLowerCase().includes(username.toLowerCase())) throw new Error('Administrator password does not meet policy');
if (!turnstileSecret || turnstileSecret.length < 20) throw new Error('Invalid Turnstile secret');

const salt = randomBytes(16);
const iterations = 100000;
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const credentials = [{
  username,
  role: 'admin',
  iterations,
  salt: salt.toString('base64url'),
  hash: hash.toString('base64url')
}];

process.stdout.write(JSON.stringify({
  STAGING_AUTH_CREDENTIALS: JSON.stringify(credentials),
  LOGIN_RATE_LIMIT_SECRET: randomBytes(48).toString('base64url'),
  TURNSTILE_SECRET_KEY: turnstileSecret
}));
