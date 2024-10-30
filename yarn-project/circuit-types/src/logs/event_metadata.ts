import { L1EventPayload, type UnencryptedL2Log } from '@aztec/circuit-types';
import { type AbiType } from '@aztec/foundation/abi';
import { EventSelector, decodeFromAbi } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';

/**
 * Represents metadata for an event decoder, including all information needed to reconstruct it.
 */
export class EventMetadata<T> {
  public readonly decode: (payload: L1EventPayload | UnencryptedL2Log) => T | undefined;

  constructor(public eventSelector: EventSelector, private readonly eventType: AbiType, public fieldNames: string[]) {
    this.decode = EventMetadata.decodeEvent<T>(eventSelector, eventType);
  }

  public static decodeEvent<T>(
    eventSelector: EventSelector,
    eventType: AbiType,
  ): (payload: L1EventPayload | UnencryptedL2Log | undefined) => T | undefined {
    return (payload: L1EventPayload | UnencryptedL2Log | undefined): T | undefined => {
      if (payload === undefined) {
        return undefined;
      }

      if (payload instanceof L1EventPayload) {
        if (!eventSelector.equals(payload.eventTypeId)) {
          return undefined;
        }
        return decodeFromAbi([eventType], payload.event.items) as T;
      } else {
        const items = [];
        for (let i = 0; i < payload.data.length; i += 32) {
          items.push(new Fr(payload.data.subarray(i, i + 32)));
        }

        return decodeFromAbi([eventType], items) as T;
      }
    };
  }

  /**
   * Serializes the metadata to a JSON-friendly format
   */
  public toJSON() {
    return {
      type: 'event_metadata',
      eventSelector: this.eventSelector.toString(),
      eventType: this.eventType,
      fieldNames: this.fieldNames,
    };
  }

  /**
   * Creates an EventMetadata instance from a JSON representation
   */
  public static fromJSON(json: any): EventMetadata<any> {
    if (json?.type !== 'event_metadata') {
      throw new Error('Invalid event metadata format');
    }

    return new EventMetadata(EventSelector.fromString(json.eventSelector), json.eventType, json.fieldNames);
  }
}
