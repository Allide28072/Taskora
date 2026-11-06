import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, Spinner, Loading, ErrorState, EmptyState, fmtDate, Art } from '../components.jsx';

/* ── layout ─────────────────────────────────────────────────────────── */
const NAV = [
  { to: '/admin/dashboard', label: 'Overview', ic: '▤' },
  { to: '/admin/content', label: 'Content', ic: '🎬' },
  { to: '/admin/novels', label: 'Novels & Chapters', ic: '📖' },
  { to: '/admin/users', label: 'Users', ic: '👥' },
  { to: '/admin/taxonomy', label: 'Genres & Categories', ic: '🏷️' },
  { to: '/admin/reports', label: 'Reports', ic: '📈' },
  { to: '/admin/settings', label: 'Settings', ic: '⚙' },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const doLogout = async () => { await logout(); nav('/login', { replace: true }); };
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-brand">𝓕𝓛𝓐𝓢𝓗 <span className="admin-brand-sub">console</span></div>
        <nav className="admin-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `admin-link${isActive ? ' active' : ''}`}>
              <span className="ic" aria-hidden>{n.ic}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-side-foot">
          <div className="small muted ellipsis">{user?.email}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => nav('/home')}>User site ↗</button>
          <button className="btn btn-danger btn-sm" onClick={doLogout}>Log out</button>
        </div>
      </aside>
      <main className="admin-main"><Outlet /></main>
    </div>
  );
}

/* ── overview ───────────────────────────────────────────────────────── */
export function AdminDashboard() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => {
    setErr(null); setS(null);
    api.get('/admin/stats').then(setS).catch(setErr);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="admin-pad"><ErrorState title="Could not load dashboard" text={err.message} retry={load} /></div>;
  if (!s) return <div className="admin-pad"><Loading label="Loading statistics…" /></div>;

  const kpis = [
    ['Total users', s.users], ['Movies', s.movies], ['Series', s.series], ['Anime', s.anime],
    ['Novels', s.novels], ['Chapters', s.chapters], ['Total views', s.views.toLocaleString()],
    ['Watch events', s.watch_activity], ['Reading events', s.reading_activity],
  ];
  const k = s.kpi || {};

  return (
    <div className="admin-pad">
      <h1>Overview</h1>
      <div className="kpi-grid">
        {kpis.map(([label, v]) => (
          <div key={label} className="kpi"><div className="kpi-num">{v ?? 0}</div><div className="kpi-label">{label}</div></div>
        ))}
      </div>

      <div className="spread mt-24" style={{ flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div className="admin-card grow" style={{ minWidth: 300 }}>
          <h3>Last 30 days</h3>
          <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
            {[['New users', k.new_users], ['Watch events', k.watch_events], ['Reading events', k.reading_events], ['Comments', k.comments]].map(([l, v]) => (
              <div key={l} className="stat"><div className="stat-num">{v ?? 0}</div><div className="muted small">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="admin-card grow" style={{ minWidth: 300 }}>
          <h3>Recent users</h3>
          {s.recent_users.map((u) => (
            <div key={u.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="grow">{u.name}<div className="muted" style={{ fontSize: 12 }}>{u.email}</div></div>
              <span className={`badge-k ${u.role === 'admin' ? 'series' : 'movie'}`}>{u.role}</span>
              <span className="muted small">{fmtDate(u.created_at)}</span>
            </div>
          ))}
        </div>
        <div className="admin-card grow" style={{ minWidth: 300 }}>
          <h3>Admin activity log</h3>
          {s.recent_audit.map((a) => (
            <div key={a.id} className="small" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <strong>{a.user_name || 'system'}</strong> {a.action}d {a.entity} {a.entity_id && <span className="muted">#{a.entity_id}</span>}
              {a.detail && <span className="muted"> — {a.detail}</span>}
              <div className="muted" style={{ fontSize: 11 }}>{fmtDate(a.created_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── shared bits ────────────────────────────────────────────────────── */
function useGenres() {
  const [genres, setGenres] = useState([]);
  useEffect(() => { api.get('/genres').then((d) => setGenres(d.genres)).catch(() => {}); }, []);
  return genres;
}

function GenrePicker({ genres, selected, onChange }) {
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {genres.map((g) => {
        const on = selected.includes(g.id);
        return (
          <button type="button" key={g.id} className={`chip${on ? ' chip-active' : ''}`} style={{ cursor: 'pointer' }}
            onClick={() => onChange(on ? selected.filter((x) => x !== g.id) : [...selected, g.id])}>
            {g.name}
          </button>
        );
      })}
    </div>
  );
}

function Confirm({ open, text, onCancel, onConfirm, busy }) {
  return (
    <Modal open={open} onClose={onCancel} title="Please confirm">
      <p>{text}</p>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? <Spinner size={16} /> : 'Delete'}</button>
      </div>
    </Modal>
  );
}

/* ── content (movies/series/anime) ──────────────────────────────────── */
const EMPTY_TITLE = {
  name: '', kind: 'movie', description: '', release_year: new Date().getFullYear(), runtime: 0,
  rating: 0, age_rating: 'PG-13', director: '', cast: '', video_url: '', trailer_url: '', featured: false,
  poster_url: '', backdrop_url: '',
};

export function AdminContent() {
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [page, setPage] = useState(1);
  const genres = useGenres();

  const [modal, setModal] = useState(null);     // { mode: 'create'|'edit', form, id }
  const [seasons, setSeasons] = useState(null); // expanded row
  const [confirm, setConfirm] = useState(null); // { label, run }
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [tmdb, setTmdb] = useState('');

  const load = useCallback(() => {
    setErr(null);
    const params = new URLSearchParams({ page: String(page) });
    if (kind) params.set('kind', kind);
    if (q) params.set('q', q);
    api.get(`/admin/titles?${params}`).then(setData).catch(setErr);
  }, [kind, q, page]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setFormErr(''); setModal({ mode: 'create', id: null, form: { ...EMPTY_TITLE }, genre_ids: [] }); };
  const openEdit = async (row) => {
    setFormErr('');
    try {
      const d = await api.get(`/admin/titles/${row.id}`);
      const t = d.title;
      setModal({
        mode: 'edit', id: t.id, genre_ids: t.genre_ids,
        form: {
          name: t.name, kind: t.kind, description: t.description || '', release_year: t.release_year || '',
          runtime: t.runtime || 0, rating: t.rating || 0, age_rating: t.age_rating || 'PG-13',
          director: t.director || '', cast: (t.cast || []).join(', '), video_url: t.video_url || '',
          trailer_url: t.trailer_url || '', featured: !!t.featured,
          poster_url: t.poster_url || '', backdrop_url: t.backdrop_url || '',
        },
      });
    } catch (e) { setFormErr(e.message); }
  };

  const saveTitle = async () => {
    setBusy(true); setFormErr('');
    const f = modal.form;
    const payload = {
      ...f,
      release_year: parseInt(f.release_year, 10) || undefined,
      runtime: parseInt(f.runtime, 10) || 0,
      rating: parseFloat(f.rating) || 0,
      cast: f.cast,
      genres: modal.genre_ids,
    };
    try {
      if (modal.mode === 'create') await api.post('/admin/titles', payload);
      else await api.put(`/admin/titles/${modal.id}`, payload);
      setModal(null); load();
    } catch (e) { setFormErr(e.message); } finally { setBusy(false); }
  };

  const delTitle = (row) => setConfirm({
    label: `Delete “${row.name}” and all its seasons/episodes?`,
    run: async () => { await api.del(`/admin/titles/${row.id}`); setConfirm(null); load(); },
  });

  const toggleSeasons = async (row) => {
    if (seasons?.id === row.id) { setSeasons(null); return; }
    const d = await api.get(`/admin/titles/${row.id}`);
    setSeasons({ id: row.id, name: row.name, kind: row.kind, seasons: d.title.seasons, titleId: row.id });
  };

  const addSeason = async (titleId) => {
    await api.post(`/admin/titles/${titleId}/seasons`, {});
    toggleSeasons({ id: titleId }); // collapse
    setTimeout(() => toggleSeasons({ id: titleId }), 0); // re-expand fresh
    load();
  };

  const addEpisode = async (seasonId) => {
    const name = window.prompt('Episode name:', '');
    if (name === null) return;
    const video = window.prompt('Licensed video URL (optional):', '') || '';
    await api.post(`/admin/seasons/${seasonId}/episodes`, { name, video_url: video });
    const d = await api.get(`/admin/titles/${seasons.titleId}`);
    setSeasons({ ...seasons, seasons: d.title.seasons });
  };

  const editEpisode = async (ep) => {
    const name = window.prompt('Episode name:', ep.name);
    if (name === null) return;
    const video = window.prompt('Licensed video URL (empty to clear):', ep.video_url || '') ?? ep.video_url;
    await api.put(`/admin/episodes/${ep.id}`, { name, video_url: video });
    const d = await api.get(`/admin/titles/${seasons.titleId}`);
    setSeasons({ ...seasons, seasons: d.title.seasons });
  };

  const delEpisode = (ep) => setConfirm({
    label: `Delete episode “${ep.name}”?`,
    run: async () => {
      await api.del(`/admin/episodes/${ep.id}`);
      const d = await api.get(`/admin/titles/${seasons.titleId}`);
      setSeasons({ ...seasons, seasons: d.title.seasons });
      setConfirm(null);
    },
  });

  const delSeason = (s) => setConfirm({
    label: `Delete ${s.name} and its episodes?`,
    run: async () => {
      await api.del(`/admin/seasons/${s.id}`);
      const d = await api.get(`/admin/titles/${seasons.titleId}`);
      setSeasons({ ...seasons, seasons: d.title.seasons });
      setConfirm(null);
    },
  });

  const importTmdb = async () => {
    if (!tmdb.trim()) return;
    setBusy(true); setFormErr('');
    try {
      const kind = window.prompt('TMDB type — type "movie" or "tv":', 'movie');
      await api.post('/admin/tmdb/import', { tmdb_id: parseInt(tmdb, 10), kind: kind === 'tv' ? 'tv' : 'movie' });
      setTmdb(''); load();
    } catch (e) { setFormErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="admin-pad">
      <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h1>Content</h1>
        <div className="row">
          <input className="input input-sm" placeholder="TMDB id import…" value={tmdb} onChange={(e) => setTmdb(e.target.value)} style={{ width: 150 }} />
          <button className="btn btn-ghost btn-sm" onClick={importTmdb} disabled={busy || !tmdb.trim()}>Import</button>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add title</button>
        </div>
      </div>
      {formErr && !modal && <div className="form-error mt-8">{formErr}</div>}

      <div className="row mt-16" style={{ flexWrap: 'wrap', gap: 8 }}>
        {['', 'movie', 'series', 'anime'].map((k) => (
          <button key={k || 'all'} className={`chip${kind === k ? ' chip-active' : ''}`} style={{ cursor: 'pointer' }}
            onClick={() => { setKind(k); setPage(1); }}>{k || 'All'}</button>
        ))}
        <div className="grow" />
        <input className="input input-sm" placeholder="Search titles…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
      </div>

      {err && <ErrorState title="Could not load content" text={err.message} retry={load} />}
      {!err && !data && <Loading label="Loading content…" />}
      {data && data.items.length === 0 && <EmptyState icon="🎬" title="No titles found" text="Try a different filter or add a new title." />}
      {data && data.items.length > 0 && (
        <div className="admin-table mt-16">
          <table>
            <thead><tr><th>ID</th><th></th><th>Name</th><th>Kind</th><th>Year</th><th>Rating</th><th>Video</th><th>Actions</th></tr></thead>
            <tbody>
              {data.items.map((row) => (
                <React.Fragment key={row.id}>
                  <tr>
                    <td className="muted">{row.id}</td>
                    <td><Art src={row.poster} fallback={row.poster_fallback} style={{ width: 34, borderRadius: 4 }} /></td>
                    <td style={{ fontWeight: 700 }}>{row.name}{row.featured ? ' ★' : ''}</td>
                    <td><span className={`badge-k ${row.kind}`}>{row.kind}</span></td>
                    <td>{row.release_year || '—'}</td>
                    <td>{Number(row.rating || 0).toFixed(1)}</td>
                    <td>{row.video_url ? <span className="chip chip-active">attached</span> : <span className="chip">none</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                        {row.kind !== 'movie' && <button className="btn btn-ghost btn-sm" onClick={() => toggleSeasons(row)}>Episodes</button>}
                        <button className="btn btn-danger btn-sm" onClick={() => delTitle(row)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                  {seasons?.id === row.id && (
                    <tr><td colSpan={8} style={{ background: 'rgba(255,255,255,0.02)' }}>
                      {seasons.seasons.map((s) => (
                        <div key={s.id} className="panel" style={{ padding: 10, marginBottom: 8 }}>
                          <div className="spread">
                            <strong>{s.name || `Season ${s.number}`}</strong>
                            <div className="row" style={{ gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => addEpisode(s.id)}>+ Episode</button>
                              <button className="btn btn-danger btn-sm" onClick={() => delSeason(s)}>Delete season</button>
                            </div>
                          </div>
                          {s.episodes.map((e) => (
                            <div key={e.id} className="row small" style={{ padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                              <span style={{ width: 30 }}>E{e.number}</span>
                              <span className="grow ellipsis">{e.name}</span>
                              {e.video_url ? <span className="chip chip-active">video</span> : <span className="chip">no video</span>}
                              <button className="btn btn-ghost btn-sm" onClick={() => editEpisode(e)}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => delEpisode(e)}>✕</button>
                            </div>
                          ))}
                        </div>
                      ))}
                      <button className="btn btn-violet btn-sm" onClick={() => addSeason(row.id)}>+ Add season</button>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="row mt-16" style={{ justifyContent: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="muted small">Page {data.page} · {data.total} titles</span>
            <button className="btn btn-ghost btn-sm" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}

      {/* create / edit modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} wide title={modal?.mode === 'create' ? 'Add title' : 'Edit title'}>
        {modal && (
          <form onSubmit={(e) => { e.preventDefault(); saveTitle(); }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="field grow" style={{ minWidth: 220 }}>
                <label>Name</label>
                <input className="input" value={modal.form.name} onChange={(e) => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })} />
              </div>
              <div className="field" style={{ width: 130 }}>
                <label>Kind</label>
                <select className="input" value={modal.form.kind} onChange={(e) => setModal({ ...modal, form: { ...modal.form, kind: e.target.value } })}>
                  <option value="movie">Movie</option><option value="series">Series</option><option value="anime">Anime</option>
                </select>
              </div>
              <div className="field" style={{ width: 110 }}>
                <label>Year</label>
                <input className="input" type="number" value={modal.form.release_year} onChange={(e) => setModal({ ...modal, form: { ...modal.form, release_year: e.target.value } })} />
              </div>
              <div className="field" style={{ width: 110 }}>
                <label>Runtime (min)</label>
                <input className="input" type="number" value={modal.form.runtime} onChange={(e) => setModal({ ...modal, form: { ...modal.form, runtime: e.target.value } })} />
              </div>
              <div className="field" style={{ width: 100 }}>
                <label>Rating 0–10</label>
                <input className="input" type="number" step="0.1" min="0" max="10" value={modal.form.rating} onChange={(e) => setModal({ ...modal, form: { ...modal.form, rating: e.target.value } })} />
              </div>
              <div className="field" style={{ width: 120 }}>
                <label>Age rating</label>
                <select className="input" value={modal.form.age_rating} onChange={(e) => setModal({ ...modal, form: { ...modal.form, age_rating: e.target.value } })}>
                  {['G', 'TV-Y', 'TV-G', 'TV-Y7', 'PG', 'TV-PG', 'PG-13', 'TV-14', 'R', 'NC-17', 'TV-MA'].map((a) => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="field mt-12">
              <label>Description</label>
              <textarea className="textarea" rows={4} value={modal.form.description} onChange={(e) => setModal({ ...modal, form: { ...modal.form, description: e.target.value } })} />
            </div>
            <div className="row mt-12" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="field grow" style={{ minWidth: 200 }}>
                <label>Director</label>
                <input className="input" value={modal.form.director} onChange={(e) => setModal({ ...modal, form: { ...modal.form, director: e.target.value } })} />
              </div>
              <div className="field grow" style={{ minWidth: 200 }}>
                <label>Cast (comma separated)</label>
                <input className="input" value={modal.form.cast} onChange={(e) => setModal({ ...modal, form: { ...modal.form, cast: e.target.value } })} />
              </div>
            </div>
            <div className="row mt-12" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="field grow" style={{ minWidth: 220 }}>
                <label>Licensed video source URL</label>
                <input className="input" placeholder="https://… (mp4/HLS you own or license)" value={modal.form.video_url} onChange={(e) => setModal({ ...modal, form: { ...modal.form, video_url: e.target.value } })} />
              </div>
              <div className="field grow" style={{ minWidth: 220 }}>
                <label>Trailer URL</label>
                <input className="input" value={modal.form.trailer_url} onChange={(e) => setModal({ ...modal, form: { ...modal.form, trailer_url: e.target.value } })} />
              </div>
            </div>
            <div className="row mt-12" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="field grow" style={{ minWidth: 220 }}>
                <label>Poster image URL <span className="muted-2">(2:3 portrait)</span></label>
                <input className="input" placeholder="https://… or leave blank for the app default" value={modal.form.poster_url} onChange={(e) => setModal({ ...modal, form: { ...modal.form, poster_url: e.target.value } })} />
              </div>
              <div className="field grow" style={{ minWidth: 220 }}>
                <label>Backdrop image URL <span className="muted-2">(16:9 wide)</span></label>
                <input className="input" placeholder="https://… or leave blank for the app default" value={modal.form.backdrop_url} onChange={(e) => setModal({ ...modal, form: { ...modal.form, backdrop_url: e.target.value } })} />
              </div>
            </div>
            <p className="muted-2 small mt-8">Blank fields use the title’s own photograph. Whatever you paste here is used first, and the app still falls back to generated artwork if the link breaks.</p>
            <div className="field mt-12">
              <label>Genres</label>
              <GenrePicker genres={genres} selected={modal.genre_ids} onChange={(ids) => setModal({ ...modal, genre_ids: ids })} />
            </div>
            <label className="check mt-12"><input type="checkbox" checked={modal.form.featured} onChange={(e) => setModal({ ...modal, form: { ...modal.form, featured: e.target.checked } })} /> Feature on the home hero</label>
            {formErr && <div className="form-error mt-8">{formErr}</div>}
            <div className="row mt-16" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner size={16} /> : modal.mode === 'create' ? 'Create title' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Confirm open={!!confirm} text={confirm?.label} busy={busy} onCancel={() => setConfirm(null)} onConfirm={confirm?.run} />
    </div>
  );
}

/* ── novels & chapters ──────────────────────────────────────────────── */
export function AdminNovels() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const genres = useGenres();
  const [modal, setModal] = useState(null);
  const [chapters, setChapters] = useState(null); // expanded novel
  const [chModal, setChModal] = useState(null);   // { mode, id, novelId, name, content }
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(() => {
    setErr(null);
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    api.get(`/admin/novels?${params}`).then(setData).catch(setErr);
  }, [q, page]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setFormErr(''); setModal({ mode: 'create', id: null, genre_ids: [], form: { name: '', author: '', status: 'ongoing', year: new Date().getFullYear(), rating: 0, description: '', featured: false, cover_url: '' } }); };
  const openEdit = async (row) => {
    setFormErr('');
    const d = await api.get(`/admin/novels/${row.id}`);
    const n = d.novel;
    setModal({ mode: 'edit', id: n.id, genre_ids: n.genre_ids, form: { name: n.name, author: n.author || '', status: n.status, year: n.year || '', rating: n.rating || 0, description: n.description || '', featured: !!n.is_featured, cover_url: n.cover_url || '' } });
  };
  const save = async () => {
    setBusy(true); setFormErr('');
    const f = modal.form;
    const payload = { ...f, year: parseInt(f.year, 10) || undefined, rating: parseFloat(f.rating) || 0, genres: modal.genre_ids };
    try {
      if (modal.mode === 'create') await api.post('/admin/novels', payload);
      else await api.put(`/admin/novels/${modal.id}`, payload);
      setModal(null); load();
    } catch (e) { setFormErr(e.message); } finally { setBusy(false); }
  };
  const del = (row) => setConfirm({ label: `Delete “${row.name}” and all its chapters?`, run: async () => { await api.del(`/admin/novels/${row.id}`); setConfirm(null); load(); } });

  const toggleChapters = async (row) => {
    if (chapters?.id === row.id) { setChapters(null); return; }
    const d = await api.get(`/admin/novels/${row.id}`);
    setChapters({ id: row.id, novel: d.novel });
  };
  const reloadChapters = async () => {
    const d = await api.get(`/admin/novels/${chapters.id}`);
    setChapters({ id: chapters.id, novel: d.novel });
  };

  const openChCreate = () => setChModal({ mode: 'create', id: null, name: '', content: '' });
  const openChEdit = async (c) => {
    const d = await api.get(`/admin/chapters/${c.id}`);
    setChModal({ mode: 'edit', id: c.id, name: d.chapter.name, content: d.chapter.content });
  };
  const saveChapter = async () => {
    setBusy(true);
    try {
      if (chModal.mode === 'create') await api.post(`/admin/novels/${chapters.id}/chapters`, chModal);
      else await api.put(`/admin/chapters/${chModal.id}`, chModal);
      setChModal(null); reloadChapters(); load();
    } catch (e) { setFormErr(e.message); } finally { setBusy(false); }
  };
  const delChapter = (c) => setConfirm({ label: `Delete “${c.name}”?`, run: async () => { await api.del(`/admin/chapters/${c.id}`); reloadChapters(); load(); setConfirm(null); } });
  const move = async (c, dir) => {
    const list = [...chapters.novel.chapters];
    const i = list.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await api.post(`/admin/novels/${chapters.id}/chapters/reorder`, { chapter_ids: list.map((x) => x.id) });
    reloadChapters();
  };

  return (
    <div className="admin-pad">
      <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h1>Novels & Chapters</h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add novel</button>
      </div>
      <div className="row mt-16">
        <input className="input input-sm" placeholder="Search novels or authors…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 260 }} />
      </div>

      {err && <ErrorState title="Could not load novels" text={err.message} retry={load} />}
      {!err && !data && <Loading label="Loading novels…" />}
      {data && data.items.length === 0 && <EmptyState icon="📖" title="No novels found" text="Add your first novel to get started." />}
      {data && data.items.length > 0 && (
        <div className="admin-table mt-16">
          <table>
            <thead><tr><th>ID</th><th></th><th>Title</th><th>Author</th><th>Status</th><th>Chapters</th><th>Actions</th></tr></thead>
            <tbody>
              {data.items.map((row) => (
                <React.Fragment key={row.id}>
                  <tr>
                    <td className="muted">{row.id}</td>
                    <td><Art src={row.cover} fallback={row.cover_fallback} style={{ width: 34, borderRadius: 4 }} /></td>
                    <td style={{ fontWeight: 700 }}>{row.name}</td>
                    <td>{row.author || '—'}</td>
                    <td><span className={`badge-k chip-status-${row.status}`}>{row.status}</span></td>
                    <td>{row.chapters}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleChapters(row)}>Chapters</button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(row)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                  {chapters?.id === row.id && (
                    <tr><td colSpan={7} style={{ background: 'rgba(255,255,255,0.02)' }}>
                      {chapters.novel.chapters.map((c, i) => (
                        <div key={c.id} className="row small" style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ width: 44 }}>#{c.number}</span>
                          <span className="grow ellipsis">{c.name}</span>
                          <span className="muted hide-mobile">{c.words?.toLocaleString()} words</span>
                          <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(c, -1)} aria-label="Move up">↑</button>
                          <button className="btn btn-ghost btn-sm" disabled={i === chapters.novel.chapters.length - 1} onClick={() => move(c, 1)} aria-label="Move down">↓</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openChEdit(c)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => delChapter(c)}>✕</button>
                        </div>
                      ))}
                      <button className="btn btn-violet btn-sm mt-8" onClick={openChCreate}>+ Add chapter</button>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="row mt-16" style={{ justifyContent: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="muted small">Page {data.page} · {data.total} novels</span>
            <button className="btn btn-ghost btn-sm" disabled={data.page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} wide title={modal?.mode === 'create' ? 'Add novel' : 'Edit novel'}>
        {modal && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="field grow" style={{ minWidth: 220 }}>
                <label>Title</label>
                <input className="input" value={modal.form.name} onChange={(e) => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })} />
              </div>
              <div className="field grow" style={{ minWidth: 180 }}>
                <label>Author</label>
                <input className="input" value={modal.form.author} onChange={(e) => setModal({ ...modal, form: { ...modal.form, author: e.target.value } })} />
              </div>
              <div className="field" style={{ width: 130 }}>
                <label>Status</label>
                <select className="input" value={modal.form.status} onChange={(e) => setModal({ ...modal, form: { ...modal.form, status: e.target.value } })}>
                  <option value="ongoing">ongoing</option><option value="completed">completed</option><option value="hiatus">hiatus</option>
                </select>
              </div>
              <div className="field" style={{ width: 100 }}>
                <label>Year</label>
                <input className="input" type="number" value={modal.form.year} onChange={(e) => setModal({ ...modal, form: { ...modal.form, year: e.target.value } })} />
              </div>
              <div className="field" style={{ width: 100 }}>
                <label>Rating 0–10</label>
                <input className="input" type="number" step="0.1" min="0" max="10" value={modal.form.rating} onChange={(e) => setModal({ ...modal, form: { ...modal.form, rating: e.target.value } })} />
              </div>
            </div>
            <div className="field mt-12">
              <label>Cover image URL <span className="muted-2">(2:3 portrait)</span></label>
              <input className="input" placeholder="https://… or leave blank for the app default" value={modal.form.cover_url || ''} onChange={(e) => setModal({ ...modal, form: { ...modal.form, cover_url: e.target.value } })} />
            </div>
            <div className="field mt-12">
              <label>Description</label>
              <textarea className="textarea" rows={4} value={modal.form.description} onChange={(e) => setModal({ ...modal, form: { ...modal.form, description: e.target.value } })} />
            </div>
            <div className="field mt-12">
              <label>Genres</label>
              <GenrePicker genres={genres} selected={modal.genre_ids} onChange={(ids) => setModal({ ...modal, genre_ids: ids })} />
            </div>
            <label className="check mt-12"><input type="checkbox" checked={modal.form.featured} onChange={(e) => setModal({ ...modal, form: { ...modal.form, featured: e.target.checked } })} /> Feature on the novels page</label>
            {formErr && <div className="form-error mt-8">{formErr}</div>}
            <div className="row mt-16" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner size={16} /> : modal.mode === 'create' ? 'Create novel' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!chModal} onClose={() => setChModal(null)} wide title={chModal?.mode === 'create' ? 'Add chapter' : 'Edit chapter'}>
        {chModal && (
          <form onSubmit={(e) => { e.preventDefault(); saveChapter(); }}>
            <div className="field">
              <label>Chapter name</label>
              <input className="input" value={chModal.name} onChange={(e) => setChModal({ ...chModal, name: e.target.value })} placeholder="Chapter name" />
            </div>
            <div className="field mt-12">
              <label>Content (blank line = new paragraph)</label>
              <textarea className="textarea" rows={14} value={chModal.content} onChange={(e) => setChModal({ ...chModal, content: e.target.value })} />
            </div>
            {formErr && <div className="form-error mt-8">{formErr}</div>}
            <div className="row mt-16" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setChModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner size={16} /> : 'Save chapter'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Confirm open={!!confirm} text={confirm?.label} busy={busy} onCancel={() => setConfirm(null)} onConfirm={confirm?.run} />
    </div>
  );
}

/* ── users ──────────────────────────────────────────────────────────── */
export function AdminUsers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const { user: me } = useAuth();

  const load = useCallback(() => {
    setErr(null);
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    api.get(`/admin/users?${params}`).then(setData).catch(setErr);
  }, [q, page]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (u) => {
    try { const d = await api.get(`/admin/users/${u.id}`); setDetail(d); } catch { /* ignore */ }
  };
  const setStatus = (u, status) => setConfirm({
    label: `${status === 'disabled' ? 'Disable' : 'Enable'} account “${u.email}”?${status === 'disabled' ? ' Active sessions will be signed out.' : ''}`,
    run: async () => { await api.put(`/admin/users/${u.id}/status`, { status }); setConfirm(null); load(); if (detail?.user?.id === u.id) openDetail(u); },
  });
  const setRole = async (u, role) => {
    await api.put(`/admin/users/${u.id}/role`, { role });
    load();
    if (detail?.user?.id === u.id) openDetail(u);
  };

  return (
    <div className="admin-pad">
      <h1>Users</h1>
      <div className="row mt-16">
        <input className="input input-sm" placeholder="Search name or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 260 }} />
      </div>
      {err && <ErrorState title="Could not load users" text={err.message} retry={load} />}
      {!err && !data && <Loading label="Loading users…" />}
      {data && (
        <div className="admin-table mt-16">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="muted">{u.id}</td>
                  <td style={{ fontWeight: 700 }}>{u.name}{u.id === me?.id ? ' (you)' : ''}</td>
                  <td className="muted">{u.email}</td>
                  <td>
                    {u.id === me?.id ? <span className="badge-k series">{u.role}</span> : (
                      <select className="input input-sm" value={u.role} onChange={(e) => setRole(u, e.target.value)} aria-label={`Role for ${u.email}`}>
                        <option value="user">user</option><option value="admin">admin</option>
                      </select>
                    )}
                  </td>
                  <td>{u.status === 'active' ? <span className="chip chip-active">active</span> : <span className="chip">disabled</span>}</td>
                  <td className="muted small">{fmtDate(u.created_at)}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDetail(u)}>Activity</button>
                      <button className={`btn btn-sm ${u.status === 'active' ? 'btn-danger' : 'btn-primary'}`}
                        onClick={() => setStatus(u, u.status === 'active' ? 'disabled' : 'active')} disabled={u.id === me?.id}>
                        {u.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row mt-16" style={{ justifyContent: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="muted small">Page {data.page} · {data.total} users</span>
            <button className="btn btn-ghost btn-sm" disabled={data.page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Account activity — ${detail?.user?.name || ''}`}>
        {detail && (
          <div>
            <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
              {[['Watch events', detail.stats.watch], ['Reading', detail.stats.reading], ['Favorites', detail.stats.favorites], ['Comments', detail.stats.comments], ['Sessions', detail.stats.sessions]].map(([l, v]) => (
                <div key={l} className="stat"><div className="stat-num">{v}</div><div className="muted small">{l}</div></div>
              ))}
            </div>
            <div className="mt-16 small">
              <div className="muted">Date of birth: {detail.user.date_of_birth || '—'} (private)</div>
              <div className="muted">Last login: {fmtDate(detail.user.last_login_at)}</div>
            </div>
            <h3 className="mt-16" style={{ fontSize: 15 }}>Recent audit entries</h3>
            {detail.activity.length === 0 && <p className="muted small">No admin actions recorded for this user.</p>}
            {detail.activity.map((a, i) => (
              <div key={i} className="small" style={{ padding: '4px 0' }}>{a.action} {a.entity} {a.detail && `— ${a.detail}`} <span className="muted">{fmtDate(a.created_at)}</span></div>
            ))}
          </div>
        )}
      </Modal>

      <Confirm open={!!confirm} text={confirm?.label} onCancel={() => setConfirm(null)} onConfirm={confirm?.run} />
    </div>
  );
}

/* ── taxonomy ───────────────────────────────────────────────────────── */
export function AdminTaxonomy() {
  const [genres, setGenres] = useState(null);
  const [cats, setCats] = useState(null);
  const [err, setErr] = useState(null);
  const [gName, setGName] = useState('');
  const [gKind, setGKind] = useState('all');
  const [cName, setCName] = useState('');
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    Promise.all([api.get('/admin/genres'), api.get('/admin/categories')])
      .then(([g, c]) => { setGenres(g.genres); setCats(c.categories); })
      .catch(setErr);
  }, []);
  useEffect(() => { load(); }, [load]);

  const addGenre = async (e) => {
    e.preventDefault();
    try { await api.post('/admin/genres', { name: gName, kind: gKind }); setGName(''); load(); } catch (e2) { setErr(e2); }
  };
  const renameGenre = async (g) => {
    const name = window.prompt('Rename genre:', g.name);
    if (!name) return;
    await api.put(`/admin/genres/${g.id}`, { name, kind: g.kind });
    load();
  };
  const delGenre = (g) => setConfirm({ label: `Delete genre “${g.name}”? Titles keep existing but lose this tag.`, run: async () => { await api.del(`/admin/genres/${g.id}`); setConfirm(null); load(); } });
  const addCat = async (e) => {
    e.preventDefault();
    try { await api.post('/admin/categories', { name: cName }); setCName(''); load(); } catch (e2) { setErr(e2); }
  };
  const delCat = (c) => setConfirm({ label: `Delete category “${c.name}”?`, run: async () => { await api.del(`/admin/categories/${c.id}`); setConfirm(null); load(); } });

  return (
    <div className="admin-pad">
      <h1>Genres & Categories</h1>
      {err && <ErrorState title="Could not load taxonomy" text={err.message} retry={load} />}
      <div className="spread mt-24" style={{ flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div className="admin-card grow" style={{ minWidth: 320 }}>
          <h3>Genres</h3>
          <form onSubmit={addGenre} className="row" style={{ gap: 8 }}>
            <input className="input input-sm grow" placeholder="New genre name…" value={gName} onChange={(e) => setGName(e.target.value)} />
            <select className="input input-sm" style={{ width: 100 }} value={gKind} onChange={(e) => setGKind(e.target.value)}>
              <option value="all">all</option><option value="film">film</option><option value="novel">novel</option>
            </select>
            <button className="btn btn-primary btn-sm" disabled={gName.trim().length < 2}>Add</button>
          </form>
          <div className="mt-16">
            {(genres || []).map((g) => (
              <div key={g.id} className="row small" style={{ padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="grow">{g.name}</span>
                <span className="muted">{g.kind} · used {g.usage_count}×</span>
                <button className="btn btn-ghost btn-sm" onClick={() => renameGenre(g)}>Rename</button>
                <button className="btn btn-danger btn-sm" onClick={() => delGenre(g)}>✕</button>
              </div>
            ))}
          </div>
        </div>
        <div className="admin-card grow" style={{ minWidth: 320 }}>
          <h3>Categories</h3>
          <form onSubmit={addCat} className="row" style={{ gap: 8 }}>
            <input className="input input-sm grow" placeholder="New category name…" value={cName} onChange={(e) => setCName(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={cName.trim().length < 2}>Add</button>
          </form>
          <div className="mt-16">
            {(cats || []).map((c) => (
              <div key={c.id} className="row small" style={{ padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="grow">{c.name}</span>
                <span className="muted">{c.kind}</span>
                <button className="btn btn-danger btn-sm" onClick={() => delCat(c)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Confirm open={!!confirm} text={confirm?.label} onCancel={() => setConfirm(null)} onConfirm={confirm?.run} />
    </div>
  );
}

/* ── reports ────────────────────────────────────────────────────────── */
export function AdminReports() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => { setErr(null); setD(null); api.get('/admin/reports').then(setD).catch(setErr); }, []);
  useEffect(() => { load(); }, [load]);
  const resolve = async (id) => { await api.put(`/admin/reports/${id}/resolve`, {}); load(); };

  if (err) return <div className="admin-pad"><ErrorState title="Could not load reports" text={err.message} retry={load} /></div>;
  if (!d) return <div className="admin-pad"><Loading label="Loading reports…" /></div>;
  const k = d.kpi || {};

  return (
    <div className="admin-pad">
      <h1>Reports</h1>
      <div className="kpi-grid mt-16">
        {[['New users (30d)', k.new_users], ['Watch events (30d)', k.watch_events], ['Reading events (30d)', k.reading_events], ['Comments (30d)', k.comments]].map(([l, v]) => (
          <div key={l} className="kpi"><div className="kpi-num">{v ?? 0}</div><div className="kpi-label">{l}</div></div>
        ))}
      </div>
      <div className="spread mt-24" style={{ flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div className="admin-card grow" style={{ minWidth: 300 }}>
          <h3>Top titles by views</h3>
          {d.top_titles.map((t) => (
            <div key={t.id} className="row small" style={{ padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className={`badge-k ${t.kind}`}>{t.kind}</span>
              <span className="grow ellipsis">{t.name}</span>
              <span className="muted">{t.views.toLocaleString()} views</span>
            </div>
          ))}
        </div>
        <div className="admin-card grow" style={{ minWidth: 300 }}>
          <h3>Top novels by views</h3>
          {d.top_novels.map((n) => (
            <div key={n.id} className="row small" style={{ padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="badge-k novel">novel</span>
              <span className="grow ellipsis">{n.name}</span>
              <span className="muted">{n.views.toLocaleString()} views</span>
            </div>
          ))}
        </div>
      </div>
      <div className="admin-card mt-24">
        <h3>User reports</h3>
        {d.reports.length === 0 && <p className="muted small">No open reports. The moderation queue is clear.</p>}
        {d.reports.map((r) => (
          <div key={r.id} className="row small" style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <span className={`badge-k ${r.status === 'resolved' ? 'completed' : 'ongoing'}`}>{r.status}</span>
            <span className="grow">{r.reason}{r.detail ? ` — ${r.detail}` : ''}</span>
            <span className="muted">{r.user_name || 'anonymous'} · {fmtDate(r.created_at)}</span>
            {r.status !== 'resolved' && <button className="btn btn-ghost btn-sm" onClick={() => resolve(r.id)}>Resolve</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── settings ───────────────────────────────────────────────────────── */
export function AdminSettings() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setErr(null); api.get('/admin/settings').then((d) => setS(d.settings)).catch(setErr); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      await api.put('/admin/settings', s);
      setMsg('Settings saved.');
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  };

  if (err && !s) return <div className="admin-pad"><ErrorState title="Could not load settings" text={err.message} retry={load} /></div>;
  if (!s) return <div className="admin-pad"><Loading label="Loading settings…" /></div>;

  const FIELDS = [
    ['site_name', 'Site name'], ['tagline', 'Tagline'], ['support_email', 'Support email'],
    ['min_password_length', 'Min password length'], ['rate_limit_per_15min', 'Login attempts / 15 min'],
    ['content_maturity_default', 'Default age rating'], ['allow_registration', 'Allow registration (true/false)'],
  ];

  return (
    <div className="admin-pad">
      <h1>Settings</h1>
      <form onSubmit={save} className="admin-card mt-16" style={{ maxWidth: 560 }}>
        {FIELDS.map(([key, label]) => (
          <div className="field" key={key}>
            <label>{label}</label>
            <input className="input" value={s[key] ?? ''} onChange={(e) => setS({ ...s, [key]: e.target.value })} />
          </div>
        ))}
        {msg && <div className="form-ok">{msg}</div>}
        <button className="btn btn-primary mt-16" disabled={busy}>{busy ? <Spinner size={16} /> : 'Save settings'}</button>
      </form>
      <p className="muted small mt-16" style={{ maxWidth: 560 }}>
        TMDB credentials are read from the server environment only (TMDB_API_KEY / TMDB_ACCESS_TOKEN in <code>.env</code>) and are never exposed here.
      </p>
    </div>
  );
}
