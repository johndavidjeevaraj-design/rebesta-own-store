import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const production = (env.NODE_ENV || 'development') === 'production';

function requiredProduction(value, name) {
  if (production && !value) throw new Error(`Missing required production environment variable: ${name}`);
  return value || '';
}

export const config = Object.freeze({
  root,
  publicDir: path.join(root, 'public'),
  dataDir: path.resolve(env.DATA_DIR || path.join(root, 'data')),
  host: env.HOST || '0.0.0.0',
  port: Number(env.PORT || 3000),
  nodeEnv: env.NODE_ENV || 'development',
  appUrl: (requiredProduction(env.APP_URL, 'APP_URL') || `http://localhost:${Number(env.PORT || 3000)}`).replace(/\/$/, ''),
  adminKey: requiredProduction(env.ADMIN_KEY, 'ADMIN_KEY') || 'dev-admin-key',
  smtp: Object.freeze({
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 465),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || env.SMTP_USER || '',
    notify: env.NOTIFY_EMAIL || env.SMTP_USER || ''
  }),
  payu: Object.freeze({
    key: env.PAYU_KEY || '',
    salt: env.PAYU_SALT || '',
    url: env.PAYU_URL || 'https://secure.payu.in/_payment'
  })
});
