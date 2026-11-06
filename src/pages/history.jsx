import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { TitleCard, NovelCard, Loading, ErrorState, EmptyState, fmtDate, Art } from '../components.jsx';
import { useT } from '../i18n.jsx';

// `t` is the history item here, so the translator is named `tr` to stay clear of it.
function HistoryRow({ t, sub, pct, to, onClear }) {
  const tr = useT();
  return (
    <div className="panel row" style={{ padding: 12, marginBottom: 10 }}>
      <Link to={to} style={{ flexShrink: 0 }}>
        <Art src={t.poster || t.cover} fallback={t.poster_fallback || t.cover_fallback} style={{ width: 64, borderRadius: 8 }} />
      </Link>
      <div className="grow" style={{ minWidth: 0 }}>
        <Link to={to} className="hrow-title">{t.name}</Link>
        <div className="muted small">{sub}</div>
        <div className="progress-track mt-8"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="row" style={{ flexShrink: 0, gap: 8 }}>
        <span className="muted small hide-mobile">{fmtDate(t.watched_at || t.read_at)}</span>
        <Link className="btn btn-primary btn-sm" to={to}>{tr('Open')}</Link>
        {onClear && <button className="btn btn-ghost btn-sm" onClick={onClear} aria-label={tr('Clear {name}', { name: t.name })}>✕</button>}
      </div>
    </div>
  );
}

export default function History() {
  const [tab, setTab] = useState('watch');
  const [watch, setWatch] = useState(null);
  const [read, setRead] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const t = useT();

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    Promise.all([api.get('/user/history'), api.get('/user/reading-history')])
      .then(([w, r]) => { setWatch(w.items); setRead(r.items); })
      .catch(setErr)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const clearWatch = async (titleId) => {
    try { await api.del(`/user/history/${titleId}`); setWatch((x) => x.filter((i) => i.id !== titleId)); } catch { /* ignore */ }
  };

  if (loading) return <div className="container" style={{ paddingTop: 28 }}><Loading label={t('Loading history…')} /></div>;
  if (err) return <div className="container" style={{ paddingTop: 28 }}><ErrorState title={t('Could not load history')} text={err.message} retry={load} /></div>;

  return (
    <div className="container" style={{ paddingTop: 28 }}>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>{t('History')}</h1>
      <div className="row mt-16" role="tablist">
        <button role="tab" aria-selected={tab === 'watch'} className={`chip chip-lg${tab === 'watch' ? ' chip-active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('watch')}>
          {t('Watching ({n})', { n: watch?.length || 0 })}
        </button>
        <button role="tab" aria-selected={tab === 'read'} className={`chip chip-lg${tab === 'read' ? ' chip-active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('read')}>
          {t('Reading ({n})', { n: read?.length || 0 })}
        </button>
      </div>

      <div className="mt-24" style={{ maxWidth: 860 }}>
        {tab === 'watch' && (
          (watch?.length || 0) === 0
            ? <EmptyState icon="🎬" title={t('No watch history yet')} text={t('Press play on anything and it will appear here.')}
                action={<Link className="btn btn-primary" to="/movies">{t('Browse movies')}</Link>} />
            : watch.map((i) => (
              <HistoryRow key={`${i.id}-${i.episode?.id || 0}`} t={i}
                sub={i.episode ? `S${i.episode.season} · E${i.episode.number} — ${i.episode.name}` : (i.completed ? t('Completed') : t('In progress'))}
                pct={i.progress}
                to={i.episode ? `/watch/${i.slug}/${i.episode.id}` : `/watch/${i.slug}`}
                onClear={() => clearWatch(i.id)} />
            ))
        )}
        {tab === 'read' && (
          (read?.length || 0) === 0
            ? <EmptyState icon="📖" title={t('No reading history yet')} text={t('Open any novel chapter and your progress will be tracked.')}
                action={<Link className="btn btn-primary" to="/novels">{t('Browse novels')}</Link>} />
            : read.map((i) => (
              <HistoryRow key={i.id} t={i} sub={t('Chapter {n}', { n: i.chapter_number })} pct={i.progress}
                to={`/novel/${i.slug}/read/${i.chapter_number}`} />
            ))
        )}
      </div>
    </div>
  );
}
