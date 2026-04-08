import type { EpochCache } from '@aztec/epoch-cache';
import { type FeeHeader, RollupContract } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import {
  flipSignature,
  generateRecoverableSignature,
  generateUnrecoverableSignature,
} from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { filter } from '@aztec/foundation/iterator';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { sleep, sleepUntil } from '@aztec/foundation/sleep';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import { type TypedEventEmitter, isErrorClass, unfreeze } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import {
  CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  L2Block,
  type L2BlockSink,
  type L2BlockSource,
  MaliciousCommitteeAttestationsAndSigners,
} from '@aztec/stdlib/block';
import { type Checkpoint, type ProposedCheckpointData, validateCheckpoint } from '@aztec/stdlib/checkpoint';
import { computeQuorum, getSlotStartBuildTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import {
  type BlockBuilderOptions,
  InsufficientValidTxsError,
  type ResolvedSequencerConfig,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import type {
  BlockProposal,
  BlockProposalOptions,
  CheckpointProposal,
  CheckpointProposalOptions,
} from '@aztec/stdlib/p2p';
import { orderAttestations, trimAttestations } from '@aztec/stdlib/p2p';
import type { L2BlockBuiltStats } from '@aztec/stdlib/stats';
import { type FailedTx, Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';
import { CheckpointBuilder, type FullNodeCheckpointsBuilder, type ValidatorClient } from '@aztec/validator-client';
import { DutyAlreadySignedError, SlashingProtectionError } from '@aztec/validator-ha-signer/errors';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { InvalidateCheckpointRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { CheckpointVoter } from './checkpoint_voter.js';
import { SequencerInterruptedError } from './errors.js';
import type { SequencerEvents } from './events.js';
import type { SequencerMetrics } from './metrics.js';
import type { SequencerTimetable } from './timetable.js';
import type { SequencerRollupConstants } from './types.js';
import { SequencerState } from './utils.js';

/** How much time to sleep while waiting for min transactions to accumulate for a block */
const TXS_POLLING_MS = 500;

/** Result from proposeCheckpoint when a checkpoint was successfully built and attested. */
type CheckpointProposalResult = {
  checkpoint: Checkpoint;
  attestations: CommitteeAttestationsAndSigners;
  attestationsSignature: Signature;
};

/**
 * Handles the execution of a checkpoint proposal after the initial preparation phase.
 * This includes building blocks, collecting attestations, and publishing the checkpoint to L1,
 * as well as enqueueing votes for slashing and governance proposals. This class is created from
 * the Sequencer once the check for being the proposer for the slot has succeeded.
 */
export class CheckpointProposalJob implements Traceable {
  protected readonly log: Logger;

  /** Tracks the fire-and-forget L1 submission promise so it can be awaited during shutdown. */
  private pendingL1Submission: Promise<void> | undefined;

  /** Fee header override computed during proposeCheckpoint, reused in enqueueCheckpointForSubmission. */
  private computedForceProposedFeeHeader?: { checkpointNumber: CheckpointNumber; feeHeader: FeeHeader };

  constructor(
    private readonly slotNow: SlotNumber,
    private readonly targetSlot: SlotNumber,
    private readonly targetEpoch: EpochNumber,
    private readonly checkpointNumber: CheckpointNumber,
    private readonly syncedToBlockNumber: BlockNumber,
    // TODO(palla/mbps): Can we remove the proposer in favor of attestorAddress? Need to check fisherman-node flows.
    private readonly proposer: EthAddress | undefined,
    private readonly publisher: SequencerPublisher,
    private readonly attestorAddress: EthAddress,
    private readonly invalidateCheckpoint: InvalidateCheckpointRequest | undefined,
    private readonly validatorClient: ValidatorClient,
    private readonly globalsBuilder: GlobalVariableBuilder,
    private readonly p2pClient: P2P,
    private readonly worldState: WorldStateSynchronizer,
    private readonly l1ToL2MessageSource: L1ToL2MessageSource,
    private readonly l2BlockSource: L2BlockSource,
    private readonly checkpointsBuilder: FullNodeCheckpointsBuilder,
    private readonly blockSink: L2BlockSink,
    private readonly l1Constants: SequencerRollupConstants,
    protected config: ResolvedSequencerConfig,
    protected timetable: SequencerTimetable,
    private readonly slasherClient: SlasherClientInterface | undefined,
    private readonly epochCache: EpochCache,
    private readonly dateProvider: DateProvider,
    private readonly metrics: SequencerMetrics,
    private readonly eventEmitter: TypedEventEmitter<SequencerEvents>,
    private readonly setStateFn: (state: SequencerState, slot?: SlotNumber) => void,
    public readonly tracer: Tracer,
    bindings?: LoggerBindings,
    private readonly proposedCheckpointData?: ProposedCheckpointData,
  ) {
    this.log = createLogger('sequencer:checkpoint-proposal', {
      ...bindings,
      instanceId: `slot-${this.slotNow}`,
    });
  }

  /** Awaits the pending L1 submission if one is in progress. Call during shutdown. */
  public async awaitPendingSubmission(): Promise<void> {
    this.log.info('Awaiting pending L1 payload submission');
    await this.pendingL1Submission;
  }

  /**
   * Executes the checkpoint proposal job.
   * Builds blocks, collects attestations, enqueues requests, and schedules L1 submission as a
   * background task so the work loop can return to IDLE immediately.
   * Returns the built checkpoint if successful, undefined otherwise.
   */
  @trackSpan('CheckpointProposalJob.execute')
  public async execute(): Promise<Checkpoint | undefined> {
    // Enqueue governance and slashing votes (returns promises that will be awaited later)
    // In fisherman mode, we simulate slashing but don't actually publish to L1
    // These are constant for the whole slot, so we only enqueue them once
    const votesPromises = new CheckpointVoter(
      this.targetSlot,
      this.publisher,
      this.attestorAddress,
      this.validatorClient,
      this.slasherClient,
      this.l1Constants,
      this.config,
      this.metrics,
      this.log,
    ).enqueueVotes();

    // Build and propose the checkpoint. Builds blocks, broadcasts, collects attestations, and signs.
    // Does NOT enqueue to L1 yet — that happens after the pipeline sleep.
    const proposalResult = await this.proposeCheckpoint();
    const checkpoint = proposalResult?.checkpoint;

    // Wait until the voting promises have resolved, so all requests are enqueued (not sent)
    await Promise.all(votesPromises);

    if (checkpoint) {
      this.metrics.recordCheckpointProposalSuccess();
    }

    // Do not post anything to L1 if we are fishermen, but do perform L1 fee analysis
    if (this.config.fishermanMode) {
      await this.handleCheckpointEndAsFisherman(checkpoint);
      return;
    }

    // Enqueue the checkpoint for L1 submission
    if (proposalResult) {
      try {
        await this.enqueueCheckpointForSubmission(proposalResult);
      } catch (err) {
        this.log.error(`Failed to enqueue checkpoint for L1 submission at slot ${this.targetSlot}`, err);
        // Continue to sendRequestsAt so votes are still sent
      }
    }

    // Compute the earliest time to submit: pipeline slot start when pipelining, now otherwise.
    const submitAfter = this.epochCache.isProposerPipeliningEnabled()
      ? new Date(Number(getTimestampForSlot(this.targetSlot, this.l1Constants)) * 1000)
      : new Date(this.dateProvider.now());

    // Schedule L1 submission in the background so the work loop returns immediately.
    // The publisher will sleep until submitAfter, then send the bundled requests.
    // The promise is stored so it can be awaited during shutdown.
    this.pendingL1Submission = this.publisher
      .sendRequestsAt(submitAfter)
      .then(async l1Response => {
        const proposedAction = l1Response?.successfulActions.find(a => a === 'propose');
        if (proposedAction) {
          this.eventEmitter.emit('checkpoint-published', { checkpoint: this.checkpointNumber, slot: this.targetSlot });
          const coinbase = checkpoint?.header.coinbase;
          await this.metrics.incFilledSlot(this.publisher.getSenderAddress().toString(), coinbase);
        } else if (checkpoint) {
          this.eventEmitter.emit('checkpoint-publish-failed', { ...l1Response, slot: this.targetSlot });

          if (this.epochCache.isProposerPipeliningEnabled()) {
            this.metrics.recordPipelineDiscard();
          }
        }
      })
      .catch(err => {
        this.log.error(`Background L1 submission failed for slot ${this.targetSlot}`, err);
        if (checkpoint) {
          this.eventEmitter.emit('checkpoint-publish-failed', { slot: this.targetSlot });

          if (this.epochCache.isProposerPipeliningEnabled()) {
            this.metrics.recordPipelineDiscard();
          }
        }
      });

    // Return the built checkpoint immediately — the work loop is now unblocked
    return checkpoint;
  }

  /** Enqueues the checkpoint for L1 submission. Called after pipeline sleep in execute(). */
  private async enqueueCheckpointForSubmission(result: CheckpointProposalResult): Promise<void> {
    const { checkpoint, attestations, attestationsSignature } = result;

    this.setStateFn(SequencerState.PUBLISHING_CHECKPOINT, this.targetSlot);
    const aztecSlotDuration = this.l1Constants.slotDuration;
    const submissionSlotStart = Number(getTimestampForSlot(this.targetSlot, this.l1Constants));
    const txTimeoutAt = new Date((submissionSlotStart + aztecSlotDuration) * 1000);

    // If we have been configured to potentially skip publishing checkpoint then roll the dice here
    if (
      this.config.skipPublishingCheckpointsPercent !== undefined &&
      this.config.skipPublishingCheckpointsPercent > 0
    ) {
      const roll = Math.max(0, randomInt(100));
      if (roll < this.config.skipPublishingCheckpointsPercent) {
        this.log.warn(
          `Skipping publishing proposal for checkpoint ${checkpoint.number}. Configured percentage: ${this.config.skipPublishingCheckpointsPercent}, generated value: ${roll}`,
        );
        return;
      }
    }

    await this.publisher.enqueueProposeCheckpoint(checkpoint, attestations, attestationsSignature, {
      txTimeoutAt,
      forcePendingCheckpointNumber: this.invalidateCheckpoint?.forcePendingCheckpointNumber,
      forceProposedFeeHeader: this.computedForceProposedFeeHeader,
    });
  }

  @trackSpan('CheckpointProposalJob.proposeCheckpoint', function () {
    return {
      // nullish operator needed for tests
      [Attributes.COINBASE]: this.validatorClient.getCoinbaseForAttestor(this.attestorAddress)?.toString(),
      [Attributes.SLOT_NUMBER]: this.targetSlot,
    };
  })
  private async proposeCheckpoint(): Promise<CheckpointProposalResult | undefined> {
    try {
      // Get operator configured coinbase and fee recipient for this attestor
      const coinbase = this.validatorClient.getCoinbaseForAttestor(this.attestorAddress);
      const feeRecipient = this.validatorClient.getFeeRecipientForAttestor(this.attestorAddress);

      // Start the checkpoint
      this.setStateFn(SequencerState.INITIALIZING_CHECKPOINT, this.targetSlot);
      this.log.info(`Starting checkpoint proposal`, {
        buildSlot: this.slotNow,
        submissionSlot: this.targetSlot,
        pipelining: this.epochCache.isProposerPipeliningEnabled(),
        proposer: this.proposer?.toString(),
        coinbase: coinbase.toString(),
      });
      this.metrics.incOpenSlot(this.targetSlot, this.proposer?.toString() ?? 'unknown');

      // Enqueues checkpoint invalidation (constant for the whole slot)
      if (this.invalidateCheckpoint && !this.config.skipInvalidateBlockAsProposer) {
        this.publisher.enqueueInvalidateCheckpoint(this.invalidateCheckpoint);
      }

      // Create checkpoint builder for the slot.
      // When pipelining, force the proposed checkpoint number and fee header to our parent so the
      // fee computation sees the same chain tip that L1 will see once the previous pipelined checkpoint lands.
      const isPipelining = this.epochCache.isProposerPipeliningEnabled();
      const parentCheckpointNumber = isPipelining ? CheckpointNumber(this.checkpointNumber - 1) : undefined;

      // Compute the parent's fee header override when pipelining
      if (isPipelining && this.proposedCheckpointData) {
        this.computedForceProposedFeeHeader = await this.computeForceProposedFeeHeader(parentCheckpointNumber!);
      }

      const checkpointGlobalVariables = await this.globalsBuilder.buildCheckpointGlobalVariables(
        coinbase,
        feeRecipient,
        this.targetSlot,
        {
          forcePendingCheckpointNumber: parentCheckpointNumber,
          forceProposedFeeHeader: this.computedForceProposedFeeHeader,
        },
      );

      // Collect L1 to L2 messages for the checkpoint and compute their hash
      const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(this.checkpointNumber);
      const inHash = computeInHashFromL1ToL2Messages(l1ToL2Messages);

      // Collect the out hashes of all the checkpoints before this one in the same epoch
      const previousCheckpointOutHashes = (await this.l2BlockSource.getCheckpointsDataForEpoch(this.targetEpoch))
        .filter(c => c.checkpointNumber < this.checkpointNumber)
        .map(c => c.checkpointOutHash);

      // Get the fee asset price modifier from the oracle
      const feeAssetPriceModifier = await this.publisher.getFeeAssetPriceModifier();

      // Create a long-lived forked world state for the checkpoint builder
      await using fork = await this.worldState.fork(this.syncedToBlockNumber, { closeDelayMs: 12_000 });

      // Create checkpoint builder for the entire slot
      const checkpointBuilder = await this.checkpointsBuilder.startCheckpoint(
        this.checkpointNumber,
        checkpointGlobalVariables,
        feeAssetPriceModifier,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
        this.log.getBindings(),
      );

      // Options for the validator client when creating block and checkpoint proposals
      const blockProposalOptions: BlockProposalOptions = {
        publishFullTxs: !!this.config.publishTxsWithProposals,
        broadcastInvalidBlockProposal: this.config.broadcastInvalidBlockProposal,
      };

      const checkpointProposalOptions: CheckpointProposalOptions = {
        publishFullTxs: !!this.config.publishTxsWithProposals,
        broadcastInvalidCheckpointProposal: this.config.broadcastInvalidBlockProposal,
      };

      let blocksInCheckpoint: L2Block[] = [];
      let blockPendingBroadcast: { block: L2Block; txs: Tx[] } | undefined = undefined;
      const checkpointBuildTimer = new Timer();

      try {
        // Main loop: build blocks for the checkpoint
        const result = await this.buildBlocksForCheckpoint(
          checkpointBuilder,
          checkpointGlobalVariables.timestamp,
          inHash,
          blockProposalOptions,
        );
        blocksInCheckpoint = result.blocksInCheckpoint;
        blockPendingBroadcast = result.blockPendingBroadcast;
      } catch (err) {
        // These errors are expected in HA mode, so we yield and let another HA node handle the slot
        // The only distinction between the 2 errors is SlashingProtectionError throws when the payload is different,
        // which is normal for block building (may have picked different txs)
        if (this.handleHASigningError(err, 'Block proposal')) {
          return undefined;
        }
        throw err;
      }

      if (blocksInCheckpoint.length === 0) {
        this.log.warn(`No blocks were built for slot ${this.targetSlot}`, { slot: this.targetSlot });
        this.eventEmitter.emit('checkpoint-empty', { slot: this.targetSlot });
        return undefined;
      }

      const minBlocksForCheckpoint = this.config.minBlocksForCheckpoint;
      if (minBlocksForCheckpoint !== undefined && blocksInCheckpoint.length < minBlocksForCheckpoint) {
        this.log.warn(
          `Checkpoint has fewer blocks than minimum (${blocksInCheckpoint.length} < ${minBlocksForCheckpoint}), skipping proposal`,
          { slot: this.targetSlot, blocksBuilt: blocksInCheckpoint.length, minBlocksForCheckpoint },
        );
        return undefined;
      }

      // Assemble and broadcast the checkpoint proposal, including the last block that was not
      // broadcasted yet, and wait to collect the committee attestations.
      this.setStateFn(SequencerState.ASSEMBLING_CHECKPOINT, this.targetSlot);
      const checkpoint = await checkpointBuilder.completeCheckpoint();

      // Final validation: per-block limits are only checked if the operator set them explicitly.
      // Otherwise, checkpoint-level budgets were already enforced by the redistribution logic.
      try {
        validateCheckpoint(checkpoint, {
          rollupManaLimit: this.l1Constants.rollupManaLimit,
          maxL2BlockGas: this.config.maxL2BlockGas,
          maxDABlockGas: this.config.maxDABlockGas,
          maxTxsPerBlock: this.config.maxTxsPerBlock,
          maxTxsPerCheckpoint: this.config.maxTxsPerCheckpoint,
        });
      } catch (err) {
        this.log.error(`Built an invalid checkpoint at slot ${this.slotNow} (skipping proposal)`, err, {
          checkpoint: checkpoint.header.toInspect(),
        });
        return undefined;
      }

      // Record checkpoint-level build metrics
      this.metrics.recordCheckpointBuild(
        checkpointBuildTimer.ms(),
        blocksInCheckpoint.length,
        checkpoint.getStats().txCount,
        Number(checkpoint.header.totalManaUsed.toBigInt()),
      );

      // Do not collect attestations nor publish to L1 in fisherman mode
      if (this.config.fishermanMode) {
        this.log.info(
          `Built checkpoint for slot ${this.targetSlot} with ${blocksInCheckpoint.length} blocks. ` +
            `Skipping proposal in fisherman mode.`,
          {
            slot: this.targetSlot,
            checkpoint: checkpoint.header.toInspect(),
            blocksBuilt: blocksInCheckpoint.length,
          },
        );
        this.metrics.recordCheckpointSuccess();
        return {
          checkpoint,
          attestations: CommitteeAttestationsAndSigners.empty(),
          attestationsSignature: Signature.empty(),
        };
      }

      // Include the block pending broadcast in the checkpoint proposal if any
      const lastBlock = blockPendingBroadcast && {
        blockHeader: blockPendingBroadcast.block.header,
        indexWithinCheckpoint: blockPendingBroadcast.block.indexWithinCheckpoint,
        txs: blockPendingBroadcast.txs,
      };

      // Create the checkpoint proposal and broadcast it
      const proposal = await this.validatorClient.createCheckpointProposal(
        checkpoint.header,
        checkpoint.archive.root,
        feeAssetPriceModifier,
        lastBlock,
        this.proposer,
        checkpointProposalOptions,
      );

      const blockProposedAt = this.dateProvider.now();
      await this.p2pClient.broadcastCheckpointProposal(proposal);

      this.setStateFn(SequencerState.COLLECTING_ATTESTATIONS, this.targetSlot);
      const attestations = await this.waitForAttestations(proposal);
      const blockAttestedAt = this.dateProvider.now();

      this.metrics.recordCheckpointAttestationDelay(blockAttestedAt - blockProposedAt);

      // Proposer must sign over the attestations before pushing them to L1
      const signer = this.proposer ?? this.publisher.getSenderAddress();
      let attestationsSignature: Signature;
      try {
        attestationsSignature = await this.validatorClient.signAttestationsAndSigners(
          attestations,
          signer,
          this.targetSlot,
          this.checkpointNumber,
        );
      } catch (err) {
        // We shouldn't really get here since we yield to another HA node
        // as soon as we see these errors when creating block or checkpoint proposals.
        if (this.handleHASigningError(err, 'Attestations signature')) {
          return undefined;
        }
        throw err;
      }

      // Return the result for the caller to enqueue after the pipeline sleep
      return { checkpoint, attestations, attestationsSignature };
    } catch (err) {
      if (err && (err instanceof DutyAlreadySignedError || err instanceof SlashingProtectionError)) {
        // swallow this error. It's already been logged by a function deeper in the stack
        return undefined;
      }

      this.log.error(`Error building checkpoint at slot ${this.targetSlot}`, err);
      return undefined;
    }
  }

  /**
   * Builds blocks for a checkpoint within the current slot.
   */
  @trackSpan('CheckpointProposalJob.buildBlocksForCheckpoint')
  private async buildBlocksForCheckpoint(
    checkpointBuilder: CheckpointBuilder,
    timestamp: bigint,
    inHash: Fr,
    blockProposalOptions: BlockProposalOptions,
  ): Promise<{
    blocksInCheckpoint: L2Block[];
    blockPendingBroadcast: { block: L2Block; txs: Tx[] } | undefined;
  }> {
    const blocksInCheckpoint: L2Block[] = [];
    const txHashesAlreadyIncluded = new Set<string>();
    const initialBlockNumber = BlockNumber(this.syncedToBlockNumber + 1);

    // Last block in the checkpoint will usually be flagged as pending broadcast, so we send it along with the checkpoint proposal
    let blockPendingBroadcast: { block: L2Block; txs: Tx[] } | undefined = undefined;

    while (true) {
      const blocksBuilt = blocksInCheckpoint.length;
      const indexWithinCheckpoint = IndexWithinCheckpoint(blocksBuilt);
      const blockNumber = BlockNumber(initialBlockNumber + blocksBuilt);

      const secondsIntoSlot = this.getSecondsIntoSlot();
      const timingInfo = this.timetable.canStartNextBlock(secondsIntoSlot);

      if (!timingInfo.canStart) {
        this.log.debug(`Not enough time left in slot to start another block`, {
          slot: this.targetSlot,
          blocksBuilt,
          secondsIntoSlot,
        });
        break;
      }

      const buildResult = await this.buildSingleBlock(checkpointBuilder, {
        // Create all blocks with the same timestamp
        blockTimestamp: timestamp,
        // Create an empty block if we haven't already and this is the last one
        forceCreate: timingInfo.isLastBlock && blocksBuilt === 0 && this.config.buildCheckpointIfEmpty,
        // Build deadline is only set if we are enforcing the timetable
        buildDeadline: timingInfo.deadline
          ? new Date((this.getSlotStartBuildTimestamp() + timingInfo.deadline) * 1000)
          : undefined,
        blockNumber,
        indexWithinCheckpoint,
        txHashesAlreadyIncluded,
      });

      // TODO(palla/mbps): Review these conditions. We may want to keep trying in some scenarios.
      if (!buildResult && timingInfo.isLastBlock) {
        // If no block was produced due to not enough txs and this was the last subslot, exit
        break;
      } else if (!buildResult && timingInfo.deadline !== undefined) {
        // But if there is still time for more blocks, wait until the next subslot and try again
        await this.waitUntilNextSubslot(timingInfo.deadline);
        continue;
      } else if (!buildResult) {
        // Exit if there is no possibility of building more blocks
        break;
      } else if ('error' in buildResult) {
        // If there was an error building the block, just exit the loop and give up the rest of the slot
        if (!(buildResult.error instanceof SequencerInterruptedError)) {
          this.log.warn(`Halting block building for slot ${this.targetSlot}`, {
            slot: this.targetSlot,
            blocksBuilt,
            error: buildResult.error,
          });
        }
        break;
      }

      const { block, usedTxs } = buildResult;
      blocksInCheckpoint.push(block);
      usedTxs.forEach(tx => txHashesAlreadyIncluded.add(tx.txHash.toString()));

      // If this is the last block, sync it to the archiver and exit the loop
      // so we can build the checkpoint and start collecting attestations.
      if (timingInfo.isLastBlock) {
        await this.syncProposedBlockToArchiver(block);
        this.log.verbose(`Completed final block ${blockNumber} for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          blockNumber,
          blocksBuilt,
        });
        blockPendingBroadcast = { block, txs: usedTxs };
        break;
      }

      // Broadcast the block proposal (unless we're in fisherman mode) unless the block is the last one,
      // in which case we'll broadcast it along with the checkpoint at the end of the loop.
      // Note that we only send the block to the archiver if we manage to create the proposal, so if there's
      // a HA error we don't pollute our archiver with a block that won't make it to the chain.
      const proposal = await this.createBlockProposal(block, inHash, usedTxs, blockProposalOptions);

      // Sync the proposed block to the archiver to make it available, only after we've managed to sign the proposal.
      // We wait for the sync to succeed, as this helps catch consistency errors, even if it means we lose some time for block-building.
      // If this throws, we abort the entire checkpoint.
      await this.syncProposedBlockToArchiver(block);

      // Once we have a signed proposal and the archiver agreed with our proposed block, then we broadcast it.
      proposal && (await this.p2pClient.broadcastProposal(proposal));

      // Wait until the next block's start time
      await this.waitUntilNextSubslot(timingInfo.deadline);
    }

    this.log.verbose(`Block building loop completed for slot ${this.targetSlot}`, {
      slot: this.targetSlot,
      blocksBuilt: blocksInCheckpoint.length,
    });

    return { blocksInCheckpoint, blockPendingBroadcast };
  }

  /** Creates a block proposal for a given block via the validator client (unless in fisherman mode) */
  private createBlockProposal(
    block: L2Block,
    inHash: Fr,
    usedTxs: Tx[],
    blockProposalOptions: BlockProposalOptions,
  ): Promise<BlockProposal | undefined> {
    if (this.config.fishermanMode) {
      this.log.info(`Skipping block proposal for block ${block.number} in fisherman mode`);
      return Promise.resolve(undefined);
    }
    return this.validatorClient.createBlockProposal(
      block.header,
      block.indexWithinCheckpoint,
      inHash,
      block.archive.root,
      usedTxs,
      this.proposer,
      blockProposalOptions,
    );
  }

  /** Sleeps until it is time to produce the next block in the slot */
  @trackSpan('CheckpointProposalJob.waitUntilNextSubslot')
  private async waitUntilNextSubslot(nextSubslotStart: number) {
    this.setStateFn(SequencerState.WAITING_UNTIL_NEXT_BLOCK, this.targetSlot);
    this.log.verbose(`Waiting until time for the next block at ${nextSubslotStart}s into slot`, {
      slot: this.targetSlot,
    });
    await this.waitUntilTimeInSlot(nextSubslotStart);
  }

  /** Builds a single block. Called from the main block building loop. */
  @trackSpan('CheckpointProposalJob.buildSingleBlock')
  protected async buildSingleBlock(
    checkpointBuilder: CheckpointBuilder,
    opts: {
      forceCreate?: boolean;
      blockTimestamp: bigint;
      blockNumber: BlockNumber;
      indexWithinCheckpoint: IndexWithinCheckpoint;
      buildDeadline: Date | undefined;
      txHashesAlreadyIncluded: Set<string>;
    },
  ): Promise<{ block: L2Block; usedTxs: Tx[] } | { error: Error } | undefined> {
    const { blockTimestamp, forceCreate, blockNumber, indexWithinCheckpoint, buildDeadline, txHashesAlreadyIncluded } =
      opts;

    this.log.verbose(
      `Preparing block ${blockNumber} index ${indexWithinCheckpoint} at checkpoint ${this.checkpointNumber} for slot ${this.targetSlot}`,
      { ...checkpointBuilder.getConstantData(), ...opts },
    );

    try {
      // Wait until we have enough txs to build the block
      const { availableTxs, canStartBuilding, minTxs } = await this.waitForMinTxs(opts);
      if (!canStartBuilding) {
        this.log.warn(
          `Not enough txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ${this.targetSlot} (got ${availableTxs} txs but needs ${minTxs})`,
          { blockNumber, slot: this.targetSlot, indexWithinCheckpoint },
        );
        this.eventEmitter.emit('block-tx-count-check-failed', { minTxs, availableTxs, slot: this.targetSlot });
        this.metrics.recordBlockProposalFailed('insufficient_txs');
        return undefined;
      }

      // Create iterator to pending txs. We filter out txs already included in previous blocks in the checkpoint
      // just in case p2p failed to sync the provisional block and didn't get to remove those txs from the mempool yet.
      const pendingTxs = filter(
        this.p2pClient.iterateEligiblePendingTxs(),
        tx => !txHashesAlreadyIncluded.has(tx.txHash.toString()),
      );

      this.log.debug(
        `Building block ${blockNumber} at index ${indexWithinCheckpoint} for slot ${this.targetSlot} with ${availableTxs} available txs`,
        { slot: this.targetSlot, blockNumber, indexWithinCheckpoint },
      );
      this.setStateFn(SequencerState.CREATING_BLOCK, this.targetSlot);

      // Per-block limits are operator overrides (from SEQ_MAX_L2_BLOCK_GAS etc.) further capped
      // by remaining checkpoint-level budgets inside CheckpointBuilder before each block is built.
      // minValidTxs is passed into the builder so it can reject the block *before* updating state.
      const minValidTxs = forceCreate ? 0 : (this.config.minValidTxsPerBlock ?? minTxs);
      const blockBuilderOptions: BlockBuilderOptions = {
        maxTransactions: this.config.maxTxsPerBlock,
        maxBlockGas:
          this.config.maxL2BlockGas !== undefined || this.config.maxDABlockGas !== undefined
            ? new Gas(this.config.maxDABlockGas ?? Infinity, this.config.maxL2BlockGas ?? Infinity)
            : undefined,
        deadline: buildDeadline,
        isBuildingProposal: true,
        minValidTxs,
        maxBlocksPerCheckpoint: this.timetable.maxNumberOfBlocks,
        perBlockAllocationMultiplier: this.config.perBlockAllocationMultiplier,
      };

      // Actually build the block by executing txs. The builder throws InsufficientValidTxsError
      // if the number of successfully processed txs is below minValidTxs, ensuring state is not
      // updated for blocks that will be discarded.
      const buildResult = await this.buildSingleBlockWithCheckpointBuilder(
        checkpointBuilder,
        pendingTxs,
        blockNumber,
        blockTimestamp,
        blockBuilderOptions,
      );

      // If any txs failed during execution, drop them from the mempool so we don't pick them up again
      await this.dropFailedTxsFromP2P(buildResult.failedTxs);

      if (buildResult.status === 'insufficient-valid-txs') {
        this.log.warn(
          `Block ${blockNumber} at index ${indexWithinCheckpoint} on slot ${this.targetSlot} has too few valid txs to be proposed`,
          {
            slot: this.targetSlot,
            blockNumber,
            numTxs: buildResult.processedCount,
            indexWithinCheckpoint,
            minValidTxs,
          },
        );
        this.eventEmitter.emit('block-build-failed', {
          reason: `Insufficient valid txs`,
          slot: this.targetSlot,
        });
        this.metrics.recordBlockProposalFailed('insufficient_valid_txs');
        return undefined;
      }

      // Block creation succeeded, emit stats and metrics
      const { block, publicProcessorDuration, usedTxs, blockBuildDuration, numTxs } = buildResult;

      const blockStats = {
        eventName: 'l2-block-built',
        duration: blockBuildDuration,
        publicProcessDuration: publicProcessorDuration,
        ...block.getStats(),
      } satisfies L2BlockBuiltStats;

      const blockHash = await block.hash();
      const txHashes = block.body.txEffects.map(tx => tx.txHash);
      const manaPerSec = block.header.totalManaUsed.toNumberUnsafe() / (blockBuildDuration / 1000);

      this.log.info(
        `Built block ${block.number} at checkpoint ${this.checkpointNumber} for slot ${this.targetSlot} with ${numTxs} txs`,
        { blockHash, txHashes, manaPerSec, ...blockStats },
      );

      // `slot` is the target/submission slot (may be one ahead when pipelining),
      // `buildSlot` is the wall-clock slot during which the block was actually built.
      this.eventEmitter.emit('block-proposed', {
        blockNumber: block.number,
        slot: this.targetSlot,
        buildSlot: this.slotNow,
      });
      this.metrics.recordBuiltBlock(blockBuildDuration, block.header.totalManaUsed.toNumberUnsafe());

      return { block, usedTxs };
    } catch (err: any) {
      this.eventEmitter.emit('block-build-failed', {
        reason: err.message,
        slot: this.targetSlot,
      });
      this.log.error(`Error building block`, err, { blockNumber, slot: this.targetSlot });
      this.metrics.recordBlockProposalFailed(err.name || 'unknown_error');
      this.metrics.recordFailedBlock();
      return { error: err };
    }
  }

  /** Uses the checkpoint builder to build a block, catching InsufficientValidTxsError. */
  private async buildSingleBlockWithCheckpointBuilder(
    checkpointBuilder: CheckpointBuilder,
    pendingTxs: AsyncIterable<Tx>,
    blockNumber: BlockNumber,
    blockTimestamp: bigint,
    blockBuilderOptions: BlockBuilderOptions,
  ) {
    try {
      const workTimer = new Timer();
      const result = await checkpointBuilder.buildBlock(pendingTxs, blockNumber, blockTimestamp, blockBuilderOptions);
      const blockBuildDuration = workTimer.ms();
      return { ...result, blockBuildDuration, status: 'success' as const };
    } catch (err: unknown) {
      if (isErrorClass(err, InsufficientValidTxsError)) {
        return {
          failedTxs: err.failedTxs,
          processedCount: err.processedCount,
          status: 'insufficient-valid-txs' as const,
        };
      }
      throw err;
    }
  }

  /** Waits until minTxs are available on the pool for building a block. */
  @trackSpan('CheckpointProposalJob.waitForMinTxs')
  private async waitForMinTxs(opts: {
    forceCreate?: boolean;
    blockNumber: BlockNumber;
    indexWithinCheckpoint: IndexWithinCheckpoint;
    buildDeadline: Date | undefined;
  }): Promise<{ canStartBuilding: boolean; availableTxs: number; minTxs: number }> {
    const { indexWithinCheckpoint, blockNumber, buildDeadline, forceCreate } = opts;

    // We only allow a block with 0 txs in the first block of the checkpoint
    const minTxs = indexWithinCheckpoint > 0 && this.config.minTxsPerBlock === 0 ? 1 : this.config.minTxsPerBlock;

    // Deadline is undefined if we are not enforcing the timetable, meaning we'll exit immediately when out of time
    const startBuildingDeadline = buildDeadline
      ? new Date(buildDeadline.getTime() - this.timetable.minExecutionTime * 1000)
      : undefined;

    let availableTxs = await this.p2pClient.getPendingTxCount();

    while (!forceCreate && availableTxs < minTxs) {
      // If we're past deadline, or we have no deadline, give up
      const now = this.dateProvider.nowAsDate();
      if (startBuildingDeadline === undefined || now >= startBuildingDeadline) {
        return { canStartBuilding: false, availableTxs, minTxs };
      }

      // Wait a bit before checking again
      this.setStateFn(SequencerState.WAITING_FOR_TXS, this.targetSlot);
      this.log.verbose(
        `Waiting for enough txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ${this.targetSlot} (have ${availableTxs} but need ${minTxs})`,
        { blockNumber, slot: this.targetSlot, indexWithinCheckpoint },
      );
      await this.waitForTxsPollingInterval();
      availableTxs = await this.p2pClient.getPendingTxCount();
    }

    return { canStartBuilding: true, availableTxs, minTxs };
  }

  /**
   * Waits for enough attestations to be collected via p2p.
   * This is run after all blocks for the checkpoint have been built.
   */
  @trackSpan('CheckpointProposalJob.waitForAttestations')
  private async waitForAttestations(proposal: CheckpointProposal): Promise<CommitteeAttestationsAndSigners> {
    if (this.config.fishermanMode) {
      this.log.debug('Skipping attestation collection in fisherman mode');
      return CommitteeAttestationsAndSigners.empty();
    }

    const slotNumber = proposal.slotNumber;
    const { committee, seed, epoch } = await this.epochCache.getCommittee(slotNumber);

    if (!committee) {
      throw new Error('No committee when collecting attestations');
    } else if (committee.length === 0) {
      this.log.verbose(`Attesting committee is empty`);
      return CommitteeAttestationsAndSigners.empty();
    } else {
      this.log.debug(`Attesting committee length is ${committee.length}`, { committee });
    }

    const numberOfRequiredAttestations = computeQuorum(committee.length);

    if (this.config.skipCollectingAttestations) {
      this.log.warn('Skipping attestation collection as per config (attesting with own keys only)');
      const attestations = await this.validatorClient?.collectOwnAttestations(proposal);
      return new CommitteeAttestationsAndSigners(orderAttestations(attestations ?? [], committee));
    }

    const attestationTimeAllowed = this.config.enforceTimeTable
      ? this.timetable.getMaxAllowedTime(SequencerState.PUBLISHING_CHECKPOINT)!
      : this.l1Constants.slotDuration;
    const attestationDeadline = new Date((this.getSlotStartBuildTimestamp() + attestationTimeAllowed) * 1000);

    this.metrics.recordRequiredAttestations(numberOfRequiredAttestations, attestationTimeAllowed);

    const collectAttestationsTimer = new Timer();
    let collectedAttestationsCount: number = 0;
    try {
      const attestations = await this.validatorClient.collectAttestations(
        proposal,
        numberOfRequiredAttestations,
        attestationDeadline,
      );

      collectedAttestationsCount = attestations.length;

      // Trim attestations to minimum required to save L1 calldata gas
      const localAddresses = this.validatorClient.getValidatorAddresses();
      const trimmed = trimAttestations(
        attestations,
        numberOfRequiredAttestations,
        this.attestorAddress,
        localAddresses,
      );
      if (trimmed.length < attestations.length) {
        this.log.debug(`Trimmed attestations from ${attestations.length} to ${trimmed.length} for L1 submission`);
      }

      // Rollup contract requires that the signatures are provided in the order of the committee
      const sorted = orderAttestations(trimmed, committee);

      // Manipulate the attestations if we've been configured to do so
      if (
        this.config.injectFakeAttestation ||
        this.config.injectHighSValueAttestation ||
        this.config.injectUnrecoverableSignatureAttestation ||
        this.config.shuffleAttestationOrdering
      ) {
        return this.manipulateAttestations(proposal.slotNumber, epoch, seed, committee, sorted);
      }

      return new CommitteeAttestationsAndSigners(sorted);
    } catch (err) {
      if (err && err instanceof AttestationTimeoutError) {
        collectedAttestationsCount = err.collectedCount;
      }
      throw err;
    } finally {
      this.metrics.recordCollectedAttestations(collectedAttestationsCount, collectAttestationsTimer.ms());
    }
  }

  /** Breaks the attestations before publishing based on attack configs */
  private manipulateAttestations(
    slotNumber: SlotNumber,
    epoch: EpochNumber,
    seed: bigint,
    committee: EthAddress[],
    attestations: CommitteeAttestation[],
  ) {
    // Compute the proposer index in the committee, since we dont want to tweak it.
    // Otherwise, the L1 rollup contract will reject the block outright.
    const proposerIndex = Number(
      this.epochCache.computeProposerIndex(slotNumber, epoch, seed, BigInt(committee.length)),
    );

    if (
      this.config.injectFakeAttestation ||
      this.config.injectHighSValueAttestation ||
      this.config.injectUnrecoverableSignatureAttestation
    ) {
      // Find non-empty attestations that are not from the proposer
      const nonProposerIndices: number[] = [];
      for (let i = 0; i < attestations.length; i++) {
        if (!attestations[i].signature.isEmpty() && i !== proposerIndex) {
          nonProposerIndices.push(i);
        }
      }
      if (nonProposerIndices.length > 0) {
        const targetIndex = nonProposerIndices[randomInt(nonProposerIndices.length)];
        if (this.config.injectHighSValueAttestation) {
          this.log.warn(
            `Injecting high-s value attestation in checkpoint for slot ${slotNumber} at index ${targetIndex}`,
          );
          unfreeze(attestations[targetIndex]).signature = flipSignature(attestations[targetIndex].signature);
        } else if (this.config.injectUnrecoverableSignatureAttestation) {
          this.log.warn(
            `Injecting unrecoverable signature attestation in checkpoint for slot ${slotNumber} at index ${targetIndex}`,
          );
          unfreeze(attestations[targetIndex]).signature = generateUnrecoverableSignature();
        } else {
          this.log.warn(`Injecting fake attestation in checkpoint for slot ${slotNumber} at index ${targetIndex}`);
          unfreeze(attestations[targetIndex]).signature = generateRecoverableSignature();
        }
      }
      return new CommitteeAttestationsAndSigners(attestations);
    }

    if (this.config.shuffleAttestationOrdering) {
      this.log.warn(`Shuffling attestation ordering in checkpoint for slot ${slotNumber} (proposer #${proposerIndex})`);

      const shuffled = [...attestations];

      // Find two non-proposer positions that both have non-empty signatures to swap.
      // This ensures the bitmap doesn't change, so the MaliciousCommitteeAttestationsAndSigners
      // signers array stays correctly aligned with L1's committee reconstruction.
      const swappable: number[] = [];
      for (let k = 0; k < shuffled.length; k++) {
        if (!shuffled[k].signature.isEmpty() && k !== proposerIndex) {
          swappable.push(k);
        }
      }
      if (swappable.length >= 2) {
        const [i, j] = [swappable[0], swappable[1]];
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const signers = new CommitteeAttestationsAndSigners(attestations).getSigners();
      return new MaliciousCommitteeAttestationsAndSigners(shuffled, signers);
    }

    return new CommitteeAttestationsAndSigners(attestations);
  }

  private async dropFailedTxsFromP2P(failedTxs: FailedTx[]) {
    if (failedTxs.length === 0) {
      return;
    }
    const failedTxData = failedTxs.map(fail => fail.tx);
    const failedTxHashes = failedTxData.map(tx => tx.getTxHash());
    this.log.verbose(`Dropping failed txs ${failedTxHashes.join(', ')}`);
    await this.p2pClient.handleFailedExecution(failedTxHashes);
  }

  /**
   * Adds the proposed block to the archiver so it's available via P2P.
   * Gossip doesn't echo messages back to the sender, so the proposer's archiver/world-state
   * would never receive its own block without this explicit sync.
   *
   * In fisherman mode we skip this push: the fisherman builds blocks locally for validation
   * and fee analysis only, and pushing them to the archiver causes spurious reorg cascades
   * whenever the real proposer's block arrives from L1.
   */
  private async syncProposedBlockToArchiver(block: L2Block): Promise<void> {
    if (this.config.skipPushProposedBlocksToArchiver || this.config.fishermanMode) {
      this.log.warn(`Skipping push of proposed block ${block.number} to archiver`, {
        blockNumber: block.number,
        slot: block.header.globalVariables.slotNumber,
      });
      return;
    }
    this.log.debug(`Syncing proposed block ${block.number} to archiver`, {
      blockNumber: block.number,
      slot: block.header.globalVariables.slotNumber,
    });
    await this.blockSink.addBlock(block);
  }

  /** Runs fee analysis and logs checkpoint outcome as fisherman */
  private async handleCheckpointEndAsFisherman(checkpoint: Checkpoint | undefined) {
    // Perform L1 fee analysis before clearing requests
    // The callback is invoked asynchronously after the next block is mined
    const feeAnalysis = await this.publisher.analyzeL1Fees(this.targetSlot, analysis =>
      this.metrics.recordFishermanFeeAnalysis(analysis),
    );

    if (checkpoint) {
      this.log.info(`Validation checkpoint building SUCCEEDED for slot ${this.targetSlot}`, {
        ...checkpoint.toCheckpointInfo(),
        ...checkpoint.getStats(),
        feeAnalysisId: feeAnalysis?.id,
      });
    } else {
      this.log.warn(`Validation block building FAILED for slot ${this.targetSlot}`, {
        slot: this.targetSlot,
        feeAnalysisId: feeAnalysis?.id,
      });
      this.metrics.recordCheckpointProposalFailed('block_build_failed');
    }

    this.publisher.clearPendingRequests();
  }

  /**
   * Helper to handle HA double-signing errors. Returns true if the error was handled (caller should yield).
   */
  private handleHASigningError(err: any, errorContext: string): boolean {
    if (err instanceof DutyAlreadySignedError) {
      this.log.info(`${errorContext} for slot ${this.targetSlot} already signed by another HA node, yielding`, {
        slot: this.targetSlot,
        signedByNode: err.signedByNode,
      });
      return true;
    }
    if (err instanceof SlashingProtectionError) {
      this.log.info(`${errorContext} for slot ${this.targetSlot} blocked by slashing protection, yielding`, {
        slot: this.targetSlot,
        existingMessageHash: err.existingMessageHash,
        attemptedMessageHash: err.attemptedMessageHash,
      });
      return true;
    }
    return false;
  }

  /**
   * In times of congestion we need to simulate using the correct fee header override for the previous block
   * We calculate the correct fee header values.
   *
   * If we are in block 1, or the checkpoint we are querying does not exist, we return undefined. However
   * If we are pipelining - where this function is called, the grandparentCheckpointNumber should always exist
   * @param parentCheckpointNumber
   * @returns
   */
  protected async computeForceProposedFeeHeader(parentCheckpointNumber: CheckpointNumber): Promise<
    | {
        checkpointNumber: CheckpointNumber;
        feeHeader: FeeHeader;
      }
    | undefined
  > {
    if (!this.proposedCheckpointData) {
      return undefined;
    }

    const rollup = this.publisher.rollupContract;
    const grandparentCheckpointNumber = CheckpointNumber(this.checkpointNumber - 2);
    try {
      const [grandparentCheckpoint, manaTarget] = await Promise.all([
        rollup.getCheckpoint(grandparentCheckpointNumber),
        rollup.getManaTarget(),
      ]);

      if (!grandparentCheckpoint || !grandparentCheckpoint.feeHeader) {
        this.log.error(
          `Grandparent checkpoint or its feeHeader is undefined for checkpointNumber=${grandparentCheckpointNumber.toString()}`,
        );
        return undefined;
      } else {
        const parentFeeHeader = RollupContract.computeChildFeeHeader(
          grandparentCheckpoint.feeHeader,
          this.proposedCheckpointData.totalManaUsed,
          this.proposedCheckpointData.feeAssetPriceModifier,
          manaTarget,
        );
        return { checkpointNumber: parentCheckpointNumber, feeHeader: parentFeeHeader };
      }
    } catch (err) {
      this.log.error(
        `Failed to fetch grandparent checkpoint or mana target for checkpointNumber=${grandparentCheckpointNumber.toString()}: ${err}`,
      );
      return undefined;
    }
  }

  /** Waits until a specific time within the current slot */
  @trackSpan('CheckpointProposalJob.waitUntilTimeInSlot')
  protected async waitUntilTimeInSlot(targetSecondsIntoSlot: number): Promise<void> {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp();
    const targetTimestamp = slotStartTimestamp + targetSecondsIntoSlot;
    await sleepUntil(new Date(targetTimestamp * 1000), this.dateProvider.nowAsDate());
  }

  /** Waits the polling interval for transactions. Extracted for test overriding. */
  protected async waitForTxsPollingInterval(): Promise<void> {
    await sleep(TXS_POLLING_MS);
  }

  private getSlotStartBuildTimestamp(): number {
    return getSlotStartBuildTimestamp(this.slotNow, this.l1Constants);
  }

  private getSecondsIntoSlot(): number {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp();
    return Number((this.dateProvider.now() / 1000 - slotStartTimestamp).toFixed(3));
  }

  public getPublisher() {
    return this.publisher;
  }
}
