// Non-visual confirmation of state changes. All best-effort: iOS has no Vibration API and
// the ring/silent switch mutes Web Audio.

let ctx: AudioContext | null = null;

export function beep(kind: 'start' | 'stop' | 'sent') {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const notes = kind === 'start' ? [523, 784] : kind === 'stop' ? [784, 523] : [523, 659, 784];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const t = ctx!.currentTime + i * 0.12;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.12);
    });
  } catch {
    /* no audio feedback available */
  }
  try {
    navigator.vibrate?.(kind === 'start' ? 60 : 30);
  } catch {
    /* not supported (iOS) */
  }
}

export function say(text: string, lang: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    s.speak(u);
  } catch {
    /* not supported */
  }
}
