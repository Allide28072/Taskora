// THE FLASH — environment configuration (no external dotenv dependency needed)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseEnvFile(file) {
  const out = {};
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch { /* file missing is fine */ }
  return out;
}

const fileEnv = { ...parseEnvFile(path.join(ROOT, '.env')), ...parseEnvFile(path.join(__dirname, '.env')) };
const get = (key, fallback = '') => process.env[key] ?? fileEnv[key] ?? fallback;

export const env = {
  root: ROOT,
  nodeEnv: get('NODE_ENV', 'development'),
  isProd: get('NODE_ENV', 'development') === 'production',

  sessionSecret: get('SESSION_SECRET') || crypto.randomBytes(48).toString('hex'),
  // Secure cookies require HTTPS, so production turns it on. COOKIE_SECURE is
  // the escape hatch for serving a container over plain HTTP.
  cookieSecure: _bool(get('COOKIE_SECURE'), get('NODE_ENV', 'development') === 'production'),
  sessionDays: Number(get('SESSION_DAYS', '30')),

  adminEmail: get('ADMIN_EMAIL', 'admin@theflash.app'),
  adminPassword: get('ADMIN_PASSWORD', 'ChangeMe!2026'),
  adminName: get('ADMIN_NAME', 'The Flash Admin'),

  // ── outbound mail ────────────────────────────────────────────────────
  // Transport is 'smtp' as soon as SMTP_HOST is set, otherwise 'log': the
  // message is appended to <DATA_DIR>/mail-outbox.log instead of being sent,
  // so the sign-up flow stays usable without a mail server.
  mailTransport: _mailTransport(),
  mailFrom: get('MAIL_FROM') || 'THE FLASH <no-reply@theflash.app>',
  smtpHost: get('SMTP_HOST', '').trim(),
  smtpPort: _smtpPort(get('SMTP_PORT', '587')),
  smtpSecure: _tristate(get('SMTP_SECURE')),
  smtpUser: get('SMTP_USER', '').trim(),
  smtpPass: get('SMTP_PASS', ''),

  // ── email verification ───────────────────────────────────────────────
  // An account cannot be used until its address is confirmed (the default).
  // Turning this off is for local demos and tests only.
  requireEmailVerification: _bool(get('REQUIRE_EMAIL_VERIFICATION'), true),
  // Ask DNS whether the domain can receive mail at all before creating a row.
  verifyEmailMx: _bool(get('EMAIL_MX_CHECK'), true),
  // Public origin used to build links inside emails.
  appUrl: (get('APP_URL', '') || `http://localhost:${_validPort(get('PORT', '3001'))}`).replace(/\/+$/, ''),

  tmdbApiKey: get('TMDB_API_KEY', ''),
  tmdbAccessToken: get('TMDB_ACCESS_TOKEN', ''),
  tmdbLanguage: get('TMDB_LANGUAGE', 'en-US'),

  // 'photos' shows real photography with generated art as the fallback;
  // 'generated' disables remote images entirely (fully offline deployments).
  imageSource: get('IMAGE_SOURCE', 'photos') === 'generated' ? 'generated' : 'photos',

  port: _validPort(get('PORT', '3001')),
  dataDir: path.join(ROOT, get('DATA_DIR', 'data')),
  dbPath: path.join(ROOT, get('DATA_DIR', 'data'), 'theflash.db'),
};

function _bool(v, fallback) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '') return fallback;
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function _validPort(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 3001;
}

function _smtpPort(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 587;
}

/** Blank means "unset" (null) rather than false, which matters for SMTP_SECURE. */
function _tristate(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '') return null;
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function _mailTransport() {
  const explicit = String(get('MAIL_TRANSPORT', '')).trim().toLowerCase();
  const host = get('SMTP_HOST', '').trim();
  if (explicit === 'smtp' && !host) {
    console.warn('[env] MAIL_TRANSPORT=smtp but SMTP_HOST is empty — using the log transport instead.');
    return 'log';
  }
  if (explicit === 'smtp' || explicit === 'log') return explicit;
  return host ? 'smtp' : 'log';
}

if (!get('SESSION_SECRET')) {
  console.warn('[env] SESSION_SECRET not set — using an ephemeral secret (sessions reset on restart).');
}
