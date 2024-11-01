import { z } from 'zod';

import { EthAddress } from '../eth-address/index.js';
import { Signature } from '../eth-signature/eth_signature.js';
import { hasHexPrefix, isHex, withoutHexPrefix } from '../string/index.js';

/**
 * Validation schemas for common types. Every schema should match its type toJSON.
 */
export const schemas = {
  /** Accepts both a 0x string and a structured { type: EthAddress, value: '0x...' } */
  EthAddress: z
    .union([
      z.string().refine(EthAddress.isAddress, 'Not a valid Ethereum address'),
      z.object({
        type: z.literal('EthAddress'),
        value: z.string().refine(EthAddress.isAddress, 'Not a valid Ethereum address'),
      }),
    ])
    .transform(input => EthAddress.fromString(typeof input === 'string' ? input : input.value)),

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

  /** Accepts a base64 string or a structured { type: 'Buffer', data: [byte, byte...] } */
  Buffer: z.union([
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

  /** Hex string with an optional 0x prefix, which gets removed as part of the parsing */
  Hex: z.string().refine(isHex, 'Not a valid hex string').transform(withoutHexPrefix),
};
