import { OUT_HASH_TREE_LEAF_COUNT } from '@aztec/constants';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { SiblingPath, UnbalancedMerkleTreeCalculator, computeUnbalancedShaRoot } from '@aztec/foundation/trees';

/**
 * # L2-to-L1 Message Tree Structure and Leaf IDs
 *
 * ## Overview
 * L2-to-L1 messages are organized in a hierarchical 4-level tree structure within each epoch:
 *   Epoch → Checkpoints → Blocks → Transactions → Messages
 *
 * Each level uses an unbalanced Merkle tree, and some levels use compression (skipping zero hashes).
 *
 * ## Tree Levels
 *
 * 1. **Message Tree (TX Out Hash)**
 *    - Leaves: Individual L2-to-L1 messages within a transaction
 *    - Root: TX out hash
 *    - Type: Unbalanced, non-compressed (the circuits ensure that all messages are not empty.)
 *
 * 2. **Block Tree**
 *    - Leaves: TX out hashes from all transactions in a block
 *    - Root: Block out hash
 *    - Type: Unbalanced, compressed (zero hashes are skipped)
 *    - Compression: If a tx has no messages (out hash = 0), that branch is ignored
 *
 * 3. **Checkpoint Tree**
 *    - Leaves: Block out hashes from all blocks in a checkpoint
 *    - Root: Checkpoint out hash
 *    - Type: Unbalanced, compressed (zero hashes are skipped)
 *    - Compression: If a block has no messages (out hash = 0), that branch is ignored
 *
 * 4. **Epoch Tree**
 *    - Leaves: Checkpoint out hashes from all checkpoints in an epoch (padded to OUT_HASH_TREE_LEAF_COUNT)
 *    - Root: Epoch out hash (set in the root rollup's public inputs and inserted into the Outbox on L1 when the epoch is proven)
 *    - Type: Unbalanced, non-compressed
 *    - **Important**: Padded with zeros up to OUT_HASH_TREE_LEAF_COUNT to allow for proofs of partial epochs
 *
 * ## Combined Membership Proof
 * To prove a message exists in an epoch, we combine the sibling paths from all 4 trees:
 *   [message siblings] + [tx siblings] + [block siblings] + [checkpoint siblings]
 *
 * ## Leaf ID: Stable Message Identification
 *
 * Each message gets a unique, stable **leaf ID** that identifies its position in the combined tree.
 * The leaf ID is computed as:
 *   leafId = 2^pathSize + leafIndex
 *
 * Where:
 * - `pathSize`: Total length of the combined sibling path (from all 4 tree levels)
 * - `leafIndex`: The message's index in a balanced tree representation at that height
 *
 * ### Why Leaf IDs Are Stable
 *
 * The leaf ID is based on the message's position in the tree structure, which is determined by:
 * - The checkpoint index within the epoch
 * - The block index within the checkpoint
 * - The transaction index within the block
 * - The message index within the transaction
 *
 * These indices are structural and do NOT depend on the total number of blocks/checkpoints in the epoch.
 *
 * ### Critical Property: Preserving Consumed Status
 *
 * **Problem**: On L1, epoch proofs can be submitted incrementally. For example:
 * - First, a proof for checkpoints 1-10 of epoch 0 is submitted (proves the first 10 checkpoints)
 * - Later, a proof for checkpoints 1-20 of epoch 0 is submitted (proves all 20 checkpoints)
 *
 * When the longer proof is submitted, it updates the epoch's out hash root on L1 to reflect the complete epoch (all 20
 * checkpoints). However, some messages from checkpoints 1-10 may have already been consumed.
 *
 * **Solution**: The Outbox on L1 tracks consumed messages using a bitmap indexed by leaf ID.
 * Because leaf IDs are stable (they don't change when more checkpoints are added to the epoch), messages that were consumed
 * under the shorter proof remain marked as consumed under the longer proof.
 *
 * This prevents double-spending of L2-to-L1 messages when longer epoch proofs are submitted.
 */

/**
 * Computes the unique leaf ID for an L2-to-L1 message.
 *
 * The leaf ID is stable across different epoch proof lengths and is used by the Outbox
 * on L1 to track which messages have been consumed.
 *
 * @param membershipWitness - Contains the leafIndex and siblingPath for the message
 * @returns The unique leaf ID used for tracking message consumption on L1
 */
export function getL2ToL1MessageLeafId(
  membershipWitness: Pick<L2ToL1MembershipWitness, 'leafIndex' | 'siblingPath'>,
): bigint {
  return 2n ** BigInt(membershipWitness.siblingPath.pathSize) + membershipWitness.leafIndex;
}

export interface MessageRetrieval {
  getL2ToL1Messages(epoch: EpochNumber): Promise<Fr[][][][]>;
}

export type L2ToL1MembershipWitness = {
  root: Fr;
  leafIndex: bigint;
  siblingPath: SiblingPath<number>;
};

export async function computeL2ToL1MembershipWitness(
  messageRetriever: MessageRetrieval,
  epoch: EpochNumber,
  message: Fr,
): Promise<L2ToL1MembershipWitness | undefined> {
  const messagesInEpoch = await messageRetriever.getL2ToL1Messages(epoch);
  if (messagesInEpoch.length === 0) {
    return undefined;
  }

  return computeL2ToL1MembershipWitnessFromMessagesInEpoch(messagesInEpoch, message);
}

// TODO: Allow to specify the message to consume by its index or by an offset, in case there are multiple messages with
// the same value.
export function computeL2ToL1MembershipWitnessFromMessagesInEpoch(
  messagesInEpoch: Fr[][][][],
  message: Fr,
): L2ToL1MembershipWitness {
  // Find the index of the message in the tx, index of the tx in the block, and index of the block in the epoch.
  let messageIndexInTx = -1;
  let txIndex = -1;
  let blockIndex = -1;
  const checkpointIndex = messagesInEpoch.findIndex(messagesInCheckpoint => {
    blockIndex = messagesInCheckpoint.findIndex(messagesInBlock => {
      txIndex = messagesInBlock.findIndex(messagesInTx => {
        messageIndexInTx = messagesInTx.findIndex(msg => msg.equals(message));
        return messageIndexInTx !== -1;
      });
      return txIndex !== -1;
    });
    return blockIndex !== -1;
  });

  if (checkpointIndex === -1) {
    throw new Error('The L2ToL1Message you are trying to prove inclusion of does not exist');
  }

  // Build the tx tree.
  const messagesInTx = messagesInEpoch[checkpointIndex][blockIndex][txIndex];
  const txTree = UnbalancedMerkleTreeCalculator.create(messagesInTx.map(msg => msg.toBuffer()));
  // Get the sibling path of the target message in the tx tree.
  const pathToMessageInTxSubtree = txTree.getSiblingPathByLeafIndex(messageIndexInTx);

  // Build the tree of the block containing the target message.
  const blockTree = buildBlockTree(messagesInEpoch[checkpointIndex][blockIndex]);
  // Get the sibling path of the tx out hash in the block tree.
  const pathToTxOutHashInBlockTree = blockTree.getSiblingPathByLeafIndex(txIndex);

  // Build the tree of the checkpoint containing the target message.
  const checkpointTree = buildCheckpointTree(messagesInEpoch[checkpointIndex]);
  // Get the sibling path of the block out hash in the checkpoint tree.
  const pathToBlockOutHashInCheckpointTree = checkpointTree.getSiblingPathByLeafIndex(blockIndex);

  // Compute the out hashes of all checkpoints in the epoch.
  let checkpointOutHashes = messagesInEpoch.map((messagesInCheckpoint, i) => {
    if (i === checkpointIndex) {
      return checkpointTree.getRoot();
    }
    return buildCheckpointTree(messagesInCheckpoint).getRoot();
  });
  // Pad to OUT_HASH_TREE_LEAF_COUNT with zeros.
  checkpointOutHashes = checkpointOutHashes.concat(
    Array.from({ length: OUT_HASH_TREE_LEAF_COUNT - messagesInEpoch.length }, () => Buffer.alloc(32)),
  );

  // Build the epoch tree with all the checkpoint out hashes, including the padded zeros.
  // Note: The epoch tree is actually a balanced tree, but we use an unbalanced tree calculator here to avoid turning
  // this function into async.
  const epochTree = UnbalancedMerkleTreeCalculator.create(checkpointOutHashes);
  // Get the sibling path of the checkpoint out hash in the epoch tree.
  const pathToCheckpointOutHashInEpochTree = epochTree.getSiblingPathByLeafIndex(checkpointIndex);

  // The root of the epoch tree should match the `out_hash` in the root rollup's public inputs.
  const root = Fr.fromBuffer(epochTree.getRoot());

  // Compute the combined sibling path by appending the tx subtree path to the block tree path, then to the checkpoint
  // tree path, then to the epoch tree path.
  const combinedPath = pathToMessageInTxSubtree
    .toBufferArray()
    .concat(pathToTxOutHashInBlockTree.toBufferArray())
    .concat(pathToBlockOutHashInCheckpointTree.toBufferArray())
    .concat(pathToCheckpointOutHashInEpochTree.toBufferArray());

  // Compute the combined index.
  // It is the index of the message in the balanced tree (by filling up the wonky tree with empty nodes) at its current
  // height. It's used to validate the membership proof.
  const messageLeafPosition = txTree.getLeafLocation(messageIndexInTx);
  const txLeafPosition = blockTree.getLeafLocation(txIndex);
  const blockLeafPosition = checkpointTree.getLeafLocation(blockIndex);
  const checkpointLeafPosition = epochTree.getLeafLocation(checkpointIndex);
  const numLeavesInLeftCheckpoints = checkpointLeafPosition.index * (1 << blockLeafPosition.level);
  const indexAtCheckpointLevel = numLeavesInLeftCheckpoints + blockLeafPosition.index;
  const numLeavesInLeftBlocks = indexAtCheckpointLevel * (1 << txLeafPosition.level);
  const indexAtTxLevel = numLeavesInLeftBlocks + txLeafPosition.index;
  const numLeavesInLeftTxs = indexAtTxLevel * (1 << messageLeafPosition.level);
  const combinedIndex = numLeavesInLeftTxs + messageLeafPosition.index;

  return {
    root,
    leafIndex: BigInt(combinedIndex),
    siblingPath: new SiblingPath(combinedPath.length, combinedPath),
  };
}

function buildCheckpointTree(messagesInCheckpoint: Fr[][][]) {
  const blockOutHashes = messagesInCheckpoint.map(messagesInBlock => buildBlockTree(messagesInBlock).getRoot());
  return buildCompressedTree(blockOutHashes);
}

function buildBlockTree(messagesInBlock: Fr[][]) {
  const txOutHashes = messagesInBlock.map(messages => computeUnbalancedShaRoot(messages.map(msg => msg.toBuffer())));
  return buildCompressedTree(txOutHashes);
}

function buildCompressedTree(leaves: Buffer[]) {
  // Note: If a block or tx has no messages (i.e. leaf == Buffer.alloc(32)), we ignore that branch and only accumulate
  // the non-zero hashes to match what the circuits do.
  const valueToCompress = Buffer.alloc(32);
  return UnbalancedMerkleTreeCalculator.create(leaves, valueToCompress);
}
