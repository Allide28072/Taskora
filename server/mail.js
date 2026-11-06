// THE FLASH — outbound email.
//
// Deliberately dependency-free: the project ships a small SMTP client rather
// than pulling in a mail library. It speaks enough of RFC 5321 to deliver a
// message through a normal provider:
//
//   - implicit TLS on 465, STARTTLS upgrade on 587/25
//   - AUTH PLAIN with an AUTH LOGIN fallback
//   - base64 bodies (so 8-bit content never depends on 8BITMIME support),
//     RFC 2047 subject encoding, CRLF line endings and dot-stuffing
//
// When SMTP is not configured the 'log' transport takes over: the message is
// appended to <DATA_DIR>/mail-outbox.log and summarised on the console. That
// keeps the whole sign-up flow usable on a machine with no mail server, and the
// verification link is then surfaced through the API in development only, in
// the same way the password-reset token already is.
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from './env.js';

const TIMEOUT_MS = 25_000;

function timeoutError(what) {
  return Object.assign(new Error(`SMTP ${what} timed out after ${TIMEOUT_MS / 1000}s.`), { code: 'ETIMEOUT' });
}

// ── reading replies ────────────────────────────────────────────────────────
// A tiny buffered line reader. SMTP replies arrive as one or more CRLF lines;
// a dash after the status code ("250-STARTTLS") means more lines follow, and a
// space ("250 OK") terminates the reply.
function lineReader(socket) {
  let buffer = '';
  const queue = [];
  const waiters = [];
  let failure = null;

  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    let i;
    while ((i = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(line); else queue.push(line);
    }
  };
  const onFail = (err) => {
    if (!failure) failure = err instanceof Error ? err : new Error(String(err));
    while (waiters.length) waiters.shift().reject(failure);
  };
  const onClose = () => onFail(new Error('The mail server closed the connection unexpectedly.'));

  socket.on('data', onData);
  socket.on('error', onFail);
  socket.on('close', onClose);

  const readLine = () => {
    if (queue.length) return Promise.resolve(queue.shift());
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  };

  return {
    detach() {
      socket.off('data', onData);
      socket.off('error', onFail);
      socket.off('close', onClose);
    },
    async reply() {
      const lines = [];
      for (;;) {
        const line = await readLine();
        lines.push(line);
        if (!/^\d{3}-/.test(line)) break;
      }
      const last = lines[lines.length - 1] || '';
      return {
        code: Number(last.slice(0, 3)) || 0,
        text: lines.map((l) => l.slice(4)).filter(Boolean).join(' ').trim(),
        lines,
      };
    },
  };
}

class Session {
  constructor(socket, host) {
    this.socket = socket;
    this.host = host;
    this.reader = lineReader(socket);
  }

  send(line) {
    this.socket.write(line + '\r\n');
    return this.reader.reply();
  }

  async cmd(line, ok) {
    const reply = await this.send(line);
    if (!ok.includes(reply.code)) {
      throw new Error(`Mail server replied ${reply.code} to ${line.split(' ')[0]}: ${reply.text || '(no detail)'}`);
    }
    return reply;
  }

  async upgrade() {
    this.reader.detach();
    const secure = await new Promise((resolve, reject) => {
      const s = tls.connect({ socket: this.socket, servername: this.host }, () => resolve(s));
      s.once('error', reject);
      s.setTimeout(TIMEOUT_MS, () => s.destroy(timeoutError('TLS handshake')));
    });
    this.socket = secure;
    this.reader = lineReader(secure);
  }
}

async function authenticate(session) {
  const plain = Buffer.from(`\u0000${env.smtpUser}\u0000${env.smtpPass}`, 'utf8').toString('base64');
  let reply = await session.send(`AUTH PLAIN ${plain}`);
  if (reply.code === 235 || reply.code === 503) return;
  // Fall back to the older three-step dialog some servers still prefer.
  reply = await session.send('AUTH LOGIN');
  if (reply.code !== 334) {
    throw new Error(`Mail server rejected AUTH PLAIN (${reply.code}) and would not start AUTH LOGIN: ${reply.text}`);
  }
  reply = await session.send(Buffer.from(env.smtpUser, 'utf8').toString('base64'));
  if (reply.code !== 334) throw new Error(`Mail server replied ${reply.code} to the username: ${reply.text}`);
  reply = await session.send(Buffer.from(env.smtpPass, 'utf8').toString('base64'));
  if (reply.code !== 235) throw new Error(`Mail server rejected the credentials (${reply.code}): ${reply.text}`);
}

// ── message assembly ───────────────────────────────────────────────────────
function encodeSubject(subject) {
  const clean = String(subject || '').replace(/[\r\n]+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function wrap76(base64) {
  const out = [];
  for (let i = 0; i < base64.length; i += 76) out.push(base64.slice(i, i + 76));
  return out.join('\r\n');
}

const b64 = (s) => wrap76(Buffer.from(String(s ?? ''), 'utf8').toString('base64'));

function normaliseNewlines(s) {
  return String(s ?? '').replace(/\r\n|\r|\n/g, '\r\n');
}

export function buildMessage({ to, from, subject, text, html }) {
  const boundary = `tf-${crypto.randomBytes(16).toString('hex')}`;
  const domain = String(from).replace(/^.*@/, '').replace(/[^A-Za-z0-9.-]/g, '') || 'theflash.app';
  const head = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
  ];

  let payload;
  if (html) {
    head.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    payload = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(normaliseNewlines(text)),
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(normaliseNewlines(html)),
      `--${boundary}--`,
      '',
    ].join('\r\n');
  } else {
    head.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64');
    payload = `${b64(normaliseNewlines(text))}\r\n`;
  }

  // Escape bodies whose lines start with a dot — DATA would otherwise treat a
  // lone "." as the terminator.
  return `${head.join('\r\n')}\r\n\r\n${payload}`.replace(/^\./gm, '..');
}

/** The bytes actually written during DATA, terminator included. */
export function dataPayload(options) {
  return `${normaliseNewlines(buildMessage(options))}\r\n.\r\n`;
}

// ── transports ─────────────────────────────────────────────────────────────
async function sendViaSmtp({ to, from, subject, text, html }) {
  const host = env.smtpHost;
  const port = env.smtpPort;
  const implicit = env.smtpSecure !== null ? env.smtpSecure : port === 465;

  const socket = implicit
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  socket.setTimeout(TIMEOUT_MS, () => socket.destroy(timeoutError(`connection to ${host}:${port}`)));

  const session = new Session(socket, host);
  try {
    const greeting = await session.reader.reply();
    if (greeting.code !== 220) throw new Error(`Mail server greeted us with ${greeting.code}: ${greeting.text}`);

    const hostname = (os.hostname() || 'theflash.local').replace(/[^A-Za-z0-9.-]/g, '') || 'theflash.local';
    let caps = await session.cmd(`EHLO ${hostname}`, [250]);

    if (!implicit && /STARTTLS/i.test(caps.lines.join(' '))) {
      await session.cmd('STARTTLS', [220]);
      await session.upgrade();
      caps = await session.cmd(`EHLO ${hostname}`, [250]);
    }
    if (env.smtpUser) await authenticate(session);

    const envelopeFrom = String(from).replace(/^.*</, '').replace(/>.*$/, '').trim() || env.smtpUser;
    await session.cmd(`MAIL FROM:<${envelopeFrom}>`, [250]);
    await session.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await session.cmd('DATA', [354]);
    session.socket.write(dataPayload({ to, from, subject, text, html }));
    const accepted = await session.reader.reply();
    if (accepted.code !== 250) throw new Error(`Mail server refused the message (${accepted.code}): ${accepted.text}`);

    try { await session.cmd('QUIT', [221]); } catch { /* server may hang up first */ }
    return { transport: 'smtp', id: accepted.text || 'accepted' };
  } finally {
    session.reader.detach();
    session.socket.destroy();
  }
}

function writeToOutbox({ to, from, subject, text }) {
  const file = path.join(env.dataDir, 'mail-outbox.log');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, [
    `──── ${new Date().toISOString()} ────`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    '',
    normaliseNewlines(text).replace(/\r\n/g, '\n'),
    '',
    '',
  ].join('\n'), 'utf8');
  const where = path.relative(env.root, file).split(path.sep).join('/');
  console.log(`[mail] "${subject}" → ${to}  ·  no SMTP configured, appended to ${where}`);
  return { transport: 'log', id: where };
}

export const mail = {
  transport: env.mailTransport,
  /** True when messages actually leave the machine. */
  delivers: env.mailTransport === 'smtp',
  async send(message) {
    const full = { from: env.mailFrom, ...message };
    if (env.mailTransport === 'smtp') return sendViaSmtp(full);
    return writeToOutbox(full);
  },
};

// ── the one message this app sends ─────────────────────────────────────────
export function verificationEmail({ name, link, appName = 'THE FLASH' }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const text = [
    `Hi ${first},`,
    '',
    `Confirm this address to finish setting up your ${appName} account:`,
    '',
    link,
    '',
    'The link works once and expires in 24 hours. If you did not create this',
    'account you can ignore this message — nothing happens until it is used.',
    '',
    `— ${appName}`,
  ].join('\n');

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html><body style="margin:0;background:#0b0d18;padding:32px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e9ecf5">
  <div style="max-width:520px;margin:0 auto;background:#141728;border:1px solid #262a44;border-radius:16px;padding:28px">
    <div style="font-size:20px;font-weight:800;letter-spacing:.04em;color:#ff7a18;margin-bottom:18px">${esc(appName)}</div>
    <p style="margin:0 0 12px;font-size:15px">Hi ${esc(first)},</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#c3c9dd">Confirm this address to finish setting up your account.</p>
    <p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;background:#ff7a18;color:#12141f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">Confirm my email</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#8d94ad">Or paste this link into your browser:</p>
    <p style="margin:0 0 22px;font-size:13px;word-break:break-all"><a href="${esc(link)}" style="color:#ff9a4d">${esc(link)}</a></p>
    <p style="margin:0;font-size:13px;color:#8d94ad;line-height:1.5">The link works once and expires in 24 hours. If you did not create this account you can ignore this message.</p>
  </div>
</body></html>`;

  return { subject: 'Confirm your email for THE FLASH', text, html };
}
