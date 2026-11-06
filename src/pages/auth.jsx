import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Spinner } from '../components.jsx';
import { LanguageSwitcher, useT } from '../i18n.jsx';

function AuthShell({ children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-glow a" /><div className="auth-glow b" />
      <div className="auth-card">
        {/* Reachable before an account exists, so the language can be chosen
            before anyone ever reaches the app itself. */}
        <div className="auth-lang"><LanguageSwitcher variant="block" /></div>
        {children}
      </div>
    </div>
  );
}

// Confirmation links are absolute URLs; the token is all we actually need.
function tokenOf(link) {
  if (!link) return '';
  try { return new URL(link, window.location.origin).searchParams.get('token') || ''; } catch { return ''; }
}

export function ResendLink({ email, onLink, onDelivered }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async () => {
    setBusy(true); setMsg('');
    try {
      const d = await api.post('/auth/resend-verification', { email });
      setMsg(d.throttled
        ? t('A link went out less than a minute ago — give it a moment before asking again.')
        : t('A fresh link is on its way. Check your inbox and your spam folder.'));
      if (d.dev_verify_link && onLink) onLink(d.dev_verify_link);
      if (d.mail_delivered !== undefined && onDelivered) onDelivered(d.mail_delivered);
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-12">
      <button type="button" className="linklike small" onClick={send} disabled={busy}>
        {busy ? t('Sending…') : t('Send a new confirmation link')}
      </button>
      {msg && <p className="small" style={{ color: 'var(--muted)', marginTop: 6 }}>{msg}</p>}
    </div>
  );
}

function VerificationPending({ email, delivered, devLink }) {
  const t = useT();
  const [link, setLink] = useState(devLink || '');
  const [sent, setSent] = useState(delivered);
  const token = tokenOf(link);
  // The address sits inside the sentence, so the translation is split around
  // the placeholder rather than pieced together from fragments.
  const [beforeEmail, afterEmail] = t('Almost there. We sent a confirmation link to {email}, and your account switches on the moment you open it.').split('{email}');
  return (
    <>
      <div className="form-ok" role="status">
        {beforeEmail}<strong>{email}</strong>{afterEmail}
      </div>
      {sent === false && (
        <div className="notice" role="note">
          {t('This server has no mail transport configured, so nothing actually left the machine.')}
        </div>
      )}
      {token && (
        <div className="panel" style={{ padding: 14, fontSize: 13 }}>
          <strong>{t('Development mode:')}</strong> {t('open the confirmation link directly.')}
          <div className="mt-8">
            <Link to={`/verify?token=${encodeURIComponent(token)}`} style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>
              {t('Confirm my email →')}
            </Link>
          </div>
        </div>
      )}
      <ResendLink email={email} onLink={setLink} onDelivered={setSent} />
      <div className="auth-foot">{t('Confirmed already?')} <Link to="/login"><button>{t('Login')}</button></Link></div>
    </>
  );
}

export function Login() {
  const t = useT();
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Two steps: the email decides whether this person needs a password or an account.
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [unverified, setUnverified] = useState('');

  const checkEmail = async (e) => {
    e.preventDefault();
    setErr('');
    const value = email.trim();
    if (!value) { setErr(t('Please enter your email address.')); return; }
    setBusy(true);
    try {
      const d = await api.post('/auth/lookup', { email: value });
      if (d.disabled) { setErr(t('This account has been disabled. Please contact support.')); return; }
      if (!d.exists) {
        // No account on file — hand the address to the sign-up screen.
        nav(`/register?email=${encodeURIComponent(value)}`, { replace: false });
        return;
      }
      setFirstName(d.first_name || '');
      setStep('password');
    } catch (e2) {
      setErr(e2.message);
    } finally { setBusy(false); }
  };

  const signIn = async (e) => {
    e.preventDefault();
    setErr('');
    if (!password) { setErr(t('Please enter your password.')); return; }
    setBusy(true);
    try {
      const d = await login(email.trim(), password);
      const target = loc.state?.from && !loc.state.from.startsWith('/admin') ? loc.state.from : d.redirect;
      nav(target, { replace: true });
    } catch (e2) {
      setErr(e2.message);
      // An unconfirmed address is a specific, fixable state — offer the resend.
      setUnverified(e2.code === 'email_unverified' ? email.trim().toLowerCase() : '');
    } finally { setBusy(false); }
  };

  const useDifferentEmail = () => {
    setStep('email');
    setPassword('');
    setErr('');
    setShow(false);
    setUnverified('');
  };

  return (
    <AuthShell>
      <div className="auth-logo">𝓕𝓛𝓐𝓢𝓗</div>
      {step !== 'email' && (
        <p className="auth-sub">{firstName ? t('Welcome back, {name}. Enter your password.', { name: firstName }) : t('Welcome back. Enter your password.')}</p>
      )}
      {err && <div className="form-error" role="alert">{err}</div>}
      {unverified && (
        <div className="notice" role="note">
          <div>{t('That account is still waiting on a confirmation link, so it cannot sign in yet.')}</div>
          <ResendLink email={unverified} />
        </div>
      )}

      {step === 'email' ? (
        <form onSubmit={checkEmail} noValidate>
          <div className="field">
            <label htmlFor="email">{t('Email')}</label>
            <input id="email" className="input" type="email" autoComplete="email" autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>
            {busy ? <Spinner size={16} /> : t('Continue')}
          </button>
        </form>
      ) : (
        <form onSubmit={signIn} noValidate>
          <div className="account-chip">
            <span className="acct-avatar">{(firstName || email)[0]?.toUpperCase()}</span>
            <span className="grow ellipsis">{email}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={useDifferentEmail}>{t('Change')}</button>
          </div>
          <div className="field">
            <label htmlFor="password">{t('Password')}</label>
            <div style={{ position: 'relative' }}>
              <input id="password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" autoFocus
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Your password')} style={{ paddingRight: 64 }} />
              <button type="button" className="btn btn-ghost btn-sm" style={{ position: 'absolute', right: 6, top: 5 }} onClick={() => setShow(!show)}>{show ? t('Hide') : t('Show')}</button>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>
            {busy ? <Spinner size={16} /> : t('Login')}
          </button>
          <div className="spread mt-16">
            <Link to="/forgot" className="small" style={{ color: 'var(--muted)' }}>{t('Forgot password?')}</Link>
            <button type="button" className="linklike small" onClick={useDifferentEmail}>{t('Use a different email')}</button>
          </div>
        </form>
      )}

      <div className="auth-foot">{t('New here?')} <Link to="/register"><button>{t('Create an account')}</button></Link></div>
    </AuthShell>
  );
}

export function Register() {
  const t = useT();
  const { register } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Arriving from the sign-in screen with an address that has no account yet.
  const presetEmail = new URLSearchParams(loc.search).get('email') || '';
  const [form, setForm] = useState({ name: '', email: presetEmail, password: '', confirm: '', date_of_birth: '' });
  const [avatarData, setAvatarData] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [showPw, setShowPw] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [pending, setPending] = useState(null);
  const fileRef = useRef(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  // The address sits inside the sentence, so the translation is split around
  // the placeholder rather than pieced together from fragments.
  const [noAccountBefore, noAccountAfter] = t('No account was found for {email}. Finish the form below and it is ready to use.').split('{email}');

  const pickAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 300_000) { setErrors([t('Profile picture must be under 300 KB.')]); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatarData(String(reader.result || ''));
    reader.readAsDataURL(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrors([]);
    const local = [];
    if (form.name.trim().length < 2) local.push(t('Please enter your full name.'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) local.push(t('Please enter a valid email address.'));
    if (form.password.length < 8) local.push(t('Password must be at least 8 characters.'));
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) local.push(t('Password needs at least one letter and one number.'));
    if (form.password !== form.confirm) local.push(t('Passwords do not match.'));
    if (!form.date_of_birth) local.push(t('Please enter your date of birth.'));
    if (local.length) { setErrors(local); return; }
    setBusy(true);
    try {
      const d = await register({ ...form, profile_image: avatarData || undefined });
      // Sign-up now ends at the inbox: no session until the link is opened.
      if (d.pending_verification) { setPending(d); return; }
      nav(d.redirect || '/home', { replace: true });
    } catch (e2) {
      setErrors(e2.fields || [e2.message]);
      setSuggestion(e2.suggestion || '');
    } finally { setBusy(false); }
  };

  if (pending) {
    return (
      <AuthShell>
        <div className="auth-logo">𝓕𝓛𝓐𝓢𝓗</div>
        <VerificationPending email={pending.email} delivered={pending.mail_delivered} devLink={pending.dev_verify_link} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-logo">𝓕𝓛𝓐𝓢𝓗</div>
      {presetEmail && (
        <div className="notice" role="status">
          {noAccountBefore}<strong>{presetEmail}</strong>{noAccountAfter}
        </div>
      )}
      {errors.length > 0 && <div className="form-error" role="alert"><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {suggestion && (
        <div className="notice" role="note">
          <span>{t('Did you mean')} </span>
          <button type="button" className="linklike"
            onClick={() => { setForm({ ...form, email: suggestion }); setErrors([]); setSuggestion(''); }}>{suggestion}</button>?
        </div>
      )}
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label>{t('Profile picture')} <span className="muted-2">{t('(optional)')}</span></label>
          <div className="row">
            {avatarData
              ? <img src={avatarData} alt="" className="avatar" style={{ width: 44, height: 44 }} />
              : <span className="avatar" style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{(form.name || 'F')[0]?.toUpperCase()}</span>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>{t('Choose image…')}</button>
            {avatarData && <button type="button" className="btn btn-danger btn-sm" onClick={() => setAvatarData('')}>{t('Remove')}</button>}
          </div>
        </div>
        <div className="field">
          <label htmlFor="name">{t('Full name')}</label>
          <input id="name" className="input" value={form.name} onChange={set('name')} placeholder="Ada Quinn" autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="remail">{t('Email')}</label>
          <input id="remail" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="rpassword">{t('Password')}</label>
          <div style={{ position: 'relative' }}>
            <input id="rpassword" className="input" type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder={t('8+ characters, letters & numbers')} autoComplete="new-password" style={{ paddingRight: 64 }} />
            <button type="button" className="btn btn-ghost btn-sm" style={{ position: 'absolute', right: 6, top: 5 }} onClick={() => setShowPw(!showPw)}>{showPw ? t('Hide') : t('Show')}</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="rconfirm">{t('Confirm password')}</label>
          <input id="rconfirm" className="input" type={showPw ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} placeholder={t('Repeat password')} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="dob">{t('Date of birth')} <span className="muted-2">{t('(used only for content preferences — never shown publicly)')}</span></label>
          <input id="dob" className="input" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} max="2026-12-31" min="1900-01-01" />
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>
          {busy ? <Spinner size={16} /> : t('Create Account')}
        </button>
      </form>
      <div className="auth-foot">{t('Already have an account?')} <Link to="/login"><button>{t('Login')}</button></Link></div>
    </AuthShell>
  );
}

export function Verify() {
  const t = useT();
  const nav = useNavigate();
  const { adoptSession } = useAuth();
  const token = new URLSearchParams(useLocation().search).get('token') || '';
  const [state, setState] = useState(token ? 'working' : 'error');
  const [err, setErr] = useState(token ? '' : t('This confirmation link is missing its token. Request a new one.'));
  // Holds the one in-flight confirmation attempt. React's StrictMode mounts
  // effects twice in development, and the token is single-use, so a second POST
  // would be refused and report a failure that already succeeded.
  const attempt = useRef(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    if (!attempt.current) {
      attempt.current = api.post('/auth/verify', { token }).then(
        (d) => ({ ok: true, data: d }),
        async (e) => {
          // A link already redeemed in this session is not a real failure — for
          // instance when the page is reloaded after a successful confirmation.
          try {
            const me = await api.get('/auth/me');
            if (me.user?.email_verified) {
              return { ok: true, data: { user: me.user, redirect: me.user.role === 'admin' ? '/admin/dashboard' : '/home' } };
            }
          } catch { /* not signed in — fall through to the error */ }
          return { ok: false, error: e };
        }
      );
    }

    attempt.current.then((outcome) => {
      if (!alive) return;
      if (!outcome.ok) { setState('error'); setErr(outcome.error.message); return; }
      // The POST opened a session server-side; adopt it before navigating, or
      // RequireAuth would send us straight back to /login.
      adoptSession(outcome.data.user);
      setState('done');
      setTimeout(() => nav(outcome.data.redirect || '/home', { replace: true }), 1200);
    });

    return () => { alive = false; };
    // Deliberately keyed on the token alone — this runs once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell>
      <div className="auth-logo">𝓕𝓛𝓐𝓢𝓗</div>
      {state === 'working' && <div className="form-ok">{t('Confirming your email…')}</div>}
      {state === 'done' && <div className="form-ok">{t('Email confirmed. Signing you in…')}</div>}
      {state === 'error' && (
        <>
          <div className="form-error" role="alert">{err}</div>
          <div className="auth-foot"><Link to="/login"><button>{t('Back to login')}</button></Link></div>
        </>
      )}
    </AuthShell>
  );
}

export function Forgot() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [devToken, setDevToken] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const d = await api.post('/auth/forgot', { email: email.trim() });
      setDone(true);
      setDevToken(d.dev_reset_token || '');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <div className="auth-logo">𝓕𝓛𝓐𝓢𝓗</div>
      {done ? (
        <>
          <div className="form-ok">{t('If that email exists, a reset link has been generated. Check your inbox.')}</div>
          {devToken && (
            <div className="panel" style={{ padding: 14, fontSize: 13 }}>
              <strong>{t('Development mode:')}</strong> {t('email delivery is not configured, so here is your reset link:')}
              <div className="mt-8"><Link to={`/reset?token=${devToken}`} style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{t('Open reset page →')}</Link></div>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          {err && <div className="form-error">{err}</div>}
          <div className="field">
            <label htmlFor="femail">{t('Email')}</label>
            <input id="femail" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>{busy ? <Spinner size={16} /> : t('Send reset link')}</button>
        </form>
      )}
      <div className="auth-foot"><Link to="/login"><button>{t('← Back to login')}</button></Link></div>
    </AuthShell>
  );
}

export function Reset() {
  const t = useT();
  const nav = useNavigate();
  const token = new URLSearchParams(useLocation().search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr(t('Passwords do not match.')); return; }
    setBusy(true);
    try {
      await api.post('/auth/reset', { token, password });
      setOk(true);
      setTimeout(() => nav('/login', { replace: true }), 1600);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <div className="auth-logo">𝓕𝓛𝓐𝓢𝓗</div>
      {ok ? <div className="form-ok">{t('Password updated. Redirecting to login…')}</div> : (
        <form onSubmit={submit} noValidate>
          {err && <div className="form-error">{err}</div>}
          {!token && <div className="form-error">{t('This reset link is missing its token. Request a new one from the forgot page.')}</div>}
          <div className="field">
            <label htmlFor="npw">{t('New password')}</label>
            <input id="npw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('8+ characters, letters & numbers')} />
          </div>
          <div className="field">
            <label htmlFor="cpw">{t('Confirm password')}</label>
            <input id="cpw" className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('Repeat password')} />
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy || !token}>{busy ? <Spinner size={16} /> : t('Update password')}</button>
        </form>
      )}
      <div className="auth-foot"><Link to="/login"><button>{t('← Back to login')}</button></Link></div>
    </AuthShell>
  );
}
