import { BlockNumber } from '@aztec/foundation/branded-types';
import { type BlockData, type CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import type {
  CheckpointData,
  L1PublishedData,
  ProposedCheckpointData,
  PublishedCheckpoint,
} from '@aztec/stdlib/checkpoint';
import {
  type BlockIncludeOptions,
  type BlockResponse,
  type CheckpointIncludeOptions,
  type CheckpointResponse,
  l1PublishInfoFromL1PublishedData,
} from '@aztec/stdlib/interfaces/client';

/** Projects a full {@link L2Block} into a {@link BlockResponse}, attaching L1 / attestation context when provided. */
export async function blockResponseFromL2Block(
  block: L2Block,
  options: BlockIncludeOptions,
  context?: { l1?: L1PublishedData; attestations?: CommitteeAttestation[] },
): Promise<BlockResponse> {
  const response: BlockResponse = {
    header: block.header,
    archive: block.archive,
    hash: await block.hash(),
    checkpointNumber: block.checkpointNumber,
    indexWithinCheckpoint: block.indexWithinCheckpoint,
    number: block.number,
  };
  if (options.includeTransactions) {
    (response as BlockResponse).body = block.body;
  }
  if (options.includeL1PublishInfo) {
    (response as BlockResponse).l1 = l1PublishInfoFromL1PublishedData(context?.l1);
  }
  if (options.includeAttestations) {
    (response as BlockResponse).attestations = context?.attestations ?? [];
  }
  return response;
}

/** Projects metadata-only {@link BlockData} into a {@link BlockResponse}. */
export function blockResponseFromBlockData(
  data: BlockData,
  options: BlockIncludeOptions,
  context?: { l1?: L1PublishedData; attestations?: CommitteeAttestation[] },
): BlockResponse {
  const response: BlockResponse = {
    header: data.header,
    archive: data.archive,
    hash: data.blockHash,
    checkpointNumber: data.checkpointNumber,
    indexWithinCheckpoint: data.indexWithinCheckpoint,
    number: data.header.getBlockNumber(),
  };
  if (options.includeL1PublishInfo) {
    (response as BlockResponse).l1 = l1PublishInfoFromL1PublishedData(context?.l1);
  }
  if (options.includeAttestations) {
    (response as BlockResponse).attestations = context?.attestations ?? [];
  }
  return response;
}

/** Projects a {@link PublishedCheckpoint} into a {@link CheckpointResponse}. */
export async function checkpointResponseFromPublishedCheckpoint(
  pc: PublishedCheckpoint,
  options: CheckpointIncludeOptions,
): Promise<CheckpointResponse> {
  const response: CheckpointResponse = {
    number: pc.checkpoint.number,
    header: pc.checkpoint.header,
    archive: pc.checkpoint.archive,
    checkpointOutHash: pc.checkpoint.getCheckpointOutHash(),
    startBlock: pc.checkpoint.blocks[0]?.number ?? BlockNumber.ZERO,
    blockCount: pc.checkpoint.blocks.length,
    feeAssetPriceModifier: pc.checkpoint.feeAssetPriceModifier,
  };
  if (options.includeBlocks) {
    (response as CheckpointResponse).blocks = await Promise.all(
      pc.checkpoint.blocks.map(block =>
        blockResponseFromL2Block(block, {
          includeTransactions: options.includeTransactions,
          includeL1PublishInfo: false,
          includeAttestations: false,
        }),
      ),
    );
  }
  if (options.includeL1PublishInfo) {
    (response as CheckpointResponse).l1 = l1PublishInfoFromL1PublishedData(pc.l1);
  }
  if (options.includeAttestations) {
    (response as CheckpointResponse).attestations = pc.attestations;
  }
  return response;
}

/** Projects metadata-only {@link CheckpointData} into a {@link CheckpointResponse}. `includeBlocks` is ignored (no blocks loaded). */
export function checkpointResponseFromCheckpointData(
  cd: CheckpointData,
  options: CheckpointIncludeOptions,
): CheckpointResponse {
  const response: CheckpointResponse = {
    number: cd.checkpointNumber,
    header: cd.header,
    archive: cd.archive,
    checkpointOutHash: cd.checkpointOutHash,
    startBlock: cd.startBlock,
    blockCount: cd.blockCount,
    feeAssetPriceModifier: cd.feeAssetPriceModifier,
  };
  if (options.includeL1PublishInfo) {
    (response as CheckpointResponse).l1 = l1PublishInfoFromL1PublishedData(cd.l1);
  }
  if (options.includeAttestations) {
    (response as CheckpointResponse).attestations = cd.attestations;
  }
  return response;
}

/**
 * Projects a {@link ProposedCheckpointData} into a {@link CheckpointResponse}.
 * Pure projection — caller pre-fetches `blocks` via `blockSource.getBlocks(...)` when
 * `options.includeBlocks` is true. Throws if `includeL1PublishInfo` or `includeAttestations`
 * is requested (proposed checkpoints have no L1 publish info or attestations).
 */
export async function projectProposedToCheckpointResponse(
  proposed: ProposedCheckpointData,
  options: CheckpointIncludeOptions,
  blocks?: L2Block[],
): Promise<CheckpointResponse> {
  if (options.includeL1PublishInfo || options.includeAttestations) {
    throw new Error('Proposed checkpoints have no L1 publish info or attestations');
  }
  const response: CheckpointResponse = {
    number: proposed.checkpointNumber,
    header: proposed.header,
    archive: proposed.archive,
    checkpointOutHash: proposed.checkpointOutHash,
    startBlock: proposed.startBlock,
    blockCount: proposed.blockCount,
    feeAssetPriceModifier: proposed.feeAssetPriceModifier,
  };
  if (options.includeBlocks) {
    if (!blocks) {
      throw new Error('Blocks must be supplied when includeBlocks is true');
    }
    (response as CheckpointResponse).blocks = await Promise.all(
      blocks.map(block =>
        blockResponseFromL2Block(block, {
          includeTransactions: options.includeTransactions,
          includeL1PublishInfo: false,
          includeAttestations: false,
        }),
      ),
    );
  }
  return response;
}
