import type { SiblingPath } from '@aztec/foundation/trees';

export type MessageLoadOracleInputs<N extends number> = {
  /** The index of the message commitment in the merkle tree. */
  index: bigint;
  /** The path in the merkle tree to the message. */
  siblingPath: SiblingPath<N>;
};
