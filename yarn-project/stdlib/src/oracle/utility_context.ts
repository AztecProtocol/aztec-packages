import { Fr } from '@aztec/foundation/fields';
import type { FieldsOf } from '@aztec/foundation/types';

import type { AztecAddress } from '../aztec-address/index.js';
import type { UInt64 } from '../types/shared.js';
import type { UtilityContextWithoutContractAddress } from './utility_context_without_contract_address.js';

/**
 * TypeScript counterpart of utility_context.nr. Used only as a return value for the utilityGetUtilityContext oracle.
 */
export class UtilityContext {
  private constructor(
    public readonly blockNumber: number,
    public readonly timestamp: UInt64,
    public readonly contractAddress: AztecAddress,
    public readonly version: Fr,
    public readonly chainId: Fr,
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

  static from(fields: FieldsOf<UtilityContext>) {
    return new UtilityContext(
      fields.blockNumber,
      fields.timestamp,
      fields.contractAddress,
      fields.version,
      fields.chainId,
    );
  }

  /**
   * Returns a representation of the utility context as expected by intrinsic Noir deserialization.
   * The order of the fields has to be the same as the order of the fields in the utility_context.nr.
   */
  public toNoirRepresentation(): (string | string[])[] {
    // TODO(#12874): remove the stupid as string conversion by modifying ForeignCallOutput type in acvm.js
    return [
      new Fr(this.blockNumber).toString() as string,
      new Fr(this.timestamp).toString() as string,
      this.contractAddress.toString() as string,
      this.version.toString() as string,
      this.chainId.toString() as string,
    ];
  }
}
