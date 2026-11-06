# THE FLASH

One place for two habits: watching cinematic series and reading light novels. Films, series and
anime sit in the same catalogue as the novels they belong to, so a story can be finished as an
episode and continued as a chapter.

A single Express + SQLite API serves a React + Vite client. No native build steps, no external
database, and no runtime service to install.

## Stack

| Layer | Choice |
| --- | --- |
| API | Express 4 on Node (ESM) |
| Database | SQLite via the built-in `node:sqlite` — zero native dependencies |
| Client | React 18 + Vite 5, React Router 6 |
| Auth | Cookie session signed with `jsonwebtoken`, passwords hashed with `bcryptjs` |
| Hardening | `express-rate-limit` on auth and write routes |
| Styling | Hand-written CSS with custom properties (`src/styles.css`) — no CSS framework |

## Requirements

- **Node.js 22.13 or newer**, or **23.4+** — the API and the test suite both use the built-in
  `node:sqlite`, which needs `--experimental-sqlite` on Node 22.5–22.12. Developed on Node 24.
- npm. Nothing else — no database server, no native build steps, no global installs.
  (Docker is optional, for the [container path](#docker).)

## Quick start

```bash
npm install
cp .env.example .env      # then edit it — see Environment below
npm run dev
```

`npm run dev` starts both halves with `concurrently`:

- API → <http://localhost:3001>
- Web → <http://localhost:5173> (Vite proxies `/api` and `/media` to the API)

On first boot the server creates `data/theflash.db`, seeds the catalogue, and creates the
bootstrap administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Seeding is idempotent, so later
restarts are safe and never overwrite your own content.

Sign in with the administrator account to reach the console at `/admin/dashboard`, or create a
normal account from the sign-in screen. New accounts have to confirm their address before they can
sign in; with no mail server configured the confirmation link is written to
`data/mail-outbox.log` and also shown on the sign-up screen, so the flow is walkable locally —
see [Email verification](#email-verification).

## Environment

`.env` (or `server/.env`) is read by the server; `.env.example` documents every key. Values are
never committed — `.env` is git-ignored.

| Key | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs session cookies. **Required in production.** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Bootstrap administrator, created on first run only. |
| `IMAGE_SOURCE` | `photos` (default) uses real photography with a drawn fallback; `generated` stays fully offline. |
| `TMDB_API_KEY` / `TMDB_ACCESS_TOKEN` / `TMDB_LANGUAGE` | Optional, for the admin metadata import. |
| `COOKIE_SECURE` | `Secure` session cookie. Defaults to on when `NODE_ENV=production`, off otherwise. Set `false` only to run production over plain HTTP. |
| `REQUIRE_EMAIL_VERIFICATION` | An account stays unusable until its address is confirmed. Default `true`; set `false` for a local demo or a test run. |
| `EMAIL_MX_CHECK` | Ask DNS whether a sign-up domain can receive mail. Default `true`; turn off on an air-gapped host. |
| `APP_URL` | Public origin used to build the confirmation link. Defaults to `http://localhost:<PORT>`. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | SMTP delivery for confirmation emails. Leaving `SMTP_HOST` empty uses the log transport instead. |
| `MAIL_FROM` | The `From:` header on outgoing messages. |
| `DATA_DIR` | Where `theflash.db` lives, relative to the project root. Default `data`. |
| `PORT` / `VITE_PORT` | Default `3001` and `5173`. |

Change the administrator password later with:

```bash
npm run admin -- <email> <new-password> [name]
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | API + Vite together, both watching for changes. |
| `npm run dev:api` | API only. |
| `npm run dev:web` | Vite only. |
| `npm run build` | Production client build into `dist/` (the API is runtime-only). |
| `npm start` | Run the API alone, without a watcher. |
| `npm run seed` | Seed or top up the catalogue. |
| `npm run admin` | Create or update an administrator. |
| `npm run typecheck` | `tsc --noEmit` over the client and server. |
| `npm test` | End-to-end API test suite (see below). |

## Production

`npm run build` writes the client to `dist/`. The API serves it automatically whenever
`dist/index.html` exists, so production is a **single process on a single port**:

```bash
npm run build
NODE_ENV=production SESSION_SECRET=<long random string> npm start
# → http://localhost:3001 serves the app and the API
```

- `/assets/*` — content-hashed, cached for a year with `immutable`
- everything else — the SPA shell, with `Cache-Control: no-cache` so deploys take effect
- `/api/*` and `/media/*` — JSON, including their 404s, never the HTML shell

**Set `SESSION_SECRET`.** Without it the server generates an ephemeral key per boot and every session
is invalidated on restart. In development that is harmless; in production it logs people out.

In production the session cookie is marked `Secure`, which means it is only sent over HTTPS. Behind a
TLS-terminating proxy that is what you want. For a plain-HTTP smoke test set `COOKIE_SECURE=false`, or
the browser will drop the cookie and sign-in will appear to do nothing.

### Docker

```bash
docker build -t the-flash .
docker run --rm -p 3001:3001 \
  -e SESSION_SECRET=<long random string> \
  -e ADMIN_EMAIL=you@example.com \
  -e ADMIN_PASSWORD=<a-long-password> \
  -v theflash-data:/app/data \
  the-flash
```

A multi-stage build: the first stage installs every dependency and builds the client, the second keeps
only production dependencies plus `server/` and `dist/`. The image runs as the non-root `node` user,
listens on `3001` with `NODE_ENV=production`, and declares a `HEALTHCHECK` against `/api/health`.

**Mount a volume at `/app/data` or your database disappears with the container.** The seed recreates
the catalogue on boot, but user accounts and anything you added through the admin console live only in
that file.

## Project layout

```
Dockerfile         multi-stage production image
.dockerignore      keeps node_modules, data/ and .env out of the build context
server/            Express API
  server.js        entry point
  app.js           middleware, routes, built-client serving
  db.js            schema and connection (node:sqlite)
  seed.js          idempotent catalogue seed and migrations
  demo-videos.js   playable-media table (trailers, sample streams)
  art.js images.js locally drawn artwork and photography fallbacks
  routes/          public.js · auth.js · user.js · admin.js
src/               React client
  main.jsx         shell, navigation, route table
  auth.jsx api.js  session context and fetch wrapper
  components.jsx   shared UI, including the site footer
  pages/           home, catalog, title, watch, novels, novel, reader, admin, …
tests/             run-tests.mjs — API suite
data/              SQLite database (git-ignored, created on first run)
```

## Email verification

Signing up does not produce a usable account on its own: the address is checked before a row is
written, and after it is written the person is sent a link they have to open.

**Three checks run at sign-up**, each returning a specific reason so the form can point at the right
thing:

1. **syntax** — the address is genuinely well formed (length, characters, domain labels, a real TLD)
2. **plausibility** — example and reserved domains (`example.com`, `.test`, `.invalid`, …), known
   disposable mailboxes (`mailinator.com`, `yopmail.com`, …) and junk local parts (`test@`, `asdf@`)
   are refused, and a near-miss of a popular provider comes back as *"Did you mean …?"*
3. **deliverability** — the domain must publish a mail route. A domain with no MX record (and no
   address record to fall back on) is refused; anything the resolver cannot answer — a timeout, a
   blocked network, no DNS at all — is treated as *unknown* and allowed through, so an offline
   deployment never bricks sign-up.

**The confirmation email** links to `/verify?token=…`. Only the token's hash is stored, the link is
single-use, it expires after 24 hours, and issuing a new link retires any earlier one. Redeeming it
is a `POST` rather than a `GET`, so an inbox scanner that fetches links cannot consume the token
before the person opens it. Opening the link confirms the address and signs them in.

**Without a mail server** (no `SMTP_HOST`) the message is appended to `<DATA_DIR>/mail-outbox.log`
and, in development only, the link is also returned in the API response so the flow stays walkable
end to end. `resend-verification` issues a new link, throttled to one per minute per account.

Changing an email on the profile page runs the same checks and returns the new address to the
unconfirmed state — the current session stays valid, so correcting a typo does not sign you out.

`server/email-policy.js` holds the checks and `server/mail.js` the SMTP client and log transport;
both are dependency-free. Seed and operator-provisioned accounts (`seed.js`, `set-admin.js`) are
marked confirmed, since an operator supplying the credentials is proof enough of the address.

## Testing

```bash
npm test
```

The suite boots the real Express app in-process against a **throwaway database** and exercises the
public, auth, user and admin routes end to end — including sign-up, the confirmation round-trip,
resending a link, the address policy (with an injected DNS resolver, so the suite needs no network),
and the message assembly in the SMTP client. Two safeguards matter here:

- The throwaway database lives in a **project-relative** temp directory, because joining an
  absolute temp path onto the project root produces a broken path on Windows.
- The suite **refuses to run** unless the app's resolved database path is inside that temp
  directory, so a misconfiguration can never write into your development data.

It shuts the server down in order (`closeAllConnections` → `close` → `db.close`) before deleting
the temp directory — on Windows an open SQLite file cannot be deleted.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request, against **Node 22.13 and 24** — the
oldest release where `node:sqlite` needs no experimental flag, and the version we develop on. Each run:

1. installs with `npm ci` (the lockfile is the source of truth)
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. starts the production server and asserts the deployment contract — `/` and a client-side route serve
   the built shell, hashed assets carry the `immutable` cache header, and `/api/*` and `/media/*` answer
   as JSON instead of falling through to HTML

**No secrets are needed.** The test suite boots its own throwaway database, and the smoke test supplies
its own dummy administrator via environment variables. Both jobs are read-only and nothing is deployed.

## About the content

Every title, novel and chapter in this catalogue is an original work written for this application;
no third-party story content or artwork is bundled. Photography comes from Picsum and is drawn
locally when unreachable. Trailers play through the studios' own official embeds.

## Licence

Released under the [MIT Licence](LICENSE) — Copyright (c) 2026 Karangwa Allide. You are free to
use, modify and redistribute the code, provided the copyright notice and permission notice stay
with it. The catalogue's own written content and artwork are covered by the same terms.

## Before you make this repository public

- **Keep `.env` out of the repository.** It holds `SESSION_SECRET` and your administrator
  password. `.gitignore` already excludes it — commit `.env.example` instead.
- **Never commit `data/*.db`.** The catalogue is rebuilt by the seed on first boot, and the
  database contains real accounts.
