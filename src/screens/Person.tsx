import type { T } from '../i18n';
import type { Contact } from '../types';
import { Avatar, Big, Icon } from '../components/ui';
import { formatE164 } from '../phone';

interface Props {
  t: T;
  contact: Contact;
  unplayed: number;
  onTalk: () => void;
  onMessages: () => void;
}

export function Person({ t, contact, unplayed, onTalk, onMessages }: Props) {
  return (
    <main className="screen person">
      <header className="who">
        <Avatar contact={contact} size="m" />
        <div>
          <h1>{contact.name}</h1>
          {contact.phone && <p className="phone-line">{formatE164(contact.phone)}</p>}
        </div>
      </header>
      <Big label={t('talk')} variant="primary" size="xl" icon={Icon.mic} onClick={onTalk} />
      <Big
        label={unplayed > 0 ? `${t('messages')} (${unplayed})` : t('messages')}
        variant="neutral"
        icon={Icon.list}
        onClick={onMessages}
      />
    </main>
  );
}
