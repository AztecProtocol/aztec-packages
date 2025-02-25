import { z } from 'zod';

import { type AbiType, AbiTypeSchema } from '../abi/abi.js';
import { decodeFromAbi } from '../abi/decoder.js';
import type { EventSelector } from '../abi/event_selector.js';
import { schemas } from '../schemas/index.js';
import { L1EventPayload } from './l1_payload/l1_event_payload.js';
import type { PublicLog } from './public_log.js';

/**
 * Represents metadata for an event decoder, including all information needed to reconstruct it.
 */
export class EventMetadata<T> {
  public readonly decode: (payload: L1EventPayload | PublicLog) => T | undefined;

  public readonly eventSelector: EventSelector;
  public readonly abiType: AbiType;
  public readonly fieldNames: string[];

  constructor(event: { eventSelector: EventSelector; abiType: AbiType; fieldNames: string[] }) {
    this.eventSelector = event.eventSelector;
    this.abiType = event.abiType;
    this.fieldNames = event.fieldNames;
    this.decode = EventMetadata.decodeEvent<T>(event.eventSelector, event.abiType);
  }

  public static decodeEvent<T>(
    eventSelector: EventSelector,
    abiType: AbiType,
  ): (payload: L1EventPayload | PublicLog | undefined) => T | undefined {
    return (payload: L1EventPayload | PublicLog | undefined): T | undefined => {
      if (payload === undefined) {
        return undefined;
      }

      if (payload instanceof L1EventPayload) {
        if (!eventSelector.equals(payload.eventTypeId)) {
          return undefined;
        }
        return decodeFromAbi([abiType], payload.event.items) as T;
      } else {
        return decodeFromAbi([abiType], payload.log) as T;
      }
    };
  }

  static get schema() {
    return z
      .object({
        eventSelector: schemas.EventSelector,
        abiType: AbiTypeSchema,
        fieldNames: z.array(z.string()),
      })
      .transform(obj => new EventMetadata(obj));
  }
}
