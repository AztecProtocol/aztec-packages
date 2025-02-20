// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Buffer32 } from '@aztec/foundation/buffer';
import { schemas as foundationSchemas } from '@aztec/foundation/schemas';
import type { ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { AbiDecoded } from '../abi/decoder.js';
import { EventSelector } from '../abi/event_selector.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { NoteSelector } from '../abi/note_selector.js';
import { AztecAddress } from '../aztec-address/index.js';

export const schemas = {
  AztecAddress: AztecAddress.schema,
  NoteSelector: NoteSelector.schema,
  FunctionSelector: FunctionSelector.schema,
  EventSelector: EventSelector.schema,
  ...foundationSchemas,
};

export const AbiDecodedSchema: ZodFor<AbiDecoded> = z.union([
  schemas.BigInt,
  z.boolean(),
  schemas.AztecAddress,
  z.array(z.lazy(() => AbiDecodedSchema)),
  z.record(z.lazy(() => AbiDecodedSchema)),
]);

export {
  type ZodFor,
  bufferSchema,
  hexSchema,
  hexSchemaFor,
  bufferSchemaFor,
  type ApiSchemaFor,
  optional,
} from '@aztec/foundation/schemas';
