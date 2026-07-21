import type { AbiType } from './abi.js';
import type { EventSelector } from './event_selector.js';

/** Metadata for a contract event, used to decode emitted event logs back into structured data. */
export type EventMetadataDefinition = {
  eventSelector: EventSelector;
  abiType: AbiType;
  /** Names of the event's struct members (not serialized Noir Field elements). */
  fieldNames: string[];
};
