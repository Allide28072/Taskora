import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components.jsx';
import { useT } from '../i18n.jsx';

const WIDTHS = { narrow: 640, medium: 760, wide: 900 };

export default function Reader() {
  const t = useT();
  const { slug, num } = useParams();
  const nav = useNavigate();
  const [novel, setNovel] = useState(null);
  const [ch, setCh] = useState(null);
  const [err, setErr] = useState(null);
  const [panel, setPanel] = useState(false);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('tf_reader_font') || 18));
  const [width, setWidth] = useState(() => localStorage.getItem('tf_reader_width') || 'medium');
  const [mode, setMode] = useState(() => localStorage.getItem('tf_reader_mode') || 'dark');
  const [pct, setPct] = useState(0);
  const [list, setList] = useState(null);
  const lastSaved = useRef(0);
  const articleRef = useRef(null);

  const n = Number(num) || 1;

  // load novel meta + chapter list once
  useEffect(() => {
    api.get(`/novel/${slug}`).then((d) => setNovel(d.novel)).catch(() => {});
  }, [slug]);

  const loadChapter = useCallback(() => {
    setErr(null); setCh(null); setPct(0); lastSaved.current = 0;
    api.get(`/novel/${slug}/chapter/${n}`)
      .then((d) => {
        setCh(d.chapter);
        window.scrollTo({ top: 0 });
        // restore saved scroll for this chapter
        const target = novel?.continue_reading;
        if (target && target.chapter_number === n && target.scroll > 3) {
          requestAnimationFrame(() => {
            const h = document.documentElement.scrollHeight - window.innerHeight;
            if (h > 0) window.scrollTo({ top: (target.scroll / 100) * h });
          });
        }
      })
      .catch(setErr);
  }, [slug, n, novel?.continue_reading]);

  useEffect(() => { loadChapter(); }, [loadChapter]);

  // persist reading progress on scroll (throttled)
  useEffect(() => {
    if (!ch || !novel) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement.scrollHeight - window.innerHeight;
        const p = h > 0 ? Math.min(100, Math.max(0, (window.scrollY / h) * 100)) : 0;
        setPct(p);
        if (Math.abs(p - lastSaved.current) >= 5) {
          lastSaved.current = p;
          api.post('/user/progress/read', { novel_id: novel.id, chapter_number: ch.number, scroll: Math.round(p) }).catch(() => {});
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [ch, novel]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft' && ch?.has_prev) nav(`/novel/${slug}/read/${n - 1}`);
      if (e.key === 'ArrowRight' && ch?.has_next) nav(`/novel/${slug}/read/${n + 1}`);
      if (e.key === 'Escape') setPanel(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ch, nav, slug, n]);

  if (err) return <div className="container" style={{ paddingTop: 100 }}><ErrorState title={t('Chapter unavailable')} text={err.message} retry={loadChapter} /></div>;
  if (!ch) return <Loading label={t('Loading chapter…')} />;

  const para = String(ch.content || '').split(/\n+/).filter(Boolean);

  return (
    <div className={`reader reader-${mode}`}>
      {/* top bar */}
      <div className="reader-top">
        <Link className="btn btn-ghost btn-sm" to={`/novel/${slug}`}>← {novel?.name || t('Novel')}</Link>
        <span className="muted small ellipsis" style={{ maxWidth: '40vw' }}>{ch.name}</span>
        <div className="grow" />
        <button className="btn btn-ghost btn-sm" aria-label={t('Reader settings')} onClick={() => setPanel(!panel)}>Aa</button>
      </div>

      {panel && (
        <div className="reader-panel">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="small muted" style={{ width: 70 }}>{t('Font size')}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { const v = Math.max(14, fontSize - 1); setFontSize(v); localStorage.setItem('tf_reader_font', v); }}>A−</button>
            <span className="small" style={{ width: 26, textAlign: 'center' }}>{fontSize}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { const v = Math.min(26, fontSize + 1); setFontSize(v); localStorage.setItem('tf_reader_font', v); }}>A+</button>
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
            <span className="small muted" style={{ width: 70 }}>{t('Width')}</span>
            {Object.keys(WIDTHS).map((k) => (
              <button key={k} className={`chip${width === k ? ' chip-active' : ''}`} style={{ cursor: 'pointer' }}
                onClick={() => { setWidth(k); localStorage.setItem('tf_reader_width', k); }}>{t(k)}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
            <span className="small muted" style={{ width: 70 }}>{t('Mode')}</span>
            {['dark', 'sepia', 'light'].map((m) => (
              <button key={m} className={`chip${mode === m ? ' chip-active' : ''}`} style={{ cursor: 'pointer' }}
                onClick={() => { setMode(m); localStorage.setItem('tf_reader_mode', m); }}>{t(m)}</button>
            ))}
          </div>
        </div>
      )}

      <article ref={articleRef} className="reader-article" style={{ maxWidth: WIDTHS[width], fontSize }}>
        <div className="reader-head">
          <div className="small muted">{novel?.name || ''}</div>
          <h1>{t('Chapter {n}', { n: ch.number })}</h1>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{ch.name}</div>
        </div>
        {para.map((p, i) => <p key={i}>{p}</p>)}
      </article>

      {/* bottom bar */}
      <div className="reader-bottom">
        {ch.has_prev
          ? <button className="btn btn-ghost btn-sm" onClick={() => nav(`/novel/${slug}/read/${n - 1}`)}>← Prev</button>
          : <span />}
        <span className="small muted">{Math.round(pct)}%</span>
        {ch.has_next
          ? <button className="btn btn-primary btn-sm" onClick={() => nav(`/novel/${slug}/read/${n + 1}`)}>Next →</button>
          : <span className="chip">The end ✦</span>}
      </div>
    </div>
  );
}
