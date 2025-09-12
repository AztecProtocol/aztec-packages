import { z } from 'zod';

import { Buffer32 } from '../buffer/buffer32.js';
import { SecretValue } from '../config/secret_value.js';
import { EthAddress } from '../eth-address/index.js';
import { Fq, Fr } from '../fields/fields.js';
import { Point } from '../fields/point.js';
import { isHex, withoutHexPrefix } from '../string/index.js';
import { bufferSchema, hexSchema } from './utils.js';

export const schemas = {
  /** Accepts a hex string. */
  EthAddress: EthAddress.schema,

  /** Accepts a hex string. */
  Fr: Fr.schema,

  /** Accepts a hex string. */
  Fq: Fq.schema,

  /** Point. Serialized as a hex string. */
  Point: Point.schema,

  /** Coerces truthy-like string values to boolean. */
  Boolean: z.union([
    z.boolean(),
    z
      .number()
      .refine(arg => arg === 0 || arg === 1, { message: `Numeric value for a boolean variable must be 0 or 1` })
      .transform(arg => arg === 1),
    z
      .string()
      .transform(arg => arg.trim().toLowerCase())
      .refine(arg => ['true', 'false', '1', '0'].includes(arg))
      .transform(arg => arg === '1' || arg === 'true'),
  ]),

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
    bufferSchema,
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

  /** A secret config value */
  SecretValue: SecretValue.schema,
};

// These are needed to avoid errors such as: "The inferred type of 'YourClassSchema' cannot be named without a reference to..."
export type { EthAddress, Fq, Fr, Point };
