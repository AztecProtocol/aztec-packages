import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import {
  type ClaimResult,
  type ProvingJobClaimManager,
  type ProvingJobProducer,
  type WorkItemId,
  makeCheckpointSubTreeWorkItemId,
  makePublishWorkItemId,
  makeSubTreeCompleteJobId,
  makeTopTreeCompleteJobId,
  makeTopTreeWorkItemId,
} from '@aztec/stdlib/interfaces/server';

/** Callback interface for work discovery events. The claim is already acquired. */
export interface WorkPollerHandler {
  onCheckpointAvailable(epoch: EpochNumber, checkpointIndex: number, claim: ClaimResult): Promise<void>;
  onEpochReadyForTopTree(epoch: EpochNumber, claim: ClaimResult): Promise<void>;
  onEpochReadyForPublishing(epoch: EpochNumber, claim: ClaimResult): Promise<void>;
}

/**
 * Polls L1/archiver and broker to discover and claim work for split proving.
 *
 * Sub-tree work is discovered as soon as individual checkpoints are posted to L1,
 * WITHOUT waiting for the epoch to complete. This allows proving to start immediately
 * as checkpoints arrive.
 *
 * Top-tree and publish work requires the epoch to be complete with all sub-tree
 * markers fulfilled.
 */
export class WorkPoller {
  private pollPromise: RunningPromise | undefined;
  private logger: Logger;

  constructor(
    private l2BlockSource: L2BlockSource,
    private broker: ProvingJobProducer & ProvingJobClaimManager,
    private pollIntervalMs: number,
    private maxClaimsPerCycle: number = 10,
    private nodeId: string = 'prover-node',
  ) {
    this.logger = createLogger('prover-node:work-poller');
  }

  start(handler: WorkPollerHandler): void {
    if (this.pollPromise) {
      return;
    }
    this.pollPromise = new RunningPromise(() => this.pollCycle(handler), this.logger, this.pollIntervalMs);
    this.pollPromise.start();
    this.logger.info(`WorkPoller started with ${this.pollIntervalMs}ms interval`);
  }

  async stop(): Promise<void> {
    if (this.pollPromise) {
      await this.pollPromise.stop();
      this.pollPromise = undefined;
    }
  }

  private async pollCycle(handler: WorkPollerHandler): Promise<void> {
    try {
      const provenBlock = await this.l2BlockSource.getProvenBlockNumber();
      const checkpointedBlock = await this.l2BlockSource.getCheckpointedL2BlockNumber();

      if (checkpointedBlock <= provenBlock) {
        return;
      }

      // Determine epoch range from block headers' slot numbers, not block numbers.
      // The number of blocks/checkpoints per epoch is variable.
      const constants = await this.l2BlockSource.getL1Constants();

      const firstUnprovenHeader = await this.l2BlockSource.getBlockHeader(BlockNumber(provenBlock + 1));
      if (!firstUnprovenHeader) {
        return;
      }
      const firstEpochToProve = Number(getEpochAtSlot(firstUnprovenHeader.getSlot(), constants));

      const checkpointedHeader = await this.l2BlockSource.getBlockHeader(BlockNumber(checkpointedBlock));
      if (!checkpointedHeader) {
        return;
      }
      const currentEpoch = Number(getEpochAtSlot(checkpointedHeader.getSlot(), constants));

      const claimableItems: Array<{
        workItemId: WorkItemId;
        type: 'checkpoint' | 'top-tree' | 'publish';
        epoch: EpochNumber;
        checkpointIndex?: number;
      }> = [];

      for (let epoch = firstEpochToProve; epoch <= currentEpoch; epoch++) {
        const epochNumber = EpochNumber(epoch);

        // Check if top-tree is already complete — if so, check publishing
        const topTreeMarkerId = makeTopTreeCompleteJobId(epochNumber);
        const topTreeMarkerStatus = await this.broker.getProvingJobStatus(topTreeMarkerId);
        if (topTreeMarkerStatus.status === 'fulfilled') {
          claimableItems.push({
            workItemId: makePublishWorkItemId(epochNumber),
            type: 'publish',
            epoch: epochNumber,
          });
          continue;
        }

        // Check epoch completion first, so we know whether the checkpoint list is final.
        const isEpochComplete = await this.l2BlockSource.isEpochComplete(epochNumber);

        // Get checkpoints posted for this epoch. If the epoch is complete, this is the
        // authoritative list. If not, more checkpoints may arrive — but we can still
        // start proving the ones we know about.
        const checkpoints = await this.l2BlockSource.getCheckpointsForEpoch(epochNumber);
        if (!checkpoints.length) {
          continue;
        }

        // Skip epochs that are already fully proven on L1
        const lastBlockInEpoch = checkpoints.at(-1)!.blocks.at(-1)!.number;
        if (lastBlockInEpoch <= provenBlock) {
          continue;
        }

        // Discover individual checkpoint sub-tree work.
        // Each checkpoint can be claimed as soon as it's posted — no need to wait for the epoch.
        const subTreeMarkerIds = checkpoints.map((_, i) => makeSubTreeCompleteJobId(epochNumber, i));
        const completedMarkers = await this.broker.getCompletedJobs(subTreeMarkerIds);
        const completedSet = new Set(completedMarkers);

        let allSubTreesComplete = true;
        for (let i = 0; i < checkpoints.length; i++) {
          if (completedSet.has(subTreeMarkerIds[i])) {
            continue;
          }
          allSubTreesComplete = false;
          claimableItems.push({
            workItemId: makeCheckpointSubTreeWorkItemId(epochNumber, i),
            type: 'checkpoint',
            epoch: epochNumber,
            checkpointIndex: i,
          });
        }

        // Top-tree requires the epoch to be complete AND all sub-trees done.
        // We checked isEpochComplete BEFORE fetching checkpoints, so if the epoch
        // was not yet complete at that point, we won't trigger top-tree even if all
        // currently-known sub-trees are done (more checkpoints may still arrive).
        if (isEpochComplete && allSubTreesComplete) {
          claimableItems.push({
            workItemId: makeTopTreeWorkItemId(epochNumber),
            type: 'top-tree',
            epoch: epochNumber,
          });
        }
      }

      if (claimableItems.length === 0) {
        return;
      }

      // Claim up to our capacity in a single atomic request
      const claimed = await this.broker.claimN(
        claimableItems.map(item => item.workItemId),
        this.maxClaimsPerCycle,
        this.nodeId,
      );

      // Fire handlers for all claimed items
      for (const claim of claimed) {
        const claimedItem = claimableItems.find(item => item.workItemId === claim.workItemId);
        if (!claimedItem) {
          continue;
        }

        this.logger.info(`Claimed ${claimedItem.type} work for epoch ${claimedItem.epoch}`, {
          workItemId: claim.workItemId,
        });

        switch (claimedItem.type) {
          case 'checkpoint':
            await handler.onCheckpointAvailable(claimedItem.epoch, claimedItem.checkpointIndex!, claim);
            break;
          case 'top-tree':
            await handler.onEpochReadyForTopTree(claimedItem.epoch, claim);
            break;
          case 'publish':
            await handler.onEpochReadyForPublishing(claimedItem.epoch, claim);
            break;
        }
      }
    } catch (err) {
      this.logger.error('Error in work poll cycle', err);
    }
  }
}
