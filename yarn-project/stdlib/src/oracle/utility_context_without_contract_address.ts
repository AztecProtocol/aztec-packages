import { schemas } from '@aztec/foundation/schemas';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import type { UInt64 } from '../types/shared.js';

/**
 * A class used as a return value of the getUtilityContextWithoutContractAddress function on Aztec Node which is in
 * turn used when processing the utilityGetUtilityContext oracle. PXE then uses values in this class along with
 * the locally stored contract address to construct the UtilityContext and return it from the utilityGetUtilityContext
 * oracle.
 */
export class UtilityContextWithoutContractAddress {
  private constructor(
    public readonly blockNumber: number,
    public readonly timestamp: UInt64,
    public readonly version: number,
    public readonly chainId: number,
  ) {}

  static from(fields: FieldsOf<UtilityContextWithoutContractAddress>) {
    return new UtilityContextWithoutContractAddress(
      fields.blockNumber,
      fields.timestamp,
      fields.version,
      fields.chainId,
    );
  }
}

export const UtilityContextWithoutContractAddressSchema = z.object({
  blockNumber: z.number(),
  timestamp: schemas.BigInt,
  version: z.number(),
  chainId: z.number(),
});
