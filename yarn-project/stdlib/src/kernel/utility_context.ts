import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import type { UInt64 } from '../types/shared.js';

// TODO(benesjan): move this to a different place, it doesn't belong here
export class UtilityContext {
  private constructor(
    private readonly blockNumber: number,
    private readonly timestamp: UInt64,
    private readonly contractAddress: AztecAddress,
    private readonly version: Fr,
    private readonly chainId: Fr,
  ) {}

  static fromUtilityContextWithoutContractAddressAndContractAddress(
    context: UtilityContextWithoutContractAddress,
    contractAddress: AztecAddress,
  ): UtilityContext {
    return new UtilityContext(
      context.blockNumber,
      context.timestamp,
      contractAddress,
      new Fr(context.version),
      new Fr(context.chainId),
    );
  }

  /**
   * Returns a representation of the utility context as expected by intrinsic Noir deserialization.
   */
  public toNoirRepresentation(): (string | string[])[] {
    // TODO(#12874): remove the stupid as string conversion by modifying ForeignCallOutput type in acvm.js
    return [
      this.blockNumber.toString() as string,
      this.timestamp.toString() as string,
      this.contractAddress.toString() as string,
      this.version.toString() as string,
      this.chainId.toString() as string,
    ];
  }
}

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
