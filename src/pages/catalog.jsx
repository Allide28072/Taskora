import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { TitleCard, Skeletons, EmptyState, ErrorState } from '../components.jsx';
import { useT } from '../i18n.jsx';

const SORTS = [
  ['popularity', 'Most popular'], ['rating', 'Highest rated'], ['newest', 'Newest first'],
  ['oldest', 'Oldest first'], ['name', 'A → Z'],
];

export default function Catalog({ kind }) {
  const t = useT();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [genres, setGenres] = useState([]);
  const [filters, setFilters] = useState({ q: '', genre: '', year: '', rating: '', sort: 'popularity' });
  const [err, setErr] = useState(null);
  const years = Array.from({ length: 15 }, (_, i) => 2026 - i);

  const load = useCallback(async (p = 1) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      params.set('page', String(p));
      const d = await api.get(`/catalog/${kind}?${params}`);
      setItems(d.items); setTotal(d.total); setPage(d.page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setErr(e); }
  }, [kind, filters]);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => {
    api.get('/genres').then((d) => setGenres(d.genres)).catch(() => {});
  }, []);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const pages = Math.max(1, Math.ceil(total / 24));
  const LABEL = kind === 'movie' ? 'Movies' : kind === 'series' ? 'Series' : 'Anime';

  return (
    <div className="container">
      <div className="page-head">
        <h1 className="page-title">{t(LABEL)}</h1>
        <p className="page-sub">{t('{total} titles available', { total })}</p>
      </div>
      <div className="filter-bar">
        <input className="input search-input" placeholder={t('Search {label}…', { label: t(LABEL).toLowerCase() })} value={filters.q} onChange={set('q')} aria-label={t('Search {label}', { label: t(LABEL) })} />
        <select className="select" value={filters.genre} onChange={set('genre')} aria-label={t('Genre')}>
          <option value="">{t('All genres')}</option>
          {genres.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
        </select>
        <select className="select" value={filters.year} onChange={set('year')} aria-label={t('Year')}>
          <option value="">{t('All years')}</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="select" value={filters.rating} onChange={set('rating')} aria-label={t('Minimum rating')}>
          <option value="">{t('Any rating')}</option>
          {[7, 8, 9].map((r) => <option key={r} value={r}>{t('★ {r}+', { r })}</option>)}
        </select>
        <select className="select" value={filters.sort} onChange={set('sort')} aria-label={t('Sort')}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
      </div>
      {err && <ErrorState text={err.message} retry={() => load(1)} />}
      {!err && !items && <Skeletons n={12} />}
      {!err && items && items.length === 0 && (
        <EmptyState icon="🔍" title={t('No {label} found', { label: t(LABEL).toLowerCase() })} text={t('Try different filters or search terms.')} action={<button className="btn btn-ghost" onClick={() => setFilters({ q: '', genre: '', year: '', rating: '', sort: 'popularity' })}>{t('Clear filters')}</button>} />
      )}
      {!err && items && items.length > 0 && (
        <>
          <div className="grid-cards">{items.map((item) => <TitleCard key={item.id} t={item} />)}</div>
          {pages > 1 && (
            <div className="row center" style={{ justifyContent: 'center', gap: 14, margin: '28px 0' }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>{t('← Prev')}</button>
              <span className="muted small">{t('Page {page} of {pages}', { page, pages })}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => load(page + 1)}>{t('Next →')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
