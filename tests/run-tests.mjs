// THE FLASH — API integration tests (zero new dependencies)
//
// Boots the real Express app in-process against a throwaway SQLite database
// and drives it over HTTP with fetch, then shuts it down and deletes the
// throwaway database.
//
//   node tests/run-tests.mjs            → run against an isolated throwaway DB in the project
//   BASE_URL=http://localhost:3001 node tests/run-tests.mjs   → run against a live server
//   KEEP_DB=1 node tests/run-tests.mjs  → keep the temp database for debugging
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'flash-test-secret';
// Sign-up now runs real-address checks, and the deliverability step needs DNS.
// The suite must not depend on the network, so the MX probe is off here; the
// policy itself is exercised below with an injected resolver.
process.env.EMAIL_MX_CHECK = '0';

const BASE = process.env.BASE_URL || null;
let cleanupDb = null;
let server = null;
let testDbRoot = null;

if (!BASE) {
  // Must be a project-relative path: env.dbPath is path.join(ROOT, DATA_DIR),
  // and joining an absolute path (e.g. from os.tmpdir()) onto ROOT produces a
  // mangled, non-existent location on Windows ("…\Flash\C:\Users\…").
  testDbRoot = path.resolve(`.data-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(testDbRoot, { recursive: true });
  process.env.DATA_DIR = path.relative(process.cwd(), testDbRoot) || '.';
  cleanupDb = () => {
    try {
      fs.rmSync(testDbRoot, { recursive: true, force: true });
    } catch (e) {
      console.warn(`⚠ could not remove temp DB dir ${testDbRoot} (${e.message}) — remove it manually.`);
    }
  };
}

// Every server module must be imported only AFTER DATA_DIR is configured:
// env.js snapshots process.env at module-evaluation time, so a static import
// would run before the assignment above and silently point the tests at the
// real development database.
const { createApp } = await import('../server/app.js');
const { env } = await import('../server/env.js');

// Hard guard: refuse to run unless the app resolved to the throwaway DB.
if (!BASE && path.resolve(env.dbPath) !== path.join(testDbRoot, 'theflash.db')) {
  console.error(
    `FATAL: test database resolved to "${env.dbPath}" instead of "${path.join(testDbRoot, 'theflash.db')}" — refusing to run against the real DB.`
  );
  process.exit(1);
}

const app = createApp();
if (!BASE) {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
}

/** Seed demo content (titles/novels/episodes/chapters) so the catalog has data. */
async function ensureSeeded() {
  if (BASE) {
    const h = await fetch(new URL('/api/health', BASE));
    if (!h.ok) throw new Error(`health check failed: ${h.status}`);
    return;
  }
  const { seed } = await import('../server/seed.js');
  await seed(app.db);
}

/** A real admin to exercise the admin surface (seed's admin password is env-driven). */
async function ensureAdminUser() {
  const email = 'admin@theflash.test';
  const existing = app.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return;
  const { hashPassword, nowISO } = await import('../server/util.js');
  const t = nowISO();
  // Operator-provisioned accounts skip the inbox round-trip, matching what
  // seed.js and set-admin.js do for the real administrator.
  app.db.prepare(`INSERT INTO users (name, email, password_hash, role, status, email_verified, email_verified_at, created_at, updated_at)
    VALUES ('Test Admin', ?, ?, 'admin', 'active', 1, ?, ?, ?)`).run(email, await hashPassword('AdminPass1'), t, t, t);
}

const api = (p, opts = {}) => fetch(new URL(p, BASE || `http://localhost:${server.address().port}`), {
  ...opts,
  headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
});

function cookieFrom(res) {
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

// Confirmation links are absolute URLs; only the token inside one matters.
function tokenOf(link) {
  try { return new URL(link).searchParams.get('token') || ''; } catch { return ''; }
}

/**
 * Registers an account and completes the email round-trip with the development
 * confirmation link, returning a signed-in session cookie. Sign-up no longer
 * signs anyone in on its own, so tests that need a usable account go via here.
 */
async function registerVerified(name, email, password) {
  const reg = await POST('/api/auth/register', { name, email, password, confirm: password });
  const body = await reg.json();
  if (!body.dev_verify_link) return { reg, body, cookie: '' };
  const verify = await POST('/api/auth/verify', { token: tokenOf(body.dev_verify_link) });
  return { reg, body, cookie: cookieFrom(verify) };
}

// ── tiny test harness ──────────────────────────────────────────────────
let passed = 0;
const failures = [];
let currentGroup = '';
const group = (name) => { currentGroup = name; console.log(`\n${name}`); };

function check(name, cond, detail = '') {
  if (cond) { passed++; process.stdout.write(`  ✔ ${name}\n`); return true; }
  failures.push(`${currentGroup} › ${name}${detail ? ` — ${detail}` : ''}`);
  process.stdout.write(`  ✘ ${name}${detail ? ` — ${detail}` : ''}\n`);
  return false;
}

const GET = async (p, cookie) => api(p, { headers: cookie ? { cookie } : {} });
const POST = (p, body, cookie) => api(p, { method: 'POST', body, headers: cookie ? { 'Content-Type': 'application/json', cookie } : { 'Content-Type': 'application/json' } });
const PATCH = (p, body, cookie) => api(p, { method: 'PATCH', body, headers: cookie ? { cookie } : {} });
const PUT = (p, body, cookie) => api(p, { method: 'PUT', body, headers: cookie ? { cookie } : {} });
const DEL = (p, cookie) => api(p, { method: 'DELETE', headers: cookie ? { cookie } : {} });

// ── suite ──────────────────────────────────────────────────────────────
let registeredEmail = '';
let userCookie = '';
let adminCookie = '';
let firstTitle = null;
let firstNovel = null;
let seriesSlug = '';
let episodeId = 0;

try {
  await ensureSeeded();
  await ensureAdminUser();

  // ── health & public catalog ──────────────────────────────────────────
  group('health & public catalog');
  {
    const r = await GET('/api/health');
    const j = await r.json();
    check('GET /api/health → 200', r.status === 200);
    check('health reports app name', j.app === 'THE FLASH');

    const home = await (await GET('/api/home')).json();
    check('home returns hero + rails', Array.isArray(home.hero) && Array.isArray(home.rails) && home.rails.length > 0);
    const trending = home.rails.find((x) => x.key === 'trending');
    check('trending rail has items', Array.isArray(trending?.items) && trending.items.length > 0);
    if (trending?.items?.length) firstTitle = trending.items[0];

    const cat = await (await GET('/api/catalog/movie')).json();
    check('catalog returns items with total', Array.isArray(cat.items) && typeof cat.total === 'number' && cat.items.length > 0);
    check('catalog item carries slug + poster', typeof cat.items[0].slug === 'string' && typeof cat.items[0].poster === 'string');

    const nov = await (await GET('/api/novels')).json();
    check('novels catalog lists items', Array.isArray(nov.items) && nov.items.length > 0);
    if (nov.items?.length) firstNovel = nov.items[0];

    const detail = await (await GET(`/api/title/${firstTitle.slug}`)).json();
    check('title detail resolves by slug', detail.title?.slug === firstTitle.slug);
    check('detail includes description', typeof detail.title.description === 'string' && detail.title.description.length > 0);
    if (detail.title.kind !== 'movie') seriesSlug = detail.title.slug;

    const novelDetail = await (await GET(`/api/novel/${firstNovel.slug}`)).json();
    check('novel detail resolves by slug', novelDetail.novel?.slug === firstNovel.slug);
    check('novel detail lists chapters', Array.isArray(novelDetail.novel.chapter_list) && novelDetail.novel.chapter_list.length > 0);

    const search = await (await GET(`/api/search?q=${encodeURIComponent(firstTitle.name.slice(0, 6))}`)).json();
    check('search returns structured buckets', Array.isArray(search.movies) && Array.isArray(search.novels) && Array.isArray(search.genres));

    const genres = await (await GET('/api/genres')).json();
    check('genres endpoint lists entries', Array.isArray(genres.genres));

    const missing = await GET('/api/title/definitely-not-a-real-slug');
    check('unknown slug → 404', missing.status === 404);
  }

  // ── auth: registration, email confirmation, sessions ────────────────
  group('auth: register, verify, me, logout');
  {
    // A real provider domain: the policy deliberately refuses reserved and
    // example names, which is the point of the checks below.
    registeredEmail = `flash.user+${Date.now()}@gmail.com`;
    const badPw = await POST('/api/auth/register', { name: 'Barry Allen', email: registeredEmail, password: 'short', confirm: 'short' });
    check('weak password rejected (400)', badPw.status === 400);

    const mismatch = await POST('/api/auth/register', { name: 'Barry Allen', email: registeredEmail, password: 'SpeedForce1', confirm: 'SpeedForce2' });
    check('password mismatch rejected (400)', mismatch.status === 400);

    const reg = await POST('/api/auth/register', { name: 'Barry Allen', email: registeredEmail, password: 'SpeedForce1', confirm: 'SpeedForce1' });
    const regBody = await reg.json();
    check('register creates a pending account (201)', reg.status === 201 && regBody.pending_verification === true);
    check('register withholds the account until confirmed', !regBody.user);
    check('register does not open a session', !cookieFrom(reg).includes('tf_token='));
    check('register hands back a development confirmation link', typeof regBody.dev_verify_link === 'string' && regBody.dev_verify_link.includes('/verify?token='));
    const confirmToken = tokenOf(regBody.dev_verify_link);
    check('confirmation link carries a token', confirmToken.length > 10);

    const early = await POST('/api/auth/login', { email: registeredEmail, password: 'SpeedForce1' });
    check('an unconfirmed address cannot sign in (403)', early.status === 403 && (await early.json()).error?.code === 'email_unverified');

    const verify = await POST('/api/auth/verify', { token: confirmToken });
    const verifyBody = await verify.json();
    check('confirming the address signs the account in (200)', verify.status === 200 && verifyBody.user?.email_verified === true);
    userCookie = cookieFrom(verify);
    check('confirming opens a session', userCookie.includes('tf_token='));

    const reuse = await POST('/api/auth/verify', { token: confirmToken });
    check('a confirmation link is single-use', reuse.status === 400);

    const fake = await POST('/api/auth/verify', { token: 'not-a-real-token' });
    check('an unknown confirmation token is refused', fake.status === 400);

    const dup = await POST('/api/auth/register', { name: 'Barry Allen', email: registeredEmail.toUpperCase(), password: 'SpeedForce1', confirm: 'SpeedForce1' });
    check('duplicate verified email rejected (409)', dup.status === 409);

    const lookup = await (await POST('/api/auth/lookup', { email: registeredEmail })).json();
    check('lookup finds registered email', lookup.exists === true && typeof lookup.first_name === 'string');

    const me = await (await GET('/api/auth/me', userCookie)).json();
    check('me returns the session user', me.user?.email === registeredEmail);

    const anon = await GET('/api/auth/me');
    check('me without cookie → 401', anon.status === 401);

    const badLogin = await POST('/api/auth/login', { email: registeredEmail, password: 'WrongPass1' });
    check('wrong password → 401', badLogin.status === 401);

    const login = await POST('/api/auth/login', { email: registeredEmail.toUpperCase(), password: 'SpeedForce1' });
    check('login is case-insensitive on email', login.status === 200);
    check('login sets a fresh session', cookieFrom(login).includes('tf_token='));

    const out = await POST('/api/auth/logout', {}, userCookie);
    check('logout ok', out.status === 200);
    const afterLogout = await GET('/api/auth/me', userCookie);
    check('revoked session cannot fetch /me', afterLogout.status === 401);

    const relogin = await POST('/api/auth/login', { email: registeredEmail, password: 'SpeedForce1' });
    userCookie = cookieFrom(relogin);
    check('re-login restores access', relogin.status === 200);
  }

  // ── email policy: "is this a real address?" ──────────────────────────
  group('email policy: real-address checks');
  {
    const { assessEmail } = await import('../server/email-policy.js');
    // An injected resolver keeps this deterministic: no DNS in the suite.
    const reachable = async () => ({ known: true, accepts: true, host: 'mx.example-mail.net' });
    const unreachable = async () => ({ known: true, accepts: false, host: null });
    const unresolved = async () => ({ known: false, accepts: true, host: null });

    const refused = [
      ['not-an-email', 'invalid_email'],
      ['barry@localhost', 'invalid_email'],
      ['barry..allen@gmail.com', 'invalid_email'],
      ['barry@gmail', 'invalid_email'],
      ['barry@example.com', 'placeholder_email'],
      ['barry@test.com', 'placeholder_email'],
      ['barry@mailinator.com', 'disposable_email'],
      ['test@gmail.com', 'placeholder_email'],
      ['abc@gmail.com', 'placeholder_email'],
      ['barry@gmial.com', 'email_typo'],
    ];
    for (const [addr, code] of refused) {
      const v = await assessEmail(addr, { lookup: reachable });
      check(`${addr} → ${code}`, v.ok === false && v.code === code, `got ${v.code || 'accepted'}`);
    }

    const typo = await assessEmail('barry@gmial.com', { lookup: reachable });
    check('a typo suggests the intended provider', typo.suggestion === 'barry@gmail.com');

    const good = await assessEmail('Barry.Allen+flash@Gmail.com', { lookup: reachable });
    check('a real address passes and is normalised', good.ok === true && good.email === 'barry.allen+flash@gmail.com');
    check('a passing address reports its MX host', good.mxHost === 'mx.example-mail.net');

    const dead = await assessEmail('barry@somedomain.net', { lookup: unreachable });
    check('a domain with no mail route is refused', dead.ok === false && dead.code === 'undeliverable_email');

    const unknown = await assessEmail('barry@somedomain.net', { lookup: unresolved });
    check('an unanswered lookup lets the address through', unknown.ok === true && unknown.deliverable === null);

    let probed = false;
    const skipped = await assessEmail('barry@gmail.com', {
      checkMx: false,
      lookup: async () => { probed = true; return reachable(); },
    });
    check('the MX probe is skipped when disabled', skipped.ok === true && probed === false);
  }

  // ── outbound mail: message assembly ──────────────────────────────────
  group('mail: message assembly');
  {
    const { buildMessage, dataPayload, verificationEmail } = await import('../server/mail.js');
    const plain = buildMessage({ to: 'barry@gmail.com', from: 'THE FLASH <no-reply@theflash.app>', subject: 'Confirm your email', text: 'Hello\nthere' });
    check('a message carries From, To and Subject', /^From: /m.test(plain) && /^To: barry@gmail.com$/m.test(plain) && /^Subject: Confirm your email$/m.test(plain));
    check('it declares itself auto-submitted', /^Auto-Submitted: auto-generated$/m.test(plain));
    const round = Buffer.from(plain.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
    check('the body round-trips through base64 with CRLF endings', round === 'Hello\r\nthere');

    const both = buildMessage({ to: 'a@b.com', from: 'x@y.com', subject: 's', text: 'plain', html: '<p>rich</p>' });
    check('text and html become a multipart alternative', both.includes('multipart/alternative') && both.includes('text/html'));

    const wide = buildMessage({ to: 'a@b.com', from: 'x@y.com', subject: 'Confirmez — é', text: 'x' });
    check('a non-ASCII subject is RFC 2047 encoded', /^Subject: =\?UTF-8\?B\?/m.test(wide));

    const payload = dataPayload({ to: 'a@b.com', from: 'x@y.com', subject: 's', text: 'body' });
    check('the DATA payload ends with <CRLF>.<CRLF>', payload.endsWith('\r\n.\r\n'));
    check('no bare-dot line can end DATA early', !payload.slice(0, -3).split('\r\n').includes('.'));

    const mail = verificationEmail({ name: 'Barry Allen', link: 'http://localhost:3001/verify?token=abc123' });
    check('the verification email contains the link', mail.text.includes('/verify?token=abc123') && mail.html.includes('/verify?token=abc123'));
    check('the verification email greets by first name', mail.text.startsWith('Hi Barry,'));
    check('the verification email has a subject', typeof mail.subject === 'string' && mail.subject.length > 0);
  }

  // ── resending a confirmation link ────────────────────────────────────
  group('auth: resending a confirmation link');
  {
    const email = `resend.me+${Date.now()}@gmail.com`;
    const reg = await (await POST('/api/auth/register', { name: 'Resend Me', email, password: 'SpeedForce1', confirm: 'SpeedForce1' })).json();
    check('a fresh account starts unconfirmed', typeof reg.dev_verify_link === 'string');

    // The throttle is one link per minute and the sign-up link counts, so the
    // resend is refused straight away — then allowed once the clock has moved.
    const tooSoon = await (await POST('/api/auth/resend-verification', { email })).json();
    check('resending immediately after sign-up is throttled', tooSoon.throttled === true);

    // In-process, the recorded issue time can be moved back instead of waiting.
    if (!BASE) app.db.prepare("UPDATE email_verifications SET created_at = datetime('now', '-5 minutes')").run();
    const resend = await (await POST('/api/auth/resend-verification', { email })).json();
    check('resend generates a new link', resend.ok === true && typeof resend.dev_verify_link === 'string');

    const throttled = await (await POST('/api/auth/resend-verification', { email })).json();
    check('a second immediate resend is throttled', throttled.throttled === true);

    const fresh = tokenOf(resend.dev_verify_link);
    check('the resent link differs from the first', fresh !== tokenOf(reg.dev_verify_link));
    check('the resent link confirms the account', (await POST('/api/auth/verify', { token: fresh })).status === 200);

    const after = await (await POST('/api/auth/resend-verification', { email })).json();
    check('a confirmed address gets no further link', after.dev_verify_link === undefined);
  }

  // ── user actions: favorites, progress, ratings, comments ─────────────
  group('user: favorites, progress, ratings, comments');
  {
    const anon = await GET('/api/user/favorites');
    check('favorites require auth (401)', anon.status === 401);

    const addFav = await POST(`/api/user/favorites/title/${firstTitle.id}`, {}, userCookie);
    check('favorite a title', addFav.status === 200 && (await addFav.json()).in_my_list === true);

    const addNovelFav = await POST(`/api/user/favorites/novel/${firstNovel.id}`, {}, userCookie);
    check('favorite a novel', addNovelFav.status === 200);

    const favs = await (await GET('/api/user/favorites', userCookie)).json();
    check('favorites list includes both types',
      favs.watchlist.some((t) => t.id === firstTitle.id) && favs.reading_list.some((n) => n.id === firstNovel.id));

    const badFav = await POST('/api/user/favorites/title/99999999', {}, userCookie);
    check('favorite unknown title → 404', badFav.status === 404);

    const wProg = await POST('/api/user/progress/watch', { title_id: firstTitle.id, position: 300, duration: 1000 }, userCookie);
    check('save watch progress', wProg.status === 200);
    const cw = await (await GET('/api/user/continue-watching', userCookie)).json();
    check('continue-watching reflects progress', cw.items.some((x) => x.id === firstTitle.id && x.progress === 30));

    const badEp = await POST('/api/user/progress/watch', { title_id: firstTitle.id, episode_id: 99999999, position: 1, duration: 10 }, userCookie);
    check('progress with foreign episode → 400', badEp.status === 400);

    const r1 = await POST('/api/user/rate', { item_type: 'title', item_id: firstTitle.id, value: 9 }, userCookie);
    check('rate a title', r1.status === 200, `status ${r1.status}: ${JSON.stringify(await r1.json().catch(() => null))}`);
    const rBad = await POST('/api/user/rate', { item_type: 'title', item_id: firstTitle.id, value: 11 }, userCookie);
    check('rating above 10 rejected', rBad.status === 400);

    const c1 = await POST(`/api/user/comments/title/${firstTitle.id}`, { body: 'Runs at the speed of light.' }, userCookie);
    check('post a comment (201)', c1.status === 201);
    const cShort = await POST(`/api/user/comments/title/${firstTitle.id}`, { body: 'x' }, userCookie);
    check('too-short comment rejected', cShort.status === 400);
    const cList = await (await GET(`/api/user/comments/title/${firstTitle.id}`, userCookie)).json();
    check('comments list shows the new comment', cList.comments.some((c) => c.body === 'Runs at the speed of light.'));

    // reading progress (auth required on read endpoints)
    const rProg = await POST('/api/user/progress/read', { novel_id: firstNovel.id, chapter_number: 2, scroll: 40 }, userCookie);
    check('save reading progress', rProg.status === 200);
    const cr = await (await GET('/api/user/continue-reading', userCookie)).json();
    check('continue-reading reflects chapter', cr.items.some((x) => x.id === firstNovel.id && x.chapter_number === 2));

    const summary = await (await GET('/api/user/summary', userCookie)).json();
    check('summary counts activity', summary.watching >= 1 && summary.reading >= 1 && summary.favorites >= 2);

    const notif = await (await GET('/api/user/notifications', userCookie)).json();
    check('notifications include welcome message', Array.isArray(notif.notifications) && notif.notifications.length > 0);
    await POST('/api/user/notifications/read-all', {}, userCookie);
    const notif2 = await (await GET('/api/user/notifications', userCookie)).json();
    check('read-all clears unread count', notif2.unread === 0);
  }

  // ── authorization boundaries ─────────────────────────────────────────
  group('authorization: role gates');
  {
    const asUser = await GET('/api/admin/stats', userCookie);
    check('regular user blocked from admin API (403)', asUser.status === 403);

    const anon = await GET('/api/admin/stats');
    check('anonymous blocked from admin API (401)', anon.status === 401);

    const loginAdmin = await POST('/api/auth/login', { email: 'admin@theflash.test', password: 'AdminPass1' });
    adminCookie = cookieFrom(loginAdmin);
    check('admin can sign in', loginAdmin.status === 200);

    const stats = await (await GET('/api/admin/stats', adminCookie)).json();
    check('admin stats include KPIs', typeof stats.users === 'number' && typeof stats.kpi?.new_users_30d === 'number');
  }

  // ── admin: content lifecycle ─────────────────────────────────────────
  group('admin: content lifecycle');
  {
    const create = await POST('/api/admin/titles', {
      kind: 'series', name: 'Central City Chronicles', description: 'A speedster crime saga.',
      release_year: 2026, genres: [], featured: false,
    }, adminCookie);
    const created = await create.json();
    check('admin creates a title (201)', create.status === 201 && typeof created.id === 'number');

    const dup = await POST('/api/admin/titles', {
      kind: 'series', name: 'Central City Chronicles', description: 'Again.', release_year: 2026,
    }, adminCookie);
    check('duplicate name gets unique slug (201)', dup.status === 201 && (await dup.json()).id !== created.id);

    const noAuth = await POST('/api/admin/titles', { name: 'Sneaky Title', kind: 'movie' });
    check('cannot create title without auth', noAuth.status === 401);

    const badImage = await POST('/api/admin/titles', { name: 'Bad Art', kind: 'movie', poster_url: 'javascript:alert(1)' }, adminCookie);
    check('javascript: poster URL rejected', badImage.status === 400);

    const seasonRes = await POST(`/api/admin/titles/${created.id}/seasons`, { name: 'Season One' }, adminCookie);
    const season = await seasonRes.json();
    check('admin adds a season (201)', seasonRes.status === 201 && typeof season.id === 'number', `status ${seasonRes.status}`);

    const ep = await POST(`/api/admin/seasons/${season.id}/episodes`, { name: 'Pilot', video_url: 'https://example.com/pilot.mp4' }, adminCookie);
    const epBody = await ep.json();
    check('admin adds an episode (201)', ep.status === 201 && typeof epBody.id === 'number');
    episodeId = epBody.id;

    const put = await PUT(`/api/admin/titles/${created.id}`, { name: 'Central City Chronicles', description: 'Updated.' }, adminCookie);
    check('admin updates the title', put.status === 200);

    const detail = await (await GET(`/api/admin/titles/${created.id}`, adminCookie)).json();
    check('admin title detail shows season + episode', detail.title?.seasons?.[0]?.episodes?.length === 1);

    const publicDetail = await (await GET(`/api/title/${detail.title.slug}`)).json();
    check('public detail exposes the new episode', publicDetail.title?.seasons?.[0]?.episodes?.some((e) => e.id === episodeId));

    const epProgress = await POST('/api/user/progress/watch', { title_id: created.id, episode_id: episodeId, position: 95, duration: 100 }, userCookie);
    check('episode watch progress accepted', epProgress.status === 200);
    const epDetail = await (await GET(`/api/episode/${episodeId}`, userCookie)).json();
    check('episode detail returns resume point', epDetail.episode?.resume?.position === 95);
  }

  // ── admin: novel + chapter lifecycle ─────────────────────────────────
  group('admin: novels & chapters');
  {
    const create = await POST('/api/admin/novels', {
      name: 'The Velocity Papers', author: 'J. West', description: 'Notes from the fast lane.',
      status: 'ongoing',
    }, adminCookie);
    const novelId = (await create.json()).id;
    check('admin creates a novel (201)', create.status === 201 && typeof novelId === 'number');

    const ch1 = await (await POST(`/api/admin/novels/${novelId}/chapters`, { name: 'Chapter 1', content: 'First words of the run.' }, adminCookie)).json();
    const ch2 = await (await POST(`/api/admin/novels/${novelId}/chapters`, { name: 'Chapter 2', content: 'More words of the run.' }, adminCookie)).json();
    check('chapters auto-number sequentially', typeof ch1.id === 'number' && typeof ch2.id === 'number');

    const reorder = await POST(`/api/admin/novels/${novelId}/chapters/reorder`, { chapter_ids: [ch2.id, ch1.id] }, adminCookie);
    check('chapter reorder accepted', reorder.status === 200, `status ${reorder.status}: ${JSON.stringify(await reorder.json().catch(() => null))}`);
    const detail = await (await GET(`/api/admin/novels/${novelId}`, adminCookie)).json();
    check('reorder swapped chapter numbers',
      detail.novel?.chapters?.[0]?.id === ch2.id && detail.novel?.chapters?.[0]?.number === 1);

    const link = await POST('/api/admin/links', { title_id: firstTitle.id, novel_id: novelId, relation: 'novelization' }, adminCookie);
    check('admin links novel to title', link.status === 200);
    const titleDetail = await (await GET(`/api/admin/titles/${firstTitle.id}`, adminCookie)).json();
    check('link shows on admin title detail', titleDetail.title?.linked_novel_ids?.includes(novelId));
    await DEL(`/api/admin/links/${firstTitle.id}/${novelId}`, adminCookie);

    const del = await DEL(`/api/admin/novels/${novelId}`, adminCookie);
    check('admin deletes the novel', del.status === 200, `status ${del.status}`);
    const gone = await GET(`/api/novel/the-velocity-papers`);
    check('deleted novel 404s publicly', gone.status === 404, `status ${gone.status}: ${JSON.stringify(await gone.json().catch(() => null))}`);
  }

  // ── admin: users & moderation ────────────────────────────────────────
  group('admin: users & moderation');
  {
    const users = await (await GET('/api/admin/users', adminCookie)).json();
    check('admin user list includes the new user', users.items.some((u) => u.email === registeredEmail));

    const target = users.items.find((u) => u.email === registeredEmail);
    const disable = await PUT(`/api/admin/users/${target.id}/status`, { status: 'disabled' }, adminCookie);
    check('admin can disable a user', disable.status === 200);
    const blocked = await GET('/api/auth/me', userCookie);
    check('disabled user session is revoked', blocked.status === 401);

    const reEnable = await PUT(`/api/admin/users/${target.id}/status`, { status: 'active' }, adminCookie);
    check('admin can re-enable a user', reEnable.status === 200);
    const rel = await POST('/api/auth/login', { email: registeredEmail, password: 'SpeedForce1' });
    userCookie = cookieFrom(rel);
    check('re-enabled user can sign in again', rel.status === 200);

    const selfDemote = await PUT(`/api/admin/users/${target.id}/role`, { role: 'user' }, adminCookie);
    check('role change on regular user is a no-op-ok', selfDemote.status === 200);
  }

  // ── password reset flow ──────────────────────────────────────────────
  group('password reset');
  {
    const email = `reset.me+${Date.now()}@gmail.com`;
    // The account has to be confirmed first, otherwise it cannot sign in after
    // the password is changed.
    await registerVerified('Reset Me', email, 'OldPass12');
    const forgot = await (await POST('/api/auth/forgot', { email })).json();
    check('forgot returns a dev token in non-prod', typeof forgot.dev_reset_token === 'string' && forgot.dev_reset_token.length > 10);

    const reset = await POST('/api/auth/reset', { token: forgot.dev_reset_token, password: 'NewPass123' });
    check('reset with token succeeds', reset.status === 200);
    const oldLogin = await POST('/api/auth/login', { email, password: 'OldPass12' });
    check('old password no longer works', oldLogin.status === 401);
    const newLogin = await POST('/api/auth/login', { email, password: 'NewPass123' });
    check('new password works', newLogin.status === 200);

    const reused = await POST('/api/auth/reset', { token: forgot.dev_reset_token, password: 'AnotherPass1' });
    check('reset token cannot be reused', reused.status === 400);
  }

  // ── interface translations ───────────────────────────────────────────
  group('i18n: languages & coverage');
  {
    const { LANGS, STRINGS, DEFAULT_LANG, FULL_TRANSLATIONS, translate, isLang } = await import('../src/strings.js');

    check('the switcher offers every requested language',
      ['en', 'fr', 'rw', 'pt', 'en-GB'].every((c) => LANGS.some((l) => l.code === c)));
    check('every language carries a code, label and short form',
      LANGS.every((l) => l.code && l.name && l.native && l.short));
    check('language codes are unique', new Set(LANGS.map((l) => l.code)).size === LANGS.length);
    check('English is the source language', DEFAULT_LANG === 'en');
    check('isLang accepts a region variant', isLang('en-GB'));
    check('isLang rejects an unoffered language', !isLang('de'));
    check('the source language needs no dictionary', !STRINGS[DEFAULT_LANG]);

    // Every key any full translation knows — the set they must all share.
    const sourceKeys = new Set();
    for (const code of FULL_TRANSLATIONS) for (const k of Object.keys(STRINGS[code])) sourceKeys.add(k);

    for (const code of FULL_TRANSLATIONS) {
      const table = STRINGS[code];
      const missing = [...sourceKeys].filter((k) => table[k] === undefined);
      check(`${code} translates every interface string`, !!table && missing.length === 0,
        `missing ${missing.length}: ${missing.slice(0, 3).join(' | ')}`);
    }

    // Placeholders must survive, or "{n} chapters" would print braces — and a
    // dictionary must not invent keys the source does not have.
    const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [code, table] of Object.entries(STRINGS)) {
      const broken = Object.entries(table).filter(([k, v]) => placeholders(k) !== placeholders(v));
      check(`${code} keeps placeholders intact`, broken.length === 0, broken.slice(0, 3).map(([k]) => k).join(' | '));
      const orphan = Object.keys(table).filter((k) => !sourceKeys.has(k));
      check(`${code} has no keys outside the source set`, orphan.length === 0, orphan.slice(0, 3).join(' | '));
    }

    // British English refines the source rather than duplicating it.
    const gb = STRINGS['en-GB'];
    check('British English is an override set, not a copy',
      Object.keys(gb).length > 0 && Object.keys(gb).length < sourceKeys.size);

    // A typo in a t('…') key would silently fall back to English, which is
    // exactly the kind of gap nobody notices. Every static string handed to a
    // translator has to be a real dictionary key.
    const fsMod = await import('node:fs');
    const pathMod = await import('node:path');
    const srcFiles = [];
    const walk = (dir) => {
      for (const entry of fsMod.readdirSync(dir, { withFileTypes: true })) {
        const p = pathMod.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.jsx')) srcFiles.push(p);
      }
    };
    walk('src');
    const callRe = /\b(?:t|tr|tNow|tNotice)\('((?:[^'\\]|\\.)*)'/g;
    const unknownKeys = [];
    for (const file of srcFiles) {
      for (const m of fsMod.readFileSync(file, 'utf8').matchAll(callRe)) {
        const key = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        if (!sourceKeys.has(key)) unknownKeys.push(`${file.replace(/\\/g, '/')}: ${key}`);
      }
    }
    check('every string passed to a translator is a known key', unknownKeys.length === 0,
      `${unknownKeys.length} unknown${unknownKeys.length ? ' — ' + unknownKeys.slice(0, 4).join(' | ') : ''}`);

    check('an unknown string falls back to English', translate('pt', 'Not a real key') === 'Not a real key');
    check('a translation interpolates placeholders', translate('pt', '{n} chapters', { n: 3 }) === '3 capítulos');
    check('Portuguese is served', translate('pt', 'Movies') === 'Filmes');
    check('Kinyarwanda is served', translate('rw', 'Movies') !== 'Movies');
    check('British English overrides a differing string', translate('en-GB', 'Movie') === 'Film');
    check('British English falls back to the source', translate('en-GB', 'Novels') === 'Novels');
    check('British English reads dates day/month', new Date('2026-03-04T12:00:00').toLocaleDateString('en-GB').startsWith('04/03'));
  }

  // ── media & misc ─────────────────────────────────────────────────────
  group('media & misc');
  {
    const poster = await GET(`/media/poster/${firstTitle.slug}?kind=${firstTitle.kind}&name=${encodeURIComponent(firstTitle.name)}`);
    check('poster endpoint serves SVG', poster.status === 200 && String(poster.headers.get('content-type')).includes('svg'));

    const unknownApi = await GET('/api/definitely-not-an-endpoint');
    check('unknown API route → JSON 404', unknownApi.status === 404 && (await unknownApi.json()).error?.code === 'not_found');
  }
} catch (err) {
  failures.push(`unexpected crash — ${err.stack || err.message || err}`);
  console.error('\nUNEXPECTED ERROR:', err);
} finally {
  // Shut down in dependency order so Windows can actually delete the DB dir:
  // drop live HTTP connections, close the server, then close SQLite.
  try { server?.closeAllConnections?.(); } catch {}
  if (server) await new Promise((resolve) => server.close(resolve));
  try { app.db?.close?.(); } catch {}
  if (cleanupDb) cleanupDb();
}

console.log(`\n${'—'.repeat(60)}`);
if (failures.length) {
  console.error(`✖ ${failures.length} failing check${failures.length === 1 ? '' : 's'} (${passed} passed):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
} else {
  console.log(`✓ All ${passed} checks passed.`);
}
