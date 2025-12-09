import { z } from 'zod';

import { schemas } from '../schemas/schemas.js';
import { type AbiType, AbiTypeSchema } from './abi.js';
import type { EventSelector } from './event_selector.js';

export type EventMetadataDefinition = {
  eventSelector: EventSelector;
  abiType: AbiType;
  fieldNames: string[];
};

export const EventMetadataDefinitionSchema = z.object({
  eventSelector: schemas.EventSelector,
  abiType: AbiTypeSchema,
  fieldNames: z.array(z.string()),
});
