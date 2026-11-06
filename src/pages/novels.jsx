import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { NovelCard, Skeletons, EmptyState, ErrorState, Rail } from '../components.jsx';
import { useT } from '../i18n.jsx';

const SORTS = [
  ['popularity', 'Most popular'], ['rating', 'Highest rated'], ['updated', 'Recently updated'],
  ['newest', 'Newest first'], ['chapters', 'Most chapters'], ['name', 'A → Z'],
];

export default function Novels() {
  const t = useT();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [genres, setGenres] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', genre: '', sort: 'popularity' });
  const [err, setErr] = useState(null);

  const load = useCallback(async (p = 1) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      params.set('page', String(p));
      const d = await api.get(`/novels?${params}`);
      setItems(d.items); setTotal(d.total); setPage(d.page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setErr(e); }
  }, [filters]);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => { api.get('/genres').then((d) => setGenres(d.genres.filter((g) => g.kind !== 'film'))).catch(() => {}); }, []);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const pages = Math.max(1, Math.ceil(total / 24));
  const statuses = [
    ['', 'All statuses'], ['ongoing', 'Ongoing'], ['completed', 'Completed'], ['hiatus', 'Hiatus'],
  ];

  return (
    <div className="container">
      <div className="page-head">
        <h1 className="page-title">{t('NOVELS')}</h1>
        <p className="page-sub">{t('{total} light novels — read where the films began, or where they could go next.', { total })}</p>
  </div>
      <div className="filter-bar">
        <input className="input search-input" placeholder={t('Search novels or authors…')} value={filters.q} onChange={set('q')} aria-label={t('Search novels')} />
        <select className="select" value={filters.status} onChange={set('status')} aria-label={t('Status')}>
          {statuses.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
        <select className="select" value={filters.genre} onChange={set('genre')} aria-label={t('Genre')}>
          <option value="">{t('All genres')}</option>
          {genres.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
        </select>
        <select className="select" value={filters.sort} onChange={set('sort')} aria-label={t('Sort')}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
      </div>
      {err && <ErrorState text={err.message} retry={() => load(1)} />}
      {!err && !items && <Skeletons n={12} />}
      {!err && items && items.length === 0 && (
        <EmptyState icon="📚" title={t('No novels found')} text={t('Try a different status, genre or search term.')} action={<button className="btn btn-ghost" onClick={() => setFilters({ q: '', status: '', genre: '', sort: 'popularity' })}>{t('Clear filters')}</button>} />
      )}
      {!err && items && items.length > 0 && (
        <>
          <div className="grid-cards">{items.map((n) => <NovelCard key={n.id} n={n} />)}</div>
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
