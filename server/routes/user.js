// THE FLASH — user API (requires auth for everything here)
import { Router } from 'express';
import { poster } from '../art.js';
import { bad, notFound, nowISO, cleanText, asyncH } from '../util.js';

function shapeTitleLight(db, row) {
  const genres = db.prepare(`SELECT g.name FROM media_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.title_id = ? LIMIT 3`).all(row.id).map((g) => g.name);
  return {
    id: row.id, kind: row.kind, slug: row.slug, name: row.name, year: row.release_year,
    rating: row.rating, age_rating: row.age_rating, runtime: row.runtime, genres,
    poster: `/media/poster/${row.slug}?kind=${row.kind}&name=${encodeURIComponent(row.name)}`,
    backdrop: `/media/backdrop/${row.slug}?kind=${row.kind}&name=${encodeURIComponent(row.name)}`,
  };
}
function shapeNovelLight(db, row) {
  const chapters = db.prepare(`SELECT COUNT(*) c FROM novel_chapters WHERE novel_id = ?`).get(row.id).c;
  return {
    id: row.id, slug: row.slug, name: row.name, author: row.author, status: row.status,
    year: row.year, rating: row.rating, chapters,
    cover: `/media/cover/${row.slug}?name=${encodeURIComponent(row.name)}`,
  };
}

export function userRouter(db, app) {
  const r = Router();
  r.use(app.requireAuth);

  // ── my list ──────────────────────────────────────────────────────────
  r.get('/favorites', (req, res) => {
    const rows = db.prepare(`SELECT item_type, item_id, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC`).all(req.user.id);
    const titles = [];
    const novels = [];
    for (const f of rows) {
      if (f.item_type === 'title') {
        const t = db.prepare('SELECT * FROM titles WHERE id = ?').get(f.item_id);
        if (t) titles.push({ ...shapeTitleLight(db, t), saved_at: f.created_at });
      } else {
        const n = db.prepare('SELECT * FROM novels WHERE id = ?').get(f.item_id);
        if (n) novels.push({ ...shapeNovelLight(db, n), saved_at: f.created_at });
      }
    }
    res.json({ watchlist: titles, reading_list: novels });
  });

  r.post('/favorites/:type/:id', (req, res) => {
    const type = req.params.type === 'novel' ? 'novel' : 'title';
    const id = parseInt(req.params.id, 10) || 0;
    const exists = type === 'novel'
      ? db.prepare('SELECT id FROM novels WHERE id = ?').get(id)
      : db.prepare('SELECT id FROM titles WHERE id = ?').get(id);
    if (!exists) throw notFound(type === 'novel' ? 'Novel not found.' : 'Title not found.');
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?)').run(req.user.id, type, id, nowISO());
    res.json({ ok: true, in_my_list: true });
  });

  r.delete('/favorites/:type/:id', (req, res) => {
    const type = req.params.type === 'novel' ? 'novel' : 'title';
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?').run(req.user.id, type, parseInt(req.params.id, 10) || 0);
    res.json({ ok: true, in_my_list: false });
  });

  // ── watch progress ───────────────────────────────────────────────────
  r.post('/progress/watch', (req, res) => {
    const title_id = parseInt(req.body?.title_id, 10) || 0;
    const episode_id = parseInt(req.body?.episode_id, 10) || 0;
    const position = Math.max(0, parseFloat(req.body?.position) || 0);
    const duration = Math.max(0, parseFloat(req.body?.duration) || 0);
    const completed = duration > 0 && position / duration > 0.92 ? 1 : 0;
    const title = db.prepare('SELECT id FROM titles WHERE id = ?').get(title_id);
    if (!title) throw bad('Unknown title.');
    if (episode_id) {
      const ep = db.prepare('SELECT id FROM episodes WHERE id = ? AND title_id = ?').get(episode_id, title_id);
      if (!ep) throw bad('Unknown episode for this title.');
    }
    db.prepare(`INSERT INTO watch_history (user_id, title_id, episode_id, position, duration, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, title_id, episode_id)
      DO UPDATE SET position = excluded.position, duration = excluded.duration, completed = excluded.completed, updated_at = excluded.updated_at`)
      .run(req.user.id, title_id, episode_id, position, duration, completed, nowISO(), nowISO());
    res.json({ ok: true });
  });

  r.get('/continue-watching', (req, res) => {
    const rows = db.prepare(`SELECT wh.*, e.number AS ep_number, e.name AS ep_name, s.number AS season_number
      FROM watch_history wh
      LEFT JOIN episodes e ON e.id = wh.episode_id
      LEFT JOIN seasons s ON s.id = e.season_id
      WHERE wh.user_id = ? AND wh.completed = 0
      ORDER BY wh.updated_at DESC LIMIT 14`).all(req.user.id);
    const seen = new Set();
    const items = [];
    for (const wh of rows) {
      if (seen.has(wh.title_id)) continue;
      seen.add(wh.title_id);
      const t = db.prepare('SELECT * FROM titles WHERE id = ?').get(wh.title_id);
      if (!t) continue;
      const pct = wh.duration > 0 ? Math.min(99, Math.round((wh.position / wh.duration) * 100)) : 0;
      items.push({
        ...shapeTitleLight(db, t),
        episode: wh.episode_id ? { number: wh.ep_number, name: wh.ep_name, season: wh.season_number, id: wh.episode_id } : null,
        progress: pct,
        resume_at: wh.position,
      });
    }
    res.json({ items });
  });

  r.get('/history', (req, res) => {
    const rows = db.prepare(`SELECT wh.*, e.number AS ep_number, e.name AS ep_name, s.number AS season_number
      FROM watch_history wh
      LEFT JOIN episodes e ON e.id = wh.episode_id
      LEFT JOIN seasons s ON s.id = e.season_id
      WHERE wh.user_id = ? ORDER BY wh.updated_at DESC LIMIT 100`).all(req.user.id);
    const items = [];
    for (const wh of rows) {
      const t = db.prepare('SELECT * FROM titles WHERE id = ?').get(wh.title_id);
      if (!t) continue;
      items.push({
        ...shapeTitleLight(db, t),
        episode: wh.episode_id ? { number: wh.ep_number, name: wh.ep_name, season: wh.season_number, id: wh.episode_id } : null,
        progress: wh.duration > 0 ? Math.min(100, Math.round((wh.position / wh.duration) * 100)) : 0,
        completed: !!wh.completed,
        watched_at: wh.updated_at,
      });
    }
    res.json({ items });
  });

  r.delete('/history/:titleId', (req, res) => {
    db.prepare('DELETE FROM watch_history WHERE user_id = ? AND title_id = ?').run(req.user.id, parseInt(req.params.titleId, 10) || 0);
    res.json({ ok: true });
  });

  // ── reading progress ─────────────────────────────────────────────────
  r.post('/progress/read', (req, res) => {
    const novel_id = parseInt(req.body?.novel_id, 10) || 0;
    const chapter_number = Math.max(1, parseInt(req.body?.chapter_number, 10) || 1);
    const scroll = Math.min(100, Math.max(0, parseFloat(req.body?.scroll) || 0));
    const novel = db.prepare('SELECT id FROM novels WHERE id = ?').get(novel_id);
    if (!novel) throw bad('Unknown novel.');
    db.prepare(`INSERT INTO reading_progress (user_id, novel_id, chapter_number, scroll, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, novel_id)
      DO UPDATE SET chapter_number = excluded.chapter_number, scroll = excluded.scroll, updated_at = excluded.updated_at`)
      .run(req.user.id, novel_id, chapter_number, scroll, nowISO(), nowISO());
    res.json({ ok: true });
  });

  r.get('/continue-reading', (req, res) => {
    const rows = db.prepare(`SELECT rp.* FROM reading_progress rp WHERE rp.user_id = ? ORDER BY rp.updated_at DESC LIMIT 14`).all(req.user.id);
    const items = [];
    for (const rp of rows) {
      const n = db.prepare('SELECT * FROM novels WHERE id = ?').get(rp.novel_id);
      if (!n) continue;
      const ch = db.prepare('SELECT name FROM novel_chapters WHERE novel_id = ? AND number = ?').get(n.id, rp.chapter_number);
      items.push({
        ...shapeNovelLight(db, n),
        chapter_number: rp.chapter_number,
        chapter_name: ch?.name || `Chapter ${rp.chapter_number}`,
        scroll: rp.scroll,
        progress: Math.round(rp.scroll),
      });
    }
    res.json({ items });
  });

  r.get('/reading-history', (req, res) => {
    const rows = db.prepare(`SELECT rp.* FROM reading_progress rp WHERE rp.user_id = ? ORDER BY rp.updated_at DESC LIMIT 100`).all(req.user.id);
    const items = [];
    for (const rp of rows) {
      const n = db.prepare('SELECT * FROM novels WHERE id = ?').get(rp.novel_id);
      if (!n) continue;
      items.push({ ...shapeNovelLight(db, n), chapter_number: rp.chapter_number, scroll: Math.round(rp.scroll), read_at: rp.updated_at });
    }
    res.json({ items });
  });

  // ── ratings ──────────────────────────────────────────────────────────
  r.post('/rate', (req, res) => {
    const type = req.body?.item_type === 'novel' ? 'novel' : 'title';
    const id = parseInt(req.body?.item_id, 10) || 0;
    const value = parseInt(req.body?.value, 10) || 0;
    if (value < 1 || value > 10) throw bad('Rating must be between 1 and 10.');
    const exists = type === 'novel'
      ? db.prepare('SELECT id FROM novels WHERE id = ?').get(id)
      : db.prepare('SELECT id FROM titles WHERE id = ?').get(id);
    if (!exists) throw notFound('Item not found.');
    db.prepare(`INSERT INTO ratings (user_id, item_type, item_id, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, item_type, item_id)
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(req.user.id, type, id, value, nowISO(), nowISO());

    // recompute aggregate
    if (type === 'title') {
      db.prepare(`UPDATE titles SET rating = (SELECT ROUND(AVG(COALESCE(r.value, titles.rating)), 1) FROM ratings r WHERE r.item_type='title' AND r.item_id = titles.id) WHERE id = ?`).run(id);
    } else {
      db.prepare(`UPDATE novels SET rating = (SELECT ROUND(AVG(COALESCE(r.value, novels.rating)), 1) FROM ratings r WHERE r.item_type='novel' AND r.item_id = novels.id) WHERE id = ?`).run(id);
    }
    res.json({ ok: true, value });
  });

  // ── comments ─────────────────────────────────────────────────────────
  r.get('/comments/:type/:id', (req, res) => {
    const type = req.params.type === 'novel' ? 'novel' : 'title';
    const rows = db.prepare(`SELECT c.id, c.body, c.created_at, u.name AS user_name, u.profile_image
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.item_type = ? AND c.item_id = ? ORDER BY c.created_at DESC LIMIT 50`).all(type, parseInt(req.params.id, 10) || 0);
    res.json({ comments: rows.map((c) => ({ ...c, avatar: c.profile_image || `/media/avatar/u${c.id}` })) });
  });

  r.post('/comments/:type/:id', (req, res) => {
    const type = req.params.type === 'novel' ? 'novel' : 'title';
    const id = parseInt(req.params.id, 10) || 0;
    const body = cleanText(req.body?.body, 1200);
    if (body.length < 2) throw bad('Comment is too short.');
    const exists = type === 'novel'
      ? db.prepare('SELECT id FROM novels WHERE id = ?').get(id)
      : db.prepare('SELECT id FROM titles WHERE id = ?').get(id);
    if (!exists) throw notFound('Item not found.');
    const info = db.prepare('INSERT INTO comments (user_id, item_type, item_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, type, id, body, nowISO());
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  // ── notifications ────────────────────────────────────────────────────
  r.get('/notifications', (req, res) => {
    const rows = db.prepare(`SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 40`).all(req.user.id);
    const unread = db.prepare(`SELECT COUNT(*) c FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`).get(req.user.id).c;
    res.json({ notifications: rows, unread });
  });

  r.post('/notifications/:id/read', (req, res) => {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)`).run(parseInt(req.params.id, 10) || 0, req.user.id);
    res.json({ ok: true });
  });

  r.post('/notifications/read-all', (req, res) => {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL`).run(req.user.id);
    res.json({ ok: true });
  });

  // ── dashboard summary ────────────────────────────────────────────────
  r.get('/summary', (req, res) => {
    const watchCount = db.prepare('SELECT COUNT(DISTINCT title_id) c FROM watch_history WHERE user_id = ?').get(req.user.id).c;
    const readingCount = db.prepare('SELECT COUNT(*) c FROM reading_progress WHERE user_id = ?').get(req.user.id).c;
    const favCount = db.prepare('SELECT COUNT(*) c FROM favorites WHERE user_id = ?').get(req.user.id).c;
    res.json({ watching: watchCount, reading: readingCount, favorites: favCount });
  });

  return r;
}
