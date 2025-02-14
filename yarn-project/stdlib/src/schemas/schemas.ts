import { type ZodFor, schemas as foundationSchemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type AbiDecoded } from '../abi/decoder.js';
import { EventSelector } from '../abi/event_selector.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { NoteSelector } from '../abi/note_selector.js';
import { AztecAddress } from '../aztec-address/index.js';

type StdLibSchemas = {
  /** Accepts a hex string. */
  AztecAddress: typeof AztecAddress.schema;

  /** Accepts a hex string. */
  FunctionSelector: typeof FunctionSelector.schema;

  /** Accepts a hex string. */
  NoteSelector: typeof NoteSelector.schema;

  /** Accepts a hex string. */
  EventSelector: typeof EventSelector.schema;
};

/** Validation schemas for common types. Every schema must match its toJSON. */
export const schemas: typeof foundationSchemas & StdLibSchemas = {
  /** Accepts a hex string. */
  AztecAddress: AztecAddress.schema,

  /** Accepts a hex string. */
  FunctionSelector: FunctionSelector.schema,

  /** Accepts a hex string. */
  NoteSelector: NoteSelector.schema,

  /** Accepts a hex string. */
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
