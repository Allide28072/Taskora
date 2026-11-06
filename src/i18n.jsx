import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LANGS, DEFAULT_LANG, STRINGS, FULL_TRANSLATIONS, translate, translateNotice, isLang } from './strings.js';

const STORE_KEY = 'tf_lang';

/**
 * The active language lives in a module-level variable as well as in React
 * state, because the API client builds its error messages outside the React
 * tree and needs to answer in the right language immediately — including before
 * React has mounted.
 */
let active = DEFAULT_LANG;

/** Best guess before the provider mounts: saved choice, then browser language. */
function initialLang() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (isLang(saved)) return saved;
    const tags = [navigator.language, ...(navigator.languages || [])].filter(Boolean).map(String);
    // A full tag wins first, so an en-GB browser lands on British English rather
    // than the generic English it would otherwise fall back to.
    for (const tag of tags) {
      const exact = LANGS.find((l) => l.code.toLowerCase() === tag.toLowerCase());
      if (exact) return exact.code;
    }
    // Then the base language: pt-BR → Portuguese, fr-CA → French.
    for (const tag of tags) {
      const base = tag.slice(0, 2).toLowerCase();
      if (isLang(base)) return base;
    }
  } catch { /* private mode, no storage */ }
  return DEFAULT_LANG;
}
active = initialLang();

/** Translate using the current language, for code outside React. */
export const tNow = (key, vars) => translate(active, key, vars);

export const getLang = () => active;

const I18nCtx = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(active);

  const setLang = useCallback((code) => {
    if (!isLang(code)) return;
    active = code;
    try { localStorage.setItem(STORE_KEY, code); } catch { /* ignore */ }
    setLangState(code);
  }, []);

  // Keep <html lang> honest — screen readers and translation tooling read it.
  useEffect(() => {
    active = lang;
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  const tNotice = useCallback((message) => translateNotice(lang, message), [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t, tNotice, langs: LANGS, translated: FULL_TRANSLATIONS }),
    [lang, setLang, t, tNotice],
  );
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

/** Read the whole i18n context. Safe to call outside the provider (falls back to English). */
export function useI18n() {
  return useContext(I18nCtx) || {
    lang: DEFAULT_LANG, setLang: () => {}, t: (k, v) => translate(DEFAULT_LANG, k, v),
    tNotice: (m) => m, langs: LANGS, translated: [],
  };
}

/** Just the translate function — the common case. */
export function useT() {
  return useI18n().t;
}

/* ── the switcher ───────────────────────────────────────────────────── */

/**
 * Language picker. `variant="nav"` sits in the top bar as a globe + code,
 * `variant="block"` is the labelled row used in Profile settings and on the
 * sign-in screen.
 */
export function LanguageSwitcher({ variant = 'nav' }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const current = LANGS.find((l) => l.code === lang) || LANGS[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (code) => { setLang(code); setOpen(false); };

  return (
    <div className={`lang-switch lang-${variant}`} ref={box}>
      <button
        type="button"
        className={variant === 'block' ? 'btn btn-ghost btn-sm lang-btn' : 'btn btn-ghost btn-sm lang-btn'}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('Interface language')}
        title={t('Interface language')}
      >
        <span aria-hidden>🌐</span>
        <span className="lang-code">{variant === 'block' ? current.native : current.short}</span>
        <span className="lang-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="lang-menu" role="listbox" aria-label={t('Language')}>
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === lang}
              className={`lang-item${l.code === lang ? ' on' : ''}`}
              onClick={() => choose(l.code)}
            >
              <span className="lang-native">{l.native}</span>
              <span className="lang-name">{t(l.name)}</span>
              {l.code === lang && <span className="lang-tick" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
