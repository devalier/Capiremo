// Delivery boundary. Speech-to-text and interpretation live in src/ai/.
import type { Message } from '../types';

export type DeliveryResult =
  | { ok: true; status: 'saved-on-device' | 'delivered' }
  | { ok: false; reason: string };

export interface DeliveryService {
  readonly name: string;
  /** True only if messages actually leave the device. */
  readonly remote: boolean;
  deliver(message: Message): Promise<DeliveryResult>;
}
