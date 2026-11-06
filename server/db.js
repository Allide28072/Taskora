// THE FLASH — database layer (node:sqlite, zero native deps)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  date_of_birth TEXT,
  profile_image TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  last_login_at TEXT,
  pref_novels INTEGER NOT NULL DEFAULT 1,
  pref_anime INTEGER NOT NULL DEFAULT 1,
  pref_kids INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resets_hash ON password_resets(token_hash);

-- One row per confirmation link sent. The token is stored hashed, and the
-- address it was issued for is kept so that changing an email invalidates any
-- link still in flight.
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_hash ON email_verifications(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT,
  is_kid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'all' CHECK (kind IN ('all','film','novel'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'all' CHECK (kind IN ('all','film','novel'))
);

CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('movie','series','anime')),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  release_year INTEGER,
  release_date TEXT,
  runtime INTEGER,
  rating REAL DEFAULT 0,
  age_rating TEXT DEFAULT 'PG-13',
  trailer_url TEXT,
  video_url TEXT,
  poster_url TEXT,
  backdrop_url TEXT,
  cast_json TEXT NOT NULL DEFAULT '[]',
  director TEXT DEFAULT '',
  tmdb_id INTEGER,
  featured INTEGER NOT NULL DEFAULT 0,
  popularity REAL NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_titles_kind ON titles(kind);
CREATE INDEX IF NOT EXISTS idx_titles_popularity ON titles(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_titles_rating ON titles(rating DESC);
CREATE INDEX IF NOT EXISTS idx_titles_year ON titles(release_year);
CREATE INDEX IF NOT EXISTS idx_titles_featured ON titles(featured);
CREATE INDEX IF NOT EXISTS idx_titles_tmdb ON titles(tmdb_id);

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT,
  UNIQUE (title_id, number)
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration INTEGER DEFAULT 45,
  video_url TEXT,
  still_url TEXT,
  air_date TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (title_id, season_id, number)
);
CREATE INDEX IF NOT EXISTS idx_episodes_title ON episodes(title_id, season_id, number);

CREATE TABLE IF NOT EXISTS novels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','completed','hiatus')),
  rating REAL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  popularity REAL NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  year INTEGER,
  tmdb_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_novels_status ON novels(status);
CREATE INDEX IF NOT EXISTS idx_novels_popularity ON novels(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_novels_rating ON novels(rating DESC);
CREATE INDEX IF NOT EXISTS idx_novels_featured ON novels(is_featured);

CREATE TABLE IF NOT EXISTS novel_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  words INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (novel_id, number)
);
CREATE INDEX IF NOT EXISTS idx_chapters_novel ON novel_chapters(novel_id, number);

CREATE TABLE IF NOT EXISTS title_novels (
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'novelization' CHECK (relation IN ('novelization','source')),
  PRIMARY KEY (title_id, novel_id)
);

CREATE TABLE IF NOT EXISTS media_genres (
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (title_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_media_genres_genre ON media_genres(genre_id);

CREATE TABLE IF NOT EXISTS novel_genres (
  novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (novel_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_novel_genres_genre ON novel_genres(genre_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('title','novel')),
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

CREATE TABLE IF NOT EXISTS watch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, title_id, episode_id)
);
CREATE INDEX IF NOT EXISTS idx_watch_user ON watch_history(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_title ON watch_history(title_id);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL DEFAULT 1,
  scroll REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, novel_id)
);
CREATE INDEX IF NOT EXISTS idx_reading_user ON reading_progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ratings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('title','novel')),
  item_id INTEGER NOT NULL,
  value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 10),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_item ON ratings(item_type, item_id);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('title','novel')),
  item_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_type, item_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system',
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE VIEW IF NOT EXISTS v_kpi_30d AS SELECT
  (SELECT COUNT(*) FROM users WHERE created_at >= datetime('now','-30 days')) AS new_users_30d,
  (SELECT COUNT(*) FROM users WHERE last_login_at >= datetime('now','-30 days')) AS active_users_30d,
  (SELECT COUNT(*) FROM watch_history WHERE updated_at >= datetime('now','-30 days')) AS watch_events_30d,
  (SELECT COUNT(*) FROM reading_progress WHERE updated_at >= datetime('now','-30 days')) AS reading_events_30d;
`;

// Columns added after the first release. `CREATE TABLE IF NOT EXISTS` cannot
// introduce a column into a table that already exists, so new columns are added
// here — and existing rows are backfilled in the same breath.
function migrate(db) {
  const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  if (!columns.has('email_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
    // Every account that predates verification is grandfathered in. Locking out
    // existing users would be a hostile way to introduce the feature, and the
    // addresses were already in use before the column existed.
    db.exec('UPDATE users SET email_verified = 1, email_verified_at = created_at');
    console.log('[db] added users.email_verified — existing accounts marked as confirmed');
  }
}

export function openDatabase(dbPath = env.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function openDatabaseNoSchema(dbPath = env.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}
