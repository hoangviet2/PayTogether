import { useEffect, useState } from 'react';
import type { Trip } from '../../shared/trip';

export type Config = { paypalClientId: string | null; ready: Record<string, boolean> };

/** Calls the Backend through Vite's /api proxy. Throws the server's error message. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown; member?: number } = {}): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(opts.member !== undefined && { 'x-member': String(opts.member) }) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const d = await r.json().catch(() => ({ error: r.status === 502 || r.status === 504 ? 'The API server is not running (cd Backend && npm run dev).' : `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
  return d as T;
}

// shortcut: who you are is a per-browser choice (no login yet); replace with a Log in with PayPal session.
const key = (tripId: string) => `pt-member-${tripId}`;
export function savedMember(tripId: string) {
  try { return Number(localStorage.getItem(key(tripId)) ?? 0) || 0; } catch { return 0; }
}
export function saveMember(tripId: string, m: number) {
  try { localStorage.setItem(key(tripId), String(m)); } catch { /* private mode: falls back to member 0 */ }
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

export type Ctx = { trip: Trip; me: number; setMe: (m: number) => void; act: (path: string, body?: unknown) => Promise<void> };
