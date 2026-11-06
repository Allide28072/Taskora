// THE FLASH — public content API (catalog, home, details, search, genres)
import { Router } from 'express';
import { poster, backdrop, cover, still, avatar, animePoster, animeBackdrop } from '../art.js';
import { titleImages, novelImages, stillPhoto } from '../images.js';
import { realTrailerFor } from '../demo-videos.js';
import { pagination, notFound, cleanText } from '../util.js';

const AGE_ORDER = ['G', 'TV-Y', 'TV-G', 'TV-Y7', 'PG', 'TV-PG', 'PG-13', 'TV-14', 'R', 'NC-17', 'TV-MA'];

function ageOk(user, age) {
  if (!user?.pref_kids) return true;
  return AGE_ORDER.indexOf(String(age || 'PG-13')) <= AGE_ORDER.indexOf('TV-PG');
}

const LIST_FIELDS = `t.id, t.kind, t.slug, t.name, t.release_year, t.rating, t.age_rating, t.runtime,
  t.popularity, t.description, t.poster_url, t.backdrop_url, t.featured`;

function shapeTitle(db, row, withDesc = false) {
  if (!row) return null;
  const genres = db.prepare(`SELECT g.name, g.slug FROM media_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.title_id = ?`).all(row.id);
  const novel = db.prepare(`SELECT n.id, n.slug, n.name FROM title_novels tn JOIN novels n ON n.id = tn.novel_id WHERE tn.title_id = ? LIMIT 1`).get(row.id);
  const out = {
    id: row.id, kind: row.kind, slug: row.slug, name: row.name,
    year: row.release_year, rating: row.rating, age_rating: row.age_rating,
    runtime: row.runtime, popularity: row.popularity, featured: !!row.featured,
    genres, novel: novel || null,
    ...titleImages(row, generatedArt(row)),
  };
  if (withDesc) out.description = row.description;
  return out;
}

/**
 * Generated artwork URLs for a title. Anime titles ask for the cel-shaded
 * anime style; everything else uses the standard poster and backdrop.
 */
function generatedArt(row) {
  const q = `kind=${row.kind}&name=${encodeURIComponent(row.name)}`;
  const style = row.kind === 'anime' ? '&style=anime' : '';
  return {
    poster: `/media/poster/${row.slug}?${q}${style}`,
    backdrop: `/media/backdrop/${row.slug}?${q}${style}`,
  };
}

function shapeNovel(db, row, withDesc = false) {
  if (!row) return null;
  const genres = db.prepare(`SELECT g.name, g.slug FROM novel_genres ng JOIN genres g ON g.id = ng.genre_id WHERE ng.novel_id = ?`).all(row.id);
  const chapters = db.prepare(`SELECT COUNT(*) c FROM novel_chapters WHERE novel_id = ?`).get(row.id).c;
  const title = db.prepare(`SELECT t.slug, t.name FROM title_novels tn JOIN titles t ON t.id = tn.title_id WHERE tn.novel_id = ? LIMIT 1`).get(row.id);
  const out = {
    id: row.id, slug: row.slug, name: row.name, author: row.author, status: row.status,
    year: row.year, rating: row.rating, genres, chapters, featured: !!row.is_featured,
    adaptation: title || null,
    ...novelImages(row, { cover: `/media/cover/${row.slug}?name=${encodeURIComponent(row.name)}` }),
  };
  if (withDesc) out.description = row.description;
  return out;
}

export function publicRouter(db, app) {
  const r = Router();

  // ── home rails ───────────────────────────────────────────────────────
  r.get('/home', (req, res) => {
    const user = req.user;
    const tFilter = (rows) => rows.map((x) => shapeTitle(db, x)).filter((x) => ageOk(user, x.age_rating));

    const featured = db.prepare(`SELECT * FROM titles WHERE featured = 1 ORDER BY popularity DESC LIMIT 5`).all();
    const trending = db.prepare(`SELECT * FROM titles ORDER BY popularity DESC LIMIT 12`).all();
    const latestMovies = db.prepare(`SELECT * FROM titles WHERE kind='movie' ORDER BY release_year DESC, id DESC LIMIT 12`).all();
    const latestSeries = db.prepare(`SELECT * FROM titles WHERE kind='series' ORDER BY release_year DESC, id DESC LIMIT 12`).all();
    const latestAnime = db.prepare(`SELECT * FROM titles WHERE kind='anime' ORDER BY release_year DESC, id DESC LIMIT 12`).all();
    const topMovies = db.prepare(`SELECT * FROM titles WHERE kind='movie' ORDER BY rating DESC LIMIT 12`).all();
    const topSeries = db.prepare(`SELECT * FROM titles WHERE kind='series' ORDER BY rating DESC LIMIT 12`).all();
    const topAnime = db.prepare(`SELECT * FROM titles WHERE kind='anime' ORDER BY rating DESC LIMIT 12`).all();

    const popularNovels = db.prepare(`SELECT * FROM novels ORDER BY popularity DESC LIMIT 12`).all();
    const recentNovels = db.prepare(`SELECT * FROM novels ORDER BY created_at DESC, id DESC LIMIT 12`).all();
    const updatedNovels = db.prepare(`SELECT n.* FROM novels n WHERE EXISTS (SELECT 1 FROM novel_chapters c WHERE c.novel_id = n.id) ORDER BY n.updated_at DESC, n.id DESC LIMIT 12`).all();

    res.json({
      hero: featured.map((x) => ({ ...shapeTitle(db, x, true), tagline: x.description.slice(0, 120) })),
      rails: [
        { key: 'trending', title: 'Trending Now', items: tFilter(trending) },
        { key: 'top_movies', title: 'Trending Movies', items: tFilter(topMovies) },
        { key: 'top_series', title: 'Popular Series', items: tFilter(topSeries) },
        { key: 'top_anime', title: 'Popular Anime', items: tFilter(topAnime) },
        { key: 'latest_movies', title: 'Latest Movies', items: tFilter(latestMovies) },
        { key: 'latest_series', title: 'Latest Series', items: tFilter(latestSeries) },
        { key: 'latest_anime', title: 'Latest Anime', items: tFilter(latestAnime) },
        { key: 'popular_novels', title: 'Popular Novels', items: popularNovels.map((x) => shapeNovel(db, x)) },
        { key: 'recent_novels', title: 'Latest Novels', items: recentNovels.map((x) => shapeNovel(db, x)) },
        { key: 'updated_novels', title: 'Recently Updated Novels', items: updatedNovels.map((x) => shapeNovel(db, x)) },
      ],
    });
  });

  // ── catalog with filters (movies | series | anime) ───────────────────
  r.get('/catalog/:kind', (req, res) => {
    const kind = req.params.kind;
    if (!['movie', 'series', 'anime'].includes(kind)) throw notFound('Unknown catalog.');
    const { page, pageSize, offset } = pagination(req.query, { pageSize: 24 });

    const where = ['t.kind = ?'];
    const params = [kind];
    if (req.query.genre) { where.push(`t.id IN (SELECT title_id FROM media_genres mg JOIN genres g ON g.id = mg.genre_id WHERE g.slug = ?)`); params.push(String(req.query.genre)); }
    if (req.query.year) { where.push('t.release_year = ?'); params.push(parseInt(req.query.year, 10) || 0); }
    if (req.query.rating) { where.push('t.rating >= ?'); params.push(parseFloat(req.query.rating) || 0); }
    if (req.query.q) { where.push('t.name LIKE ?'); params.push(`%${String(req.query.q).slice(0, 60)}%`); }

    const sortMap = {
      popularity: 't.popularity DESC',
      rating: 't.rating DESC',
      newest: 't.release_year DESC, t.id DESC',
      oldest: 't.release_year ASC',
      name: 't.name ASC',
      az: 't.name ASC',
    };
    const order = sortMap[String(req.query.sort)] || sortMap.popularity;

    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) c FROM titles t WHERE ${whereSql}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM titles t WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
    res.json({ items: rows.map((x) => shapeTitle(db, x, true)), total, page, pageSize });
  });

  // ── novels catalog with filters ──────────────────────────────────────
  r.get('/novels', (req, res) => {
    const { page, pageSize, offset } = pagination(req.query, { pageSize: 24 });
    const where = ['1=1'];
    const params = [];
    if (req.query.status && ['ongoing', 'completed', 'hiatus'].includes(req.query.status)) { where.push('n.status = ?'); params.push(req.query.status); }
    if (req.query.genre) { where.push(`n.id IN (SELECT novel_id FROM novel_genres ng JOIN genres g ON g.id = ng.genre_id WHERE g.slug = ?)`); params.push(String(req.query.genre)); }
    if (req.query.q) { where.push('(n.name LIKE ? OR n.author LIKE ?)'); params.push(`%${String(req.query.q).slice(0, 60)}%`, `%${String(req.query.q).slice(0, 60)}%`); }

    const sortMap = {
      popularity: 'n.popularity DESC',
      rating: 'n.rating DESC',
      updated: 'n.updated_at DESC, n.id DESC',
      newest: 'n.year DESC, n.id DESC',
      chapters: '(SELECT COUNT(*) FROM novel_chapters c WHERE c.novel_id = n.id) DESC',
      name: 'n.name ASC',
    };
    const order = sortMap[String(req.query.sort)] || sortMap.popularity;

    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) c FROM novels n WHERE ${whereSql}`).get(...params).c;
    const rows = db.prepare(`SELECT n.* FROM novels n WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
    res.json({ items: rows.map((x) => shapeNovel(db, x, true)), total, page, pageSize });
  });

  // ── title detail ─────────────────────────────────────────────────────
  r.get('/title/:slug', (req, res) => {
    const row = db.prepare('SELECT * FROM titles WHERE slug = ?').get(String(req.params.slug));
    if (!row) throw notFound('This title does not exist.');
    const t = shapeTitle(db, row, true);

    // full details
    t.cast = JSON.parse(row.cast_json || '[]');
    t.director = row.director;
    t.trailer_url = row.trailer_url || null;
    // When the trailer is a stand-in from a released look-alike film, name it so
    // the player can credit the footage instead of implying it is this title's own.
    t.trailer_credit = realTrailerFor(row.slug)?.label || null;
    t.has_video = !!row.video_url;
    t.video_url = row.video_url || null;
    t.release_date = row.release_date;
    t.views = row.views;

    // seasons & episodes for series/anime
    if (row.kind !== 'movie') {
      const seasons = db.prepare('SELECT id, number, name FROM seasons WHERE title_id = ? ORDER BY number').all(row.id);
      t.seasons = seasons.map((s) => ({
        ...s,
        episodes: db.prepare('SELECT id, number, name, description, duration, air_date, video_url FROM episodes WHERE season_id = ? ORDER BY number').all(s.id)
          .map((e) => ({
            ...e,
            still: stillPhoto(`e${s.id}-${e.number}`),
            still_fallback: `/media/still/e${s.id}-${e.number}?name=${encodeURIComponent(row.name)}`,
          })),
      }));
    }

    // user-specific context
    if (req.user) {
      const fav = db.prepare(`SELECT 1 x FROM favorites WHERE user_id = ? AND item_type='title' AND item_id = ?`).get(req.user.id, row.id);
      t.in_my_list = !!fav;
      const myRating = db.prepare(`SELECT value FROM ratings WHERE user_id = ? AND item_type='title' AND item_id = ?`).get(req.user.id, row.id);
      t.my_rating = myRating?.value ?? null;

      if (row.kind === 'movie') {
        const prog = db.prepare(`SELECT position, duration FROM watch_history WHERE user_id = ? AND title_id = ? AND episode_id = 0`).get(req.user.id, row.id);
        t.resume = prog ? { position: prog.position, duration: prog.duration } : null;
      } else {
        const last = db.prepare(`SELECT episode_id, position, duration FROM watch_history WHERE user_id = ? AND title_id = ? AND episode_id != 0 ORDER BY updated_at DESC LIMIT 1`).get(req.user.id, row.id);
        if (last) {
          const ep = db.prepare(`SELECT e.id, e.number, e.season_id, s.number AS season_number FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE e.id = ?`).get(last.episode_id);
          if (ep) t.resume = { episode_id: ep.id, episode_number: ep.number, season_number: ep.season_number, position: last.position, duration: last.duration };
        }
      }

      const comments = db.prepare(`SELECT c.id, c.body, c.created_at, u.name AS user_name, u.profile_image FROM comments c JOIN users u ON u.id = c.user_id WHERE c.item_type='title' AND c.item_id = ? ORDER BY c.created_at DESC LIMIT 20`).all(row.id);
      t.comments = comments.map((c) => ({ ...c, avatar: c.profile_image || `/media/avatar/u${c.user_id}` }));
    }

    // related: same genres, different title
    const related = db.prepare(`SELECT DISTINCT t2.* FROM titles t2
      JOIN media_genres mg2 ON mg2.title_id = t2.id
      WHERE t2.id != ? AND mg2.genre_id IN (SELECT genre_id FROM media_genres WHERE title_id = ?)
      ORDER BY t2.popularity DESC LIMIT 10`).all(row.id, row.id);
    t.related = related.map((x) => shapeTitle(db, x));

    db.prepare('UPDATE titles SET views = views + 1 WHERE id = ?').run(row.id);
    res.json({ title: t });
  });

  // ── episode detail (streams video url if set) ────────────────────────
  r.get('/episode/:id', app.requireAuth, (req, res) => {
    const ep = db.prepare(`SELECT e.*, s.number AS season_number, t.name AS title_name, t.kind, t.slug AS title_slug
      FROM episodes e JOIN seasons s ON s.id = e.season_id JOIN titles t ON t.id = e.title_id WHERE e.id = ?`).get(parseInt(req.params.id, 10) || 0);
    if (!ep) throw notFound('This episode does not exist.');
    const prog = db.prepare(`SELECT position, duration FROM watch_history WHERE user_id = ? AND title_id = ? AND episode_id = ?`).get(req.user.id, ep.title_id, ep.id);
    res.json({
      episode: {
        id: ep.id, number: ep.number, season_number: ep.season_number, name: ep.name,
        description: ep.description, duration: ep.duration, air_date: ep.air_date,
        video_url: ep.video_url || null, has_video: !!ep.video_url,
        title: { id: ep.title_id, slug: ep.title_slug, name: ep.title_name, kind: ep.kind },
        still: `/media/still/e${ep.season_id}-${ep.number}?name=${encodeURIComponent(ep.title_name)}`,
        resume: prog ? { position: prog.position, duration: prog.duration } : null,
      },
    });
  });

  // ── novel detail ─────────────────────────────────────────────────────
  r.get('/novel/:slug', (req, res) => {
    const row = db.prepare('SELECT * FROM novels WHERE slug = ?').get(String(req.params.slug));
    if (!row) throw notFound('This novel does not exist.');
    const n = shapeNovel(db, row, true);
    n.views = row.views;
    n.updated_at = row.updated_at;

    const chapters = db.prepare('SELECT id, number, name, words FROM novel_chapters WHERE novel_id = ? ORDER BY number').all(row.id);
    n.chapter_list = chapters;
    n.total_words = chapters.reduce((a, c) => a + (c.words || 0), 0);

    if (req.user) {
      const fav = db.prepare(`SELECT 1 x FROM favorites WHERE user_id = ? AND item_type='novel' AND item_id = ?`).get(req.user.id, row.id);
      n.in_my_list = !!fav;
      const myRating = db.prepare(`SELECT value FROM ratings WHERE user_id = ? AND item_type='novel' AND item_id = ?`).get(req.user.id, row.id);
      n.my_rating = myRating?.value ?? null;
      const prog = db.prepare(`SELECT chapter_number, scroll FROM reading_progress WHERE user_id = ? AND novel_id = ?`).get(req.user.id, row.id);
      if (prog) {
        const ch = db.prepare('SELECT name FROM novel_chapters WHERE novel_id = ? AND number = ?').get(row.id, prog.chapter_number);
        n.continue_reading = { chapter_number: prog.chapter_number, chapter_name: ch?.name || `Chapter ${prog.chapter_number}`, scroll: prog.scroll };
      }
      const comments = db.prepare(`SELECT c.id, c.body, c.created_at, u.name AS user_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.item_type='novel' AND c.item_id = ? ORDER BY c.created_at DESC LIMIT 20`).all(row.id);
      n.comments = comments;
    }

    db.prepare('UPDATE novels SET views = views + 1 WHERE id = ?').run(row.id);
    res.json({ novel: n });
  });

  // ── chapter read ─────────────────────────────────────────────────────
  r.get('/novel/:slug/chapter/:num', app.requireAuth, (req, res) => {
    const novel = db.prepare('SELECT * FROM novels WHERE slug = ?').get(String(req.params.slug));
    if (!novel) throw notFound('This novel does not exist.');
    const num = parseInt(req.params.num, 10) || 0;
    const ch = db.prepare('SELECT id, number, name, content, words FROM novel_chapters WHERE novel_id = ? AND number = ?').get(novel.id, num);
    if (!ch) throw notFound('This chapter does not exist.');
    const total = db.prepare('SELECT COUNT(*) c FROM novel_chapters WHERE novel_id = ?').get(novel.id).c;
    res.json({
      chapter: {
        ...ch, novel: { id: novel.id, slug: novel.slug, name: novel.name, author: novel.author },
        has_prev: num > 1, has_next: num < total,
      },
    });
  });

  // ── global search ────────────────────────────────────────────────────
  r.get('/search', (req, res) => {
    const q = cleanText(req.query.q, 60);
    if (!q) return res.json({ query: '', movies: [], series: [], anime: [], novels: [], authors: [], genres: [] });
    const like = `%${q}%`;

    const titles = db.prepare(`SELECT * FROM titles WHERE name LIKE ? OR description LIKE ? ORDER BY popularity DESC LIMIT 18`).all(like, like);
    const novels = db.prepare(`SELECT * FROM novels WHERE name LIKE ? OR author LIKE ? OR description LIKE ? ORDER BY popularity DESC LIMIT 18`).all(like, like, like);
    const authors = db.prepare(`SELECT DISTINCT author FROM novels WHERE author LIKE ? LIMIT 8`).all(like);
    const genres = db.prepare(`SELECT name, slug, kind FROM genres WHERE name LIKE ? LIMIT 8`).all(like);

    res.json({
      query: q,
      movies: titles.filter((x) => x.kind === 'movie').map((x) => shapeTitle(db, x)),
      series: titles.filter((x) => x.kind === 'series').map((x) => shapeTitle(db, x)),
      anime: titles.filter((x) => x.kind === 'anime').map((x) => shapeTitle(db, x)),
      novels: novels.map((x) => shapeNovel(db, x)),
      authors: authors.map((x) => x.author),
      genres: genres.map((x) => ({ name: x.name, slug: x.slug, kind: x.kind })),
    });
  });

  // ── genres list ──────────────────────────────────────────────────────
  r.get('/genres', (req, res) => {
    const rows = db.prepare('SELECT id, name, slug, kind FROM genres ORDER BY name').all();
    res.json({ genres: rows });
  });

  return r;
}

export function mediaRouter(db) {
  const r = Router();
  const sendSvg = (res, svg) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.send(svg);
  };

  r.get('/poster/:slug', (req, res) => sendSvg(res, req.query.style === 'anime'
    ? animePoster(req.params.slug + (req.query.kind || ''))
    : poster(req.params.slug + (req.query.kind || ''), String(req.query.name || ''))));
  r.get('/backdrop/:slug', (req, res) => sendSvg(res, req.query.style === 'anime'
    ? animeBackdrop(req.params.slug + (req.query.kind || ''))
    : backdrop(req.params.slug + (req.query.kind || ''), String(req.query.name || ''))));
  r.get('/cover/:slug', (req, res) => sendSvg(res, cover(req.params.slug, String(req.query.name || ''))));
  r.get('/still/:seed', (req, res) => sendSvg(res, still(req.params.seed + String(req.query.name || ''))));
  r.get('/avatar/:seed', (req, res) => sendSvg(res, avatar(req.params.seed, String(req.query.name || ''))));
  return r;
}
