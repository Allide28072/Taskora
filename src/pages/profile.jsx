import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { TitleCard, NovelCard, Rail, Loading, ErrorState, EmptyState, fmtDate, Spinner } from '../components.jsx';
import { ResendLink } from './auth.jsx';
import { useT } from '../i18n.jsx';

function Section({ title, children }) {
  return (
    <div className="panel mt-16" style={{ padding: 18 }}>
      <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>{title}</h3>
      {children}
    </div>
  );
}

export default function Profile() {
  const t = useT();
  const { user, updateProfile, changePassword, logout } = useAuth();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [cw, setCw] = useState([]);
  const [cr, setCr] = useState([]);
  const [load1, setLoad1] = useState(true);
  const [err1, setErr1] = useState(null);

  // settings state
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [pic, setPic] = useState(user?.profile_image || '');
  const [prefs, setPrefs] = useState(user?.prefs || { novels: false, anime: false, kids: false });
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy1, setBusy1] = useState(false);
  const [busy2, setBusy2] = useState(false);
  const [msg1, setMsg1] = useState('');
  const [msg2, setMsg2] = useState('');
  const [e1, setE1] = useState('');
  const [e2, setE2] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.get('/user/summary'), api.get('/user/continue-watching'), api.get('/user/continue-reading')])
      .then(([s, w, r]) => { if (alive) { setSummary(s); setCw(w.items); setCr(r.items); } })
      .catch((e) => { if (alive) setErr1(e); })
      .finally(() => { if (alive) setLoad1(false); });
    return () => { alive = false; };
  }, []);

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300_000) { setE1('Image must be under 300 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setPic(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const saveProfile = async (ev) => {
    ev.preventDefault(); setBusy1(true); setE1(''); setMsg1('');
    try {
      await updateProfile({ name, email, profile_image: pic, prefs });
      setMsg1('Profile saved.');
    } catch (e) { setE1(e.message); } finally { setBusy1(false); }
  };

  const savePassword = async (ev) => {
    ev.preventDefault(); setBusy2(true); setE2(''); setMsg2('');
    try {
      await changePassword(cur, next);
      setMsg2('Password changed.'); setCur(''); setNext('');
    } catch (e) { setE2(e.message); } finally { setBusy2(false); }
  };

  const doLogout = async () => {
    await logout();
    nav('/login', { replace: true });
  };

  if (!user) return null;

  return (
    <div className="container" style={{ paddingTop: 28 }}>
      {/* identity */}
      <div className="panel row" style={{ padding: 20, gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {pic
          ? <img className="avatar avatar-lg" src={pic} alt="" />
          : <span className="avatar avatar-lg" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>{(user.name || 'F')[0]?.toUpperCase()}</span>}
        <div className="grow" style={{ minWidth: 200 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>{user.name}</h1>
          <div className="muted">{user.email}</div>
          <div className="muted small mt-8">Member since {fmtDate(user.created_at)} · role: {user.role}</div>
          {user.email_verified === false && (
            <div className="notice" role="note" style={{ marginTop: 12 }}>
              <div>This email is not confirmed yet, so the account cannot be signed into from a new device. We sent a link to {user.email}.</div>
              <ResendLink email={user.email} />
            </div>
          )}
          {user.role === 'admin' && (
            <Link to="/admin/dashboard" className="btn btn-primary btn-sm mt-12">{t('🛠 Open admin console')}</Link>
          )}
        </div>
        <div className="row" style={{ gap: 22 }}>
          {[['Watching', summary?.watching], ['Reading', summary?.reading], ['Saved', summary?.favorites]].map(([label, v]) => (
            <div key={label} className="stat">
              <div className="stat-num">{v ?? '–'}</div>
              <div className="muted small">{t(label)}</div>
            </div>
          ))}
        </div>
      </div>

      {load1 && <Loading label={t('Loading profile…')} />}
      {err1 && <ErrorState title={t('Could not load activity')} text={err1.message} />}

      {!load1 && !err1 && (
        <>
          {cw.length > 0 && <div className="mt-24"><Rail title={t('Continue Watching')} items={cw} renderItem={(item) => <TitleCard key={item.id} t={item} progress={item.progress} episode={item.episode} />} /></div>}
          {cw.length === 0 && <div className="mt-24"><EmptyState icon="🎬" title={t('Nothing in progress')} text={t('Start a movie or series and it will show up here.')} action={<Link className="btn btn-primary" to="/home">{t('Browse titles')}</Link>} /></div>}
          {cr.length > 0 && <div className="mt-24"><Rail title={t('Continue Reading')} items={cr} renderItem={(n) => <NovelCard key={n.id} n={n} progress={n.progress} chapterLabel={t('Ch. {n} · {name}', { n: n.chapter_number, name: n.chapter_name })} />} /></div>}
        </>
      )}

      {/* settings */}
      <h2 className="mt-32" style={{ fontFamily: 'var(--font-display)' }}>{t('Settings')}</h2>
      <form onSubmit={saveProfile}>
        <Section title={t('Account details')}>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <div className="field grow" style={{ minWidth: 220 }}>
              <label htmlFor="pf-name">Name</label>
              <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field grow" style={{ minWidth: 220 }}>
              <label htmlFor="pf-email">Email</label>
              <input id="pf-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="row mt-16" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {pic && <img className="avatar" src={pic} alt="" />}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Upload picture…</button>
            {pic && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPic('')}>Remove picture</button>}
          </div>
          <div className="row mt-16" style={{ gap: 18, flexWrap: 'wrap' }}>
            <label className="check"><input type="checkbox" checked={!!prefs.novels} onChange={(e) => setPrefs({ ...prefs, novels: e.target.checked })} /> Show me novel recommendations</label>
            <label className="check"><input type="checkbox" checked={!!prefs.anime} onChange={(e) => setPrefs({ ...prefs, anime: e.target.checked })} /> Highlight anime</label>
            <label className="check"><input type="checkbox" checked={!!prefs.kids} onChange={(e) => setPrefs({ ...prefs, kids: e.target.checked })} /> Family-friendly content only</label>
          </div>
          {e1 && <div className="form-error mt-8">{e1}</div>}
          {msg1 && <div className="form-ok mt-8">{msg1}</div>}
          <button className="btn btn-primary mt-16" disabled={busy1}>{busy1 ? <Spinner size={16} /> : t('Save profile')}</button>
        </Section>
      </form>

      <form onSubmit={savePassword}>
        <Section title={t('Change password')}>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <div className="field grow" style={{ minWidth: 200 }}>
              <label htmlFor="pf-cur">Current password</label>
              <input id="pf-cur" className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="field grow" style={{ minWidth: 200 }}>
              <label htmlFor="pf-next">New password</label>
              <input id="pf-next" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          {e2 && <div className="form-error mt-8">{e2}</div>}
          {msg2 && <div className="form-ok mt-8">{msg2}</div>}
          <button className="btn btn-primary mt-16" disabled={busy2 || !cur || !next}>{busy2 ? <Spinner size={16} /> : t('Update password')}</button>
        </Section>
      </form>

      <Section title={t('Session')}>
        <p className="muted small">Sign out of THE FLASH on this device.</p>
        <button className="btn btn-danger" onClick={doLogout}>Log out</button>
      </Section>
    </div>
  );
}
