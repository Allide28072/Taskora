import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useT, getLang } from './i18n.jsx';

/* ── buttons / form atoms ─────────────────────────────────────────── */
export function Spinner({ size = 18 }) {
  const t = useT();
  return <span aria-label={t('Loading…')} style={{ width: size, height: size, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent)', borderRadius: '99px', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />;
}

// Callers pass the English source string; anything already translated passes
// through untouched, so this works for both static and interpolated labels.
export function Loading({ label = 'Loading…' }) {
  const t = useT();
  return (
    <div className="center" style={{ padding: '40px 0' }}>
      <Spinner size={26} />
      <div className="muted small mt-8">{t(label)}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, wide, children }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="spread mb-16">
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t('Close')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon = '🎞️', title, text, action }) {
  const t = useT();
  return (
    <div className="state">
      <div className="state-icon" aria-hidden>{icon}</div>
      <h3>{t(title)}</h3>
      {text && <p>{t(text)}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, text, retry }) {
  const t = useT();
  return (
    <div className="state">
      <div className="state-icon" aria-hidden>📡</div>
      <h3>{title ? t(title) : t('Something went wrong')}</h3>
      {text && <p>{text}</p>}
      {retry && <button className="btn btn-ghost" onClick={retry}>{t('Try again')}</button>}
    </div>
  );
}

export function Skeletons({ n = 8, poster = true }) {
  return (
    <div className="grid-cards" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i}>
          {poster && <div className="skel skel-poster" />}
          <div className="skel skel-line" style={{ marginTop: 10 }} />
          <div className="skel skel-line" style={{ width: '60%' }} />
        </div>
      ))}
    </div>
  );
}

/* ── artwork ──────────────────────────────────────────────────────── */
/**
 * Artwork with a guaranteed fallback. The preferred source is a real photo;
 * if it cannot be loaded (offline, blocked host, deleted URL) we swap to the
 * generated art for the same record, so a poster is never blank or broken.
 */
export function Art({ src, fallback, alt = '', ...rest }) {
  const [current, setCurrent] = useState(src || fallback || '');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCurrent(src || fallback || '');
    setReady(false);
  }, [src, fallback]);

  return (
    <img
      {...rest}
      src={current}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={[rest.className, ready ? 'art-ready' : ''].filter(Boolean).join(' ')}
      onLoad={() => setReady(true)}
      onError={() => { if (fallback && current !== fallback) setCurrent(fallback); }}
    />
  );
}

/* ── media cards ──────────────────────────────────────────────────── */
/** The badge carries a colour per kind; the label is translated separately. */
const KIND_KEY = { movie: 'Movie', series: 'Series', anime: 'Anime', novel: 'Novel' };
export const kindLabel = (kind, t) => t(KIND_KEY[kind] || kind);
/** `ongoing` → the dictionary's `Ongoing` entry, in whatever language is active. */
export const statusLabel = (status, t) => t(String(status || '').charAt(0).toUpperCase() + String(status || '').slice(1));

export function TitleCard({ t: title, progress, episode }) {
  const tr = useT();
  const t = title;
  return (
    <Link className="mcard" to={`/title/${t.slug}`} aria-label={t.name}>
      <div className="mcard-poster">
        <Art src={t.poster} fallback={t.poster_fallback} />
        <div className="mcard-grad" />
        <div className="mcard-top">
          <span className={`badge-k ${t.kind}`}>{kindLabel(t.kind, tr)}</span>
          {t.rating > 0 && <span className="badge-k" style={{ color: 'var(--gold)' }}>★ {t.rating.toFixed(1)}</span>}
        </div>
        {/* the title rides on the artwork, so a tile is identifiable at a glance */}
        <div className="art-name"><span className="clamp-2">{t.name}</span></div>
      </div>
      <div className="mcard-body">
        <div className="mcard-meta">
          <span>{t.year || '—'}</span>
          {t.age_rating && <span className="badge-k">{t.age_rating}</span>}
          {episode && <span>S{episode.season}·E{episode.number}</span>}
        </div>
        {progress > 0 && (
          <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        )}
      </div>
    </Link>
  );
}

export function NovelCard({ n, progress, chapterLabel }) {
  const t = useT();
  return (
    <Link className="mcard mcard-novel" to={`/novel/${n.slug}`} aria-label={n.name}>
      <div className="mcard-poster">
        <Art src={n.cover} fallback={n.cover_fallback} />
        <div className="mcard-grad" />
        <div className="mcard-top">
          <span className="badge-k novel">{t('Novel')}</span>
          <span className={`badge-k chip-status-${n.status}`}>{statusLabel(n.status, t)}</span>
        </div>
        <div className="art-name"><span className="clamp-2">{n.name}</span></div>
      </div>        <div className="mcard-body">
        <div className="mcard-meta">
          <span className="ellipsis" style={{ maxWidth: 110 }}>{n.author}</span>
          <span>★ {Number(n.rating || 0).toFixed(1)}</span>
          <span>{t('{n} ch', { n: n.chapters })}</span>
        </div>
        {chapterLabel && <div className="small muted mt-8 ellipsis">{chapterLabel}</div>}
        {progress > 0 && <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>}
      </div>
    </Link>
  );
}

export function Rail({ title, items, renderItem, to }) {
  const t = useT();
  if (!items?.length) return null;
  return (
    <section className="rail" aria-label={t(title)}>
      <div className="rail-head">
        <h2 className="rail-title">{t(title)}</h2>
        {to && <Link className="small" style={{ color: 'var(--muted)', fontWeight: 700 }} to={to}>{t('View all →')}</Link>}
      </div>
      <div className="rail-scroller">{items.map(renderItem)}</div>
    </section>
  );
}

/* ── star rating ──────────────────────────────────────────────────── */
export function RateStars({ value, onRate, size = 21 }) {
  const t = useT();
  const [hover, setHover] = useState(0);
  const active = hover || value || 0;
  return (
    <div className="rate-row" role="radiogroup" aria-label={t('Rate out of 10')}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
        <button
          key={v}
          className={`rate-btn${v <= active ? ' on' : ''}`}
          style={{ fontSize: size }}
          onMouseEnter={() => setHover(v)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onRate?.(v)}
          aria-label={t('{n} out of 10', { n: v })}
        >★</button>
      ))}
    </div>
  );
}

/* ── add-to-list button (works for titles & novels) ───────────────── */
export function ListButton({ type, id, inList, onChange, label = true }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (inList) await api.del(`/user/favorites/${type}/${id}`);
      else await api.post(`/user/favorites/${type}/${id}`, {});
      onChange?.(!inList);
    } catch (e) {
      if (e.status === 401) window.location.assign('/login');
    } finally { setBusy(false); }
  };
  return (
    <button className={`btn ${inList ? 'btn-ghost' : 'btn-violet'}`} onClick={toggle} disabled={busy}>
      {inList ? '✓' : '+'} {label ? t(inList ? 'In My List' : 'Add to My List') : ''}
    </button>
  );
}

/* ── comments ─────────────────────────────────────────────────────── */
export function Comments({ type, id }) {
  const t = useT();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api.get(`/user/comments/${type}/${id}`).then((d) => alive && setComments(d.comments)).catch(() => {});
    return () => { alive = false; };
  }, [type, id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/user/comments/${type}/${id}`, { body });
      const d = await api.get(`/user/comments/${type}/${id}`);
      setComments(d.comments);
      setBody('');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="mt-32">
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{t('Comments')}</h2>
      <form onSubmit={submit} className="mt-16">
        <textarea className="textarea" placeholder={t('Share your thoughts…')} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1200} />
        {err && <div className="form-error mt-8">{err}</div>}
        <button className="btn btn-primary btn-sm mt-8" disabled={busy || !body.trim()}>{busy ? t('Posting…') : t('Post comment')}</button>
      </form>
      <div className="mt-16">
        {comments.length === 0 && <p className="muted small">{t('No comments yet. Be the first.')}</p>}
        {comments.map((c) => (
          <div className="comment" key={c.id}>
            <img className="comment-avatar" src={c.avatar || `/media/avatar/u${c.user_id || c.id}`} alt="" loading="lazy" />
            <div className="comment-body">
              <span className="comment-name">{c.user_name}</span>
              <span className="comment-time">{new Date(c.created_at.replace(' ', 'T')).toLocaleDateString(getLang())}</span>
              <p className="comment-text">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── video ────────────────────────────────────────────────────────── */
/** YouTube and Vimeo links play in an embed; anything else is a direct file. */
export function isEmbedUrl(url) {
  return /youtu\.be|youtube\.com|vimeo\.com/i.test(String(url || ''));
}

function toEmbedUrl(url) {
  const s = String(url);
  const yt = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0`;
  const vimeo = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
  return s;
}

/**
 * One player for both kinds of source: a direct file (mp4/HLS/webm) or a
 * hosted embed. Used by the trailer lightbox and by the watch page when an
 * administrator supplies a YouTube or Vimeo link instead of a file.
 */
export function VideoPlayer({ src, poster, autoPlay = false, className = '', showInfo = false, ...rest }) {
  const t = useT();
  // Browsers refuse to autoplay a video that has sound, so an automatic start
  // begins muted; the native controls carry the unmute button and a click on
  // the video un-mutes it. Explicit playback (the watch page) is untouched.
  const [muted, setMuted] = useState(autoPlay);
  if (!src) return null;
  if (isEmbedUrl(src)) {
    return (
      <iframe
        className={`vplayer ${className}`}
        src={toEmbedUrl(src)}
        title={t('Video player')}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    );
  }
  return (
    <>
      <video
        className={`vplayer ${className}`}
        src={src}
        poster={poster}
        controls
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        preload="metadata"
        onClick={() => setMuted(false)}
        {...rest}
      />
      {showInfo && muted && autoPlay && (
        <p className="muted-2 small mt-8" role="status">{t('Sound starts muted — use the volume control on the player, or click the picture, to hear it.')}</p>
      )}
    </>
  );
}

/* ── footer ───────────────────────────────────────────────────────── */
// Labels are English source keys; every one is resolved through t() at render.
const FOOTER_COLUMNS = [
  {
    heading: 'Browse',
    links: [
      ['Home', '/home'], ['Movies', '/movies'], ['Series', '/series'],
      ['Anime', '/anime'], ['Novels', '/novels'], ['Search', '/search'],
    ],
  },
  {
    heading: 'Your library',
    links: [
      ['My List', '/my-list'], ['Continue watching', '/history'],
      ['History', '/history'], ['Notifications', '/notifications'], ['Profile', '/profile'],
    ],
  },
  {
    heading: 'Support',
    links: [
      ['Help Centre', '/info/help'], ['Contact us', '/info/contact'],
      ['Accessibility', '/info/accessibility'], ['About THE FLASH', '/info/about'],
    ],
  },
  {
    heading: 'Legal',
    links: [
      ['Terms of Use', '/info/terms'], ['Privacy Policy', '/info/privacy'],
      ['Cookie Preferences', '/info/cookies'],
    ],
  },
];

export function Footer() {
  const t = useT();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-brand">
          <Link to="/home" className="footer-logo" aria-label={t('THE FLASH home')}>𝓕𝓛𝓐𝓢𝓗</Link>
          <p className="footer-tagline">{t('Stream the story, then read what happens next. Original films, series, anime and light novels in one library.')}</p>
          <Link to="/home" className="btn btn-ghost btn-sm">{t('Start watching')}</Link>
        </div>

        <nav className="footer-cols" aria-label={t('Footer')}>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="footer-heading">{t(col.heading)}</h3>
              <ul>
                {col.links.map(([label, to]) => <li key={label}><Link to={to}>{t(label)}</Link></li>)}
              </ul>
            </div>
          ))}
        </nav>

        <div className="footer-legal">
          <p>{t('© {year} THE FLASH. Every film, series, anime, novel and chapter in this catalogue is an original work, written and produced for this application.', { year: new Date().getFullYear() })}</p>
          <p className="muted-2">{t('Sample photography is provided by Picsum and drawn locally whenever it cannot be reached; no third-party artwork ships with the app. Trailers play through each studio’s own official embed.')}</p>
          <p className="footer-credit">{t('Developed by')} <strong>Allide</strong></p>
        </div>
      </div>
    </footer>
  );
}

/* ── format helpers ───────────────────────────────────────────────── */
export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
export const fmtRuntime = (min) => (!min ? '—' : min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);
// Dates follow the language the reader picked, not the browser's own setting.
export const fmtDate = (d) => (d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString(getLang(), { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
