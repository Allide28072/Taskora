import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { NovelCard, Loading, ErrorState, EmptyState, ListButton, RateStars, Comments, fmtDate, Art } from '../components.jsx';
import { useT } from '../i18n.jsx';

export default function NovelDetail() {
  const t = useT();
  const { slug } = useParams();
  const nav = useNavigate();
  const [n, setN] = useState(null);
  const [err, setErr] = useState(null);
  const [myRating, setMyRating] = useState(null);
  const [asc, setAsc] = useState(true);

  const load = useCallback(() => {
    setErr(null); setN(null);
    api.get(`/novel/${slug}`).then((d) => {
      setN(d.novel);
      setMyRating(d.novel.my_rating ?? null);
    }).catch(setErr);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="container" style={{ paddingTop: 100 }}><ErrorState title={t('Novel unavailable')} text={err.message} retry={load} /></div>;
  if (!n) return <Loading label={t('Loading novel…')} />;

  const cr = n.continue_reading;
  const chapters = asc ? n.chapter_list : [...n.chapter_list].reverse();
  const firstCh = n.chapter_list?.[0]?.number || 1;

  const rate = async (v) => {
    setMyRating(v);
    try { await api.post('/user/rate', { item_type: 'novel', item_id: n.id, value: v }); } catch { /* keep UI state */ }
  };

  return (
    <div>
      <div className="nhero">
        <div className="hero-bg"><Art src={n.cover} fallback={n.cover_fallback} /></div>
        <div className="hero-fade" />
        <div className="container hero-content">
          <div className="row" style={{ alignItems: 'flex-end', gap: 28, flexWrap: 'wrap' }}>
            <Art className="nhero-cover" src={n.cover} fallback={n.cover_fallback} alt={n.name} />
            <div className="grow" style={{ minWidth: 260 }}>
              <div className="hero-meta">
                <span className="badge-k novel">NOVEL</span>
                <span className={`badge-k chip-status-${n.status}`}>{n.status}</span>
                <span className="chip chip-rating">★ {Number(n.rating || 0).toFixed(1)}</span>
                <span className="chip">{n.chapter_list?.length || 0} chapters</span>
                <span className="chip hide-mobile">{(n.total_words || 0).toLocaleString()} words</span>
              </div>
              <h1 className="hero-title" style={{ fontSize: 'clamp(26px, 3.8vw, 40px)' }}>{n.name}</h1>
              <div className="muted" style={{ fontWeight: 700 }}>{t('by {author}', { author: n.author || t('Unknown author') })}</div>
              {n.adaptation && (
                <div className="mt-8">
                  <Link className="adapt-link" to={`/title/${n.adaptation.slug}`}>🎬 Watch the adaptation: {n.adaptation.name}</Link>
                </div>
              )}
              <div className="dhero-actions">
                {cr
                  ? <button className="btn btn-primary btn-lg" onClick={() => nav(`/novel/${n.slug}/read/${cr.chapter_number}`)}>▶ Continue Ch. {cr.chapter_number}</button>
                  : <button className="btn btn-primary btn-lg" onClick={() => nav(`/novel/${n.slug}/read/${firstCh}`)}>📖 Start reading</button>}
                {cr && <button className="btn btn-ghost btn-lg" onClick={() => nav(`/novel/${n.slug}/read/${firstCh}`)}>From start</button>}
                <ListButton type="novel" id={n.id} inList={!!n.in_my_list} onChange={(v) => setN({ ...n, in_my_list: v })} label={false} />
              </div>
              {cr && (
                <div className="mt-16" style={{ maxWidth: 320 }}>
                  <div className="small muted mb-8">Progress · Chapter {cr.chapter_number} · {Math.round(cr.scroll)}%</div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(cr.scroll)}%` }} /></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="row mt-24" style={{ alignItems: 'flex-start', gap: 40, flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: 250 }}>
            <h3 style={{ fontFamily: 'var(--font-display)' }}>Synopsis</h3>
            <p className="muted">{n.description || t('No synopsis yet.')}</p>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
              {n.genres?.map((g) => <Link key={g.slug} className="chip" to={`/novels?genre=${g.slug}`} style={{ textDecoration: 'none' }}>{g.name}</Link>)}
            </div>
            <p className="muted small mt-8">Last updated {fmtDate(n.updated_at)}</p>
          </div>
          <div style={{ width: 220 }} className="hide-mobile">
            <h3 style={{ fontFamily: 'var(--font-display)' }}>Your rating</h3>
            <RateStars value={myRating} onRate={rate} />
            <p className="muted small">Community score ★ {Number(n.rating || 0).toFixed(1)} / 10</p>
          </div>
        </div>

        <div className="mt-24">
          <div className="spread">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Chapters</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setAsc(!asc)}>{asc ? t('Newest last ↓') : t('Newest first ↑')}</button>
          </div>
          <div className="mt-16 chapter-list">
            {chapters.map((c) => (
              <Link key={c.id} className={`chapter-row${cr?.chapter_number === c.number ? ' chapter-active' : ''}`}
                to={`/novel/${n.slug}/read/${c.number}`}>
                <span className="chapter-num">Ch. {c.number}</span>
                <span className="chapter-name grow ellipsis">{c.name}</span>
                <span className="muted small hide-mobile">{(c.words || 0).toLocaleString()} words</span>
                {cr?.chapter_number === c.number && <span className="chip chip-active">resume</span>}
              </Link>
            ))}
            {chapters.length === 0 && <EmptyState icon="📖" title={t('No chapters yet')} text={t('The author has not published any chapters.')} />}
          </div>
        </div>

        <Comments type="novel" id={n.id} />

        {n.adaptation && (
          <div className="mt-32 adapt-banner">
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)' }}>Prefer to watch?</h3>
              <p className="muted small">{t('This story also exists as a {kind} on THE FLASH.', { kind: n.adaptation.kind === 'anime' ? t('streaming adaptation') : t('screen adaptation') })}</p>
            </div>
            <Link className="btn btn-primary" to={`/title/${n.adaptation.slug}`}>▶ Watch {n.adaptation.name}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
