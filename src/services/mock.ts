import type { AsrService, DeliveryService, InterpretationService } from './types';

/** No speech service is connected in the prototype. Says so instead of faking text. */
export const unavailableAsr: AsrService = {
  name: 'none',
  async transcribe() {
    return { status: 'unavailable', reason: 'No speech-to-text service is connected in this prototype.' };
  },
};

/** Abstains. A real implementation is added in Phase 4 with an evaluation corpus. */
export const abstainingInterpreter: InterpretationService = {
  name: 'none',
  async suggest() {
    return [];
  },
};

/** Messages stay on this device. Delivery status is reported as such, never as "delivered". */
export const localOnlyDelivery: DeliveryService = {
  name: 'this-device',
  remote: false,
  async deliver() {
    return { ok: true, status: 'saved-on-device' };
  },
};
