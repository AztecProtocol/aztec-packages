import { z } from 'zod';

import { type AbiDecoded } from '../abi/decoder.js';
import { EventSelector } from '../abi/event_selector.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { NoteSelector } from '../abi/note_selector.js';
import { AztecAddress } from '../aztec-address/index.js';
import { Buffer32 } from '../buffer/buffer32.js';
import { EthAddress } from '../eth-address/index.js';
import { Signature } from '../eth-signature/eth_signature.js';
import { Fq, Fr } from '../fields/fields.js';
import { Point } from '../fields/point.js';
import { hasHexPrefix, isHex, withoutHexPrefix } from '../string/index.js';
import { type ZodFor } from './types.js';
import { hexSchema, maybeStructuredStringSchemaFor } from './utils.js';

const FrSchema = maybeStructuredStringSchemaFor('Fr', Fr, isHex);
const FqSchema = maybeStructuredStringSchemaFor('Fq', Fq, isHex);

/** Validation schemas for common types. Every schema must match its toJSON. */
export const schemas = {
  /** Accepts both a 0x string and a structured `{ type: EthAddress, value: '0x...' }` */
  EthAddress: maybeStructuredStringSchemaFor('EthAddress', EthAddress, EthAddress.isAddress),

  /** Accepts both a 0x string and a structured `{ type: AztecAddress, value: '0x...' }` */
  AztecAddress: maybeStructuredStringSchemaFor('AztecAddress', AztecAddress, AztecAddress.isAddress),

  /** Accepts both a 0x string and a structured type. */
  FunctionSelector: maybeStructuredStringSchemaFor('FunctionSelector', FunctionSelector),

  /** Accepts both a 0x string and a structured type. */
  NoteSelector: maybeStructuredStringSchemaFor('NoteSelector', NoteSelector),

  /** Accepts both a 0x string and a structured type. */
  EventSelector: maybeStructuredStringSchemaFor('EventSelector', EventSelector),

  /** Field element. Accepts a 0x prefixed hex string or a structured type. */
  Fr: FrSchema,

  /** Field element. Accepts a 0x prefixed hex string or a structured type. */
  Fq: FqSchema,

  /** Point. Serialized as 0x prefixed string or a type. */
  Point: z
    .object({
      x: FrSchema,
      y: FrSchema,
      isInfinite: z.boolean().optional(),
    })
    .or(hexSchema)
    .transform(value =>
      typeof value === 'string' ? Point.fromString(value) : new Point(value.x, value.y, value.isInfinite ?? false),
    ),

  /** Accepts a 0x string */
  Signature: z
    .string()
    .refine(hasHexPrefix, 'No hex prefix')
    .refine(Signature.isValid0xString, 'Not a valid Ethereum signature')
    .transform(Signature.from0xString),

  /** Coerces any input to bigint */
  BigInt: z.union([z.bigint(), z.number(), z.string()]).pipe(z.coerce.bigint()),

  /** Coerces any input to integer number */
  Integer: z.union([z.bigint(), z.number(), z.string()]).pipe(z.coerce.number().int()),

  /** Coerces input to UInt32 */
  UInt32: z.union([z.bigint(), z.number(), z.string()]).pipe(
    z.coerce
      .number()
      .int()
      .min(0)
      .max(2 ** 32 - 1),
  ),

  /** Accepts a hex string as a Buffer32 type */
  Buffer32: z.string().refine(isHex, 'Not a valid hex string').transform(Buffer32.fromString),

  /** Accepts a base64 string or a structured `{ type: 'Buffer', data: [byte, byte...] }` as a buffer */
  BufferB64: z.union([
    z
      .string()
      .base64()
      .transform(data => Buffer.from(data, 'base64')),
    z
      .object({
        type: z.literal('Buffer'),
        data: z.array(z.number().int().max(255)),
      })
      .transform(({ data }) => Buffer.from(data)),
  ]),

  /** Accepts a hex string with optional 0x prefix as a buffer */
  BufferHex: z
    .string()
    .refine(isHex, 'Not a valid hex string')
    .transform(withoutHexPrefix)
    .transform(data => Buffer.from(data, 'hex')),

  /** Hex string with an optional 0x prefix, which gets removed as part of the parsing */
  HexString: hexSchema,
};

export const AbiDecodedSchema: ZodFor<AbiDecoded> = z.union([
  schemas.BigInt,
  z.boolean(),
  schemas.AztecAddress,
  z.array(z.lazy(() => AbiDecodedSchema)),
  z.record(z.lazy(() => AbiDecodedSchema)),
]);
