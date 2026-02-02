import { toACVMField } from '@aztec/simulator/client';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHeader } from '@aztec/stdlib/tx';

/**
 * TypeScript counterpart of utility_context.nr. Used only as a return value for the utilityGetUtilityContext oracle.
 */
export class UtilityContext {
  constructor(
    public readonly blockHeader: BlockHeader,
    public readonly contractAddress: AztecAddress,
  ) {}

  /**
   * Returns a representation of the utility context as expected by intrinsic Noir deserialization.
   * The order of the fields has to be the same as the order of the fields in the utility_context.nr.
   */
  public toNoirRepresentation(): (string | string[])[] {
    // TODO(#12874): remove the stupid as string conversion by modifying ForeignCallOutput type in acvm.js
    const blockHeaderFields = this.blockHeader.toFields().map(toACVMField);
    return [...blockHeaderFields, this.contractAddress.toString() as string];
  }
}
