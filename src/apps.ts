// Home-screen app launchers. On iPhone, a web app opens another app through its URL scheme.
// Schemes below are the apps' publicly known ones; each must be confirmed on the real phone
// (an app that isn't installed simply doesn't open, and we show a fallback).

export interface AppPreset {
  id: string;
  name: string;
  /** Scheme URL that opens the app. */
  url: string;
  /** Website to offer if the app doesn't open. */
  web: string | null;
  icon: string;
}

export const APP_PRESETS: AppPreset[] = [
  { id: 'netflix', name: 'Netflix', url: 'nflx://', web: 'https://www.netflix.com/', icon: '📺' },
  { id: 'duolingo', name: 'Duolingo', url: 'duolingo://', web: 'https://www.duolingo.com/', icon: '🦉' },
  { id: 'youtube', name: 'YouTube', url: 'youtube://', web: 'https://m.youtube.com/', icon: '▶️' },
  { id: 'whatsapp', name: 'WhatsApp', url: 'whatsapp://', web: null, icon: '💬' },
  { id: 'spotify', name: 'Spotify', url: 'spotify://', web: 'https://open.spotify.com/', icon: '🎧' },
  { id: 'applemusic', name: 'Music', url: 'music://', web: null, icon: '🎵' },
  { id: 'podcasts', name: 'Podcasts', url: 'podcasts://', web: null, icon: '🎙️' },
  { id: 'photos', name: 'Photos', url: 'photos-redirect://', web: null, icon: '🖼️' },
  { id: 'maps', name: 'Maps', url: 'maps://', web: null, icon: '🗺️' },
  { id: 'calendar', name: 'Calendar', url: 'calshow://', web: null, icon: '📅' },
  { id: 'primevideo', name: 'Prime Video', url: 'aiv://', web: 'https://www.primevideo.com/', icon: '🎬' },
  { id: 'disneyplus', name: 'Disney+', url: 'disneyplus://', web: 'https://www.disneyplus.com/', icon: '✨' },
  { id: 'kindle', name: 'Kindle', url: 'kindle://', web: null, icon: '📖' },
  { id: 'audible', name: 'Audible', url: 'audible://', web: null, icon: '🎧' },
];

export const MAIL_URL = 'message://'; // Apple Mail inbox

export interface AppSlot {
  /** Preset id, or 'custom'. */
  app: string;
  label: string;
  /** Only used when app === 'custom'. */
  customUrl: string;
}

export const defaultSlots: [AppSlot, AppSlot] = [
  { app: 'netflix', label: 'Netflix', customUrl: '' },
  { app: 'duolingo', label: 'Duolingo', customUrl: '' },
];

const BLOCKED = /^(javascript|data|vbscript|file|blob|about):/i;

/** Accept app schemes (nflx://) and http(s) links; refuse anything that could run code in the page. */
export function safeLaunchUrl(url: string): string | null {
  const u = url.trim();
  if (!u || BLOCKED.test(u)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
  if (/^https?:/i.test(u)) {
    try {
      new URL(u);
    } catch {
      return null;
    }
  }
  return u;
}

export interface ResolvedApp {
  label: string;
  url: string | null;
  web: string | null;
  icon: string;
}

export function resolveSlot(slot: AppSlot): ResolvedApp {
  if (slot.app === 'custom') {
    const url = safeLaunchUrl(slot.customUrl);
    return { label: slot.label.trim() || 'App', url, web: url && /^https?:/i.test(url) ? url : null, icon: '⭐' };
  }
  const p = APP_PRESETS.find((x) => x.id === slot.app) ?? APP_PRESETS[0];
  return { label: slot.label.trim() || p.name, url: p.url, web: p.web, icon: p.icon };
}

/** Test seam: e2e tests replace this to observe launches without leaving the page. */
type Launcher = (url: string) => void;
export function launch(url: string) {
  const hook = (window as unknown as { __capiremoLaunch?: Launcher }).__capiremoLaunch;
  if (hook) return hook(url);
  window.location.href = url;
}

/**
 * Open an app; resolves true if the page was hidden soon after (the app opened),
 * false if nothing happened within `ms` (app missing or blocked).
 */
export function launchAndWatch(url: string, ms = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (opened: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('blur', onHide);
      resolve(opened);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden' || !document.hasFocus()) finish(true);
    };
    const timer = setTimeout(() => finish(false), ms);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('blur', onHide);
    launch(url);
  });
}
