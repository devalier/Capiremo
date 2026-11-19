import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { say } from './audio/feedback';
import { usePlayer } from './audio/usePlayer';
import { Big, Icon } from './components/ui';
import { makeT, speechLang } from './i18n';
import { Caregiver } from './screens/Caregiver';
import { Home } from './screens/Home';
import { Messages } from './screens/Messages';
import { Person } from './screens/Person';
import { PhoneSetup } from './screens/PhoneSetup';
import { Talk } from './screens/Talk';
import { draftAtRisk } from './state/flow';
import { conversation, unplayedFrom } from './state/messages';
import { useTalkFlow, type Services } from './state/useTalkFlow';
import { defaultContacts, defaultSettings, requestPersistence, type Settings } from './storage/store';
import type { Contact, Message } from './types';
import { SPEAKER_ID } from './types';

type View =
  | { name: 'home' }
  | { name: 'person'; id: string }
  | { name: 'talk' }
  | { name: 'messages'; id: string }
  | { name: 'caregiver' }
  | { name: 'phone'; id: string; back: 'home' | 'caregiver' };

export function App({ services }: { services: Services }) {
  const { store } = services;
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [contacts, setContacts] = useState<Contact[]>(defaultContacts);
  const [messages, setMessages] = useState<Message[]>([]);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [caregiverUnlocked, setCaregiverUnlocked] = useState(false);
  const [rawView, setView] = useState<View>(() => (location.hash === '#caregiver' ? { name: 'caregiver' } : { name: 'home' }));
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    void Promise.all([store.getSettings(), store.getContacts(), store.getMessages()]).then(([s, c, m]) => {
      setSettings(s);
      setContacts(c);
      setMessages(m);
    });
    void requestPersistence().then(setPersistent);
  }, [store]);

  const t = useMemo(() => makeT(settings.labels), [settings.labels]);
  const locale = settings.labels === 'it' ? 'it-IT' : 'en-GB';

  const upsertMessage = useCallback((m: Message) => {
    setMessages((prev) => [...prev.filter((x) => x.id !== m.id), m]);
  }, []);

  const saveMessage = useCallback(
    (m: Message) => {
      upsertMessage(m);
      void store.putMessage(m);
    },
    [store, upsertMessage],
  );

  const { flow, dispatch, talk, recordAgain, level, maxReached } = useTalkFlow({
    services,
    forceDemo: settings.forceDemoAudio,
    sounds: settings.sounds,
    onMessage: upsertMessage,
    recentMessages: () => messagesRef.current.slice(-10),
  });
  const view: View = rawView.name === 'talk' && flow.kind === 'idle' ? { name: 'home' } : rawView;

  const player = usePlayer();
  const contactOf = useCallback(
    (id: string) => contacts.find((c) => c.id === id) ?? { id, name: id, photo: null, order: 99, phone: null, country: null },
    [contacts],
  );

  // Spoken confirmation of major state changes (optional, caregiver setting).
  useEffect(() => {
    if (!settings.speak) return;
    const first = (s: string) => s.split('\n')[0];
    const map: Partial<Record<typeof flow.kind, string>> = {
      recording: first(t('recording')),
      review: first(t('reviewHint')),
      sent: flow.kind === 'sent' ? first(t('sent', { name: contactOf(flow.recipientId).name })) : '',
    };
    const msg = map[flow.kind];
    if (msg) say(msg, speechLang(settings.labels));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.kind]);

  // Any active flow takes over the screen, so a draft is never hidden mid-task.
  useEffect(() => {
    if (flow.kind !== 'idle' && flow.kind !== 'review' && view.name !== 'caregiver') setView({ name: 'talk' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.kind]);

  // Keep the hash in sync so the caregiver page can be bookmarked; everything else is "#".
  useEffect(() => {
    const h = view.name === 'caregiver' ? '#caregiver' : '';
    if (location.hash !== h) history.replaceState(null, '', h || location.pathname);
  }, [view]);

  function goHome() {
    player.stop();
    if (flow.kind === 'recording') dispatch({ type: 'STOP' }); // keep what was said
    else dispatch({ type: 'HOME' });
    setView({ name: 'home' });
  }

  function playMessage(m: Message) {
    player.toggle(m.id, m.audio, () => {
      if (m.recipientId === SPEAKER_ID && !m.playedByRecipient) saveMessage({ ...m, playedByRecipient: true });
    });
  }

  const pending = draftAtRisk(flow);
  // Sent screen has its own big HOME as the main action; avoid two identical buttons.
  const showHome =
    view.name !== 'home' &&
    view.name !== 'caregiver' &&
    view.name !== 'phone' && // keypad uses the full screen and has its own CANCEL
    !(view.name === 'talk' && flow.kind === 'sent');

  function saveContacts(c: Contact[]) {
    setContacts(c);
    void store.putContacts(c);
  }

  let body: React.ReactNode;
  if (view.name === 'caregiver') {
    body = (
      <Caregiver
        contacts={contacts}
        messages={messages}
        settings={settings}
        playing={player.playing}
        persistent={persistent}
        services={{
          asr: services.asr.name,
          interpreter: services.interpreter.name,
          delivery: services.delivery.name,
          remote: services.delivery.remote,
        }}
        onPlay={playMessage}
        onSettings={(s) => {
          setSettings(s);
          void store.putSettings(s);
        }}
        onContacts={saveContacts}
        unlocked={caregiverUnlocked}
        onUnlock={() => setCaregiverUnlocked(true)}
        onEditPhone={(id) => setView({ name: 'phone', id, back: 'caregiver' })}
        onMessage={saveMessage}
        onWipe={async () => {
          player.stop();
          await store.wipe();
          location.hash = '';
          location.reload();
        }}
        onClose={() => setView({ name: 'home' })}
      />
    );
  } else if (view.name === 'phone') {
    const c = contactOf(view.id);
    const back = view.back;
    body = (
      <PhoneSetup
        key={c.id}
        t={t}
        contact={c}
        onCancel={() => setView(back === 'home' ? { name: 'home' } : { name: 'caregiver' })}
        onSave={(phone, country) => {
          saveContacts(contacts.map((x) => (x.id === c.id ? { ...x, phone, country } : x)));
          setView(back === 'home' ? { name: 'person', id: c.id } : { name: 'caregiver' });
        }}
      />
    );
  } else if (view.name === 'talk' && flow.kind !== 'idle') {
    body = (
      <Talk
        t={t}
        flow={flow}
        contactOf={contactOf}
        dispatch={dispatch}
        playing={player.playing}
        playFailed={player.failed}
        onPlay={() => flow.kind === 'review' && player.toggle(flow.draft.id, flow.draft.audio)}
        onRecordAgain={(demo) => {
          player.stop();
          recordAgain(demo || settings.forceDemoAudio);
        }}
        onRetry={(id, demo) => talk(id, demo)}
        onHome={goHome}
        onMessages={(id) => {
          dispatch({ type: 'HOME' });
          setView({ name: 'messages', id });
        }}
        maxReached={maxReached}
        remoteDelivery={services.delivery.remote}
        level={level}
      />
    );
  } else if (view.name === 'person') {
    const c = contactOf(view.id);
    body = (
      <Person
        t={t}
        contact={c}
        unplayed={unplayedFrom(messages, c.id)}
        onTalk={() => {
          if (pending) return setView({ name: 'talk' }); // finish the existing draft first
          talk(c.id);
          setView({ name: 'talk' });
        }}
        onMessages={() => setView({ name: 'messages', id: c.id })}
      />
    );
  } else if (view.name === 'messages') {
    const c = contactOf(view.id);
    body = (
      <Messages
        t={t}
        locale={locale}
        contact={c}
        messages={conversation(messages, c.id)}
        playing={player.playing}
        playFailed={player.failed}
        onPlay={playMessage}
      />
    );
  } else {
    body = (
      <Home
        t={t}
        contacts={[...contacts].sort((a, b) => a.order - b.order)}
        unplayed={(id) => unplayedFrom(messages, id)}
        pendingDraft={flow.kind === 'review' || flow.kind === 'error' || flow.kind === 'confirm-discard' ? pending : null}
        canUndo={flow.kind === 'idle' && !!flow.discarded}
        onContact={(id) =>
          setView(contactOf(id).phone ? { name: 'person', id } : { name: 'phone', id, back: 'home' })
        }
        onOpenDraft={() => setView({ name: 'talk' })}
        onUndo={() => {
          dispatch({ type: 'UNDO_DISCARD' });
          setView({ name: 'talk' });
        }}
        onCaregiver={() => setView({ name: 'caregiver' })}
      />
    );
  }

  return (
    <div className={`app labels-${settings.labels}`}>
      {showHome && (
        <nav className="topbar">
          <Big label={t('home')} variant="quiet" size="m" icon={Icon.home} onClick={goHome} />
        </nav>
      )}
      {body}
    </div>
  );
}
