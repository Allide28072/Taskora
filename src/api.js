// THE FLASH — api client
import { tNow } from './i18n.jsx';

// Keys are English source strings, resolved in the reader's chosen language at
// the moment the error is built — see src/strings.js.
const FRIENDLY = {
  400: 'That request could not be completed.',
  401: 'You need to sign in to continue.',
  403: 'You do not have access to that.',
  404: 'We could not find that.',
  409: 'That already exists.',
  413: 'That is too large.',
  429: 'Too many attempts. Please slow down.',
  500: 'Something went wrong on our side. Please try again.',
};

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
  } catch {
    const e = new Error(tNow('No internet connection. Check your network and try again.'));
    e.code = 'network';
    throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  if (!res.ok) {
    // Server messages are English too, so they go through the same dictionary —
    // a message with no translation passes through untouched.
    const e = new Error(tNow(data?.error?.message || FRIENDLY[res.status] || 'Something went wrong.'));
    e.code = data?.error?.code || 'error';
    e.status = res.status;
    // "did you mean ada@gmail.com?" — carried through so a form can offer it.
    e.suggestion = data?.suggestion || '';
    e.fields = data?.error?.errors?.map((x) => tNow(x));
    throw e;
  }
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p) => request(p, { method: 'DELETE' }),
};

export const img = {
  poster: (t) => t?.poster || '',
  cover: (n) => n?.cover || '',
};
