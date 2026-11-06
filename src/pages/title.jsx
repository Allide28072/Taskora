import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { TitleCard, Rail, Loading, ErrorState, EmptyState, ListButton, RateStars, Comments, fmtRuntime, fmtDate, Art, Modal, VideoPlayer, isEmbedUrl } from '../components.jsx';
import { useT } from '../i18n.jsx';

// `t` is the loaded title here, so the translator is named `tr`.
export default function TitleDetail() {
  const tr = useT();
  const { slug } = useParams();
  const nav = useNavigate();
  const [t, setT] = useState(null);
  const [err, setErr] = useState(null);
  const [season, setSeason] = useState(0);
  const [myRating, setMyRating] = useState(null);
  const [trailer, setTrailer] = useState(false);

  const load = useCallback(() => {
    setErr(null); setT(null);
    api.get(`/title/${slug}`).then((d) => {
      setT(d.title);
      setMyRating(d.title.my_rating ?? null);
      setSeason(d.title.seasons?.length ? 0 : -1);
    }).catch(setErr);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="container" style={{ paddingTop: 100 }}><ErrorState title={tr('Title unavailable')} text={err.message} retry={load} /></div>;
  if (!t) return <Loading label={tr('Loading title…')} />;

  const s = t.seasons?.[season];
  const resumeLabel = t.resume
    ? t.resume.episode_id
      ? `Resume S${t.resume.season_number} E${t.resume.episode_number}`
      : `Resume · ${Math.round((t.resume.position / Math.max(1, t.resume.duration)) * 100)}%`
    : null;

  const rate = async (v) => {
    setMyRating(v);
    try { await api.post('/user/rate', { item_type: 'title', item_id: t.id, value: v }); } catch { /* keep UI state */ }
  };

  return (
    <div>
      <Modal open={trailer} onClose={() => setTrailer(false)} wide title={`${t.name} — trailer`}>
        {trailer && <VideoPlayer src={t.trailer_url} autoPlay showInfo />}
        <p className="muted-2 small mt-12">
          {isEmbedUrl(t.trailer_url)
            ? t.trailer_credit
              ? tr('Hosted trailer played through its official embed — stand-in footage: {credit}.', { credit: t.trailer_credit })
              : tr('Hosted trailer played through its official embed.')
            : tr('Demonstration trailer: openly licensed footage from the Blender Foundation (CC BY 3.0), attached by an administrator. Replace it with a licensed trailer in Admin → Content.')}
        </p>
      </Modal>
      <div className="dhero">
        <div className="hero-bg"><Art src={t.backdrop} fallback={t.backdrop_fallback} /></div>
        <div className="hero-fade" />
        <div className="container hero-content" style={{ paddingBottom: 44 }}>
          <div className="hero-meta">
            <span className={`badge-k ${t.kind}`}>{t.kind.toUpperCase()}</span>
            <span className="chip chip-rating">★ {t.rating?.toFixed(1)}</span>
            {t.year && <span className="chip">{t.year}</span>}
            {t.age_rating && <span className="badge-k">{t.age_rating}</span>}
            {t.runtime > 0 && <span className="chip">{fmtRuntime(t.runtime)}</span>}
            {t.genres?.map((g) => <span key={g.slug} className="chip">{g.name}</span>)}
          </div>
          <h1 className="hero-title" style={{ fontSize: 'clamp(28px, 4.4vw, 44px)' }}>{t.name}</h1>
          <p className="hero-desc" style={{ WebkitLineClamp: 4 }}>{t.description}</p>
          <div className="dhero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => nav(t.resume?.episode_id ? `/watch/${t.slug}/${t.resume.episode_id}` : `/watch/${t.slug}`)}>
              ▶ {resumeLabel ? tr('Resume') : t.kind === 'movie' ? tr('Play movie') : tr('Play')}
            </button>
            {t.trailer_url && (
              <button className="btn btn-ghost btn-lg" onClick={() => setTrailer(true)}>🎬 Play trailer</button>
            )}
            {t.novel && <Link className="btn btn-violet btn-lg" to={`/novel/${t.novel.slug}`}>📖 Read the story</Link>}
            <ListButton type="title" id={t.id} inList={!!t.in_my_list} onChange={(v) => setT({ ...t, in_my_list: v })} />
          </div>
          {t.resume && !t.resume.episode_id && (
            <div className="mt-16 progress-track" style={{ maxWidth: 340 }}><div className="progress-fill" style={{ width: `${Math.round((t.resume.position / Math.max(1, t.resume.duration)) * 100)}%` }} /></div>
          )}
        </div>
      </div>

      <div className="container">
        <div className="spread mt-24" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div className="grow" style={{ minWidth: 280 }}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 40 }}>
              <div className="grow" style={{ minWidth: 240 }}>
                <h3 style={{ fontFamily: 'var(--font-display)' }}>Story</h3>
                <p className="muted">{t.description}</p>
                {t.cast?.length > 0 && <p className="muted small mt-8"><strong style={{ color: 'var(--text)' }}>Cast:</strong> {t.cast.join(', ')}</p>}
                {t.director && <p className="muted small"><strong style={{ color: 'var(--text)' }}>Director:</strong> {t.director}</p>}
                {t.release_date && <p className="muted small"><strong style={{ color: 'var(--text)' }}>Released:</strong> {fmtDate(t.release_date)}</p>}
              </div>
              <div style={{ width: 210, flexShrink: 0 }} className="hide-mobile">
                <h3 style={{ fontFamily: 'var(--font-display)' }}>Your rating</h3>
                <RateStars value={myRating} onRate={rate} />
                <p className="muted small">Community score ★ {t.rating?.toFixed(1)} / 10</p>
              </div>
            </div>
          </div>
        </div>

        {/* seasons & episodes */}
        {t.seasons?.length > 0 && (
          <div className="mt-24">
            <div className="spread">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Episodes</h2>
              {t.seasons.length > 1 && (
                <div className="row">
                  {t.seasons.map((x, i) => (
                    <button key={x.id} className={`chip${i === season ? ' chip-active' : ''}`} onClick={() => setSeason(i)} style={{ cursor: 'pointer' }}>{x.name || `Season ${x.number}`}</button>
                  ))}
                </div>
              )}
              <div />
            </div>
            <div className="mt-16">
              {s.episodes.map((e) => (
                <Link key={e.id} to={`/watch/${t.slug}/${e.id}`} className="row panel" style={{ padding: 12, marginBottom: 10, textDecoration: 'none' }}>
                  <Art src={e.still} fallback={e.still_fallback} style={{ width: 130, borderRadius: 8, flexShrink: 0 }} />
                  <div className="grow">
                    <div style={{ fontWeight: 800 }}>{e.number}. {e.name}</div>
                    <div className="muted small clamp-2">{e.description}</div>
                  </div>
                  <span className="chip hide-mobile">{e.duration}m</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <Comments type="title" id={t.id} />

        {t.related?.length > 0 && (
          <div className="mt-24">
            <Rail title={tr('More like this')} items={t.related} renderItem={(x) => <TitleCard key={x.id} t={x} />} />
          </div>
        )}
      </div>
    </div>
  );
}
