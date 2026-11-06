import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { TitleCard, NovelCard, Loading, ErrorState, EmptyState, Skeletons, Art } from '../components.jsx';
import { useT } from '../i18n.jsx';

function Group({ title, items, render }) {
  if (!items?.length) return null;
  return (
    <div className="mt-24">
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{title}</h2>
      <div className="grid-cards mt-16">{items.map(render)}</div>
    </div>
  );
}

export default function SearchPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [text, setText] = useState(q);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [sugg, setSugg] = useState([]);
  const timer = useRef(0);
  const nav = useNavigate();

  // debounce suggestions while typing
  useEffect(() => {
    if (!text.trim()) { setSugg([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(text.trim())}`)
        .then((d) => {
          const mix = [
            ...d.movies.slice(0, 3).map((x) => ({ kind: 'movie', ...x })),
            ...d.series.slice(0, 3).map((x) => ({ kind: 'series', ...x })),
            ...d.anime.slice(0, 3).map((x) => ({ kind: 'anime', ...x })),
            ...d.novels.slice(0, 3).map((x) => ({ kind: 'novel', ...x })),
          ];
          setSugg(mix);
        })
        .catch(() => setSugg([]));
    }, 220);
    return () => clearTimeout(timer.current);
  }, [text]);

  const run = useCallback((query) => {
    setParams(query ? { q: query } : {});
    setSugg([]);
  }, [setParams]);

  // fetch results for the committed query
  useEffect(() => {
    if (!q) { setData(null); return; }
    let alive = true;
    setLoading(true); setErr(null);
    api.get(`/search?q=${encodeURIComponent(q)}`)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [q]);

  const total = data ? data.movies.length + data.series.length + data.anime.length + data.novels.length : 0;

  return (
    <div className="container" style={{ paddingTop: 28 }}>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>Search</h1>
      <form className="mt-16 searchbar" onSubmit={(e) => { e.preventDefault(); run(text.trim()); }} role="search">
        <input
          autoFocus
          className="input"
          placeholder={t('Search movies, series, anime, novels, authors, genres…')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('Search query')}
        />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>

      {/* instant suggestions while typing */}
      {!q && sugg.length > 0 && (
        <div className="mt-16">
          {sugg.map((s) => (
            <button key={`${s.kind}-${s.slug}`} className="row panel sugg-row" style={{ padding: 8, marginBottom: 6, width: '100%' }}
              onClick={() => run(s.name)}>
              <Art src={s.poster || s.cover} fallback={s.poster_fallback || s.cover_fallback} style={{ width: 42, borderRadius: 6 }} />
              <div className="grow" style={{ textAlign: 'left' }}>
                <div className="small" style={{ fontWeight: 700 }}>{s.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{s.kind === 'novel' ? `Novel · ${s.author}` : s.kind}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!q && !sugg.length && (
        <EmptyState icon="⌕" title={t('Find your next story')}
          text={t('Type to search across every movie, series, anime, novel, author, and genre on THE FLASH.')} />
      )}

      {q && loading && <div style={{ paddingTop: 24 }}><Loading label={`Searching for “${q}”…`} /></div>}
      {q && err && <ErrorState title={t('Search failed')} text={err.message} retry={() => run(q)} />}

      {q && data && !loading && total === 0 && (
        <EmptyState icon="🔍" title={`No results for “${q}”`}
          text={t('Check the spelling, try fewer words, or browse the catalog directly.')}
          action={<Link className="btn btn-primary" to="/novels">Browse novels</Link>} />
      )}

      {q && data && !loading && (
        <>
          <p className="muted small mt-16">{total} result{total === 1 ? '' : 's'} for “{q}”</p>
          <Group title={t('Movies')} items={data.movies} render={(t) => <TitleCard key={t.id} t={t} />} />
          <Group title={t('Series')} items={data.series} render={(t) => <TitleCard key={t.id} t={t} />} />
          <Group title={t('Anime')} items={data.anime} render={(t) => <TitleCard key={t.id} t={t} />} />
          <Group title={t('Novels')} items={data.novels} render={(n) => <NovelCard key={n.id} n={n} />} />
          {(data.authors?.length > 0) && (
            <div className="mt-24">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Authors</h2>
              <div className="row mt-16" style={{ flexWrap: 'wrap', gap: 8 }}>
                {data.authors.map((a) => (
                  <button key={a} className="chip" style={{ cursor: 'pointer' }} onClick={() => run(a)}>✒ {a}</button>
                ))}
              </div>
            </div>
          )}
          {(data.genres?.length > 0) && (
            <div className="mt-24">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Genres</h2>
              <div className="row mt-16" style={{ flexWrap: 'wrap', gap: 8 }}>
                {data.genres.map((g) => (
                  <button key={g.slug} className="chip" style={{ cursor: 'pointer' }}
                    onClick={() => nav(g.kind === 'novel' ? `/novels?genre=${g.slug}` : `/movies?genre=${g.slug}`)}>
                    #{g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
