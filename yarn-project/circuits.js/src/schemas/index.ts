// eslint-disable-next-line import/no-unresolved
import { Buffer32 } from '@aztec/foundation/buffer';
import { type ZodFor, schemas as foundationSchemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { AbiDecoded } from '../abi/decoder.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { NoteSelector } from '../abi/note_selector.js';

export const schemas = {
  NoteSelector: NoteSelector.schema,
  FunctionSelector: FunctionSelector.schema,
  ...foundationSchemas,
};

export const AbiDecodedSchema: ZodFor<AbiDecoded> = z.union([
  schemas.BigInt,
  z.boolean(),
  schemas.AztecAddress,
  z.array(z.lazy(() => AbiDecodedSchema)),
  z.record(z.lazy(() => AbiDecodedSchema)),
]);
