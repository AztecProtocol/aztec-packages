import { SpongeBlob } from '@aztec/blob-lib';
import { encodeBlockBlobData } from '@aztec/blob-lib/encoding';
import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { MembershipWitness } from '@aztec/foundation/trees';
import { BlockHash } from '@aztec/stdlib/block';
import type { L2Block } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader, TxEffect, TxHash } from '@aztec/stdlib/tx';

import type { AncestorEffectsHints } from './types.js';

/**
 * Produces hints that prove a transaction's effects belong to a block that is an ancestor of the given anchor block.
 *
 * @param node - The Aztec node to query for blocks, effects, and membership witnesses.
 * @param txHash - Hash of the transaction whose effects we want to prove.
 * @param anchorBlockHash - Hash of the anchor block (the target block must be strictly before this one).
 * @returns The tx effects and the hints needed to verify ancestry.
 */
export async function produceAncestorEffectsHints(
  node: AztecNode,
  txHash: TxHash,
  anchorBlockHash: BlockHash,
): Promise<{ effects: TxEffect; hints: AncestorEffectsHints }> {
  // 1. Look up the tx effect
  const indexedTxEffect = await node.getTxEffect(txHash);
  if (!indexedTxEffect) {
    throw new Error(`Tx effect not found for hash ${txHash}`);
  }

  // 2. Fetch the tx's block and anchor block header in parallel
  const [txBlock, anchorBlockHeader] = await Promise.all([
    node.getBlock(indexedTxEffect.l2BlockNumber),
    node.getBlockHeader(anchorBlockHash),
  ]);
  if (!txBlock) {
    throw new Error(`Block ${indexedTxEffect.l2BlockNumber} not found`);
  }
  if (!anchorBlockHeader) {
    throw new Error(`Anchor block header not found for hash ${anchorBlockHash}`);
  }

  // 3. Get archive membership witness proving txBlock is in the anchor block's archive.
  // Special case: if the tx block IS the anchor block, archive membership is trivial — a block's
  // own hash isn't in its own archive, so we skip fetching a witness. The checker verifies this
  // case via header-hash equality instead.
  const txBlockHash = await txBlock.hash();
  let archiveMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined;
  if (!txBlockHash.equals(anchorBlockHash)) {
    archiveMembershipWitness = await node.getBlockHashMembershipWitness(anchorBlockHash, txBlockHash);
    if (!archiveMembershipWitness) {
      throw new Error(
        `Tx block ${txBlock.number} is not an ancestor of anchor block (hash ${anchorBlockHash}). ` +
          `The anchor block's lastArchive does not contain the tx block's hash.`,
      );
    }
  }

  // 4. Compute the sponge state at the start of the target block and gather previous-block authentication data
  const { previousBlockEndSpongeBlob, previousBlockHeader, previousBlockArchiveMembershipWitness } =
    await computePreviousBlockHints(node, txBlock, anchorBlockHash);

  return {
    effects: indexedTxEffect.data,
    hints: {
      anchorBlockHeader,
      archiveMembershipWitness,
      txBlockHeader: txBlock.header,
      previousBlockEndSpongeBlob,
      previousBlockHeader,
      previousBlockArchiveMembershipWitness,
      blockTxEffects: txBlock.body.txEffects,
      txIndexInBlock: indexedTxEffect.txIndexInBlock,
    },
  };
}

/**
 * Computes the sponge state absorbed into by the target block and gathers the immediate predecessor's
 * header + archive membership witness (so the checker can authenticate the sponge).
 */
async function computePreviousBlockHints(
  node: AztecNode,
  txBlock: L2Block,
  anchorBlockHash: BlockHash,
): Promise<{
  previousBlockEndSpongeBlob: SpongeBlob;
  previousBlockHeader: BlockHeader;
  previousBlockArchiveMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>;
}> {
  if (txBlock.number === 0) {
    throw new Error('Target block is genesis block, which is not supported as a target.');
  }
  // Compute the sponge state at the start of the target block
  let sponge: SpongeBlob;
  if (txBlock.indexWithinCheckpoint === 0) {
    // Target is the first block in its checkpoint → sponge is fresh (even though a prev block exists in a prior checkpoint)
    sponge = SpongeBlob.init();
  } else {
    // Target is not first in its checkpoint → replay the sponge through all prior blocks in the same checkpoint
    const firstBlockInCheckpoint = BlockNumber(txBlock.number - txBlock.indexWithinCheckpoint);
    const previousBlocks = await node.getBlocks(firstBlockInCheckpoint, txBlock.indexWithinCheckpoint);
    if (previousBlocks.length !== txBlock.indexWithinCheckpoint) {
      throw new Error(
        `Expected ${txBlock.indexWithinCheckpoint} previous blocks in the checkpoint, got ${previousBlocks.length}`,
      );
    }
    sponge = SpongeBlob.init();
    for (const block of previousBlocks) {
      await sponge.absorb(encodeBlockBlobData(block.toBlockBlobData()));
    }
  }

  // Fetch the immediate predecessor (target.blockNumber - 1) and its archive membership witness.
  // This is needed to authenticate the sponge (via slot comparison + squeeze-against-spongeBlobHash) or,
  // for cross-checkpoint boundaries, to prove that target is genuinely first-in-checkpoint.
  const prevBlockNumber = BlockNumber(txBlock.number - 1);
  const previousBlockHeader = await node.getBlockHeader(prevBlockNumber);
  if (!previousBlockHeader) {
    throw new Error(`Previous block ${prevBlockNumber} header not found`);
  }
  const previousBlockHash = await previousBlockHeader.hash();
  const previousBlockArchiveMembershipWitness = await node.getBlockHashMembershipWitness(
    anchorBlockHash,
    previousBlockHash,
  );
  if (!previousBlockArchiveMembershipWitness) {
    throw new Error(`Previous block ${prevBlockNumber} not found in anchor's archive.`);
  }

  return {
    previousBlockEndSpongeBlob: sponge,
    previousBlockHeader,
    previousBlockArchiveMembershipWitness,
  };
}
