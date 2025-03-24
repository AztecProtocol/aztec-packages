import type { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Fq, Fr, Point } from '@aztec/foundation/fields';
import { type ZodFor, schemas as foundationSchemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { AbiDecoded } from '../abi/decoder.js';
import { EventSelector } from '../abi/event_selector.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { NoteSelector } from '../abi/note_selector.js';
import { AztecAddress } from '../aztec-address/index.js';

/**
 * Validation schemas for common types. Every schema must match its toJSON.
 * Foundation schemas are repeated here to aid type inference
 * */
export const schemas = {
  /** Accepts a hex string. */
  EthAddress: foundationSchemas.EthAddress as ZodFor<EthAddress>,

  /** Accepts a hex string. */
  Fr: foundationSchemas.Fr as ZodFor<Fr>,

  /** Accepts a hex string. */
  Fq: foundationSchemas.Fq as ZodFor<Fq>,

  /** Point. Serialized as a hex string. */
  Point: foundationSchemas.Point as ZodFor<Point>,

  /** Coerces any input to bigint. */
  BigInt: foundationSchemas.BigInt,

  /** Coerces any input to integer number. */
  Integer: foundationSchemas.Integer,

  /** Coerces input to UInt32. */
  UInt32: foundationSchemas.UInt32,

  /** Accepts a hex string as a Buffer32 type. */
  Buffer32: foundationSchemas.Buffer32 as ZodFor<Buffer32>,

  /** Accepts a base64 string or an object `{ type: 'Buffer', data: [byte, byte...] }` as a buffer. */
  Buffer: foundationSchemas.Buffer,

  /** Accepts a hex string as a buffer. */
  BufferHex: foundationSchemas.BufferHex,

  /** Hex string with an optional 0x prefix which gets removed as part of the parsing. */
  HexString: foundationSchemas.HexString,

  /** Schema for secret config value */
  SecretValue: foundationSchemas.SecretValue,

  /** Accepts a hex string. */
  AztecAddress: AztecAddress.schema,

  /** Accepts a hex string. */
  NoteSelector: NoteSelector.schema,

  /** Accepts a hex string. */
  FunctionSelector: FunctionSelector.schema,

  /** Accepts a hex string. */
  EventSelector: EventSelector.schema,
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
  mapSchema,
  pickFromSchema,
} from '@aztec/foundation/schemas';
