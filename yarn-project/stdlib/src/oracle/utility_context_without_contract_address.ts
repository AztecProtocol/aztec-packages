import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { UInt64 } from '../types/shared.js';

/**
 * A class used as a return value of the getUtilityContextWithoutContractAddress function on Aztec Node which is in
 * turn used when processing the utilityGetUtilityContext oracle. PXE then uses values in this class along with
 * the locally stored contract address to construct the UtilityContext and return it from the utilityGetUtilityContext
 * oracle.
 */
export class UtilityContextWithoutContractAddress {
  constructor(
    public readonly blockNumber: number,
    public readonly timestamp: UInt64,
    public readonly version: number,
    public readonly chainId: number,
  ) {}
}

export const UtilityContextWithoutContractAddressSchema = z.object({
  blockNumber: z.number(),
  timestamp: schemas.BigInt,
  version: z.number(),
  chainId: z.number(),
});
