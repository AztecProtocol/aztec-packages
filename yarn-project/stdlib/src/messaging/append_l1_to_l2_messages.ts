import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';

import type { MerkleTreeWriteOperations } from '../interfaces/merkle_tree_operations.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';

/**
 * Pads `l1ToL2Messages` to `NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP` and appends them to the
 * L1→L2 message tree of `db`. Use whenever a fork at "state before the first block of a
 * checkpoint" needs to mirror what the world-state synchronizer inserts at sync time.
 */
export async function appendL1ToL2MessagesToTree(db: MerkleTreeWriteOperations, l1ToL2Messages: Fr[]): Promise<void> {
  const padded = padArrayEnd<Fr, number>(
    l1ToL2Messages,
    Fr.ZERO,
    NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
    'Too many L1 to L2 messages',
  );
  await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, padded);
}
