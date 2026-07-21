import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Body, L2Block } from '@aztec/stdlib/block';
import { AppendOnlyTreeSnapshot, MerkleTreeId, type MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, TxEffect } from '@aztec/stdlib/tx';

/**
 * Returns a transaction request hash that is valid for transactions that are the only ones in a block.
 * @param blockNumber The number for the block in which there is a single transaction.
 * @returns The transaction request hash.
 */
export function getSingleTxBlockRequestHash(blockNumber: BlockNumber): Fr {
  return new Fr(blockNumber + 9999); // Why does this need to be a high number? Why do small numbered nullifiers already exist?
}

export async function insertTxEffectIntoWorldTrees(
  txEffect: TxEffect,
  worldTrees: MerkleTreeWriteOperations,
  l1ToL2Messages: Fr[] = [],
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
    padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
  );

  // We do not need to add public data writes because we apply them as we go.
}

export async function makeTXEBlockHeader(
  worldTrees: MerkleTreeWriteOperations,
  globalVariables: GlobalVariables,
): Promise<BlockHeader> {
  const stateReference = await worldTrees.getStateReference();
  const archiveInfo = await worldTrees.getTreeInfo(MerkleTreeId.ARCHIVE);

  return BlockHeader.from({
    lastArchive: new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
    spongeBlobHash: Fr.ZERO,
    state: stateReference,
    globalVariables,
    totalFees: Fr.ZERO,
    totalManaUsed: Fr.ZERO,
  });
}

/**
 * Creates an L2Block with proper archive chaining.
 * This function:
 * 1. Gets the current archive state as lastArchive for the header
 * 2. Creates the block header
 * 3. Updates the archive tree with the header hash
 * 4. Gets the new archive state for the block's archive
 *
 * @param worldTrees - The world trees to read/write from
 * @param globalVariables - Global variables for the block
 * @param txEffects - Transaction effects to include in the block
 * @returns The created L2Block with proper archive chaining
 */
export async function makeTXEBlock(
  worldTrees: MerkleTreeWriteOperations,
  globalVariables: GlobalVariables,
  txEffects: TxEffect[],
): Promise<L2Block> {
  const header = await makeTXEBlockHeader(worldTrees, globalVariables);

  // Update the archive tree with this block's header hash
  await worldTrees.updateArchive(header);

  // Get the new archive state after updating
  const newArchiveInfo = await worldTrees.getTreeInfo(MerkleTreeId.ARCHIVE);
  const newArchive = new AppendOnlyTreeSnapshot(new Fr(newArchiveInfo.root), Number(newArchiveInfo.size));

  // L2Block requires checkpointNumber and indexWithinCheckpoint.
  // TXE uses 1-block-per-checkpoint for testing simplicity, so we can use block number as checkpoint number.
  // This uses the deprecated fromBlockNumber method intentionally for the TXE testing environment.
  const checkpointNumber = CheckpointNumber.fromBlockNumber(globalVariables.blockNumber);
  const indexWithinCheckpoint = IndexWithinCheckpoint(0);

  return new L2Block(newArchive, header, new Body(txEffects), checkpointNumber, indexWithinCheckpoint);
}
