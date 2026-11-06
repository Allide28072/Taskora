import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Loading, ErrorState, EmptyState, fmtDate } from '../components.jsx';
import { useI18n } from '../i18n.jsx';

const ICONS = { chapter: '📖', episode: '🎬', novel: '✨', system: '⚡', account: '👤' };

export default function Notifications() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const { refreshUnread } = useAuth();
  const { t, tNotice } = useI18n();

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    api.get('/user/notifications')
      .then(setData)
      .catch(setErr)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const markOne = async (n) => {
    if (n.is_read) return;
    try {
      await api.post(`/user/notifications/${n.id}/read`, {});
      setData((d) => ({ ...d, notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)), unread: Math.max(0, d.unread - 1) }));
      refreshUnread();
    } catch { /* ignore */ }
  };

  const markAll = async () => {
    try {
      await api.post('/user/notifications/read-all', {});
      setData((d) => ({ ...d, notifications: d.notifications.map((x) => ({ ...x, is_read: 1 })), unread: 0 }));
      refreshUnread();
    } catch { /* ignore */ }
  };

  if (loading) return <div className="container" style={{ paddingTop: 28 }}><Loading label={t('Loading notifications…')} /></div>;
  if (err) return <div className="container" style={{ paddingTop: 28 }}><ErrorState title={t('Could not load notifications')} text={err.message} retry={load} /></div>;

  const items = data?.notifications || [];

  return (
    <div className="container" style={{ paddingTop: 28, maxWidth: 760 }}>
      <div className="spread">
        <h1 style={{ fontFamily: 'var(--font-display)' }}>{t('Notifications')}</h1>
        {data?.unread > 0 && <button className="btn btn-ghost btn-sm" onClick={markAll}>{t('Mark all read ({n})', { n: data.unread })}</button>}
      </div>
      <div className="mt-24">
        {items.length === 0 && (
          <EmptyState icon="🔔" title={t('Nothing here yet')} text={t('New chapters, episodes, and account updates will land here.')}
            action={<Link className="btn btn-primary" to="/home">{t('Go to Home')}</Link>} />
        )}
        {items.map((n) => (
          <Link key={n.id} to={n.link || '/home'} className={`notif${n.is_read ? '' : ' notif-unread'}`} onClick={() => markOne(n)}>
            <span className="notif-ic" aria-hidden>{ICONS[n.type] || '🔔'}</span>
            <div className="grow">
              <div>{tNotice(n.message)}</div>
              <div className="muted small">{fmtDate(n.created_at)}</div>
            </div>
            {!n.is_read && <span className="bell-dot notif-dot" aria-label={t('unread')} />}
          </Link>
        ))}
      </div>
    </div>
  );
}
