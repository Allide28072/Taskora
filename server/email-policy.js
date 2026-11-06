// THE FLASH — "is this a real email address?" checks.
//
// Registration runs three escalating checks before a row is ever created:
//
//   1. syntax        — the address is genuinely well-formed
//   2. plausibility  — domains that cannot belong to a real person (reserved
//                      documentation names, throwaway mailboxes) are refused,
//                      and a near-miss of a popular provider is handed back as
//                      a suggestion so a typo becomes "did you mean…?"
//   3. deliverability — the domain must be able to receive mail at all
//
// Step 3 needs DNS. Two rules keep it from being a liability:
//   - it is skipped entirely when EMAIL_MX_CHECK is off, and
//   - a lookup failure that is *not* an authoritative answer (timeout, no
//     network, a blocked resolver) is treated as "unknown" and allowed
//     through, so an offline deployment never bricks sign-up.
// Only a definitive "this domain does not exist / publishes no mail route" is
// refused.
import { promises as dns } from 'node:dns';

// Domains that exist to be examples, or that are reserved by the standards and
// can never belong to a real mailbox.
const RESERVED_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'example.edu',
  'test.com', 'test.org', 'test.net',
  'localhost.com', 'invalid.com', 'domain.com', 'email.com',
  'yourdomain.com', 'mycompany.com', 'company.com', 'acme.com',
]);

// Top-level labels reserved by RFC 2606/6761 — no real mail is ever delivered.
const RESERVED_TLDS = new Set(['test', 'invalid', 'localhost', 'example', 'local']);

// Widely used throwaway / temporary-mailbox providers. Not exhaustive by
// design: this catches the common cases cheaply, and the verification email is
// the real gate.
const THROWAWAY_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'guerrillamail.com',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com',
  'grr.la', 'spam4.me', 'mailinator.com', 'mailinator.net', 'mailinator2.com',
  'trashmail.com', 'trashmail.net', 'trashmail.de', 'yopmail.com', 'yopmail.fr',
  'yopmail.net', 'cool.fr.nf', 'jetable.org', 'jetable.fr.nf', 'temp-mail.org',
  'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'throwawaymail.com',
  'getnada.com', 'nada.email', 'dispostable.com', 'mailnesia.com', 'maildrop.cc',
  'mintemail.com', 'mytemp.email', 'fakeinbox.com', 'fakemail.net', 'spamgourmet.com',
  'mailexpire.com', 'meltmail.com', 'anonbox.net', 'discard.email', 'emailondeck.com',
  'mohmal.com', 'moakt.com', 'emailfake.com', 'generator.email', 'mailcatch.com',
  'mail-temporaire.fr', 'tempr.email', 'wegwerfmail.de', 'byom.de', 'kurzepost.de',
]);

// Local parts that are never a person's real mailbox. Small and deliberate —
// false positives here would be far more annoying than a fake signup that the
// verification email catches anyway.
const JUNK_LOCAL_PARTS = new Set([
  'test', 'testing', 'tester', 'tests', 'asdf', 'asdfasdf', 'qwerty', 'qwertyuiop',
  'aaa', 'aaaa', 'abc', 'abcd', 'fake', 'fakemail', 'dummy', 'null', 'undefined',
  'nobody', 'noone', 'nothing', 'whatever', 'blah', 'spam', 'noreply', 'no-reply',
]);

// Popular providers used for "did you mean…?" — a typo of one of these is the
// single most common fake-looking address in a real sign-up.
const POPULAR_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'outlook.com', 'hotmail.com',
  'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com',
  'gmx.com', 'gmx.net', 'zoho.com', 'yandex.com', 'mail.com', 'msn.com', 'orange.fr',
  'free.fr', 'laposte.net', 'wanadoo.fr', 'web.de', 'mail.ru', 'qq.com', '163.com',
];

const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^[A-Za-z]{2,24}$/;

const reject = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

// ── Levenshtein distance, capped: only "close enough" matters here ──────────
function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let best = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < best) best = curr[j];
    }
    // Bail out of hopeless comparisons early.
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Suggests the obvious intended domain for a near-miss, e.g.
 * "ada@gmial.com" → "ada@gmail.com". Returns null when nothing is close.
 */
export function suggestEmail(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain || POPULAR_DOMAINS.includes(domain)) return null;
  // Allow one slip (typo, doubled or dropped letter, transposition).
  const bound = domain.length >= 8 ? 2 : 1;
  let best = null;
  let bestDistance = bound + 1;
  for (const candidate of POPULAR_DOMAINS) {
    const d = editDistance(domain, candidate, bound);
    if (d < bestDistance) { bestDistance = d; best = candidate; }
  }
  return best ? `${local}@${best}` : null;
}

// ── deliverability ─────────────────────────────────────────────────────────
const mxCache = new Map();
const MX_TTL_MS = 10 * 60 * 1000;
const MX_TIMEOUT_MS = 3000;

async function defaultLookup(domain) {
  const cached = mxCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await resolveMailRoute(domain);
  mxCache.set(domain, { value, expires: Date.now() + MX_TTL_MS });
  return value;
}

async function resolveMailRoute(domain) {
  // Returns { known, accepts, host } — "known" false means we could not get an
  // answer and the caller should let the address through.
  const withTimeout = (p) => Promise.race([
    p,
    new Promise((_, reject) => {
      const t = setTimeout(() => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEOUT' })), MX_TIMEOUT_MS);
      if (t.unref) t.unref();
    }),
  ]);

  try {
    const records = await withTimeout(dns.resolveMx(domain));
    if (records && records.length) {
      // A null MX ("." with priority 0) is an explicit "this domain takes no
      // mail", which is a deliberate rejection rather than a missing record.
      const usable = records.filter((r) => r.exchange && r.exchange !== '.');
      if (!usable.length) return { known: true, accepts: false, host: null };
      usable.sort((a, b) => a.priority - b.priority);
      return { known: true, accepts: true, host: usable[0].exchange };
    }
    return { known: true, accepts: false, host: null };
  } catch (err) {
    const code = err?.code;
    const mustExist = code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN';
    if (mustExist) {
      // No MX record at all. RFC 5321 says to fall back to the address's A or
      // AAAA record, so a domain can accept mail without publishing MX.
      try {
        const a = await withTimeout(dns.resolve4(domain));
        if (a && a.length) return { known: true, accepts: true, host: domain };
      } catch { /* fall through: genuinely no mail route */ }
      return { known: true, accepts: false, host: null };
    }
    // Anything else (timeout, blocked resolver, transient failure) is not an
    // authoritative answer — don't punish the person filling in the form.
    return { known: false, accepts: true, host: null };
  }
}

/**
 * Assesses an address and reports whether sign-up should be allowed.
 *
 * @param {string} raw             the address as typed
 * @param {object} [opts]
 * @param {boolean} [opts.checkMx] run the DNS deliverability check
 * @param {Function} [opts.lookup] injectable resolver, for tests
 * @returns {Promise<{ok: boolean, email?: string, domain?: string,
 *   code?: string, message?: string, suggestion?: string|null,
 *   deliverable?: boolean|null, mxHost?: string|null}>}
 */
export async function assessEmail(raw, opts = {}) {
  const checkMx = opts.checkMx !== undefined ? !!opts.checkMx : true;
  const lookup = opts.lookup || defaultLookup;

  const email = String(raw ?? '').trim().toLowerCase();
  if (!email) return reject('invalid_email', 'Please enter your email address.');
  if (email.length > 254) return reject('invalid_email', 'That email address is too long.');

  const at = email.lastIndexOf('@');
  if (at < 1) return reject('invalid_email', 'Please enter a valid email address, like name@example.com.');

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // ── 1. syntax ──
  if (!local || local.length > 64) {
    return reject('invalid_email', 'Please enter a valid email address, like name@example.com.');
  }
  if (!LOCAL_RE.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return reject('invalid_email', 'That email address contains characters a mailbox cannot use.');
  }
  if (!domain || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) {
    return reject('invalid_email', 'Please enter a valid email address, like name@example.com.');
  }

  const labels = domain.split('.');
  if (labels.length < 2) return reject('invalid_email', 'Please include the full domain, like name@gmail.com.');
  for (const label of labels) {
    if (!LABEL_RE.test(label)) return reject('invalid_email', 'That email domain is not written correctly.');
  }
  const tld = labels[labels.length - 1];
  if (!TLD_RE.test(tld)) return reject('invalid_email', 'Please include a real domain ending, like .com.');
  if (RESERVED_TLDS.has(tld)) {
    return reject('placeholder_email', 'That domain cannot receive email. Please use a real address you can open.');
  }

  // ── 2. plausibility ──
  if (RESERVED_DOMAINS.has(domain)) {
    return reject('placeholder_email', 'That is an example domain — it cannot receive mail. Please use a real address you can open.');
  }
  if (THROWAWAY_DOMAINS.has(domain)) {
    return reject('disposable_email', 'Disposable and temporary mailboxes are not accepted. Please use an address you keep.');
  }
  const firstLabel = labels[0];
  if (JUNK_LOCAL_PARTS.has(local) || (labels.length === 2 && JUNK_LOCAL_PARTS.has(firstLabel))) {
    return reject('placeholder_email', 'That does not look like your real address. Please use one you can open your mail in.');
  }

  const suggestion = suggestEmail(email);
  if (suggestion) {
    return reject('email_typo', `That domain looks like a typo. Did you mean ${suggestion}?`, { suggestion });
  }

  // ── 3. deliverability ──
  if (!checkMx) return { ok: true, email, domain, deliverable: null, mxHost: null };

  const route = await lookup(domain);
  if (route.known && !route.accepts) {
    return reject('undeliverable_email', `${domain} cannot receive email, so we cannot send you a confirmation link. Please check the address.`);
  }
  return { ok: true, email, domain, deliverable: route.known ? true : null, mxHost: route.host || null };
}

/** Clears the memoised DNS answers — used by tests. */
export function resetEmailPolicyCache() {
  mxCache.clear();
}
