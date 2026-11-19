// One shared audio element. Playback always starts from a tap (required on iOS).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioClip } from '../types';

export function usePlayer() {
  const el = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const stop = useCallback(() => {
    el.current?.pause();
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    (id: string, clip: AudioClip, onPlayed?: () => void) => {
      if (playing === id) return stop();
      stop();
      setFailed(null);
      const a = (el.current ??= new Audio());
      url.current = URL.createObjectURL(new Blob([clip.data], { type: clip.mimeType }));
      a.src = url.current;
      a.onended = () => stop();
      a.onerror = () => {
        setFailed(id);
        stop();
      };
      setPlaying(id);
      a.play().then(
        () => onPlayed?.(),
        () => {
          setFailed(id);
          stop();
        },
      );
    },
    [playing, stop],
  );

  return { playing, failed, toggle, stop };
}
