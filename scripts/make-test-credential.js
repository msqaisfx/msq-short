import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.env.MSQ_TEST_PASSWORD;
if (!password) throw new Error('MSQ_TEST_PASSWORD is required');
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
const encode = value => value.toString('base64url');
process.stdout.write(JSON.stringify([{ username: 'security-admin', role: 'admin', iterations: 100000, salt: encode(salt), hash: encode(hash) }]));
