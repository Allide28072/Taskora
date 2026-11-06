// THE FLASH — seed system. 100% original fictional catalog (no third-party IP).
import { hashPassword, nowISO, slugify } from './util.js';
import { env } from './env.js';
import { posterPhoto, backdropPhoto, coverPhoto, photosEnabled } from './images.js';
import { trailerFor, streamFor, realTrailerFor, isDemoTrailer, UNPLAYABLE_HOSTS } from './demo-videos.js';

/* ── prose generation for novel chapters ─────────────────────────────── */

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJ = ['cold', 'silent', 'golden', 'hollow', 'electric', 'distant', 'restless', 'amber', 'crooked', 'sleepless'];
const NOUN = ['dawn', 'storm', 'engine', 'lantern', 'river', 'signal', 'shadow', 'mirror', 'horizon', 'archive'];

function paragraph(rand) {
  const openers = [
    'The city exhaled its last light an hour ago',
    'Rain wrote long silver sentences across the window',
    'Somewhere below, a tram sighed and started moving',
    'The kettle muttered like a small argument',
    'Morning arrived with the smell of wet iron',
    'The corridor hummed, thinking its electric thoughts',
    'Snow fell upward in the memory, which was how she knew it was a memory',
    'The market sold everything except the thing she needed',
  ];
  const middles = [
    'Every clock in the house disagreed, and for once she trusted the wrongest one',
    'He counted footsteps the way other people counted sheep',
    'The map was older than the road it described',
    'Grief, she had learned, kept office hours',
    'The letter had traveled further than she ever had',
    'Old machines forgive; old promises do not',
    'There were ninety-nine ways to cross the river and she intended to invent the hundredth',
    'The dog watched the door as if it remembered a different family',
  ];
  const closers = [
    'By then the light had changed its mind twice.',
    'She filed the feeling under "later," which was a very full drawer.',
    'It was, everyone agreed afterward, the wrong night for a miracle.',
    'And the city, indifferent, kept its appointment with morning.',
    'He decided, quietly, to be brave at a more convenient time.',
    'Somewhere a bell rang once, out of courtesy.',
    'The kettle agreed, and began again.',
    'She smiled the way you smile at a photograph.',
  ];
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  return `${pick(openers)}, and ${pick(middles).toLowerCase()}. ${pick(closers)}`;
}

function chapterProse(novelName, chapterNumber, seedWord) {
  const rand = mulberry(chapterNumber * 7919 + seedWord.length * 131 + novelName.length);
  const paras = 5 + Math.floor(rand() * 3);
  const body = [];
  body.push(`${novelName} — Chapter ${chapterNumber}`);
  body.push('');
  for (let p = 0; p < paras; p++) body.push(paragraph(rand));
  body.push('');
  body.push(paragraph(rand));
  return body.join('\n\n');
}

/* ── catalog definitions (all original) ──────────────────────────────── */

const GENRES = [
  ['Action', 'all'], ['Adventure', 'all'], ['Fantasy', 'all'], ['Sci-Fi', 'all'],
  ['Mystery', 'all'], ['Drama', 'all'], ['Romance', 'all'], ['Thriller', 'all'],
  ['Comedy', 'all'], ['Horror', 'all'], ['Supernatural', 'all'], ['Slice of Life', 'novel'],
];

const CATEGORIES = [
  ['Trending Now', 'film'], ['New Releases', 'film'], ['Award Winners', 'film'],
  ['Binge-worthy', 'film'], ['Editor Picks', 'all'], ['Critically Acclaimed', 'all'],
];

const TITLES = [
  // movies
  { name: 'Ember Protocol', kind: 'movie', year: 2024, runtime: 118, rating: 8.4, age: 'PG-13', featured: 1, popularity: 980, genres: ['Action', 'Sci-Fi', 'Thriller'], cast: ['Ada Quinn', 'Marcus Vale', 'Iris Solano'], director: 'Nadia Kray', overview: 'A courier who can move through memory inherits a package that remembers everyone it has ever touched. To deliver it, she must out-run the agency that taught her the route.' },
  { name: 'The Salt Cathedral', kind: 'movie', year: 2023, runtime: 134, rating: 7.9, age: 'PG-13', featured: 0, popularity: 870, genres: ['Drama', 'Mystery'], cast: ['Tomas Reyes', 'June Okafor'], director: 'Elias Wren', overview: 'Two divers discover a church sunk beneath a salt lake, perfectly preserved — and freshly swept. A slow-burn mystery about what the water keeps.' },
  { name: 'Voltage Saint', kind: 'movie', year: 2025, runtime: 106, rating: 8.1, age: 'R', featured: 0, popularity: 940, genres: ['Action', 'Supernatural'], cast: ['Reva Crowne', 'Silas Marsh'], director: 'Nadia Kray', overview: 'In a city where lightning is currency, a debt-collector with a storm in her chest takes one last job from the boy who owes her everything.' },
  { name: 'Glass Orchard', kind: 'movie', year: 2022, runtime: 97, rating: 7.2, age: 'PG', featured: 0, popularity: 610, genres: ['Drama', 'Fantasy'], cast: ['Mei Tanaka', 'Arthur Bell'], director: 'Sofia Lindqvist', overview: 'A fruit farmer grows apples of glass. When one shatters, the town begins to dream in unison. A fable about inheritance and repair.' },
  { name: 'Nine Kinds of Quiet', kind: 'movie', year: 2024, runtime: 112, rating: 8.6, age: 'PG-13', featured: 0, popularity: 900, genres: ['Drama', 'Mystery'], cast: ['Hana Ito', 'Dele Ade'], director: 'Elias Wren', overview: ' A sound engineer catalogues the silences of her hometown and finds one silence that answers back.' },
  { name: 'Chrome Lullaby', kind: 'movie', year: 2023, runtime: 121, rating: 7.6, age: 'R', featured: 0, popularity: 760, genres: ['Sci-Fi', 'Thriller'], cast: ['Cass Varga', 'Odile Frank'], director: 'Ivo Petrov', overview: 'A retired assassin babysits an android child for one night in a city that outlaws both. What could go wrong takes all night to say.' },
  { name: 'Paper Compass', kind: 'movie', year: 2025, runtime: 103, rating: 7.8, age: 'PG', featured: 0, popularity: 820, genres: ['Adventure', 'Fantasy'], cast: ['Lila Sorrel', 'Ivan Moss'], director: 'Sofia Lindqvist', overview: 'A cartographer inherits a map that only works when folded wrong. The wrong folds lead somewhere honest.' },
  { name: 'The Fourth Wall of June', kind: 'movie', year: 2022, runtime: 95, rating: 6.9, age: 'PG-13', featured: 0, popularity: 500, genres: ['Romance', 'Comedy'], cast: ['Nora Finch', 'Bram Oduya'], director: 'June Castellan', overview: 'Two set-builders for a failing theater fall in love during the construction of a door that must never be opened on stage.' },
  { name: 'Hollow Tide', kind: 'movie', year: 2024, runtime: 127, rating: 8.2, age: 'R', featured: 1, popularity: 910, genres: ['Horror', 'Mystery'], cast: ['Marisol Vega', 'Peter Lund'], director: 'Ivo Petrov', overview: 'A coastal village pays its tide in names. The new teacher keeps hers, which makes her either the hero or the invoice.' },
  { name: 'Static Bloom', kind: 'movie', year: 2025, runtime: 110, rating: 7.5, age: 'PG-13', featured: 0, popularity: 790, genres: ['Sci-Fi', 'Romance'], cast: ['Yara Chen', 'Emil Duarte'], director: 'Nadia Kray', overview: 'Radio astronomers decode a love letter older than the galaxy. Replying might redirect a comet.' },

  // series
  { name: 'Lantern District', kind: 'series', year: 2023, runtime: 52, rating: 8.7, age: 'TV-MA', featured: 1, popularity: 990, genres: ['Mystery', 'Drama', 'Thriller'], cast: ['Gemma Voss', 'Theo Marsh', 'Ines Halloran'], director: 'Elias Wren', overview: 'Every lamp in the district is paid for by a different crime. A new detective starts turning them off.' },
  { name: 'Gravity Ward', kind: 'series', year: 2024, runtime: 48, rating: 8.3, age: 'TV-14', featured: 0, popularity: 930, genres: ['Sci-Fi', 'Drama'], cast: ['Adaeze Nwosu', 'Kai Bergstrom'], director: 'Nadia Kray', overview: 'A hospital for broken astronauts treats patients who miss the weight of the world. Literally.' },
  { name: 'The Long Analog', kind: 'series', year: 2022, runtime: 55, rating: 8.0, age: 'TV-MA', featured: 0, popularity: 720, genres: ['Drama'], cast: ['Ruth Calder', 'Sam Oyelaran'], director: 'June Castellan', overview: 'In 1977, the last radio DJ of a dying station keeps broadcasting to a town that may have already left.' },
  { name: 'Marrow & Myth', kind: 'series', year: 2025, runtime: 50, rating: 8.5, age: 'TV-MA', featured: 0, popularity: 950, genres: ['Fantasy', 'Adventure'], cast: ['Orsolya Kiss', 'Dara Quill'], director: 'Sofia Lindqvist', overview: 'A bone-reader and a runaway god travel a continent that rewrites its own history every spring.' },
  { name: 'Comet Club', kind: 'series', year: 2023, runtime: 32, rating: 7.7, age: 'TV-14', featured: 0, popularity: 680, genres: ['Comedy', 'Romance'], cast: ['Pip Sanders', 'Marta Ruiz'], director: 'June Castellan', overview: 'Five night-shift friends run a failing astronomy club out of a laundromat. The universe keeps RSVPing.' },

  // anime
  { name: 'Skybound Signal', kind: 'anime', year: 2024, runtime: 24, rating: 8.8, age: 'TV-14', featured: 1, popularity: 995, genres: ['Adventure', 'Sci-Fi', 'Fantasy'], cast: ['Aoi Mizuhara', 'Ren Takahashi'], director: 'Hiroko Sato', overview: 'A sky-fisher girl catches a message in a bottle that fell upward. The reply requires a ship made of borrowed weather.' },
  { name: 'Kitsune Drive', kind: 'anime', year: 2023, runtime: 23, rating: 8.4, age: 'TV-14', featured: 0, popularity: 920, genres: ['Supernatural', 'Action'], cast: ['Suzu Amamiya', 'Kaito Renjiro'], director: 'Hiroko Sato', overview: 'A courier fox-spirit delivers parcels between the living and the dead. Tipping is mandatory.' },
  { name: 'Orbital Teacup', kind: 'anime', year: 2025, runtime: 22, rating: 8.0, age: 'TV-PG', featured: 0, popularity: 840, genres: ['Slice of Life', 'Sci-Fi', 'Comedy'], cast: ['Mio Hoshino', 'Gen Aoki'], director: 'Yuki Tanabe', overview: 'The calmest anime ever made about a tea room at the end of the space elevator. Episodes contain at least one perfect sunset.' },
  { name: 'Blade of the Nine Koi', kind: 'anime', year: 2022, runtime: 24, rating: 8.6, age: 'TV-MA', featured: 0, popularity: 900, genres: ['Action', 'Fantasy'], cast: ['Haru Shinkai', 'Ayame Kurosawa'], director: 'Yuki Tanabe', overview: 'Nine sword schools, one stolen river, and a fisherman\'s daughter who studies all nine in secret.' },
  { name: 'Neon Shrine', kind: 'anime', year: 2024, runtime: 24, rating: 8.2, age: 'TV-14', featured: 0, popularity: 870, genres: ['Supernatural', 'Mystery'], cast: ['Rin Amagase', 'Sota Fuyuki'], director: 'Hiroko Sato', overview: 'The shrine\'s donation box pays out change from the future. A broke student keeps receiving coins dated tomorrow.' },
];

const NOVELS = [
  { name: 'Ember Protocol: The Memory Routes', author: 'Vera Ashwood', status: 'completed', year: 2023, rating: 8.5, featured: 1, popularity: 970, genres: ['Sci-Fi', 'Thriller', 'Adventure'], overview: 'The novelization of the film Ember Protocol — expanded with the routes they never filmed. Every courier has a reason; Ada Quinn has a map of hers.' },
  { name: 'Nine Kinds of Quiet: The Book of Silences', author: 'Ilya Marchetti', status: 'ongoing', year: 2024, rating: 8.9, featured: 1, popularity: 960, genres: ['Mystery', 'Drama', 'Supernatural'], overview: 'A sound engineer inherits her grandmother\'s archive of recorded silences. The eleventh silence is listening back.' },
  { name: 'Marrow & Myth: The Spring Codex', author: 'Orsolya Kiss', status: 'ongoing', year: 2025, rating: 8.7, featured: 0, popularity: 940, genres: ['Fantasy', 'Adventure', 'Romance'], overview: 'The continent of Vess rewrites itself each spring. This year, the bone-reader is the one holding the pen.' },
  { name: 'Skybound Signal: Weather We Borrow', author: 'Aoi Mizuhara', status: 'ongoing', year: 2024, rating: 8.8, featured: 0, popularity: 930, genres: ['Adventure', 'Sci-Fi', 'Fantasy'], overview: 'The light novel behind the anime. Nami builds a ship from borrowed weather to answer a message that fell the wrong way.' },
  { name: 'The Salt Cathedral: Below, Still', author: 'Elias Wren', status: 'completed', year: 2023, rating: 8.1, featured: 0, popularity: 780, genres: ['Mystery', 'Drama', 'Horror'], overview: 'The full account of the sunk church and the sweeper who keeps it. Some chapters are written in tide.' },
  { name: 'Kitsune Drive: Tipping Mandatory', author: 'Suzu Amamiya', status: 'ongoing', year: 2023, rating: 8.3, featured: 0, popularity: 850, genres: ['Supernatural', 'Comedy', 'Action'], overview: 'Parcels, ghosts, and exact change. The fox courier logs of a city with two post offices.' },
  { name: 'Hollow Tide: The Name Invoice', author: 'Marisol Vega', status: 'hiatus', year: 2024, rating: 7.9, featured: 0, popularity: 700, genres: ['Horror', 'Mystery'], overview: 'A village pays its tide in names. The teacher who kept hers writes down what the water does with the rest.' },
  { name: 'Paper Compass: The Hundredth Fold', author: 'Lila Sorrel', status: 'completed', year: 2025, rating: 8.0, featured: 0, popularity: 810, genres: ['Adventure', 'Fantasy'], overview: 'A map that only works folded wrong. The cartographer\'s granddaughter finishes the last route.' },
  { name: 'Voltage Saint: Storm Ledger', author: 'Reva Crowne', status: 'ongoing', year: 2025, rating: 8.2, featured: 0, popularity: 880, genres: ['Action', 'Fantasy', 'Romance'], overview: 'In a city where lightning is currency, the ledger keeps its own interest. A debt-collector writes hers down before it collects her.' },
  { name: 'Orbital Teacup: Steep Gravity', author: 'Mio Hoshino', status: 'ongoing', year: 2025, rating: 7.8, featured: 0, popularity: 760, genres: ['Slice of Life', 'Sci-Fi', 'Comedy'], overview: 'Essays and episodes from the tea room at the end of the space elevator. Contains at least one perfect sunset per chapter.' },
];

/* ── chapter naming ──────────────────────────────────────────────────── */
const CHAPTER_TITLES = [
  'The Wrong Fold', 'Salt and Static', 'What the River Kept', 'Ninety-Nine Doors',
  'The Eleventh Silence', 'Borrowed Weather', 'A Debt of Light', 'The Sweeper\'s Key',
  'Tide, With Names', 'The Long Analog', 'Glass, Grown', 'The Courier\'s Map',
  'Change From Tomorrow', 'Lanterns, Paid For', 'The Hundredth Way', 'Snow, Upward',
  'Office Hours of Grief', 'The Kettle Agrees', 'Coin Dated Tomorrow', 'The Last Route',
];

export async function seed(db) {
  const t = nowISO();

  // genres & categories
  const insGenre = db.prepare('INSERT OR IGNORE INTO genres (name, slug, kind) VALUES (?, ?, ?)');
  for (const [name, kind] of GENRES) insGenre.run(name, slugify(name), kind);
  const insCat = db.prepare('INSERT OR IGNORE INTO categories (name, slug, kind) VALUES (?, ?, ?)');
  for (const [name, kind] of CATEGORIES) insCat.run(name, slugify(name), kind);

  const genreIds = {};
  for (const row of db.prepare('SELECT id, name FROM genres').all()) genreIds[row.name] = row.id;

  // titles
  const insTitle = db.prepare(`INSERT INTO titles
    (kind, slug, name, description, release_year, release_date, runtime, rating, age_rating, trailer_url, video_url, poster_url, backdrop_url, cast_json, director, featured, popularity, views, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const linkGenre = db.prepare('INSERT OR IGNORE INTO media_genres (title_id, genre_id) VALUES (?, ?)');

  const seasonPlan = {};
  for (const T of TITLES) {
    const slug = slugify(T.name);
    const info = db.prepare('SELECT id FROM titles WHERE slug = ?').get(slug);
    if (info) { seasonPlan[slug] = info.id; continue; }
    // Anime keeps the generated cel-shaded key art; live action prefers photography.
    const photos = photosEnabled() && T.kind !== 'anime';
    const res = insTitle.run(
      T.kind, slug, T.name, T.overview, T.year,
      `${T.year}-0${1 + (T.name.length % 9)}-15`, T.runtime, T.rating, T.age,
      realTrailerFor(slug)?.url || trailerFor(T.name.length),
      T.kind === 'movie' ? streamFor(T.name.length) : '',
      photos ? posterPhoto(slug) : '', photos ? backdropPhoto(slug) : '',
      JSON.stringify(T.cast || []), T.director || '',
      T.featured ? 1 : 0, T.popularity, Math.floor(T.popularity * (3 + (T.name.length % 7))),
      t, t
    );
    const id = Number(res.lastInsertRowid);
    seasonPlan[slug] = id;
    for (const g of T.genres) if (genreIds[g]) linkGenre.run(id, genreIds[g]);
  }

  // seasons + episodes for series & anime
  const insSeason = db.prepare('INSERT INTO seasons (title_id, number, name) VALUES (?, ?, ?)');
  const insEpisode = db.prepare(`INSERT INTO episodes (title_id, season_id, number, name, description, duration, video_url, still_url, air_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [slug, titleId] of Object.entries(seasonPlan)) {
    const row = db.prepare('SELECT kind FROM titles WHERE id = ?').get(titleId);
    if (!row || row.kind === 'movie') continue;
    const existing = db.prepare('SELECT COUNT(*) c FROM seasons WHERE title_id = ?').get(titleId).c;
    if (existing) continue;
    const seasonCount = 1 + (titleId % 3);
    for (let s = 1; s <= seasonCount; s++) {
      const sid = Number(insSeason.run(titleId, s, `Season ${s}`).lastInsertRowid);
      const epCount = row.kind === 'anime' ? 12 : 8;
      for (let e = 1; e <= epCount; e++) {
        insEpisode.run(
          titleId, sid, e,
          `Episode ${e}`,
          'The story folds forward; someone chooses, and the choice chooses back.',
          row.runtime || 45, streamFor(sid + e), '', `${2022 + (titleId % 4)}-0${1 + (s % 9)}-1${e % 10}`,
          t
        );
      }
    }
  }

  // novels
  const insNovel = db.prepare(`INSERT INTO novels
    (slug, name, author, description, cover_url, status, rating, is_featured, popularity, views, year, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insChapter = db.prepare(`INSERT INTO novel_chapters (novel_id, number, name, content, words, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const linkNovelGenre = db.prepare('INSERT OR IGNORE INTO novel_genres (novel_id, genre_id) VALUES (?, ?)');
  const novelPlan = {};

  for (const N of NOVELS) {
    const slug = slugify(N.name);
    const existing = db.prepare('SELECT id FROM novels WHERE slug = ?').get(slug);
    if (existing) { novelPlan[slug] = existing.id; continue; }
    const res = insNovel.run(
      slug, N.name, N.author, N.overview, photosEnabled() ? coverPhoto(slug) : '', N.status, N.rating,
      N.featured ? 1 : 0, N.popularity, N.popularity * (5 + (N.author.length % 5)), N.year, t, t
    );
    const id = Number(res.lastInsertRowid);
    novelPlan[slug] = id;
    for (const g of N.genres) if (genreIds[g]) linkNovelGenre.run(id, genreIds[g]);

    const chapterCount = N.status === 'completed' ? 16 : 10 + (id % 7);
    for (let c = 1; c <= chapterCount; c++) {
      const name = CHAPTER_TITLES[(c - 1 + id) % CHAPTER_TITLES.length];
      const content = chapterProse(N.name, c, N.author);
      insChapter.run(id, c, `Chapter ${c}: ${name}`, content, content.split(/\s+/).length, t, t);
    }
  }

  // movie ↔ novel connections (the FLASH identity)
  const link = db.prepare('INSERT OR IGNORE INTO title_novels (title_id, novel_id, relation) VALUES (?, ?, ?)');
  const pairs = [
    ['ember-protocol', 'ember-protocol-the-memory-routes', 'novelization'],
    ['nine-kinds-of-quiet', 'nine-kinds-of-quiet-the-book-of-silences', 'novelization'],
    ['marrow-myth', 'marrow-myth-the-spring-codex', 'novelization'],
    ['skybound-signal', 'skybound-signal-weather-we-borrow', 'novelization'],
    ['the-salt-cathedral', 'the-salt-cathedral-below-still', 'novelization'],
    ['kitsune-drive', 'kitsune-drive-tipping-mandatory', 'novelization'],
    ['hollow-tide', 'hollow-tide-the-name-invoice', 'novelization'],
    ['paper-compass', 'paper-compass-the-hundredth-fold', 'novelization'],
    ['voltage-saint', 'voltage-saint-storm-ledger', 'novelization'],
    ['orbital-teacup', 'orbital-teacup-steep-gravity', 'novelization'],
  ];
  for (const [tSlug, nSlug, rel] of pairs) {
    const tid = seasonPlan[tSlug] ?? db.prepare('SELECT id FROM titles WHERE slug = ?').get(tSlug)?.id;
    const nid = novelPlan[nSlug] ?? db.prepare('SELECT id FROM novels WHERE slug = ?').get(nSlug)?.id;
    if (tid && nid) link.run(tid, nid, rel);
  }

  // ── artwork and playback backfill (idempotent) ───────────────────────
  // Rows created before the image layer existed still need their artwork, and
  // anime rows previously given photography are cleared so the cel-shaded key
  // art takes over. Administrators can override any stored URL by hand.
  if (photosEnabled()) {
    const cleared = db.prepare(`UPDATE titles SET poster_url = '', backdrop_url = ''
      WHERE kind = 'anime' AND (poster_url LIKE '%picsum.photos%' OR backdrop_url LIKE '%picsum.photos%')`).run().changes;

    const updTitle = db.prepare(`UPDATE titles SET poster_url = ?, backdrop_url = ? WHERE id = ? AND kind <> 'anime'`);
    const needTitle = db.prepare(`SELECT id, slug FROM titles WHERE kind <> 'anime' AND (COALESCE(poster_url,'') = '' OR COALESCE(backdrop_url,'') = '')`).all();
    for (const row of needTitle) updTitle.run(posterPhoto(row.slug), backdropPhoto(row.slug), row.id);

    const updNovel = db.prepare('UPDATE novels SET cover_url = ? WHERE id = ?');
    const needNovel = db.prepare(`SELECT id, slug FROM novels WHERE COALESCE(cover_url,'') = ''`).all();
    for (const row of needNovel) updNovel.run(coverPhoto(row.slug), row.id);

    if (needTitle.length || needNovel.length || cleared) {
      console.log(`[seed] artwork: ${needTitle.length} titles, ${needNovel.length} novels, ${cleared} anime switched to cel-shaded key art`);
    }
  }

  // Playable media backfill — openly licensed demo files stand in for licensed
  // content, so every trailer and every episode can actually play.
  {
    // Retire any stored source that cannot decode in a browser, so a dead
    // placeholder never leaves a player stuck on a format error.
    let retired = 0;
    for (const host of UNPLAYABLE_HOSTS) {
      const like = `%${host}%`;
      for (const t of db.prepare(`SELECT id, kind FROM titles WHERE trailer_url LIKE ? OR video_url LIKE ?`).all(like, like)) {
        db.prepare(`UPDATE titles SET trailer_url = CASE WHEN trailer_url LIKE ? THEN ? ELSE trailer_url END,
          video_url = CASE WHEN video_url LIKE ? THEN ? ELSE video_url END WHERE id = ?`)
          .run(like, trailerFor(t.id + 1), like, t.kind === 'movie' ? streamFor(t.id + 1) : '', t.id);
        retired++;
      }
      const eps = db.prepare(`SELECT id FROM episodes WHERE video_url LIKE ?`).all(like);
      for (const e of eps) db.prepare('UPDATE episodes SET video_url = ? WHERE id = ?').run(streamFor(e.id), e.id);
      retired += eps.length;
    }
    if (retired) console.log(`[seed] replaced ${retired} unplayable demo sources`);

    // Real trailers — the catalogue is entirely fictional, so each title is
    // paired with the official trailer of a released look-alike (see
    // REAL_TRAILERS in demo-videos.js). Only the canned demo clip is replaced:
    // a URL an administrator pasted in by hand is left exactly as it is.
    let upgraded = 0;
    for (const row of db.prepare(`SELECT id, slug, trailer_url FROM titles`).all()) {
      const real = realTrailerFor(row.slug);
      if (!real) continue;
      const current = String(row.trailer_url || '');
      if (current && !isDemoTrailer(current)) continue;
      if (current !== real.url) {
        db.prepare('UPDATE titles SET trailer_url = ? WHERE id = ?').run(real.url, row.id);
        upgraded++;
      }
    }
    if (upgraded) console.log(`[seed] paired ${upgraded} titles with a real trailer`);

    const updTrailer = db.prepare(`UPDATE titles SET trailer_url = ? WHERE id = ? AND COALESCE(trailer_url,'') = ''`);
    let trailers = 0;
    for (const row of db.prepare(`SELECT id, kind, name FROM titles WHERE COALESCE(trailer_url,'') = ''`).all()) {
      updTrailer.run(trailerFor(row.id + row.name.length), row.id);
      trailers++;
    }

    const updMovie = db.prepare(`UPDATE titles SET video_url = ? WHERE id = ? AND COALESCE(video_url,'') = ''`);
    let movies = 0;
    for (const row of db.prepare(`SELECT id, name FROM titles WHERE kind = 'movie' AND COALESCE(video_url,'') = ''`).all()) {
      updMovie.run(streamFor(row.id + row.name.length), row.id);
      movies++;
    }

    const updEpisode = db.prepare(`UPDATE episodes SET video_url = ? WHERE id = ? AND COALESCE(video_url,'') = ''`);
    let episodes = 0;
    for (const row of db.prepare(`SELECT id FROM episodes WHERE COALESCE(video_url,'') = ''`).all()) {
      updEpisode.run(streamFor(row.id), row.id);
      episodes++;
    }

    if (trailers || movies || episodes) {
      console.log(`[seed] playable media attached: ${trailers} trailers, ${movies} movies, ${episodes} episodes`);
    }
  }

  // admin bootstrap — hashed, never displayed
  const adminExisting = db.prepare('SELECT id FROM users WHERE email = ?').get(env.adminEmail.toLowerCase());
  if (!adminExisting) {
    const hash = await hashPassword(env.adminPassword);
    // The bootstrap administrator is provisioned by the operator from the
    // environment, so its address is trusted by construction — it is marked
    // confirmed rather than sending a link nobody can receive yet.
    db.prepare(`INSERT INTO users (name, email, password_hash, role, date_of_birth, profile_image, status, email_verified, email_verified_at, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', '1990-01-01', NULL, 'active', 1, ?, ?, ?)`).run(env.adminName, env.adminEmail.toLowerCase(), hash, t, t, t);
    console.log(`[seed] admin account ready: ${env.adminEmail.toLowerCase()} (password from env, hashed)`);
  } else {
    console.log('[seed] admin account already present');
  }

  // welcome notification for fresh installs
  db.prepare(`INSERT INTO notifications (user_id, type, message, link, is_read, created_at)
    VALUES (NULL, 'system', 'Welcome to THE FLASH. Your library of stories awaits.', '/home', 0, ?)`).run(t);

  console.log(`[seed] done: ${db.prepare('SELECT COUNT(*) c FROM titles').get().c} titles, ${db.prepare('SELECT COUNT(*) c FROM episodes').get().c} episodes, ${db.prepare('SELECT COUNT(*) c FROM novels').get().c} novels, ${db.prepare('SELECT COUNT(*) c FROM novel_chapters').get().c} chapters`);
}
