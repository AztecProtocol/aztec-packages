import { Fr } from '@aztec/foundation/fields';
import type { SiblingPath } from '@aztec/foundation/trees';

export class MessageLoadOracleInputs<N extends number> {
  constructor(
    /** The index of the message commitment in the merkle tree. */
    public index: bigint,
    /** The path in the merkle tree to the message. */
    public siblingPath: SiblingPath<N>,
  ) {}

  toFields(): Fr[] {
    return [new Fr(this.index), ...this.siblingPath.toFields()];
  }

  /**
   * Returns a representation of the public data witness as expected by intrinsic Noir deserialization.
   */
  public toNoirRepresentation(): (string | string[])[] {
    // TODO(#12874): remove the stupid as string conversion by modifying ForeignCallOutput type in acvm.js
    return [new Fr(this.index).toString() as string, this.siblingPath.toFields().map(fr => fr.toString()) as string[]];
  }
}
