import type { NULLIFIER_TREE_HEIGHT } from '@aztec/constants';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { NullifierLeafPreimage, NullifierMembershipWitness } from '@aztec/stdlib/trees';

/**
 * A nullifier leaf preimage and the witness proving its membership in the nullifier tree.
 */
export type NullifierMembershipWitnessData = {
  leafPreimage: NullifierLeafPreimage;
  witness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>;
};

export function toNullifierMembershipWitnessData(witness: NullifierMembershipWitness): NullifierMembershipWitnessData {
  return { leafPreimage: witness.leafPreimage, witness: witness.withoutPreimage() };
}
