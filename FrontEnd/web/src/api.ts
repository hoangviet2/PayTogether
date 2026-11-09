import { useEffect, useState } from 'react';
import type { Trip } from '../../shared/trip';

export type Config = { paypalClientId: string | null; paypalLogin: string | null; ready: Record<string, boolean> };

/** Calls the Backend through Vite's /api proxy. Throws the server's error message. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const s = getSession();
  const r = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(s && { 'x-session': s.session }) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const d = await r.json().catch(() => ({ error: r.status === 502 || r.status === 504 ? 'The API server is not running (cd Backend && npm run dev).' : `HTTP ${r.status}` }));
  if (r.status === 401 && s && path !== '/auth/paypal') { setSession(null); location.hash = '#/'; } // expired or server secret changed
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
  return d as T;
}

// Log in with PayPal: session = signed token from the Backend; user = PayPal id matched against trip members.
export type Session = { session: string; user: string; name: string };
export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem('pt-session') ?? 'null'); } catch { return null; }
}
export function setSession(s: Session | null) {
  try { if (s) localStorage.setItem('pt-session', JSON.stringify(s)); else localStorage.removeItem('pt-session'); } catch { /* private mode: login lasts for this page only */ }
}

// PayPal sends the browser back to this exact URL; it must match the Return URL in the PayPal app settings.
const returnUrl = () => location.origin + '/';

/** Sends the browser to PayPal's sign-in page. `state` guards against a forged return (CSRF). */
export function startLogin(loginUrl: string) {
  const state = crypto.randomUUID();
  sessionStorage.setItem('pt-login', JSON.stringify({ state, after: location.hash }));
  location.href = `${loginUrl}&redirect_uri=${encodeURIComponent(returnUrl())}&state=${state}`;
}

/** On return from PayPal (?code=…&state=…): trade the code for a session, then go back where the user was. */
export async function finishLogin(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  if (!code && !q.get('error')) return;
  const saved = JSON.parse(sessionStorage.getItem('pt-login') ?? '{}') as { state?: string; after?: string };
  sessionStorage.removeItem('pt-login');
  history.replaceState(null, '', returnUrl() + (saved.after && saved.after !== '#/' ? saved.after : '#/trips'));
  if (!code) throw new Error('PayPal login was cancelled.');
  if (q.get('state') !== saved.state) throw new Error('Login did not match this browser. Try again.');
  setSession(await api<Session>('/auth/paypal', { body: { code } }));
}

/** Polls the trip so Wayfinder replies and webhook updates show up. shortcut: polling; move to Socket.IO with the realtime app. */
export function useTrip(id: string) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // Keep the same object when nothing changed, so grids and charts don't redraw every poll.
    const load = () => api<Trip>(`/trips/${id}`)
      .then((t) => live && (setTrip((prev) => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t)), setError(null)))
      .catch((e) => live && setError(e.message));
    load();
    const timer = setInterval(load, 2000);
    return () => { live = false; clearInterval(timer); };
  }, [id]);
  return { trip, setTrip, error, setError };
}

let configP: Promise<Config> | null = null;
export function useConfig() {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    (configP ??= api<Config>('/config')).then(setCfg).catch(() => { configP = null; });
  }, []);
  return cfg;
}

export type Ctx = { trip: Trip; me: number; act: (path: string, body?: unknown) => Promise<void> };
