// THE FLASH — admin API (every route requires role=admin)
import { Router } from 'express';
import {
  bad, notFound, nowISO, cleanText, uniqueSlug, parseIntSafe, parseGenres, asyncH,
} from '../util.js';
import { titleImages, novelImages } from '../images.js';

function audit(db, req, action, entity, entityId, detail = '') {
  db.prepare('INSERT INTO admin_audit (user_id, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user?.id ?? null, action, entity, String(entityId), cleanText(detail, 500), nowISO());
}

function titleBody(db, body, existing = null) {
  const name = cleanText(body.name ?? existing?.name, 160);
  if (name.length < 2) throw bad('Title name is required.');
  const kind = ['movie', 'series', 'anime'].includes(body.kind) ? body.kind : (existing?.kind || 'movie');
  return {
    kind,
    name,
    description: cleanText(body.description ?? existing?.description ?? '', 5000),
    release_year: parseIntSafe(body.release_year, existing?.release_year ?? new Date().getFullYear()),
    release_date: body.release_date ? cleanText(body.release_date, 10) : (existing?.release_date || null),
    runtime: parseIntSafe(body.runtime, existing?.runtime ?? 0),
    rating: Math.min(10, Math.max(0, parseFloat(body.rating) || existing?.rating || 0)),
    age_rating: cleanText(body.age_rating ?? existing?.age_rating ?? 'PG-13', 10),
    trailer_url: cleanText(body.trailer_url ?? existing?.trailer_url ?? '', 500) || null,
    video_url: cleanText(body.video_url ?? existing?.video_url ?? '', 500) || null,
    poster_url: imageUrl(body.poster_url ?? existing?.poster_url ?? ''),
    backdrop_url: imageUrl(body.backdrop_url ?? existing?.backdrop_url ?? ''),
    cast: Array.isArray(body.cast)
      ? JSON.stringify(body.cast.map((c) => cleanText(c, 80)).filter(Boolean).slice(0, 30))
      : (body.cast !== undefined ? JSON.stringify(cleanText(String(body.cast), 1000).split(',').map((s) => s.trim()).filter(Boolean)) : (existing?.cast_json || '[]')),
    director: cleanText(body.director ?? existing?.director ?? '', 120),
    featured: (body.featured !== undefined ? !!body.featured : !!(existing?.featured)) ? 1 : 0,
    popularity: Math.max(0, parseFloat(body.popularity) || existing?.popularity || 500),
  };
}

function novelBody(db, body, existing = null) {
  const name = cleanText(body.name ?? existing?.name, 160);
  if (name.length < 2) throw bad('Novel name is required.');
  return {
    name,
    author: cleanText(body.author ?? existing?.author ?? '', 120),
    description: cleanText(body.description ?? existing?.description ?? '', 5000),
    status: ['ongoing', 'completed', 'hiatus'].includes(body.status) ? body.status : (existing?.status || 'ongoing'),
    rating: Math.min(10, Math.max(0, parseFloat(body.rating) || existing?.rating || 0)),
    year: parseIntSafe(body.year, existing?.year ?? new Date().getFullYear()),
    featured: (body.featured !== undefined ? !!body.featured : !!(existing?.is_featured)) ? 1 : 0,
    popularity: Math.max(0, parseFloat(body.popularity) || existing?.popularity || 500),
    cover_url: imageUrl(body.cover_url ?? existing?.cover_url ?? ''),
  };
}

/**
 * Artwork URLs come from administrators, so they are stored as plain links and
 * only ever rendered as an <img src>. Anything that is not http(s) or a local
 * path is dropped, which keeps javascript: and data: payloads out of the page.
 */
function imageUrl(value) {
  const url = cleanText(value, 500).trim();
  if (!url) return '';
  if (url.startsWith('/media/')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  throw bad('Image URLs must start with http://, https:// or /media/.');
}

export function adminRouter(db, app) {
  const r = Router();
  r.use(app.requireAdmin); // ← authorization verified server-side on EVERY admin route

  // ── dashboard stats ──────────────────────────────────────────────────
  r.get('/stats', (req, res) => {
    const g = (sql) => db.prepare(sql).get().c;
    res.json({
      users: g('SELECT COUNT(*) c FROM users'),
      movies: g(`SELECT COUNT(*) c FROM titles WHERE kind='movie'`),
      series: g(`SELECT COUNT(*) c FROM titles WHERE kind='series'`),
      anime: g(`SELECT COUNT(*) c FROM titles WHERE kind='anime'`),
      novels: g('SELECT COUNT(*) c FROM novels'),
      chapters: g('SELECT COUNT(*) c FROM novel_chapters'),
      views: g('SELECT COALESCE(SUM(views),0) c FROM titles') + g('SELECT COALESCE(SUM(views),0) c FROM novels'),
      watch_activity: g('SELECT COUNT(*) c FROM watch_history'),
      reading_activity: g('SELECT COUNT(*) c FROM reading_progress'),
      kpi: db.prepare('SELECT * FROM v_kpi_30d').get(),
      recent_users: db.prepare('SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 5').all(),
      recent_audit: db.prepare('SELECT a.*, u.name AS user_name FROM admin_audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 8').all(),
    });
  });

  // ── content: titles (movies/series/anime) ────────────────────────────
  r.get('/titles', (req, res) => {
    const { page, pageSize, offset } = { page: Math.max(1, parseInt(req.query.page, 10) || 1), pageSize: 20, offset: 0 };
    const offsetCalc = (page - 1) * 20;
    const where = ['1=1'];
    const params = [];
    if (req.query.kind && ['movie', 'series', 'anime'].includes(req.query.kind)) { where.push('kind = ?'); params.push(req.query.kind); }
    if (req.query.q) { where.push('name LIKE ?'); params.push(`%${String(req.query.q).slice(0, 60)}%`); }
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) c FROM titles WHERE ${whereSql}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM titles WHERE ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offsetCalc);
    res.json({
      items: rows.map((x) => ({
        ...x,
        cast_json: undefined,
        cast: JSON.parse(x.cast_json || '[]'),
        ...titleImages(x, {
          poster: `/media/poster/${x.slug}?kind=${x.kind}&name=${encodeURIComponent(x.name)}`,
          backdrop: `/media/backdrop/${x.slug}?kind=${x.kind}&name=${encodeURIComponent(x.name)}`,
        }),
      })),
      total, page, pageSize,
    });
  });

  r.post('/titles', (req, res) => {
    const body = titleBody(db, req.body);
    const slug = uniqueSlug(db, 'titles', body.name);
    const t = nowISO();
    const info = db.prepare(`INSERT INTO titles (kind, slug, name, description, release_year, release_date, runtime, rating, age_rating, trailer_url, video_url, poster_url, backdrop_url, cast_json, director, featured, popularity, views, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .run(body.kind, slug, body.name, body.description, body.release_year, body.release_date, body.runtime, body.rating, body.age_rating, body.trailer_url, body.video_url, body.poster_url, body.backdrop_url, body.cast, body.director, body.featured, body.popularity, t, t);
    const id = Number(info.lastInsertRowid);
    for (const gid of parseGenres(db, req.body.genres)) db.prepare('INSERT OR IGNORE INTO media_genres (title_id, genre_id) VALUES (?, ?)').run(id, gid);
    audit(db, req, 'create', 'title', id, body.name);
    res.status(201).json({ ok: true, id });
  });

  r.get('/titles/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM titles WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (!row) throw notFound('Title not found.');
    const genres = db.prepare('SELECT genre_id FROM media_genres WHERE title_id = ?').all(row.id).map((x) => x.genre_id);
    const seasons = db.prepare('SELECT id, number, name FROM seasons WHERE title_id = ? ORDER BY number').all(row.id)
      .map((s) => ({ ...s, episodes: db.prepare('SELECT id, number, name, description, duration, video_url, air_date FROM episodes WHERE season_id = ? ORDER BY number').all(s.id) }));
    const linked = db.prepare('SELECT novel_id FROM title_novels WHERE title_id = ?').all(row.id).map((x) => x.novel_id);
    res.json({ title: { ...row, cast_json: undefined, cast: JSON.parse(row.cast_json || '[]'), genre_ids: genres, seasons, linked_novel_ids: linked } });
  });

  r.put('/titles/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const existing = db.prepare('SELECT * FROM titles WHERE id = ?').get(id);
    if (!existing) throw notFound('Title not found.');
    const body = titleBody(db, req.body, existing);
    const slug = body.name !== existing.name ? uniqueSlug(db, 'titles', body.name, id) : existing.slug;
    db.prepare(`UPDATE titles SET kind=?, slug=?, name=?, description=?, release_year=?, release_date=?, runtime=?, rating=?, age_rating=?, trailer_url=?, video_url=?, poster_url=?, backdrop_url=?, cast_json=?, director=?, featured=?, popularity=?, updated_at=? WHERE id=?`)
      .run(body.kind, slug, body.name, body.description, body.release_year, body.release_date, body.runtime, body.rating, body.age_rating, body.trailer_url, body.video_url, body.poster_url, body.backdrop_url, body.cast, body.director, body.featured, body.popularity, nowISO(), id);
    if (req.body.genres !== undefined) {
      db.prepare('DELETE FROM media_genres WHERE title_id = ?').run(id);
      for (const gid of parseGenres(db, req.body.genres)) db.prepare('INSERT OR IGNORE INTO media_genres (title_id, genre_id) VALUES (?, ?)').run(id, gid);
    }
    audit(db, req, 'update', 'title', id, body.name);
    res.json({ ok: true });
  });

  r.delete('/titles/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const existing = db.prepare('SELECT name FROM titles WHERE id = ?').get(id);
    if (!existing) throw notFound('Title not found.');
    db.prepare('DELETE FROM titles WHERE id = ?').run(id);
    audit(db, req, 'delete', 'title', id, existing.name);
    res.json({ ok: true });
  });

  // ── seasons & episodes ───────────────────────────────────────────────
  r.post('/titles/:id/seasons', (req, res) => {
    const titleId = parseInt(req.params.id, 10) || 0;
    if (!db.prepare('SELECT id FROM titles WHERE id = ?').get(titleId)) throw notFound('Title not found.');
    const max = db.prepare('SELECT COALESCE(MAX(number),0) m FROM seasons WHERE title_id = ?').get(titleId).m;
    const num = parseIntSafe(req.body?.number, max + 1);
    const info = db.prepare('INSERT INTO seasons (title_id, number, name) VALUES (?, ?, ?)').run(titleId, num, cleanText(req.body?.name, 80) || `Season ${num}`);
    audit(db, req, 'create', 'season', Number(info.lastInsertRowid), `title ${titleId}`);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  r.put('/seasons/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    if (!db.prepare('SELECT id FROM seasons WHERE id = ?').get(id)) throw notFound('Season not found.');
    db.prepare('UPDATE seasons SET name = ?, number = ? WHERE id = ?')
      .run(cleanText(req.body?.name, 80) || 'Season', parseIntSafe(req.body?.number, 1), id);
    audit(db, req, 'update', 'season', id);
    res.json({ ok: true });
  });

  r.delete('/seasons/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    db.prepare('DELETE FROM seasons WHERE id = ?').run(id);
    audit(db, req, 'delete', 'season', id);
    res.json({ ok: true });
  });

  r.post('/seasons/:id/episodes', (req, res) => {
    const seasonId = parseInt(req.params.id, 10) || 0;
    const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
    if (!season) throw notFound('Season not found.');
    const max = db.prepare('SELECT COALESCE(MAX(number),0) m FROM episodes WHERE season_id = ?').get(seasonId).m;
    const num = parseIntSafe(req.body?.number, max + 1);
    const name = cleanText(req.body?.name, 160) || `Episode ${num}`;
    const info = db.prepare(`INSERT INTO episodes (title_id, season_id, number, name, description, duration, video_url, still_url, air_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)`)
      .run(season.title_id, seasonId, num, name, cleanText(req.body?.description, 2000), parseIntSafe(req.body?.duration, 45), cleanText(req.body?.video_url, 500) || null, cleanText(req.body?.air_date, 10) || null, nowISO());
    // notify
    const t = nowISO();
    db.prepare(`INSERT INTO notifications (user_id, type, message, link, is_read, created_at) SELECT NULL, 'episode', 'New episode of ' || name || ' is out now.', '/title/' || slug, 0, ? FROM titles WHERE id = ?`).run(t, season.title_id);
    audit(db, req, 'create', 'episode', Number(info.lastInsertRowid), `${season.title_id} S${season.number}E${num}`);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  r.put('/episodes/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const existing = db.prepare('SELECT * FROM episodes WHERE id = ?').get(id);
    if (!existing) throw notFound('Episode not found.');
    db.prepare(`UPDATE episodes SET name=?, description=?, duration=?, video_url=?, air_date=?, number=? WHERE id=?`)
      .run(
        cleanText(req.body?.name ?? existing.name, 160),
        cleanText(req.body?.description ?? existing.description, 2000),
        parseIntSafe(req.body?.duration, existing.duration),
        req.body?.video_url !== undefined ? (cleanText(req.body.video_url, 500) || null) : existing.video_url,
        req.body?.air_date !== undefined ? (cleanText(req.body.air_date, 10) || null) : existing.air_date,
        parseIntSafe(req.body?.number, existing.number),
        id
      );
    audit(db, req, 'update', 'episode', id);
    res.json({ ok: true });
  });

  r.delete('/episodes/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    db.prepare('DELETE FROM episodes WHERE id = ?').run(id);
    audit(db, req, 'delete', 'episode', id);
    res.json({ ok: true });
  });

  // ── novels ───────────────────────────────────────────────────────────
  r.get('/novels', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const where = ['1=1'];
    const params = [];
    if (req.query.q) { where.push('(name LIKE ? OR author LIKE ?)'); params.push(`%${String(req.query.q).slice(0, 60)}%`, `%${String(req.query.q).slice(0, 60)}%`); }
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) c FROM novels WHERE ${whereSql}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM novels WHERE ${whereSql} ORDER BY id DESC LIMIT 20 OFFSET ?`).all(...params, (page - 1) * 20);
    res.json({
      items: rows.map((x) => ({
        ...x,
        ...novelImages(x, { cover: `/media/cover/${x.slug}?name=${encodeURIComponent(x.name)}` }),
        chapters: db.prepare('SELECT COUNT(*) c FROM novel_chapters WHERE novel_id = ?').get(x.id).c,
      })),
      total, page,
    });
  });

  r.post('/novels', (req, res) => {
    const body = novelBody(db, req.body);
    const slug = uniqueSlug(db, 'novels', body.name);
    const t = nowISO();
    const info = db.prepare(`INSERT INTO novels (slug, name, author, description, cover_url, status, rating, is_featured, popularity, views, year, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
      .run(slug, body.name, body.author, body.description, body.cover_url, body.status, body.rating, body.featured, body.popularity, body.year, t, t);
    const id = Number(info.lastInsertRowid);
    for (const gid of parseGenres(db, req.body.genres)) db.prepare('INSERT OR IGNORE INTO novel_genres (novel_id, genre_id) VALUES (?, ?)').run(id, gid);
    db.prepare(`INSERT INTO notifications (user_id, type, message, link, is_read, created_at) VALUES (NULL, 'novel', 'New novel added: ' || ?, '/novel/' || ?, 0, ?)`).run(body.name, slug, t);
    audit(db, req, 'create', 'novel', id, body.name);
    res.status(201).json({ ok: true, id });
  });

  r.get('/novels/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM novels WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (!row) throw notFound('Novel not found.');
    const genres = db.prepare('SELECT genre_id FROM novel_genres WHERE novel_id = ?').all(row.id).map((x) => x.genre_id);
    const chapters = db.prepare('SELECT id, number, name, words FROM novel_chapters WHERE novel_id = ? ORDER BY number').all(row.id);
    res.json({ novel: { ...row, genre_ids: genres, chapters } });
  });

  r.put('/novels/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const existing = db.prepare('SELECT * FROM novels WHERE id = ?').get(id);
    if (!existing) throw notFound('Novel not found.');
    const body = novelBody(db, req.body, existing);
    const slug = body.name !== existing.name ? uniqueSlug(db, 'novels', body.name, id) : existing.slug;
    db.prepare(`UPDATE novels SET slug=?, name=?, author=?, description=?, cover_url=?, status=?, rating=?, is_featured=?, popularity=?, year=?, updated_at=? WHERE id=?`)
      .run(slug, body.name, body.author, body.description, body.cover_url, body.status, body.rating, body.featured, body.popularity, body.year, nowISO(), id);
    if (req.body.genres !== undefined) {
      db.prepare('DELETE FROM novel_genres WHERE novel_id = ?').run(id);
      for (const gid of parseGenres(db, req.body.genres)) db.prepare('INSERT OR IGNORE INTO novel_genres (novel_id, genre_id) VALUES (?, ?)').run(id, gid);
    }
    audit(db, req, 'update', 'novel', id, body.name);
    res.json({ ok: true });
  });

  r.delete('/novels/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const existing = db.prepare('SELECT name FROM novels WHERE id = ?').get(id);
    if (!existing) throw notFound('Novel not found.');
    db.prepare('DELETE FROM novels WHERE id = ?').run(id);
    audit(db, req, 'delete', 'novel', id, existing.name);
    res.json({ ok: true });
  });

  // ── chapters ─────────────────────────────────────────────────────────
  r.post('/novels/:id/chapters', (req, res) => {
    const novelId = parseInt(req.params.id, 10) || 0;
    const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
    if (!novel) throw notFound('Novel not found.');
    const max = db.prepare('SELECT COALESCE(MAX(number),0) m FROM novel_chapters WHERE novel_id = ?').get(novelId).m;
    const num = parseIntSafe(req.body?.number, max + 1);
    const content = cleanText(req.body?.content, 200_000);
    const info = db.prepare(`INSERT INTO novel_chapters (novel_id, number, name, content, words, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(novelId, num, cleanText(req.body?.name, 160) || `Chapter ${num}`, content, content.split(/\s+/).filter(Boolean).length, nowISO(), nowISO());
    db.prepare('UPDATE novels SET updated_at = ? WHERE id = ?').run(nowISO(), novelId);
    db.prepare(`INSERT INTO notifications (user_id, type, message, link, is_read, created_at) VALUES (NULL, 'chapter', 'New chapter of ' || ? || ' is out now.', '/novel/' || ?, 0, ?)`)
      .run(novel.name, novel.slug, nowISO());
    audit(db, req, 'create', 'chapter', Number(info.lastInsertRowid), `${novel.name} #${num}`);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  r.get('/chapters/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM novel_chapters WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (!row) throw notFound('Chapter not found.');
    res.json({ chapter: row });
  });

  r.put('/chapters/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const existing = db.prepare('SELECT * FROM novel_chapters WHERE id = ?').get(id);
    if (!existing) throw notFound('Chapter not found.');
    const content = req.body?.content !== undefined ? cleanText(req.body.content, 200_000) : existing.content;
    db.prepare(`UPDATE novel_chapters SET name=?, content=?, words=?, number=?, updated_at=? WHERE id=?`)
      .run(cleanText(req.body?.name ?? existing.name, 160), content, content.split(/\s+/).filter(Boolean).length, parseIntSafe(req.body?.number, existing.number), nowISO(), id);
    db.prepare('UPDATE novels SET updated_at = ? WHERE id = ?').run(nowISO(), existing.novel_id);
    audit(db, req, 'update', 'chapter', id);
    res.json({ ok: true });
  });

  r.delete('/chapters/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const existing = db.prepare('SELECT novel_id FROM novel_chapters WHERE id = ?').get(id);
    if (!existing) throw notFound('Chapter not found.');
    db.prepare('DELETE FROM novel_chapters WHERE id = ?').run(id);
    db.prepare('UPDATE novels SET updated_at = ? WHERE id = ?').run(nowISO(), existing.novel_id);
    audit(db, req, 'delete', 'chapter', id);
    res.json({ ok: true });
  });

  // reorder chapters (renumbers 1..n in the given order)
  r.post('/novels/:id/chapters/reorder', (req, res) => {
    const novelId = parseInt(req.params.id, 10) || 0;
    const ids = Array.isArray(req.body?.chapter_ids) ? req.body.chapter_ids.map((x) => parseInt(x, 10)).filter(Boolean) : [];
    const novel = db.prepare('SELECT id FROM novels WHERE id = ?').get(novelId);
    if (!novel) throw notFound('Novel not found.');
    const base = nowISO();
    // Two passes: push every touched chapter into a scratch range above the
    // real numbering first, then assign the final order — otherwise moving a
    // chapter to a lower position collides with the (novel_id, number)
    // UNIQUE index and 500s. Chapters not in the list keep their numbers.
    let scratch = 1_000_000;
    for (const cid of ids) {
      db.prepare('UPDATE novel_chapters SET number = ?, updated_at = ? WHERE id = ? AND novel_id = ?').run(scratch++, base, cid, novelId);
    }
    let n = 1;
    for (const cid of ids) {
      db.prepare('UPDATE novel_chapters SET number = ?, updated_at = ? WHERE id = ? AND novel_id = ?').run(n++, base, cid, novelId);
    }
    audit(db, req, 'reorder', 'chapters', novelId, `${ids.length} chapters`);
    res.json({ ok: true });
  });

  // ── adaptation links (movie ↔ novel) ─────────────────────────────────
  r.post('/links', (req, res) => {
    const titleId = parseIntSafe(req.body?.title_id, 0);
    const novelId = parseIntSafe(req.body?.novel_id, 0);
    const relation = ['novelization', 'source'].includes(req.body?.relation) ? req.body.relation : 'novelization';
    if (!db.prepare('SELECT id FROM titles WHERE id = ?').get(titleId)) throw bad('Title not found.');
    if (!db.prepare('SELECT id FROM novels WHERE id = ?').get(novelId)) throw bad('Novel not found.');
    db.prepare('INSERT OR REPLACE INTO title_novels (title_id, novel_id, relation) VALUES (?, ?, ?)').run(titleId, novelId, relation);
    audit(db, req, 'link', 'title_novels', `${titleId}->${novelId}`);
    res.json({ ok: true });
  });

  r.delete('/links/:titleId/:novelId', (req, res) => {
    db.prepare('DELETE FROM title_novels WHERE title_id = ? AND novel_id = ?').run(parseInt(req.params.titleId, 10) || 0, parseInt(req.params.novelId, 10) || 0);
    audit(db, req, 'unlink', 'title_novels', `${req.params.titleId}->${req.params.novelId}`);
    res.json({ ok: true });
  });

  // ── users management ─────────────────────────────────────────────────
  r.get('/users', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const q = cleanText(req.query.q, 60);
    const where = q ? 'WHERE name LIKE ? OR email LIKE ?' : '';
    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const total = db.prepare(`SELECT COUNT(*) c FROM users ${where}`).get(...params).c;
    const rows = db.prepare(`SELECT id, name, email, role, status, created_at, last_login_at FROM users ${where} ORDER BY created_at DESC LIMIT 20 OFFSET ?`).all(...params, (page - 1) * 20);
    res.json({ items: rows, total, page });
  });

  r.get('/users/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const u = db.prepare('SELECT id, name, email, role, status, date_of_birth, created_at, last_login_at, updated_at FROM users WHERE id = ?').get(id);
    if (!u) throw notFound('User not found.');
    const stats = {
      watch: db.prepare('SELECT COUNT(*) c FROM watch_history WHERE user_id = ?').get(id).c,
      reading: db.prepare('SELECT COUNT(*) c FROM reading_progress WHERE user_id = ?').get(id).c,
      favorites: db.prepare('SELECT COUNT(*) c FROM favorites WHERE user_id = ?').get(id).c,
      comments: db.prepare('SELECT COUNT(*) c FROM comments WHERE user_id = ?').get(id).c,
      sessions: db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND revoked_at IS NULL').get(id).c,
    };
    const recent = db.prepare(`SELECT a.action, a.entity, a.entity_id, a.detail, a.created_at FROM admin_audit a WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 10`).all(id);
    res.json({ user: u, stats, activity: recent });
  });

  r.put('/users/:id/status', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const status = req.body?.status === 'disabled' ? 'disabled' : 'active';
    const u = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
    if (!u) throw notFound('User not found.');
    if (u.role === 'admin' && status === 'disabled' && id === req.user.id) throw bad('You cannot disable your own admin account.');
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowISO(), id);
    if (status === 'disabled') db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowISO(), id);
    audit(db, req, 'status', 'user', id, status);
    res.json({ ok: true, status });
  });

  r.put('/users/:id/role', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const role = req.body?.role === 'admin' ? 'admin' : 'user';
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!u) throw notFound('User not found.');
    if (id === req.user.id && role !== 'admin') throw bad('You cannot demote your own account.');
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowISO(), id);
    audit(db, req, 'role', 'user', id, role);
    res.json({ ok: true, role });
  });

  // ── genres & categories ──────────────────────────────────────────────
  r.get('/genres', (req, res) => {
    const rows = db.prepare(`SELECT g.*, 
      (SELECT COUNT(*) FROM media_genres mg WHERE mg.genre_id = g.id) + (SELECT COUNT(*) FROM novel_genres ng WHERE ng.genre_id = g.id) AS usage_count
      FROM genres g ORDER BY g.name`).all();
    res.json({ genres: rows });
  });

  r.post('/genres', (req, res) => {
    const name = cleanText(req.body?.name, 60);
    if (name.length < 2) throw bad('Genre name is required.');
    const slug = uniqueSlug(db, 'genres', name);
    const info = db.prepare('INSERT INTO genres (name, slug, kind) VALUES (?, ?, ?)').run(name, slug, ['all', 'film', 'novel'].includes(req.body?.kind) ? req.body.kind : 'all');
    audit(db, req, 'create', 'genre', Number(info.lastInsertRowid), name);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  r.put('/genres/:id', (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const name = cleanText(req.body?.name, 60);
    if (name.length < 2) throw bad('Genre name is required.');
    db.prepare('UPDATE genres SET name = ?, kind = ? WHERE id = ?').run(name, ['all', 'film', 'novel'].includes(req.body?.kind) ? req.body.kind : 'all', id);
    audit(db, req, 'update', 'genre', id, name);
    res.json({ ok: true });
  });

  r.delete('/genres/:id', (req, res) => {
    db.prepare('DELETE FROM genres WHERE id = ?').run(parseInt(req.params.id, 10) || 0);
    audit(db, req, 'delete', 'genre', parseInt(req.params.id, 10) || 0);
    res.json({ ok: true });
  });

  r.get('/categories', (req, res) => {
    res.json({ categories: db.prepare('SELECT * FROM categories ORDER BY name').all() });
  });

  r.post('/categories', (req, res) => {
    const name = cleanText(req.body?.name, 60);
    if (name.length < 2) throw bad('Category name is required.');
    const info = db.prepare('INSERT INTO categories (name, slug, kind) VALUES (?, ?, ?)').run(name, uniqueSlug(db, 'categories', name), ['all', 'film', 'novel'].includes(req.body?.kind) ? req.body.kind : 'all');
    audit(db, req, 'create', 'category', Number(info.lastInsertRowid), name);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  r.delete('/categories/:id', (req, res) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(parseInt(req.params.id, 10) || 0);
    audit(db, req, 'delete', 'category', parseInt(req.params.id, 10) || 0);
    res.json({ ok: true });
  });

  // ── reports & audit ──────────────────────────────────────────────────
  r.get('/reports', (req, res) => {
    const reports = db.prepare(`SELECT r.*, u.name AS user_name FROM reports r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 50`).all();
    const topTitles = db.prepare(`SELECT id, name, kind, slug, views FROM titles ORDER BY views DESC LIMIT 10`).all();
    const topNovels = db.prepare(`SELECT id, name, slug, views FROM novels ORDER BY views DESC LIMIT 10`).all();
    res.json({
      reports, top_titles: topTitles, top_novels: topNovels,
      kpi: db.prepare('SELECT * FROM v_kpi_30d').get(),
      by_kind: {
        movie: db.prepare(`SELECT COUNT(*) c FROM titles WHERE kind='movie'`).get().c,
        series: db.prepare(`SELECT COUNT(*) c FROM titles WHERE kind='series'`).get().c,
        anime: db.prepare(`SELECT COUNT(*) c FROM titles WHERE kind='anime'`).get().c,
      },
    });
  });

  r.put('/reports/:id/resolve', (req, res) => {
    db.prepare(`UPDATE reports SET status='resolved' WHERE id = ?`).run(parseInt(req.params.id, 10) || 0);
    audit(db, req, 'resolve', 'report', parseInt(req.params.id, 10) || 0);
    res.json({ ok: true });
  });

  // ── settings ─────────────────────────────────────────────────────────
  r.get('/settings', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    res.json({ settings: Object.fromEntries(rows.map((x) => [x.key, x.value])) });
  });

  r.put('/settings', (req, res) => {
    const entries = Object.entries(req.body || {}).slice(0, 20);
    for (const [k, v] of entries) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
        .run(cleanText(k, 60), cleanText(String(v), 500));
    }
    audit(db, req, 'update', 'settings', 'global');
    res.json({ ok: true });
  });

  // ── TMDB metadata import (optional, env-keyed) ───────────────────────
  r.post('/tmdb/import', asyncH(async (req, res) => {
    const { env } = await import('../env.js');
    if (!env.tmdbApiKey && !env.tmdbAccessToken) {
      return res.status(400).json({ error: { code: 'tmdb_not_configured', message: 'TMDB is not configured. Set TMDB_API_KEY or TMDB_ACCESS_TOKEN in .env.' } });
    }
    const kind = req.body?.kind === 'tv' ? 'tv' : 'movie';
    const tmdbId = parseIntSafe(req.body?.tmdb_id, 0);
    if (!tmdbId) throw bad('Provide a TMDB id (number).');
    const headers = env.tmdbAccessToken ? { Authorization: `Bearer ${env.tmdbAccessToken}` } : {};
    const url = `https://api.themoviedb.org/3/${kind}/${tmdbId}?api_key=${env.tmdbApiKey}&language=${env.tmdbLanguage}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) return res.status(502).json({ error: { code: 'tmdb_error', message: 'TMDB request failed. Check the id and your key.' } });
    const meta = await resp.json();
    const name = meta.title || meta.name || 'Imported Title';
    const slug = uniqueSlug(db, 'titles', name);
    const t = nowISO();
    const info = db.prepare(`INSERT INTO titles (kind, slug, name, description, release_year, release_date, runtime, rating, age_rating, trailer_url, video_url, poster_url, backdrop_url, cast_json, director, featured, popularity, views, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, '[]', ?, 0, ?, 0, ?, ?)`)
      .run(
        kind === 'tv' ? 'series' : 'movie', slug, name,
        cleanText(meta.overview, 5000),
        parseInt(String(meta.release_date || meta.first_air_date || '0').slice(0, 4), 10) || null,
        meta.release_date || meta.first_air_date || null,
        meta.runtime || (meta.episode_run_time?.[0] ?? 0) || 0,
        Math.min(10, meta.vote_average || 0),
        'PG-13',
        '', // trailer_url — set via /3/{kind}/{id}/videos if desired
        `https://image.tmdb.org/t/p/w780${meta.poster_path || ''}`,
        `https://image.tmdb.org/t/p/w1280${meta.backdrop_path || ''}`,
        cleanText(meta.created_by?.map((c) => c.name).join(', ') || '', 120),
        Math.min(10000, meta.popularity || 500), t, t
      );
    audit(db, req, 'tmdb_import', 'title', Number(info.lastInsertRowid), name);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), name });
  }));

  return r;
}
