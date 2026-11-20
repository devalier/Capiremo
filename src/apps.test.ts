import { describe, expect, it } from 'vitest';
import { APP_PRESETS, defaultSlots, resolveSlot, safeLaunchUrl } from './apps';

describe('launch URLs', () => {
  it('accepts app schemes and http(s)', () => {
    expect(safeLaunchUrl('nflx://')).toBe('nflx://');
    expect(safeLaunchUrl(' https://www.duolingo.com/ ')).toBe('https://www.duolingo.com/');
    expect(safeLaunchUrl('fb://profile')).toBe('fb://profile');
  });
  it('rejects code-running and malformed URLs', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc', 'blob:x', 'about:blank', 'netflix', '', 'http://']) {
      expect(safeLaunchUrl(bad), bad).toBeNull();
    }
  });
  it('defaults are Netflix and Duolingo', () => {
    expect(defaultSlots.map((s) => resolveSlot(s).url)).toEqual(['nflx://', 'duolingo://']);
  });
  it('custom label overrides preset name; empty label falls back', () => {
    expect(resolveSlot({ app: 'youtube', label: 'Music videos', customUrl: '' }).label).toBe('Music videos');
    expect(resolveSlot({ app: 'youtube', label: ' ', customUrl: '' }).label).toBe('YouTube');
  });
  it('custom app with unsafe URL resolves to no URL', () => {
    expect(resolveSlot({ app: 'custom', label: 'X', customUrl: 'javascript:alert(1)' }).url).toBeNull();
    expect(resolveSlot({ app: 'custom', label: 'RaiPlay', customUrl: 'https://www.raiplay.it/' })).toMatchObject({
      url: 'https://www.raiplay.it/',
      web: 'https://www.raiplay.it/',
    });
  });
  it('preset ids are unique and URLs are safe', () => {
    expect(new Set(APP_PRESETS.map((p) => p.id)).size).toBe(APP_PRESETS.length);
    for (const p of APP_PRESETS) expect(safeLaunchUrl(p.url)).toBe(p.url);
  });
});
