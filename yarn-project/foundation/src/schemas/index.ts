import { z } from 'zod';

import { EthAddress } from '../eth-address/index.js';
import { Signature } from '../eth-signature/eth_signature.js';

/** Common zod schemas for foundation types. */
export const schemas = {
  EthAddress: z.string().refine(EthAddress.isAddress, 'Not a valid Ethereum address').transform(EthAddress.fromString),
  Signature: z
    .string()
    .regex(/^0x[0-9a-f]$/i)
    .min(/* 0x + r (64) + s (64) + v (2+) */ 132)
    .transform(val => Signature.from0xString(val as `0x${string}`)),
  BigInt: z.coerce.bigint(),
  Integer: z.coerce.number().int(),
};

/** Parses the given arguments using a tuple from the provided schemas. */
export function parse<T extends [] | [z.ZodTypeAny, ...z.ZodTypeAny[]]>(args: IArguments, ...schemas: T) {
  return z.tuple(schemas).parse(args);
}
