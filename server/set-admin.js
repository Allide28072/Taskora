// THE FLASH — set the administrator account.
//
//   node server/set-admin.js <email> <password> [name]
//
// Falls back to ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from the environment.
// The password is hashed with bcrypt before it is stored and is never written
// anywhere else, so it never appears in the database or in any log.
//
// If an administrator already exists under a different address, that account is
// renamed rather than left behind as a second, forgotten way into the console.
import { openDatabase } from './db.js';
import { hashPassword, nowISO } from './util.js';
import { env } from './env.js';

const email = String(process.argv[2] || env.adminEmail || '').trim().toLowerCase();
const password = String(process.argv[3] || env.adminPassword || '');
const name = String(process.argv[4] || env.adminName || 'Administrator');

if (!email || !password) {
  console.error('Usage: node server/set-admin.js <email> <password> [name]');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error(`"${email}" is not a valid email address.`);
  process.exit(1);
}

const db = openDatabase();
const hash = await hashPassword(password);
const now = nowISO();

const target = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
const legacy = target ? null : db.prepare(`SELECT id, email FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get();

// An administrator provisioned from the command line or the environment is
// trusted by construction, so the address is marked confirmed — requiring a
// link that only the operator could receive would lock them out of their own
// console on first boot.
if (target) {
  db.prepare(`UPDATE users SET password_hash = ?, role = 'admin', status = 'active', email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`)
    .run(hash, now, now, target.id);
  console.log(`[admin] password updated for ${email}`);
} else if (legacy) {
  db.prepare(`UPDATE users SET email = ?, password_hash = ?, name = ?, role = 'admin', status = 'active', email_verified = 1, email_verified_at = ?, updated_at = ? WHERE id = ?`)
    .run(email, hash, name, now, now, legacy.id);
  console.log(`[admin] ${legacy.email} renamed to ${email} with a new password`);
} else {
  db.prepare(`INSERT INTO users (name, email, password_hash, role, date_of_birth, profile_image, status, email_verified, email_verified_at, created_at, updated_at)
    VALUES (?, ?, ?, 'admin', '1990-01-01', NULL, 'active', 1, ?, ?, ?)`).run(name, email, hash, now, now, now);
  console.log(`[admin] created ${email}`);
}

// Any session opened before the change is no longer trustworthy.
db.prepare(`UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE role = 'admin')`).run(now);

console.log('[admin] done — sign in from the normal login screen.');
