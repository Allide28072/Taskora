import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { TitleCard, NovelCard, Loading, ErrorState, EmptyState } from '../components.jsx';
import { useT } from '../i18n.jsx';

export default function MyList() {
  const t = useT();
  const [tab, setTab] = useState('watchlist');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    api.get('/user/favorites')
      .then(setData)
      .catch(setErr)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (type, id) => {
    try {
      await api.del(`/user/favorites/${type}/${id}`);
      load();
    } catch { /* leave list as-is on failure */ }
  };

  if (loading) return <div className="container" style={{ paddingTop: 28 }}><Loading label={t('Loading your list…')} /></div>;
  if (err) return <div className="container" style={{ paddingTop: 28 }}><ErrorState title={t('Could not load My List')} text={err.message} retry={load} /></div>;

  const titles = data?.watchlist || [];
  const novels = data?.reading_list || [];

  return (
    <div className="container" style={{ paddingTop: 28 }}>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>{t('My List')}</h1>
      <div className="row mt-16" role="tablist">
        <button role="tab" aria-selected={tab === 'watchlist'} className={`chip chip-lg${tab === 'watchlist' ? ' chip-active' : ''}`}
          style={{ cursor: 'pointer' }} onClick={() => setTab('watchlist')}>
          {t('Watchlist ({n})', { n: titles.length })}
        </button>
        <button role="tab" aria-selected={tab === 'reading'} className={`chip chip-lg${tab === 'reading' ? ' chip-active' : ''}`}
          style={{ cursor: 'pointer' }} onClick={() => setTab('reading')}>
          {t('Reading List ({n})', { n: novels.length })}
        </button>
      </div>

      <div className="mt-24">
        {tab === 'watchlist' && (
          titles.length === 0
            ? <EmptyState icon="✚" title={t('Your watchlist is empty')} text={t('Add movies, series, and anime from their detail pages.')}
                action={<Link className="btn btn-primary" to="/home">{t('Browse titles')}</Link>} />
            : <div className="grid-cards">
                {titles.map((item) => (
                  <div key={item.id} className="listcell">
                    <TitleCard t={item} />
                    <button className="btn btn-ghost btn-sm list-remove" onClick={() => remove('title', item.id)} aria-label={t('Remove {name}', { name: item.name })}>{t('Remove')}</button>
                  </div>
                ))}
              </div>
        )}
        {tab === 'reading' && (
          novels.length === 0
            ? <EmptyState icon="📖" title={t('Your reading list is empty')} text={t('Save novels to pick them up any time.')}
                action={<Link className="btn btn-primary" to="/novels">{t('Browse novels')}</Link>} />
            : <div className="grid-cards">
                {novels.map((n) => (
                  <div key={n.id} className="listcell">
                    <NovelCard n={n} />
                    <button className="btn btn-ghost btn-sm list-remove" onClick={() => remove('novel', n.id)} aria-label={t('Remove {name}', { name: n.name })}>{t('Remove')}</button>
                  </div>
                ))}
              </div>
        )}
      </div>
    </div>
  );
}
