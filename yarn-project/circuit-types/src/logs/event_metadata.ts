import { EventType, L1EventPayload, type UnencryptedL2Log } from '@aztec/circuit-types';
import { type AbiType } from '@aztec/foundation/abi';
import { EventSelector, decodeFromAbi } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';

/**
 * Represents metadata for an event decoder, including all information needed to reconstruct it.
 */
export class EventMetadata<T> {
  public readonly decode: (payload: L1EventPayload | UnencryptedL2Log) => T | undefined;

  public readonly eventSelector: EventSelector;
  public readonly abiType: AbiType;
  public readonly fieldNames: string[];

  constructor(
    public readonly eventType: EventType,
    event: { eventSelector: EventSelector; abiType: AbiType; fieldNames: string[] },
  ) {
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

    return new EventMetadata(EventType.Encrypted, {
      eventSelector: EventSelector.fromString(json.eventSelector),
      abiType: json.abiType,
      fieldNames: json.fieldNames,
    });
  }
}
