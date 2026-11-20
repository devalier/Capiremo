import type { DeliveryService } from './types';

/** Messages stay on this device. Delivery status is reported as such, never as "delivered". */
export const localOnlyDelivery: DeliveryService = {
  name: 'this-device',
  remote: false,
  async deliver() {
    return { ok: true, status: 'saved-on-device' };
  },
};
