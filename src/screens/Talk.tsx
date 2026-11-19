import { useEffect, useState } from 'react';
import type { T } from '../i18n';
import type { FlowEvent, FlowState } from '../state/flow';
import type { Contact } from '../types';
import { Avatar, Big, Icon, Label } from '../components/ui';
import { micSupported } from '../audio/capture';

interface Props {
  t: T;
  flow: FlowState;
  contactOf: (id: string) => Contact;
  dispatch: (e: FlowEvent) => void;
  playing: string | null;
  playFailed: string | null;
  onPlay: () => void;
  onRecordAgain: (demo?: boolean) => void;
  onRetry: (recipientId: string, demo: boolean) => void;
  onHome: () => void;
  onMessages: (id: string) => void;
  maxReached: boolean;
  remoteDelivery: boolean;
  level: () => number | null;
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <p className="elapsed" aria-live="off">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </p>
  );
}

function LevelMeter({ level }: { level: () => number | null }) {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setV(level());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  if (v === null) return null;
  return (
    <div className="meter" aria-hidden="true">
      <div style={{ transform: `scaleX(${Math.max(0.04, v)})` }} />
    </div>
  );
}

export function Talk(p: Props) {
  const { t, flow, dispatch } = p;

  switch (flow.kind) {
    case 'requesting':
      return (
        <main className="screen talk">
          <Who t={t} c={p.contactOf(flow.recipientId)} />
          <p className="status" role="status">
            <Label text={t('starting')} />
          </p>
          <Big label={t('cancel')} variant="quiet" icon={Icon.x} onClick={() => dispatch({ type: 'CANCEL' })} />
        </main>
      );

    case 'recording':
      return (
        <main className="screen talk recording">
          <Who t={t} c={p.contactOf(flow.recipientId)} />
          <div className="rec-state" role="status">
            <span className="rec-dot" aria-hidden="true" />
            <Label text={t('recording')} />
          </div>
          <Elapsed since={flow.startedAt} />
          <LevelMeter level={p.level} />
          <Big label={t('stop')} variant="stop" size="xl" icon={Icon.stop} onClick={() => dispatch({ type: 'STOP' })} />
          <p className="hint">
            <Label text={t('pressStop')} />
          </p>
        </main>
      );

    case 'finishing':
    case 'sending':
      return (
        <main className="screen talk">
          <p className="status" role="status">
            <Label text={flow.kind === 'sending' ? t('sending') : t('finishing')} />
          </p>
        </main>
      );

    case 'review': {
      const d = flow.draft;
      const c = p.contactOf(d.recipientId);
      const isPlaying = p.playing === d.id;
      return (
        <main className="screen talk review">
          <h1 className="title">
            <Label text={t('reviewTitle', { name: c.name })} />
          </h1>
          {d.interrupted && (
            <p className="note warn">
              <Label text={t('interrupted')} />
            </p>
          )}
          {p.maxReached && (
            <p className="note">
              <Label text={t('maxReached')} />
            </p>
          )}
          {d.audio.demo && <p className="note demo">{t('demo')}</p>}
          <Big
            label={isPlaying ? t('stopPlaying') : t('listen')}
            variant="neutral"
            icon={isPlaying ? Icon.stop : Icon.play}
            onClick={p.onPlay}
          />
          {p.playFailed === d.id && <p className="note warn">Playback failed on this device.</p>}
          <p className="duration">{t('seconds', { n: Math.max(1, Math.round(d.audio.durationMs / 1000)) }).split('\n')[0]}</p>
          <p className="hint">
            <Label text={t('noText')} />
          </p>
          <Big label={t('send')} variant="go" size="xl" icon={Icon.send} onClick={() => dispatch({ type: 'SEND' })} />
          <div className="row">
            <Big label={t('recordAgain')} variant="neutral" size="m" icon={Icon.again} onClick={() => p.onRecordAgain(d.audio.demo)} />
            <Big label={t('cancel')} variant="neutral" size="m" icon={Icon.x} onClick={() => dispatch({ type: 'CANCEL' })} />
          </div>
        </main>
      );
    }

    case 'confirm-discard':
      return (
        <main className="screen talk confirm">
          <h1 className="title" role="alert">
            <Label text={t('confirmDiscard')} />
          </h1>
          <Big label={t('noKeep')} variant="go" size="xl" onClick={() => dispatch({ type: 'KEEP' })} />
          <Big label={t('yesDelete')} variant="danger" onClick={() => dispatch({ type: 'CONFIRM_DISCARD' })} />
        </main>
      );

    case 'sent': {
      const c = p.contactOf(flow.recipientId);
      return (
        <main className="screen talk sent">
          <div className="sent-mark" aria-hidden="true">
            {Icon.check}
          </div>
          <h1 className="title" role="status">
            <Label text={t('sent', { name: c.name })} />
          </h1>
          {!p.remoteDelivery && (
            <p className="note">
              <Label text={t('sentLocal')} />
            </p>
          )}
          <Big label={t('home')} variant="primary" icon={Icon.home} onClick={p.onHome} />
          <Big label={t('messages')} variant="neutral" icon={Icon.list} onClick={() => p.onMessages(c.id)} />
        </main>
      );
    }

    case 'error': {
      const msg = {
        'permission-denied': t('errPermission'),
        'no-microphone': t('errNoMic'),
        unsupported: t('errUnsupported'),
        'recording-failed': t('errRecording'),
        'send-failed': t('errSend'),
      }[flow.error];
      return (
        <main className="screen talk error">
          <Who t={t} c={p.contactOf(flow.recipientId)} />
          <p className="note warn" role="alert">
            <Label text={msg} />
          </p>
          {flow.error === 'send-failed' ? (
            <Big label={t('tryAgain')} variant="go" size="xl" icon={Icon.send} onClick={() => dispatch({ type: 'SEND' })} />
          ) : flow.draft ? (
            <Big label={t('listen')} variant="go" icon={Icon.play} onClick={() => dispatch({ type: 'BACK_TO_DRAFT' })} />
          ) : (
            <>
              {micSupported() && (
                <Big label={t('tryAgain')} variant="primary" icon={Icon.mic} onClick={() => p.onRetry(flow.recipientId, false)} />
              )}
              <Big label={t('useDemo')} variant="neutral" size="m" onClick={() => p.onRetry(flow.recipientId, true)} />
            </>
          )}
        </main>
      );
    }

    case 'idle':
      return null;
  }
}

function Who({ t, c }: { t: T; c: Contact }) {
  return (
    <header className="who">
      <Avatar contact={c} size="m" />
      <h1>
        <Label text={t('recordingFor', { name: c.name })} />
      </h1>
    </header>
  );
}
