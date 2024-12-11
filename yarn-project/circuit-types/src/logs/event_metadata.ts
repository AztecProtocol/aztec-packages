import { type AbiType, AbiTypeSchema, type EventSelector, decodeFromAbi } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { L1EventPayload } from './l1_payload/l1_event_payload.js';
import { type UnencryptedL2Log } from './unencrypted_l2_log.js';

/**
 * Represents metadata for an event decoder, including all information needed to reconstruct it.
 */
export class EventMetadata<T> {
  public readonly decode: (payload: L1EventPayload | UnencryptedL2Log) => T | undefined;

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
  ): (payload: L1EventPayload | UnencryptedL2Log | undefined) => T | undefined {
    return (payload: L1EventPayload | UnencryptedL2Log | undefined): T | undefined => {
      if (payload === undefined) {
        return undefined;
      }

      if (payload instanceof L1EventPayload) {
        if (!eventSelector.equals(payload.eventTypeId)) {
          return undefined;
        }
        return decodeFromAbi([abiType], payload.event.items) as T;
      } else {
        const items = [];
        for (let i = 0; i < payload.data.length; i += 32) {
          items.push(new Fr(payload.data.subarray(i, i + 32)));
        }

        return decodeFromAbi([abiType], items) as T;
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
