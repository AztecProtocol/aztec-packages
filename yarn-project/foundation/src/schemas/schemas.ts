import { z } from 'zod';

import { FunctionSelector } from '../abi/function_selector.js';
import { AztecAddress } from '../aztec-address/index.js';
import { Buffer32 } from '../buffer/buffer32.js';
import { EthAddress } from '../eth-address/index.js';
import { Signature } from '../eth-signature/eth_signature.js';
import { Fq, Fr } from '../fields/fields.js';
import { hasHexPrefix, isHex, withoutHexPrefix } from '../string/index.js';
import { hexSchema, maybeStructuredStringSchemaFor } from './utils.js';

/** Validation schemas for common types. Every schema must match its toJSON. */
export const schemas = {
  /** Accepts both a 0x string and a structured { type: EthAddress, value: '0x...' } */
  EthAddress: maybeStructuredStringSchemaFor('EthAddress', EthAddress, EthAddress.isAddress),

  /** Accepts both a 0x string and a structured { type: AztecAddress, value: '0x...' } */
  AztecAddress: maybeStructuredStringSchemaFor('AztecAddress', AztecAddress, AztecAddress.isAddress),

  /** Accepts both a 0x string and a structured type. */
  FunctionSelector: maybeStructuredStringSchemaFor('FunctionSelector', FunctionSelector),

  /** Field element. Accepts a 0x prefixed hex string or a structured type. */
  Fr: maybeStructuredStringSchemaFor('Fr', Fr, isHex),

  /** Field element. Accepts a 0x prefixed hex string or a structured type. */
  Fq: maybeStructuredStringSchemaFor('Fq', Fq, isHex),

  /** Accepts a 0x string */
  Signature: z
    .string()
    .refine(hasHexPrefix, 'No hex prefix')
    .refine(Signature.isValid0xString, 'Not a valid Ethereum signature')
    .transform(Signature.from0xString),

  /** Coerces any input to bigint */
  BigInt: z.coerce.bigint(),

  /** Coerces any input to integer number */
  Integer: z.coerce.number().int(),

  /** Coerces input to UInt32 */
  UInt32: z.coerce
    .number()
    .int()
    .max(2 ** 32 - 1),

  /** Accepts a hex string as a Buffer32 type */
  Buffer32: z.string().refine(isHex, 'Not a valid hex string').transform(Buffer32.fromString),

  /** Accepts a base64 string or a structured { type: 'Buffer', data: [byte, byte...] } as a buffer */
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
