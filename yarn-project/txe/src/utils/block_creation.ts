import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { L2BlockHeader } from '@aztec/stdlib/block';
import { makeContentCommitment } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot, MerkleTreeId, type MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import { GlobalVariables, TxEffect } from '@aztec/stdlib/tx';

/**
 * Returns a transaction request hash that is valid for transactions that are the only ones in a block.
 * @param blockNumber The number for the block in which there is a single transaction.
 * @returns The transaction request hash.
 */
export function getSingleTxBlockRequestHash(blockNumber: number): Fr {
  return new Fr(blockNumber + 9999); // Why does this need to be a high number? Why do small numbered nullifiers already exist?
}

export async function insertTxEffectIntoWorldTrees(
  txEffect: TxEffect,
  worldTrees: MerkleTreeWriteOperations,
): Promise<void> {
  await worldTrees.appendLeaves(
    MerkleTreeId.NOTE_HASH_TREE,
    padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
  );

  await worldTrees.batchInsert(
    MerkleTreeId.NULLIFIER_TREE,
    padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(nullifier => nullifier.toBuffer()),
    NULLIFIER_SUBTREE_HEIGHT,
  );

  await worldTrees.appendLeaves(
    MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
    padArrayEnd(txEffect.l2ToL1Msgs, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
  );

  // We do not need to add public data writes because we apply them as we go.
}

export async function makeTXEBlockHeader(
  worldTrees: MerkleTreeWriteOperations,
  globalVariables: GlobalVariables,
): Promise<L2BlockHeader> {
  const stateReference = await worldTrees.getStateReference();
  const archiveInfo = await worldTrees.getTreeInfo(MerkleTreeId.ARCHIVE);

  return new L2BlockHeader(
    new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
    makeContentCommitment(),
    stateReference,
    globalVariables,
    Fr.ZERO,
    Fr.ZERO,
    Fr.ZERO,
  );
}
