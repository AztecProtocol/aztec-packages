import { PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { type L2Frontier, type ValidateCheckpointResult, getCheckpointedTipSlot } from '@aztec/stdlib/block';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';

/** Slot, target checkpoint, and parent data for a next block that opens a fresh checkpoint. */
export type NewCheckpointPlan = {
  /** Slot the next block will land in. */
  targetSlot: SlotNumber;
  /** Checkpoint whose L1-to-L2 messages the simulation fork needs. */
  targetCheckpoint: CheckpointNumber;
  /** The proposed (not yet L1-confirmed) parent checkpoint, when pipelining. */
  proposedCheckpointData: ProposedCheckpointData | undefined;
  /** Checkpointed tip at the time the plan's snapshot was taken. */
  checkpointedCheckpointNumber: CheckpointNumber;
};

/**
 * How the next block sits on the chain, derived from a single atomic archiver snapshot. Everything here comes
 * from archiver reads only; turning it into globals is what may hit L1. `newCheckpoint` is set only when the
 * next block opens a fresh checkpoint rather than continuing the in-progress one.
 */
export type NextBlockPlan = {
  latestBlockNumber: BlockNumber;
  /** Hash of the latest proposed block, so the world-state fork can be checked against the plan's chain. */
  latestBlockHash: string;
  newCheckpoint?: NewCheckpointPlan;
};

/** Identity of the parent the boundary fee is computed on top of. */
export type BoundaryFeeParent =
  | {
      kind: 'proposed';
      headerHash: string;
      archiveRoot: string;
      checkpointOutHash: string;
      totalManaUsed: bigint;
      feeAssetPriceModifier: bigint;
    }
  | { kind: 'checkpointed'; pendingChainValid: boolean; firstInvalidCheckpoint?: CheckpointNumber };

/**
 * Every input the min fee of a checkpoint-opening block derives from, so two equal keys prove a cached fee is
 * still what a fresh build would produce: the target slot, the checkpointed tip, the block the plan sits on,
 * and either the proposed parent's fee-relevant fields or the pending-chain validity that selects the
 * invalidation override.
 *
 * The L1 block the fee was read at is deliberately not part of the key. The min fee for a fixed slot and parent
 * depends only on rollup storage, and the rollup transactions that move it (checkpoints landing, invalidations,
 * prunes) all move the frontier and therefore this key, so a new L1 block on its own is a hit. The exception is a
 * governance parameter update such as the mana target, which changes the fee without touching the frontier;
 * the cache re-prices a matching record whenever the L1 anchor moves, so that lags by at most one refresh.
 */
export type BoundaryFeeKey = {
  targetSlot: SlotNumber;
  checkpointedCheckpointNumber: CheckpointNumber;
  latestBlockHash: string;
  parent: BoundaryFeeParent;
};

/**
 * Slot the next block will land in, the largest of three terms:
 *
 * - The sequencer's exact formula, `getEpochAndSlotInNextL1Slot().slot + PROPOSER_PIPELINING_SLOT_OFFSET`.
 * - `proposedCheckpointSlot + 1`, an RPC-side approximation of the next build: when a proposed checkpoint
 *   is gossiped before its L1 slot starts, the next build (once its wall clock arrives) will target
 *   `parentSlot + 1`. The sequencer never advances its own target past wall clock — it just declines to
 *   build — so this is a prediction of inclusion globals, not literal sequencer behavior. The parent slot
 *   comes from the proposed checkpoint header so the slot and the overrides plan cannot derive from
 *   different snapshots.
 * - `checkpointedTipSlot + 1`, a floor: the next block can never land in a slot already taken by a
 *   checkpointed checkpoint. The slot comes from the frontier's checkpointed checkpoint header, so it
 *   describes the same instant as the tips and the proposed checkpoint. This only binds when this node's
 *   clock is behind the chain, in which case the first term would otherwise price the next block in a slot
 *   L1 has already moved past — and the L1 gas oracle can step between the two, so wallet quotes and
 *   simulations would disagree on the fee.
 */
function computeTargetSlot(
  clockSlot: SlotNumber,
  proposedCheckpointData: ProposedCheckpointData | undefined,
  checkpointedTipSlot: SlotNumber | undefined,
): SlotNumber {
  const slotAfterProposedCheckpoint = proposedCheckpointData ? proposedCheckpointData.header.slotNumber + 1 : undefined;
  const slotAfterCheckpointedTip = checkpointedTipSlot !== undefined ? checkpointedTipSlot + 1 : undefined;
  return SlotNumber(Math.max(...compactArray([clockSlot, slotAfterProposedCheckpoint, slotAfterCheckpointedTip])));
}

/**
 * The slot this node's clock says the next block would be built in, the first of the three terms
 * {@link planNextBlock} maximizes over. Pure arithmetic over the epoch cache's in-memory view.
 */
export function getClockSlot(epochCache: EpochCacheInterface): SlotNumber {
  return SlotNumber(epochCache.getEpochAndSlotInNextL1Slot().slot + PROPOSER_PIPELINING_SLOT_OFFSET);
}

/**
 * Works out how the next block sits on the chain from one atomic frontier snapshot: whether it continues the
 * in-progress checkpoint or opens a fresh one, which slot it lands in, and which checkpoint's L1-to-L2
 * messages a fork would need. Pure: the caller supplies both the snapshot and the clock slot, so the fee a
 * wallet is quoted and the fee a simulation charges can never derive from different decisions.
 */
export function planNextBlock(frontier: L2Frontier, clockSlot: SlotNumber): NextBlockPlan {
  const { tips, proposedCheckpoint: proposedCheckpointData } = frontier;
  const latestBlockNumber = tips.proposed.number;
  const latestBlockHash = tips.proposed.hash;

  // Terminating block of the proposed-checkpoint frontier: the leading proposed (not-yet-L1-confirmed)
  // checkpoint's last block is `startBlock + blockCount - 1`; with no proposed checkpoint the frontier
  // coincides with the checkpointed tip.
  const proposedCheckpointLastBlock = proposedCheckpointData
    ? BlockNumber.add(proposedCheckpointData.startBlock, proposedCheckpointData.blockCount - 1)
    : tips.checkpointed.block.number;

  // The next block continues the in-progress checkpoint when the latest proposed block is ahead of the
  // proposed-checkpoint terminating block; it opens a new checkpoint when they coincide.
  if (proposedCheckpointLastBlock !== latestBlockNumber) {
    return { latestBlockNumber, latestBlockHash };
  }

  const checkpointedCheckpointNumber = tips.checkpointed.checkpoint.number;
  // The new checkpoint sits on top of the proposed one when pipelining, otherwise on the checkpointed tip.
  const parentCheckpointNumber = proposedCheckpointData?.checkpointNumber ?? checkpointedCheckpointNumber;
  // Undefined before the first checkpoint lands: no slot is taken yet, so there is no floor.
  const checkpointedTipSlot = frontier.checkpointedCheckpoint ? getCheckpointedTipSlot(frontier) : undefined;

  return {
    latestBlockNumber,
    latestBlockHash,
    newCheckpoint: {
      targetSlot: computeTargetSlot(clockSlot, proposedCheckpointData, checkpointedTipSlot),
      targetCheckpoint: CheckpointNumber(parentCheckpointNumber + 1),
      proposedCheckpointData,
      checkpointedCheckpointNumber,
    },
  };
}

/**
 * Keys the fee of a plan that opens a new checkpoint. Undefined mid-checkpoint, where the fee is copied from
 * the in-progress checkpoint's header and nothing needs pricing.
 * @param pendingChainValidationStatus - From the same frontier snapshot the plan was built from.
 */
export function computeBoundaryFeeKey(
  plan: NextBlockPlan,
  pendingChainValidationStatus: ValidateCheckpointResult,
): BoundaryFeeKey | undefined {
  if (!plan.newCheckpoint) {
    return undefined;
  }
  const { targetSlot, proposedCheckpointData, checkpointedCheckpointNumber } = plan.newCheckpoint;
  const parent: BoundaryFeeParent = proposedCheckpointData
    ? {
        kind: 'proposed',
        headerHash: proposedCheckpointData.header.hash().toString(),
        archiveRoot: proposedCheckpointData.archive.root.toString(),
        checkpointOutHash: proposedCheckpointData.checkpointOutHash.toString(),
        totalManaUsed: proposedCheckpointData.totalManaUsed,
        feeAssetPriceModifier: proposedCheckpointData.feeAssetPriceModifier,
      }
    : {
        kind: 'checkpointed',
        pendingChainValid: pendingChainValidationStatus.valid,
        firstInvalidCheckpoint: pendingChainValidationStatus.valid
          ? undefined
          : pendingChainValidationStatus.checkpoint.checkpointNumber,
      };
  return { targetSlot, checkpointedCheckpointNumber, latestBlockHash: plan.latestBlockHash, parent };
}

/** Whether two boundary fee keys describe the same fee. */
export function boundaryFeeKeyEquals(a: BoundaryFeeKey, b: BoundaryFeeKey): boolean {
  return (
    a.targetSlot === b.targetSlot &&
    a.checkpointedCheckpointNumber === b.checkpointedCheckpointNumber &&
    a.latestBlockHash === b.latestBlockHash &&
    boundaryFeeParentEquals(a.parent, b.parent)
  );
}

function boundaryFeeParentEquals(a: BoundaryFeeParent, b: BoundaryFeeParent): boolean {
  if (a.kind === 'proposed') {
    return (
      b.kind === 'proposed' &&
      a.headerHash === b.headerHash &&
      a.archiveRoot === b.archiveRoot &&
      a.checkpointOutHash === b.checkpointOutHash &&
      a.totalManaUsed === b.totalManaUsed &&
      a.feeAssetPriceModifier === b.feeAssetPriceModifier
    );
  }
  return (
    b.kind === 'checkpointed' &&
    a.pendingChainValid === b.pendingChainValid &&
    a.firstInvalidCheckpoint === b.firstInvalidCheckpoint
  );
}
