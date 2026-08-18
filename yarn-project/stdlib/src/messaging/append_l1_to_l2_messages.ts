import type { Fr } from '@aztec/foundation/curves/bn254';

import type { MerkleTreeWriteOperations } from '../interfaces/merkle_tree_operations.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';

/**
 * Appends a block's real L1→L2 message leaves (unpadded, at compact indices) to the L1→L2 message tree of `db`.
 * Use whenever a fork at "state before a block" needs to mirror what the world-state
 * synchronizer inserts at sync time.
 */
export async function appendL1ToL2MessagesToTree(db: MerkleTreeWriteOperations, l1ToL2Messages: Fr[]): Promise<void> {
  await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);
}
