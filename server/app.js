// THE FLASH — express app factory
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { openDatabase } from './db.js';
import { env } from './env.js';
import { verifyToken, unauthorized, forbidden, HttpError } from './util.js';
import { authRouter } from './routes/auth.js';
import { publicRouter, mediaRouter } from './routes/public.js';
import { userRouter } from './routes/user.js';
import { adminRouter } from './routes/admin.js';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function createApp() {
  const db = openDatabase();
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use((req, res, next) => { req.cookies = parseCookies(req); next(); });

  // minimal security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  // global api rate limit (generous ceiling; auth endpoints have their own strict limiter)
  app.use('/api', (req, res, next) => (req.path === '/health' ? next() : next('route')), rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many requests. Please slow down and try again shortly.' } },
  }));

  // ── auth middleware ──────────────────────────────────────────────────
  app.use((req, res, next) => {
    req.user = null;
    const token = req.cookies?.tf_token;
    if (token) {
      try {
        const payload = verifyToken(token);
        // The column list is explicit, so anything publicUser() needs has to be
        // named here — omitting email_verified made every confirmed account
        // report itself as unconfirmed on /auth/me and the profile page.
        let user = db.prepare('SELECT id, name, email, role, status, date_of_birth, profile_image, pref_novels, pref_anime, pref_kids, email_verified, email_verified_at, created_at FROM users WHERE id = ?').get(payload.uid);
        if (user && user.status === 'active') {
          if (payload.jti) {
            const session = db.prepare('SELECT revoked_at FROM sessions WHERE token_id = ?').get(payload.jti);
            if (session && session.revoked_at) user = null;
          }
          req.user = user;
        }
      } catch { /* invalid/expired token → anonymous */ }
    }
    next();
  });

  app.requireAuth = (req, res, next) => (req.user ? next() : next(unauthorized()));
  app.requireAdmin = (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== 'admin') return next(forbidden('Admin access denied.'));
    next();
  };
  app.db = db;

  // ── routes ───────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter(db, app));
  app.use('/api', publicRouter(db, app));
  app.use('/media', mediaRouter(db));
  app.use('/api/user', userRouter(db, app));
  app.use('/api/admin', adminRouter(db, app));

  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'THE FLASH', time: new Date().toISOString() }));

  // 404 for unknown api routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'This endpoint does not exist.' } });
  });

  // unknown media should 404 as data, not fall through to the client below
  app.use('/media', (req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'This media file does not exist.' } });
  });

  // ── the built client (production) ─────────────────────────────────────
  // `npm run build` writes dist/. When it is present this process serves the
  // whole app, so a deployment is one container on one port. In development
  // Vite serves the client instead and proxies /api and /media here.
  const distDir = path.join(env.root, 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    // Vite fingerprints everything in assets/, so those may be cached forever.
    app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    // Client-side routes are real URLs, so anything that is not an api or media
    // request gets the shell — but never the html document from cache.
    app.get('*', (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } });
    });
  } else if (env.isProd) {
    console.warn('[app] dist/index.html not found — run `npm run build` to serve the client from this server.');
  }

  // central error handler — never leak raw database errors
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err && err.code && String(err.code).startsWith('SQLITE_')) {
      if (String(err.message).includes('UNIQUE')) {
        const isEmail = String(err.message).includes('users.email');
        return res.status(409).json({ error: { code: 'conflict', message: isEmail ? 'That email is already registered. Try logging in instead.' : 'That entry already exists.' } });
      }
      return res.status(400).json({ error: { code: 'bad_request', message: 'The request could not be completed.' } });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'too_large', message: 'That payload is too large.' } });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'The request body could not be read.' } });
    }
    console.error('[api]', err);
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } });
  });

  return app;
}
