import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { I18nProvider, useT, LanguageSwitcher } from './i18n.jsx';
import { Spinner, Loading, Footer } from './components.jsx';
import './styles.css';

import { Login, Register, Forgot, Reset, Verify } from './pages/auth.jsx';
import Home from './pages/home.jsx';
import Catalog from './pages/catalog.jsx';
import Novels from './pages/novels.jsx';
import TitleDetail from './pages/title.jsx';
import Watch from './pages/watch.jsx';
import NovelDetail from './pages/novel.jsx';
import Reader from './pages/reader.jsx';
import SearchPage from './pages/search.jsx';
import MyList from './pages/mylist.jsx';
import History from './pages/history.jsx';
import Profile from './pages/profile.jsx';
import Notifications from './pages/notifications.jsx';
import { Info } from './pages/info.jsx';
import { AdminLayout, AdminDashboard, AdminContent, AdminNovels, AdminUsers, AdminTaxonomy, AdminReports, AdminSettings } from './pages/admin.jsx';

/* ── splash ───────────────────────────────────────────────────────── */
function Splash({ done }) {
  const [fading, setFading] = useState(false);
  useEffect(() => { if (done) { const t = setTimeout(() => setFading(true), 60); return () => clearTimeout(t); } }, [done]);
  if (fading && done) return null;
  return (
    <div className={`splash${done ? ' done' : ''}`} aria-hidden={done}>
      <div className="splash-logo">𝓕𝓛𝓐𝓢𝓗</div>
      <div className="splash-bar"><i /></div>
    </div>
  );
}

/* ── guards ───────────────────────────────────────────────────────── */
function RequireAuth({ children }) {
  const { user, booting } = useAuth();
  const loc = useLocation();
  if (booting) return <Splash done={false} />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}
function RequireAdmin({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <Splash done={false} />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/home" replace />;
  return children;
}
function PublicOnly({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <Splash done={false} />;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/home'} replace />;
  return children;
}
function Root() {
  const { user, booting } = useAuth();
  if (booting) return <Splash done={false} />;
  return <Navigate to={user ? (user.role === 'admin' ? '/admin/dashboard' : '/home') : '/login'} replace />;
}

/* ── scroll restore ───────────────────────────────────────────────── */
function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

/* ── shell for user pages ─────────────────────────────────────────── */
// `k` is the English source string, which is also the translation key — see
// src/strings.js. Nothing here is a label until t() resolves it.
const TOP_LINKS = [
  { to: '/home', k: 'Home' }, { to: '/movies', k: 'Movies' },
  { to: '/series', k: 'Series' }, { to: '/anime', k: 'Anime' },
  { to: '/novels', k: 'Novels' },
];
const MOBILE_LINKS = [
  { to: '/home', k: 'Home', ic: '⌂' }, { to: '/novels', k: 'Novels', ic: '📖' },
  { to: '/search', k: 'Search', ic: '⌕' }, { to: '/my-list', k: 'My List', ic: '✚' },
  { to: '/profile', k: 'Profile', ic: '☺' },
];

export function Shell({ children }) {
  const { user, unread } = useAuth();
  const t = useT();
  const [scrolled, setScrolled] = useState(false);
  // The player and the reader stay immersive — no footer under the story itself.
  const { pathname } = useLocation();
  const showFooter = !/^\/watch\//.test(pathname) && !/^\/novel\/[^/]+\/read\//.test(pathname);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div>
      <nav className={`nav${scrolled ? ' scrolled' : ''}`}>
        <div className="nav-inner">
          <Link to="/home" className="logo" aria-label={t('THE FLASH home')}>𝓕𝓛𝓐𝓢𝓗</Link>
          <div className="nav-links hide-mobile">
            {TOP_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>{t(l.k)}</NavLink>
            ))}
            {user?.role === 'admin' && (
              <NavLink to="/admin/dashboard" className={({ isActive }) => `nav-link admin-entry${isActive ? ' active' : ''}`}>
                <span aria-hidden>🛠</span> {t('Admin')}
              </NavLink>
            )}
          </div>
          <div className="nav-right">
            <Link to="/search" className="btn btn-ghost btn-sm hide-mobile" aria-label={t('Search')}>⌕ {t('Search')}</Link>
            <LanguageSwitcher />
            <Link to="/notifications" className="btn btn-ghost btn-sm bell" aria-label={t('Notifications')}>
              🔔{unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            <Link to="/profile" aria-label={t('Your profile')}>
              {user?.profile_image
                ? <img className="avatar" src={user.profile_image} alt="" />
                : <span className="avatar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--text)' }}>{(user?.name || 'F')[0]?.toUpperCase()}</span>}
            </Link>
          </div>
        </div>
      </nav>
      <main style={{ paddingTop: 64, paddingBottom: 90 }}>{children}</main>
      {showFooter && <Footer />}
      <nav className="bottomnav hide-desktop" aria-label={t('Primary')}>
        {MOBILE_LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ic" aria-hidden>{l.ic}</span>{t(l.k)}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink to="/admin/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ic" aria-hidden>🛠</span>{t('Admin')}
          </NavLink>
        )}
      </nav>
    </div>
  );
}

function NotFound() {
  const t = useT();
  return (
    <Shell>
      <div className="container">
        <div className="state" style={{ marginTop: 80 }}>
          <div className="state-icon">⚡</div>
          <h3>{t('Lost in the stream')}</h3>
          <p>{t('The page you are looking for does not exist or has moved.')}</p>
          <Link className="btn btn-primary" to="/home">{t('Back to Home')}</Link>
        </div>
      </div>
    </Shell>
  );
}

function App() {
  const { booting } = useAuth();
  const [minSplash, setMinSplash] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMinSplash(true), 1300); return () => clearTimeout(t); }, []);
  return (
    <>
      <Splash done={!booting && minSplash} />
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="/forgot" element={<PublicOnly><Forgot /></PublicOnly>} />
        <Route path="/reset" element={<PublicOnly><Reset /></PublicOnly>} />
        {/* Not wrapped in PublicOnly: a signed-in visitor following a link should
            land on the confirmation screen rather than a redirect. */}
        <Route path="/verify" element={<Verify />} />

        <Route path="/home" element={<RequireAuth><Shell><Home /></Shell></RequireAuth>} />
        <Route path="/movies" element={<RequireAuth><Shell><Catalog kind="movie" /></Shell></RequireAuth>} />
        <Route path="/series" element={<RequireAuth><Shell><Catalog kind="series" /></Shell></RequireAuth>} />
        <Route path="/anime" element={<RequireAuth><Shell><Catalog kind="anime" /></Shell></RequireAuth>} />
        <Route path="/novels" element={<RequireAuth><Shell><Novels /></Shell></RequireAuth>} />
        <Route path="/search" element={<RequireAuth><Shell><SearchPage /></Shell></RequireAuth>} />
        <Route path="/my-list" element={<RequireAuth><Shell><MyList /></Shell></RequireAuth>} />
        <Route path="/history" element={<RequireAuth><Shell><History /></Shell></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Shell><Profile /></Shell></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Shell><Notifications /></Shell></RequireAuth>} />
        <Route path="/info/:slug" element={<RequireAuth><Shell><Info /></Shell></RequireAuth>} />
        <Route path="/title/:slug" element={<RequireAuth><Shell><TitleDetail /></Shell></RequireAuth>} />
        <Route path="/watch/:slug" element={<RequireAuth><Shell><Watch /></Shell></RequireAuth>} />
        <Route path="/watch/:slug/:episodeId" element={<RequireAuth><Shell><Watch /></Shell></RequireAuth>} />
        <Route path="/novel/:slug" element={<RequireAuth><Shell><NovelDetail /></Shell></RequireAuth>} />
        <Route path="/novel/:slug/read/:num" element={<RequireAuth><Shell><Reader /></Shell></RequireAuth>} />

        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="novels" element={<AdminNovels />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="taxonomy" element={<AdminTaxonomy />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
);

// hide the index.html boot overlay once react is live
document.getElementById('boot')?.classList.add('done');
