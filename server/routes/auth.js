// THE FLASH — authentication API
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  hashPassword, verifyPassword, signToken, verifyToken, newTokenId, authCookie, clearAuthCookie,
  bad, unauthorized, notFound, nowISO, sha256, randomToken, EMAIL_RE, validateRegistration, cleanText, asyncH,
} from '../util.js';
import { env } from '../env.js';
import { poster } from '../art.js';
import { assessEmail } from '../email-policy.js';
import { mail, verificationEmail } from '../mail.js';

const strictLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Please wait 15 minutes and try again.' } },
});

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    date_of_birth: u.date_of_birth, profile_image: u.profile_image,
    email_verified: !!u.email_verified,
    prefs: { novels: !!u.pref_novels, anime: !!u.pref_anime, kids: !!u.pref_kids },
    created_at: u.created_at,
  };
}

/** The "your story starts here" notification, sent once the address is trusted. */
function welcome(db, user, t) {
  const already = db.prepare("SELECT id FROM notifications WHERE user_id = ? AND link = '/profile'").get(user.id);
  if (already) return;
  db.prepare(`INSERT INTO notifications (user_id, type, message, link, is_read, created_at) VALUES (?, 'system', ?, '/profile', 0, ?)`)
    .run(user.id, `Welcome to THE FLASH, ${String(user.name).split(' ')[0]}. Your story starts here.`, t);
}

/**
 * Issues a single-use confirmation link for an address.
 *
 * Only the token's hash is stored, earlier unused links are retired so an old
 * email cannot be replayed, and a delivery failure never throws — the account
 * row already exists, so the person is told to check their inbox and the resend
 * endpoint is there if the message never arrives.
 */
async function issueVerification(db, userId, email, name) {
  const token = randomToken();
  const t = nowISO();
  db.prepare('UPDATE email_verifications SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(t, userId);
  db.prepare(`INSERT INTO email_verifications (user_id, token_hash, email, expires_at, created_at)
    VALUES (?, ?, ?, datetime(?, '+24 hours'), ?)`).run(userId, sha256(token), email, t, t);

  const link = `${env.appUrl}/verify?token=${token}`;
  let delivered = false;
  try {
    await mail.send({ to: email, ...verificationEmail({ name, link }) });
    delivered = mail.delivers;
  } catch (err) {
    console.error(`[auth] could not deliver the confirmation email to ${email}: ${err.message}`);
  }

  // With no mail transport configured the link is handed to the client instead,
  // in development only — the same escape hatch the password-reset token uses.
  const dev = !mail.delivers && !env.isProd ? { dev_verify_link: link } : {};
  return { delivered, dev };
}

export function authRouter(db, app) {
  const r = Router();

  const startSession = (res, user) => {
    const jti = newTokenId();
    const token = signToken({ uid: user.id, role: user.role, jti });
    db.prepare('INSERT INTO sessions (user_id, token_id, user_agent, ip, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(user.id, jti, '', '', nowISO(), nowISO());
    authCookie(res, token);
    return token;
  };

  // ── register ─────────────────────────────────────────────────────────
  r.post('/register', strictLimit, asyncH(async (req, res) => {
    const body = req.body || {};
    const name = cleanText(body.name, 80);
    const email = cleanText(body.email, 120).toLowerCase();
    const errors = validateRegistration({ name, email, password: body.password, confirm: body.confirm, date_of_birth: body.date_of_birth });
    if (errors.length) return res.status(400).json({ error: { code: 'validation', message: errors[0], errors } });

    // "Is this a real address?" runs before anything is written. Addresses that
    // cannot exist, throwaway mailboxes and typos of big providers are refused
    // with a specific reason so the form can point at the right thing.
    const verdict = await assessEmail(email, { checkMx: env.verifyEmailMx });
    if (!verdict.ok) {
      return res.status(400).json({
        error: { code: verdict.code, message: verdict.message, errors: [verdict.message] },
        suggestion: verdict.suggestion || null,
      });
    }

    const hash = await hashPassword(body.password);
    const t = nowISO();
    const dob = body.date_of_birth ? cleanText(body.date_of_birth, 10) : null;
    const avatar = poster('user:' + email + t, name);

    const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(email);
    if (existing && existing.email_verified) {
      return res.status(409).json({ error: { code: 'email_taken', message: 'This email is already registered. Try logging in instead.' } });
    }

    let userId;
    if (existing) {
      // A previous attempt never confirmed its address. Let the form be
      // finished rather than trapping them behind an address they cannot reuse.
      db.prepare('UPDATE users SET name = ?, password_hash = ?, date_of_birth = ?, profile_image = ?, updated_at = ? WHERE id = ?')
        .run(name, hash, dob, avatar, t, existing.id);
      userId = existing.id;
    } else {
      const info = db.prepare(`INSERT INTO users (name, email, password_hash, role, date_of_birth, profile_image, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'user', ?, ?, 'active', ?, ?, ?)`)
        .run(name, email, hash, dob, avatar, env.requireEmailVerification ? 0 : 1, t, t);
      userId = Number(info.lastInsertRowid);
    }

    if (!env.requireEmailVerification) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      welcome(db, user, t);
      startSession(res, user);
      return res.status(201).json({ user: publicUser(user), redirect: '/home' });
    }

    // No session yet: the account exists but the address is not trusted until
    // the link we just sent is opened.
    const issued = await issueVerification(db, userId, email, name);
    res.status(201).json({
      pending_verification: true,
      email,
      message: `We sent a confirmation link to ${email}. Open it to finish setting up your account.`,
      mail_delivered: issued.delivered,
      ...issued.dev,
    });
  }));

  // ── email lookup (first step of the two-step sign-in) ────────────────
  // The sign-in screen asks for the email on its own so it can either move on
  // to the password or send brand-new visitors straight to account creation.
  // That does confirm whether an address is registered, which is a deliberate
  // product choice here; the limiter below keeps it from being harvested.
  const lookupLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Please wait a moment and try again.' } },
  });

  r.post('/lookup', lookupLimit, (req, res) => {
    const email = cleanText(req.body?.email, 120).toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: { code: 'invalid_email', message: 'Please enter a valid email address.' } });
    }
    const user = db.prepare('SELECT id, name, status FROM users WHERE email = ?').get(email);
    res.json({
      exists: !!user,
      first_name: user ? String(user.name).split(' ')[0] : null,
      disabled: user ? user.status === 'disabled' : false,
    });
  });

  // ── login ────────────────────────────────────────────────────────────
  r.post('/login', strictLimit, asyncH(async (req, res) => {
    const email = cleanText(req.body?.email, 120).toLowerCase();
    const password = String(req.body?.password || '');
    if (!EMAIL_RE.test(email) || !password) {
      return res.status(400).json({ error: { code: 'invalid_credentials', message: 'Please enter a valid email and password.' } });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: { code: 'invalid_credentials', message: 'Incorrect email or password.' } });
    }
    if (user.status === 'disabled') {
      return res.status(403).json({ error: { code: 'account_disabled', message: 'This account has been disabled. Contact support.' } });
    }
    // The password was right, but an unconfirmed address is still not allowed in.
    if (!user.email_verified && env.requireEmailVerification) {
      return res.status(403).json({
        error: { code: 'email_unverified', message: `Confirm your email before signing in. We sent a link to ${user.email}.` },
        email: user.email,
      });
    }
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(nowISO(), nowISO(), user.id);
    startSession(res, user);
    res.json({ user: publicUser(user), redirect: user.role === 'admin' ? '/admin/dashboard' : '/home' });
  }));

  // ── logout ───────────────────────────────────────────────────────────
  r.post('/logout', (req, res) => {
    const token = req.cookies?.tf_token;
    if (token) {
      try {
        const payload = verifyToken(token);
        if (payload?.jti) db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_id = ?').run(nowISO(), payload.jti);
      } catch { /* already invalid */ }
    }
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  // ── me ───────────────────────────────────────────────────────────────
  r.get('/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Not signed in.' } });
    res.json({ user: publicUser(req.user) });
  });

  // ── confirm an email address ─────────────────────────────────────────
  const verifyLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Please wait 15 minutes and try again.' } },
  });

  const invalidLink = (res) => res.status(400).json({
    error: { code: 'invalid_token', message: 'This confirmation link is invalid or has expired. Request a new one.' },
  });

  // The link in the email leads to the app's /verify screen, which calls this.
  // Redeeming is a POST on purpose: mail providers and security scanners fetch
  // links before a person opens them, and a GET that consumed the token would
  // break sign-up for anyone whose inbox scanned the message first.
  r.post('/verify', verifyLimit, asyncH(async (req, res) => {
    const token = cleanText(req.body?.token, 128);
    if (!token) return invalidLink(res);

    const row = db.prepare('SELECT * FROM email_verifications WHERE token_hash = ?').get(sha256(token));
    if (!row || row.used_at || row.expires_at < nowISO()) return invalidLink(res);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    if (!user) return invalidLink(res);
    // The address may have moved on since the link was issued.
    if (user.email !== row.email) {
      return res.status(409).json({ error: { code: 'email_changed', message: 'That link was issued for a different address. Request a new one.' } });
    }

    const t = nowISO();
    db.prepare('UPDATE users SET email_verified = 1, email_verified_at = ?, updated_at = ? WHERE id = ?').run(t, t, user.id);
    db.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').run(t, row.id);

    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    welcome(db, fresh, t);
    // Opening the link is proof enough of the address, so sign them straight in.
    startSession(res, fresh);
    res.json({ user: publicUser(fresh), redirect: fresh.role === 'admin' ? '/admin/dashboard' : '/home' });
  }));

  // ── send the confirmation link again ─────────────────────────────────
  r.post('/resend-verification', strictLimit, asyncH(async (req, res) => {
    const email = cleanText(req.body?.email, 120).toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: { code: 'invalid_email', message: 'Please enter a valid email address.' } });
    }
    const generic = { ok: true, message: 'If that address still needs confirming, a fresh link is on its way.' };

    const user = db.prepare('SELECT id, name, email, email_verified FROM users WHERE email = ?').get(email);
    if (!user || user.email_verified) return res.json(generic);

    // One link per minute per account, so this cannot be used to flood an inbox.
    const last = db.prepare('SELECT created_at FROM email_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id);
    if (last && Date.now() - new Date(`${last.created_at.replace(' ', 'T')}Z`).getTime() < 60_000) {
      return res.json({ ...generic, throttled: true, retry_after: 60 });
    }

    const issued = await issueVerification(db, user.id, user.email, user.name);
    res.json({ ...generic, mail_delivered: issued.delivered, ...issued.dev });
  }));

  // ── forgot password ──────────────────────────────────────────────────
  r.post('/forgot', strictLimit, asyncH(async (req, res) => {
    const email = cleanText(req.body?.email, 120).toLowerCase();
    // Always answer generically so accounts cannot be enumerated.
    let devToken = null;
    if (EMAIL_RE.test(email)) {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (user) {
        const token = randomToken();
        db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, datetime(?, \'+30 minutes\'), ?)')
          .run(user.id, sha256(token), nowISO(), nowISO());
        // Real deployments email this link; in development we surface it for testing.
        if (!env.isProd) devToken = token;
        console.log(`[auth] password reset requested for ${email} (token generated, expires in 30 min)`);
      }
    }
    res.json({ ok: true, message: 'If that email exists, a reset link has been generated. Check your inbox.', dev_reset_token: devToken });
  }));

  // ── reset password ───────────────────────────────────────────────────
  r.post('/reset', strictLimit, asyncH(async (req, res) => {
    const token = cleanText(req.body?.token, 128);
    const password = String(req.body?.password || '');
    if (!token) throw bad('Reset token missing.');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw bad('Password must be at least 8 characters and include a letter and a number.');
    }
    const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(token));
    if (!row || row.used_at || row.expires_at < nowISO()) {
      return res.status(400).json({ error: { code: 'invalid_token', message: 'This reset link is invalid or has expired. Request a new one.' } });
    }
    const hash = await hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, nowISO(), row.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowISO(), row.id);
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowISO(), row.user_id);
    res.json({ ok: true, message: 'Password updated. You can now sign in.' });
  }));

  // ── profile updates (authenticated) ──────────────────────────────────
  r.patch('/profile', app.requireAuth, asyncH(async (req, res) => {
    const u = req.user;
    const name = req.body?.name !== undefined ? cleanText(req.body.name, 80) : u.name;
    if (name.length < 2) throw bad('Name must be at least 2 characters.');

    let email = u.email;
    let emailChanged = false;
    if (req.body?.email !== undefined && cleanText(req.body.email).toLowerCase() !== u.email) {
      email = cleanText(req.body.email, 120).toLowerCase();
      if (!EMAIL_RE.test(email)) throw bad('Please enter a valid email address.');
      // The same real-address checks apply when an address is changed.
      const verdict = await assessEmail(email, { checkMx: env.verifyEmailMx });
      if (!verdict.ok) {
        return res.status(400).json({ error: { code: verdict.code, message: verdict.message }, suggestion: verdict.suggestion || null });
      }
      const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, u.id);
      if (clash) return res.status(409).json({ error: { code: 'email_taken', message: 'That email is already in use by another account.' } });
      emailChanged = true;
    }

    let image = u.profile_image;
    if (req.body?.profile_image !== undefined) {
      const img = String(req.body.profile_image || '');
      if (img.length > 400_000) throw bad('That image is too large. Please choose a smaller one.');
      image = img || null;
    }

    const prefs = {
      novels: req.body?.prefs?.novels !== undefined ? (req.body.prefs.novels ? 1 : 0) : u.pref_novels,
      anime: req.body?.prefs?.anime !== undefined ? (req.body.prefs.anime ? 1 : 0) : u.pref_anime,
      kids: req.body?.prefs?.kids !== undefined ? (req.body.prefs.kids ? 1 : 0) : u.pref_kids,
    };

    db.prepare(`UPDATE users SET name = ?, email = ?, profile_image = ?, pref_novels = ?, pref_anime = ?, pref_kids = ?, updated_at = ? WHERE id = ?`)
      .run(name, email, image, prefs.novels, prefs.anime, prefs.kids, nowISO(), u.id);

    if (emailChanged && env.requireEmailVerification) {
      // The new address is unconfirmed until the link just sent is opened. The
      // current session stays valid — signing someone out mid-edit because they
      // corrected a typo in their address would be needless cruelty — but the
      // profile page shows it as unconfirmed with a resend button.
      db.prepare('UPDATE users SET email_verified = 0, email_verified_at = NULL WHERE id = ?').run(u.id);
      await issueVerification(db, u.id, email, name);
    }

    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    res.json({ user: publicUser(fresh), email_changed: emailChanged && env.requireEmailVerification });
  }));

  // ── change password (authenticated) ──────────────────────────────────
  r.post('/change-password', app.requireAuth, strictLimit, asyncH(async (req, res) => {
    const current = String(req.body?.current_password || '');
    const next = String(req.body?.new_password || '');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!(await verifyPassword(current, user.password_hash))) {
      return res.status(400).json({ error: { code: 'wrong_password', message: 'Your current password is incorrect.' } });
    }
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
      throw bad('New password must be at least 8 characters and include a letter and a number.');
    }
    const hash = await hashPassword(next);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, nowISO(), user.id);
    res.json({ ok: true, message: 'Password changed successfully.' });
  }));

  return r;
}
