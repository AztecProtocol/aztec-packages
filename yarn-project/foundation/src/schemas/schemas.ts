import { z } from 'zod';

import { type AbiDecoded } from '../abi/decoder.js';
import { EventSelector } from '../abi/event_selector.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { NoteSelector } from '../abi/note_selector.js';
import { AztecAddress } from '../aztec-address/index.js';
import { Buffer32 } from '../buffer/buffer32.js';
import { EthAddress } from '../eth-address/index.js';
import { Fq, Fr } from '../fields/fields.js';
import { Point } from '../fields/point.js';
import { isHex, withoutHexPrefix } from '../string/index.js';
import { type ZodFor } from './types.js';
import { hexSchema } from './utils.js';

// Copied from zod internals, which was copied from https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

/** Validation schemas for common types. Every schema must match its toJSON. */
export const schemas = {
  /** Accepts a hex string. */
  EthAddress: EthAddress.schema,

  /** Accepts a hex string. */
  AztecAddress: AztecAddress.schema,

  /** Accepts a hex string. */
  FunctionSelector: FunctionSelector.schema,

  /** Accepts a hex string. */
  NoteSelector: NoteSelector.schema,

  /** Accepts a hex string. */
  EventSelector: EventSelector.schema,

  /** Accepts a hex string. */
  Fr: Fr.schema,

  /** Accepts a hex string. */
  Fq: Fq.schema,

  /** Point. Serialized as a hex string. */
  Point: Point.schema,

  /** Coerces any input to bigint. */
  BigInt: z.union([z.bigint(), z.number(), z.string()]).pipe(z.coerce.bigint()),

  /** Coerces any input to integer number. */
  Integer: z.union([z.bigint(), z.number(), z.string()]).pipe(z.coerce.number().int()),

  /** Coerces input to UInt32. */
  UInt32: z.union([z.bigint(), z.number(), z.string()]).pipe(
    z.coerce
      .number()
      .int()
      .min(0)
      .max(2 ** 32 - 1),
  ),

  /** Accepts a hex string as a Buffer32 type. */
  Buffer32: z.string().refine(isHex, 'Not a valid hex string').transform(Buffer32.fromString),

  /** Accepts a base64 string or an object `{ type: 'Buffer', data: [byte, byte...] }` as a buffer. */
  Buffer: z.union([
    z
      .string()
      // We only test the str for base64 if it's shorter than 1024 bytes, otherwise we've run into maximum
      // stack size exceeded errors when trying to validate excessively long strings (such as contract bytecode).
      .refine(str => str.length > 1024 || base64Regex.test(str), 'Not a valid base64 string')
      .transform(data => Buffer.from(data, 'base64')),
    z
      .object({
        type: z.literal('Buffer'),
        data: z.array(z.number().int().min(0).max(255)),
      })
      .transform(({ data }) => Buffer.from(data)),
  ]),

  /** Accepts a hex string as a buffer. */
  BufferHex: z
    .string()
    .refine(isHex, 'Not a valid hex string')
    .transform(withoutHexPrefix)
    .transform(data => Buffer.from(data, 'hex')),

  /** Hex string with an optional 0x prefix which gets removed as part of the parsing. */
  HexString: hexSchema,
};

export const AbiDecodedSchema: ZodFor<AbiDecoded> = z.union([
  schemas.BigInt,
  z.boolean(),
  schemas.AztecAddress,
  z.array(z.lazy(() => AbiDecodedSchema)),
  z.record(z.lazy(() => AbiDecodedSchema)),
]);
