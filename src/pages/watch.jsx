import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, ErrorState, EmptyState, fmtTime, fmtRuntime, Art, VideoPlayer, isEmbedUrl as isEmbed } from '../components.jsx';
import { useT } from '../i18n.jsx';

// `t` is the loaded title here, so the translator is named `tr`.
export default function Watch() {
  const tr = useT();
  const { slug, episodeId } = useParams();
  const nav = useNavigate();
  const [t, setT] = useState(null);
  const [ep, setEp] = useState(null);
  const [err, setErr] = useState(null);
  const [nextEp, setNextEp] = useState(null);
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const lastSaved = useRef(0);
  const [tick, setTick] = useState(0); // re-render clock for control labels

  const load = useCallback(async () => {
    setErr(null); setT(null); setEp(null);
    try {
      const d = await api.get(`/title/${slug}`);
      const title = d.title;
      setT(title);
      if (title.kind === 'movie') {
        setEp({
          id: 0, number: 1, name: title.name, description: title.description,
          duration: title.runtime * 60, still: title.backdrop,
          video_url: title.has_video ? title.video_url : null, has_video: !!title.has_video, video_url_raw: title.video_url,
        });
        setNextEp(null);
      } else {
        let target = null;
        if (episodeId) {
          for (const s of title.seasons || []) {
            const f = s.episodes.find((x) => String(x.id) === String(episodeId));
            if (f) { target = { ...f, season_number: s.number }; break; }
          }
        } else if (title.resume?.episode_id) {
          for (const s of title.seasons || []) {
            const f = s.episodes.find((x) => x.id === title.resume.episode_id);
            if (f) { target = { ...f, season_number: s.number }; break; }
          }
        }
        target = target || title.seasons?.[0]?.episodes?.[0] || null;
        setEp(target ? { ...target, has_video: !!target.video_url } : null);
        if (target) {
          const flat = (title.seasons || []).flatMap((s) => s.episodes.map((e) => ({ ...e, season_number: s.number })));
          const idx = flat.findIndex((e) => e.id === target.id);
          setNextEp(flat[idx + 1] || null);
        } else setNextEp(null);
      }
    } catch (e) { setErr(e); }
  }, [slug, episodeId]);

  useEffect(() => { load(); }, [load]);

  // persist watch progress
  const save = useCallback(async (position, duration, force = false) => {
    if (!t || !ep) return;
    // Checkpoint every few seconds (and whenever playback pauses) so short
    // clips resume correctly too, not just feature-length runs.
    if (!force && Math.abs(position - lastSaved.current) < 4) return;
    lastSaved.current = position;
    try {
      await api.post('/user/progress/watch', {
        title_id: t.id, episode_id: ep.id || 0,
        position: Math.floor(position), duration: Math.floor(duration || ep.duration || 0),
      });
    } catch { /* keep playing even if offline */ }
  }, [t, ep]);

  // wire save onto the video element (timeupdate + unmount)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !ep?.has_video) return;
    const onTime = () => save(v.currentTime, v.duration);
    v.addEventListener('timeupdate', onTime);
    const onTick = () => setTick((x) => x + 1); // update seek/time labels
    v.addEventListener('timeupdate', onTick);
    const onEnded = () => save(v.duration, v.duration, true);
    const onPause = () => { if (v.currentTime > 0 && v.currentTime < v.duration) save(v.currentTime, v.duration, true); };
    v.addEventListener('ended', onEnded);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('timeupdate', onTick);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('pause', onPause);
      if (v.currentTime > 5) save(v.currentTime, v.duration, true);
    };
  }, [save, ep?.has_video, ep?.id]);

  if (err) return <div className="container" style={{ paddingTop: 100 }}><ErrorState title={tr('Playback unavailable')} text={err.message} retry={load} /></div>;
  if (!t) return <Loading label={tr('Loading player…')} />;
  if (!ep) return (
    <div className="container" style={{ paddingTop: 100 }}>
      <EmptyState icon="🎬" title={tr('No episodes yet')} text={tr('This series has no episodes published.')}
        action={<Link className="btn btn-primary" to={`/title/${t.slug}`}>Back to details</Link>} />
    </div>
  );

  const resume = ep.id
    ? (t.resume?.episode_id === ep.id ? t.resume : null)
    : (t.resume?.episode_id ? null : t.resume);

  const v = videoRef.current;
  const markWatched = async (gotoNext = false) => {
    await save(ep.duration || 1, ep.duration || 1, true);
    if (gotoNext && nextEp) nav(`/watch/${t.slug}/${nextEp.id}`);
  };

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <div className="row mb-16">
        <Link className="btn btn-ghost btn-sm" to={`/title/${t.slug}`}>← Details</Link>
        <div className="grow" />
        {nextEp && (
          <button className="btn btn-violet btn-sm" onClick={() => nav(`/watch/${t.slug}/${nextEp.id}`)}>
            Next: E{nextEp.number} →
          </button>
        )}
      </div>

      <div className="player-shell" ref={shellRef}>
        {ep.has_video && isEmbed({ video_url: ep.video_url }) ? (
          <div className="player-embed">
            <VideoPlayer src={ep.video_url} autoPlay />
            <button className="btn btn-ghost btn-sm mt-12" onClick={() => { save(ep.duration || 0, true); nav(0); }}>✓ Mark this episode watched</button>
          </div>
        ) : ep.has_video ? (
          <>
            <video
              key={`${t.id}-${ep.id}`}
              ref={videoRef}
              src={ep.video_url}
              poster={ep.still}
              controls={false}
              playsInline
              onLoadedMetadata={(e) => {
                const vv = e.currentTarget;
                if (resume?.position && resume.position < (vv.duration || Infinity) - 10) vv.currentTime = resume.position;
                setTick((x) => x + 1);
              }}
              onClick={() => { const el = videoRef.current; if (el) el.paused ? el.play() : el.pause(); }}
            />
            <div className="player-controls">
              <input
                type="range" className="pc-range" aria-label={tr('Seek')} min={0} max={v?.duration || 0} step={1} value={v?.currentTime || 0}
                onChange={(e) => { const el = videoRef.current; if (el) el.currentTime = Number(e.target.value); }}
                style={{ '--pct': `${v?.duration ? ((v.currentTime / v.duration) * 100) : 0}%` }}
              />
              <div className="pc-row">
                <button className="pc-btn" aria-label={v?.paused ? tr('Play') : tr('Pause')}
                  onClick={() => { const el = videoRef.current; if (el) el.paused ? el.play() : el.pause(); }}>
                  {v?.paused ? '▶' : '⏸'}
                </button>
                <button className="pc-btn" aria-label={tr('Back 10 seconds')} onClick={() => { const el = videoRef.current; if (el) el.currentTime = Math.max(0, el.currentTime - 10); }}>−10s</button>
                <button className="pc-btn" aria-label={tr('Forward 10 seconds')} onClick={() => { const el = videoRef.current; if (el) el.currentTime = el.currentTime + 10; }}>+10s</button>
                <span className="pc-time">{fmtTime(v?.currentTime)} / {fmtTime(v?.duration)}</span>
                <div className="grow" />
                <button className="pc-btn" aria-label={tr('Mute toggle')} onClick={() => { const el = videoRef.current; if (el) el.muted = !el.muted; }}>{v?.muted ? '🔇' : '🔊'}</button>
                <input type="range" className="pc-range pc-vol" aria-label={tr('Volume')} min={0} max={1} step={0.05} value={v?.muted ? 0 : (v?.volume ?? 1)}
                  onChange={(e) => { const el = videoRef.current; if (el) { el.volume = Number(e.target.value); el.muted = false; } }} />
                <button className="pc-btn" aria-label={tr('Fullscreen')} onClick={() => {
                  if (document.fullscreenElement) document.exitFullscreen();
                  else shellRef.current?.requestFullscreen?.();
                }}>⛶</button>
              </div>
            </div>
          </>
        ) : (
          <div className="player-poster">
            <div style={{ fontSize: 44 }} aria-hidden>⚡</div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{ep.name}</h3>
            <p className="muted" style={{ maxWidth: 480, margin: 0 }}>
              {t.kind === 'movie'
                ? tr('No stream is attached to this movie yet. Administrators connect a licensed video source in Admin → Content.')
                : tr('No stream is attached to this episode yet. Administrators connect a licensed video source in Admin → Content → Episodes.')}
            </p>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              {t.kind !== 'movie'
                ? <button className="btn btn-primary" onClick={() => markWatched(true)}>✓ Mark watched & next episode</button>
                : <button className="btn btn-primary" onClick={() => markWatched(false)}>✓ Mark as watched</button>}
              <Link className="btn btn-ghost" to={`/title/${t.slug}`}>View details</Link>
            </div>
          </div>
        )}
      </div>

      <div className="spread mt-16" style={{ flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 250 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '6px 0' }}>{t.name}</h1>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span className={`badge-k ${t.kind}`}>{t.kind.toUpperCase()}</span>
            {t.year && <span className="chip">{t.year}</span>}
            <span className="chip chip-rating">★ {Number(t.rating || 0).toFixed(1)}</span>
            {ep.id
              ? <span className="chip">S{ep.season_number} · E{ep.number} — {ep.name}</span>
              : <span className="chip">{fmtRuntime(t.runtime)}</span>}
          </div>
          <p className="muted mt-8">{ep.description || t.description}</p>
        </div>
        <div style={{ width: 270 }}>
          <h3 className="small" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-2)' }}>
            {t.kind === 'movie' ? tr('About this movie') : tr('Episodes')}
          </h3>
          {t.kind !== 'movie' && (t.seasons || []).slice(0, 2).map((s) => (
            <div key={s.id} className="mb-8">
              <div className="small muted mt-8 mb-8">{s.name || `Season ${s.number}`}</div>
              {s.episodes.slice(0, 8).map((e) => (
                <Link key={e.id} to={`/watch/${t.slug}/${e.id}`}
                  className={`row panel ep-row${e.id === ep.id ? ' ep-active' : ''}`} style={{ padding: 8, marginBottom: 6 }}>
                  <Art src={e.still} fallback={e.still_fallback} style={{ width: 84, borderRadius: 6, flexShrink: 0 }} />
                  <div className="small grow" style={{ fontWeight: 700 }}>{e.number}. {e.name}</div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
