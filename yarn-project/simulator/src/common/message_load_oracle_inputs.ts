import { type SiblingPath } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';

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
}
