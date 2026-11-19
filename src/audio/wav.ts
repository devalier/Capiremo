// Synthetic audio for demo mode (no microphone). Produces a valid 16-bit mono PCM WAV.
// The sound is a gentle two-tone pattern so it is obviously not a voice.

export function synthWav(durationMs: number, sampleRate = 16000): ArrayBuffer {
  const n = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const ascii = (off: number, s: string) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const freq = Math.floor(t * 2) % 2 === 0 ? 440 : 554;
    const env = Math.min(1, (t % 0.5) * 20) * Math.min(1, (0.5 - (t % 0.5)) * 20);
    v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * freq * t) * env * 0.25 * 32767), true);
  }
  return buf;
}
