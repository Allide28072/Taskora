// THE FLASH — shared server utilities
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from './env.js';

export const nowISO = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const bad = (msg, code = 'bad_request') => new HttpError(400, code, msg);
export const unauthorized = (msg = 'You need to sign in to continue.') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Admin access denied.') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, 'not_found', msg);

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function hashPassword(plain) {
  return bcrypt.hash(String(plain), 10);
}
export function verifyPassword(plain, hash) {
  try { return bcrypt.compare(String(plain), hash); } catch { return false; }
}

export function signToken(payload) {
  return jwt.sign(payload, env.sessionSecret, { expiresIn: `${env.sessionDays}d` });
}
export function verifyToken(token) {
  return jwt.verify(token, env.sessionSecret);
}
export function newTokenId() {
  return crypto.randomBytes(18).toString('hex');
}
export function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}
export function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function authCookie(res, token) {
  res.cookie('tf_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
    maxAge: env.sessionDays * 24 * 3600 * 1000,
  });
}
export function clearAuthCookie(res) {
  res.cookie('tf_token', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

export function uniqueSlug(db, table, base, excludeId = null) {
  let slug = slugify(base);
  let i = 1;
  for (;;) {
    const row = excludeId
      ? db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).get(slug, excludeId)
      : db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(slug);
    if (!row) return slug;
    slug = `${slugify(base)}-${++i}`;
  }
}

export function pagination(query, defaults = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(60, Math.max(6, parseInt(query.pageSize, 10) || defaults.pageSize || 24));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function cleanText(s, max = 5000) {
  if (s == null) return '';
  // Strip control characters, keeping tab, newline and carriage return.
  return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

// Cheap shape check used at every entry point (register, login, profile). It
// only has to reject obvious rubbish — the deeper "is this address real?"
// analysis lives in email-policy.js and is what registration actually gates on.
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/;

export function validateRegistration({ name, email, password, confirm, date_of_birth }) {
  const errors = [];
  if (!name || String(name).trim().length < 2) errors.push('Please enter your full name (2+ characters).');
  if (!EMAIL_RE.test(String(email || ''))) errors.push('Please enter a valid email address.');
  const pw = String(password || '');
  if (pw.length < 8) errors.push('Password must be at least 8 characters.');
  else if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) errors.push('Password must contain at least one letter and one number.');
  if (confirm !== undefined && pw !== String(confirm)) errors.push('Passwords do not match.');
  if (date_of_birth) {
    const d = new Date(date_of_birth);
    if (isNaN(d.getTime())) errors.push('Invalid date of birth.');
    else {
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 13) errors.push('You must be at least 13 years old to create an account.');
      if (age > 120) errors.push('Please enter a valid date of birth.');
    }
  }
  return errors;
}

export function parseIntSafe(v, fallback = null) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function parseGenres(db, value) {
  // Accepts array of ids or comma string; returns valid genre ids.
  let ids = [];
  if (Array.isArray(value)) ids = value.map((x) => parseIntSafe(x)).filter((x) => x != null);
  else if (typeof value === 'string' && value.trim()) ids = value.split(',').map((x) => parseIntSafe(x.trim())).filter((x) => x != null);
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT id FROM genres WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  return rows.map((r) => r.id);
}
