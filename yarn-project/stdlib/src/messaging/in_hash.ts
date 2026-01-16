import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { computeBalancedShaRoot } from '@aztec/foundation/trees';

/**
 * Computes the inHash for a checkpoint (or the first block in a checkpoint) given its l1 to l2 messages.
 */
export function computeInHashFromL1ToL2Messages(unpaddedL1ToL2Messages: Fr[]): Fr {
  const l1ToL2Messages = padArrayEnd<Fr, number>(unpaddedL1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  return new Fr(computeBalancedShaRoot(l1ToL2Messages.map(msg => msg.toBuffer())));
}
