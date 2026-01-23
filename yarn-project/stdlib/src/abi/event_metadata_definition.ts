import type { AbiType } from './abi.js';
import type { EventSelector } from './event_selector.js';

export type EventMetadataDefinition = {
  eventSelector: EventSelector;
  abiType: AbiType;
  fieldNames: string[];
};
