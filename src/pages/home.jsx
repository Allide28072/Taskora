import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { TitleCard, NovelCard, Rail, Loading, ErrorState, ListButton, Spinner, Art } from '../components.jsx';
import { useT } from '../i18n.jsx';

// `t` is the featured item here, so the translator is named `tr`.
function Hero({ items }) {
  const tr = useT();
  const nav = useNavigate();
  const { user } = useAuth();
  const [i, setI] = useState(0);
  const [inList, setInList] = useState(false);
  const t = items[i];

  useEffect(() => { setInList(false); }, [i, items]);
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % items.length), 8000);
    return () => clearInterval(id);
  }, [items]);

  if (!t) return null;
  const goWatch = () => nav(t.kind === 'movie' ? `/watch/${t.slug}` : `/watch/${t.slug}`);
  const goRead = () => t.novel && nav(`/novel/${t.novel.slug}`);

  return (
    <div className="hero">
      <div className="hero-bg"><Art src={t.backdrop} fallback={t.backdrop_fallback} /></div>
      <div className="hero-fade" />
      <div className="container hero-content">
        <div className="hero-meta">
          <span className={`badge-k ${t.kind}`}>{t.kind === 'anime' ? 'ANIME' : t.kind.toUpperCase()}</span>
          <span className="chip chip-rating">★ {t.rating?.toFixed(1)}</span>
          {t.year && <span className="chip">{t.year}</span>}
          {t.age_rating && <span className="badge-k">{t.age_rating}</span>}
          {t.genres?.slice(0, 3).map((g) => <span key={g.slug} className="chip">{g.name}</span>)}
        </div>
        <h1 className="hero-title">{t.name}</h1>
        <p className="hero-desc">{t.description}</p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={goWatch}>{tr('▶ Watch now')}</button>
          {t.novel && <button className="btn btn-violet btn-lg" onClick={goRead}>{tr('📖 Read the story')}</button>}
          {user && <ListButton type="title" id={t.id} inList={inList} onChange={setInList} />}
        </div>
      </div>
      {items.length > 1 && (
        <div className="hero-dots">
          {items.map((_, k) => <button key={k} className={`hero-dot${k === i ? ' on' : ''}`} onClick={() => setI(k)} aria-label={tr('Featured item {n}', { n: k + 1 })} />)}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const t = useT();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => {
    setErr(null);
    api.get('/home').then(setData).catch(setErr);
  }, []);
  useEffect(() => { load(); }, [load]);

  const { user } = useAuth();

  return (
    <div>
      {!data && !err && (
        <div className="hero" style={{ minHeight: '52vh' }}>
          <div className="hero-bg" style={{ background: 'radial-gradient(800px 400px at 50% 30%, #141034, #05060c 70%)' }} />
          <div className="hero-fade" />
          <div className="container hero-content"><Loading label={t('Loading THE FLASH…')} /></div>
          <div className="container mt-24"><Skeletons n={6} /></div>
        </div>
      )}
      {err && <div className="container" style={{ paddingTop: 120 }}><ErrorState text={err.message} retry={load} /></div>}
      {data && (
        <>
          <Hero items={data.hero} />
          <div className="container">
            {data.rails.map((rail) => (
              <Rail
                key={rail.key}
                title={t(rail.title)}
                items={rail.items}
                to={rail.key === 'trending' ? '/movies' : undefined}
                renderItem={(x) => x.slug && x.author !== undefined
                  ? <NovelCard key={x.id} n={x} />
                  : <TitleCard key={x.id} t={x} />}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Skeletons({ n }) {
  return (
    <div className="rail">
      <div className="skel skel-line" style={{ width: 160, height: 18 }} />
      <div className="rail-scroller">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="mcard"><div className="skel skel-poster" /><div className="skel skel-line" /></div>
        ))}
      </div>
    </div>
  );
}
