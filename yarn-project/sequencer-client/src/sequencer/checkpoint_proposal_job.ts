import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { filter } from '@aztec/foundation/iterator';
import type { Logger } from '@aztec/foundation/log';
import { sleep, sleepUntil } from '@aztec/foundation/sleep';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import { type TypedEventEmitter, unfreeze } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import {
  CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  L2BlockNew,
  MaliciousCommitteeAttestationsAndSigners,
} from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import { getSlotStartBuildTimestamp } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import type {
  PublicProcessorLimits,
  ResolvedSequencerConfig,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { BlockProposal, BlockProposalOptions } from '@aztec/stdlib/p2p';
import { orderAttestations } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { L2BlockBuiltStats } from '@aztec/stdlib/stats';
import { type FailedTx, Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';
import type { ValidatorClient } from '@aztec/validator-client';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { InvalidateBlockRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { CheckpointBuilder, type FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import { CheckpointVoter } from './checkpoint_voter.js';
import { SequencerInterruptedError } from './errors.js';
import type { SequencerEvents } from './events.js';
import type { SequencerMetrics } from './metrics.js';
import type { SequencerTimetable } from './timetable.js';
import type { SequencerRollupConstants } from './types.js';
import { SequencerState } from './utils.js';

/** How much time to sleep while waiting for min transactions to accumulate for a block */
const TXS_POLLING_MS = 500;

/**
 * Handles the execution of a checkpoint proposal after the initial preparation phase.
 * This includes building blocks, collecting attestations, and publishing the checkpoint to L1,
 * as well as enqueueing votes for slashing and governance proposals. This class is created from
 * the Sequencer once the check for being the proposer for the slot has succeeded.
 */
export class CheckpointProposalJob implements Traceable {
  constructor(
    private readonly slot: SlotNumber,
    private readonly checkpointNumber: CheckpointNumber,
    private readonly syncedToBlockNumber: BlockNumber,
    // TODO(palla/mbps): Can we remove the proposer in favor of attestorAddress? Need to check fisherman-node flows.
    private readonly proposer: EthAddress | undefined,
    private readonly publisher: SequencerPublisher,
    private readonly attestorAddress: EthAddress,
    private readonly invalidateBlock: InvalidateBlockRequest | undefined,
    private readonly validatorClient: ValidatorClient,
    private readonly globalsBuilder: GlobalVariableBuilder,
    private readonly p2pClient: P2P,
    private readonly worldState: WorldStateSynchronizer,
    private readonly l1ToL2MessageSource: L1ToL2MessageSource,
    private readonly checkpointsBuilder: FullNodeCheckpointsBuilder,
    private readonly l1Constants: SequencerRollupConstants,
    protected config: ResolvedSequencerConfig,
    protected timetable: SequencerTimetable,
    private readonly slasherClient: SlasherClientInterface | undefined,
    private readonly epochCache: EpochCache,
    private readonly dateProvider: DateProvider,
    private readonly metrics: SequencerMetrics,
    private readonly eventEmitter: TypedEventEmitter<SequencerEvents>,
    private readonly setStateFn: (state: SequencerState, slot?: SlotNumber) => void,
    protected readonly log: Logger,
    public readonly tracer: Tracer,
  ) {}

  /**
   * Executes the checkpoint proposal job.
   * Returns the published checkpoint if successful, undefined otherwise.
   */
  @trackSpan('CheckpointProposalJob.execute')
  public async execute(): Promise<Checkpoint | undefined> {
    // Enqueue governance and slashing votes (returns promises that will be awaited later)
    // In fisherman mode, we simulate slashing but don't actually publish to L1
    // These are constant for the whole slot, so we only enqueue them once
    const votesPromises = new CheckpointVoter(
      this.slot,
      this.publisher,
      this.attestorAddress,
      this.validatorClient,
      this.slasherClient,
      this.l1Constants,
      this.config,
      this.metrics,
      this.log,
    ).enqueueVotes();

    // Build and propose the checkpoint. This will enqueue the request on the publisher if a checkpoint is built.
    const checkpoint = await this.proposeCheckpoint();

    // Wait until the voting promises have resolved, so all requests are enqueued (not sent)
    await Promise.all(votesPromises);

    if (checkpoint) {
      this.metrics.recordBlockProposalSuccess();
    }

    // Do not post anything to L1 if we are fishermen, but do perform L1 fee analysis
    if (this.config.fishermanMode) {
      await this.handleCheckpointEndAsFisherman(checkpoint);
      return;
    }

    // Then send everything to L1
    const l1Response = await this.publisher.sendRequests();
    const proposedAction = l1Response?.successfulActions.find(a => a === 'propose');
    if (proposedAction) {
      this.eventEmitter.emit('checkpoint-published', { checkpoint: this.checkpointNumber, slot: this.slot });
      const coinbase = checkpoint?.header.coinbase;
      await this.metrics.incFilledSlot(this.publisher.getSenderAddress().toString(), coinbase);
      return checkpoint;
    } else if (checkpoint) {
      this.eventEmitter.emit('checkpoint-publish-failed', { ...l1Response, slot: this.slot });
      return undefined;
    }
  }

  @trackSpan('CheckpointProposalJob.proposeCheckpoint', function () {
    return {
      // nullish operator needed for tests
      [Attributes.COINBASE]: this.validatorClient.getCoinbaseForAttestor(this.attestorAddress)?.toString(),
      [Attributes.SLOT_NUMBER]: this.slot,
    };
  })
  private async proposeCheckpoint(): Promise<Checkpoint | undefined> {
    try {
      // Get operator configured coinbase and fee recipient for this attestor
      const coinbase = this.validatorClient.getCoinbaseForAttestor(this.attestorAddress);
      const feeRecipient = this.validatorClient.getFeeRecipientForAttestor(this.attestorAddress);

      // Start the checkpoint
      this.setStateFn(SequencerState.INITIALIZING_CHECKPOINT, this.slot);
      this.metrics.incOpenSlot(this.slot, this.proposer?.toString() ?? 'unknown');

      // Enqueues block invalidation (constant for the whole slot)
      if (this.invalidateBlock && !this.config.skipInvalidateBlockAsProposer) {
        this.publisher.enqueueInvalidateBlock(this.invalidateBlock);
      }

      // Create checkpoint builder for the slot
      const checkpointGlobalVariables = await this.globalsBuilder.buildCheckpointGlobalVariables(
        coinbase,
        feeRecipient,
        this.slot,
      );

      // Collect L1 to L2 messages for the checkpoint
      const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(this.checkpointNumber);

      // Create a long-lived forked world state for the checkpoint builder
      using fork = await this.worldState.fork(this.syncedToBlockNumber, { closeDelayMs: 12_000 });

      // Create checkpoint builder for the entire slot
      const checkpointBuilder = await this.checkpointsBuilder.startCheckpoint(
        this.checkpointNumber,
        checkpointGlobalVariables,
        l1ToL2Messages,
        fork,
      );

      // Options for the validator client when creating block and checkpoint proposals
      const blockProposalOptions: BlockProposalOptions = {
        publishFullTxs: !!this.config.publishTxsWithProposals,
        broadcastInvalidBlockProposal: this.config.broadcastInvalidBlockProposal,
      };

      // Main loop: build blocks for the checkpoint
      const { blocksInCheckpoint, pendingBroadcast } = await this.buildBlocksForCheckpoint(
        checkpointBuilder,
        checkpointGlobalVariables.timestamp,
        blockProposalOptions,
      );

      if (blocksInCheckpoint.length === 0) {
        this.log.warn(`No blocks were built for slot ${this.slot}`, { slot: this.slot });
        this.eventEmitter.emit('checkpoint-empty', { slot: this.slot });
        return undefined;
      }

      // Assemble and broadcast the checkpoint proposal, including the last block that was not
      // broadcasted yet, and wait to collect the committee attestations.
      this.setStateFn(SequencerState.ASSEMBLING_CHECKPOINT, this.slot);
      const checkpoint = await checkpointBuilder.completeCheckpoint();

      // Do not collect attestations nor publish to L1 in fisherman mode
      if (this.config.fishermanMode) {
        this.log.info(
          `Built checkpoint for slot ${this.slot} with ${blocksInCheckpoint.length} blocks. ` +
            `Skipping proposal in fisherman mode.`,
          {
            slot: this.slot,
            checkpoint: checkpoint.header.toInspect(),
            blocksBuilt: blocksInCheckpoint.length,
          },
        );
        this.metrics.recordCheckpointSuccess();
        return checkpoint;
      }

      // TODO(palla/mbps): Wire this to the new p2p API once available, including the pendingBroadcast.block
      const proposal = await this.validatorClient.createCheckpointProposal(
        checkpoint.header,
        checkpoint.archive.root,
        pendingBroadcast?.txs ?? [],
        this.proposer,
        blockProposalOptions,
      );
      const blockProposedAt = this.dateProvider.now();
      await this.p2pClient.broadcastProposal(proposal);

      this.setStateFn(SequencerState.COLLECTING_ATTESTATIONS, this.slot);
      const attestations = await this.waitForAttestations(proposal);
      const blockAttestedAt = this.dateProvider.now();

      this.metrics.recordBlockAttestationDelay(blockAttestedAt - blockProposedAt);

      // Proposer must sign over the attestations before pushing them to L1
      const signer = this.proposer ?? this.publisher.getSenderAddress();
      const attestationsSignature = await this.validatorClient.signAttestationsAndSigners(attestations, signer);

      // Enqueue publishing the checkpoint to L1
      this.setStateFn(SequencerState.PUBLISHING_CHECKPOINT, this.slot);
      const aztecSlotDuration = this.l1Constants.slotDuration;
      const slotStartBuildTimestamp = this.getSlotStartBuildTimestamp();
      const txTimeoutAt = new Date((slotStartBuildTimestamp + aztecSlotDuration) * 1000);
      await this.publisher.enqueueProposeCheckpoint(checkpoint, attestations, attestationsSignature, {
        txTimeoutAt,
        forcePendingBlockNumber: this.invalidateBlock?.forcePendingBlockNumber,
      });

      return checkpoint;
    } catch (err) {
      this.log.error(`Error building checkpoint at slot ${this.slot}`, err);
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
    blockProposalOptions: BlockProposalOptions,
  ): Promise<{
    blocksInCheckpoint: L2BlockNew[];
    pendingBroadcast: { block: L2BlockNew; txs: Tx[] } | undefined;
  }> {
    const blocksInCheckpoint: L2BlockNew[] = [];
    const txHashesAlreadyIncluded = new Set<string>();
    const initialBlockNumber = BlockNumber(this.syncedToBlockNumber + 1);

    // Last block in the checkpoint will usually be flagged as pending broadcast, so we send it along with the checkpoint proposal
    let pendingBroadcast: { block: L2BlockNew; txs: Tx[] } | undefined = undefined;

    while (true) {
      const blocksBuilt = blocksInCheckpoint.length;
      const indexWithinCheckpoint = blocksBuilt;
      const blockNumber = BlockNumber(initialBlockNumber + blocksBuilt);

      const secondsIntoSlot = this.getSecondsIntoSlot();
      const timingInfo = this.timetable.canStartNextBlock(secondsIntoSlot);

      if (!timingInfo.canStart) {
        this.log.debug(`Not enough time left in slot to start another block`, {
          slot: this.slot,
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
          this.log.warn(`Halting block building for slot ${this.slot}`, {
            slot: this.slot,
            blocksBuilt,
            error: buildResult.error,
          });
        }
        break;
      }

      const { block, usedTxs } = buildResult;
      blocksInCheckpoint.push(block);

      // Sync the proposed block to the archiver to make it available
      // Note that the checkpoint builder uses its own fork so it should not need to wait for this syncing
      // Eventually we should refactor the checkpoint builder to not need a separate long-lived fork
      await this.syncProposedBlockToArchiver(block);

      // If this is the last block, exit the loop now so we start collecting attestations
      if (timingInfo.isLastBlock) {
        this.log.verbose(`Completed final block ${blockNumber} for slot ${this.slot}`, {
          slot: this.slot,
          blockNumber,
          blocksBuilt,
        });
        pendingBroadcast = { block, txs: usedTxs };
        break;
      }

      // For non-last blocks, broadcast the block proposal (unless we're in fisherman mode)
      // If the block is the last one, we'll broadcast it along with the checkpoint at the end of the loop
      if (!this.config.fishermanMode) {
        // TODO(palla/mbps): Wire this to the new p2p API once available
        const proposal = await this.validatorClient.createBlockProposal(
          block.header.globalVariables.blockNumber,
          (await checkpointBuilder.getCheckpoint()).header,
          block.archive.root,
          usedTxs,
          this.proposer,
          blockProposalOptions,
        );
        await this.p2pClient.broadcastProposal(proposal);
      }

      // Wait until the next block's start time
      await this.waitUntilNextSubslot(timingInfo.deadline);
    }

    this.log.verbose(`Block building loop completed for slot ${this.slot}`, {
      slot: this.slot,
      blocksBuilt: blocksInCheckpoint.length,
    });

    return {
      blocksInCheckpoint,
      pendingBroadcast,
    };
  }

  /** Sleeps until it is time to produce the next block in the slot */
  @trackSpan('CheckpointProposalJob.waitUntilNextSubslot')
  private async waitUntilNextSubslot(nextSubslotStart: number) {
    this.setStateFn(SequencerState.WAITING_UNTIL_NEXT_BLOCK, this.slot);
    this.log.verbose(`Waiting until time for the next block at ${nextSubslotStart}s into slot`, { slot: this.slot });
    await this.waitUntilTimeInSlot(nextSubslotStart);
  }

  /** Builds a single block. Called from the main block building loop. */
  @trackSpan('CheckpointProposalJob.buildSingleBlock')
  private async buildSingleBlock(
    checkpointBuilder: CheckpointBuilder,
    opts: {
      forceCreate?: boolean;
      blockTimestamp: bigint;
      blockNumber: BlockNumber;
      indexWithinCheckpoint: number;
      buildDeadline: Date | undefined;
      txHashesAlreadyIncluded: Set<string>;
    },
  ): Promise<{ block: L2BlockNew; usedTxs: Tx[] } | { error: Error } | undefined> {
    const { blockTimestamp, forceCreate, blockNumber, indexWithinCheckpoint, buildDeadline, txHashesAlreadyIncluded } =
      opts;

    this.log.verbose(
      `Preparing block ${blockNumber} index ${indexWithinCheckpoint} at checkpoint ${this.checkpointNumber} for slot ${this.slot}`,
      { ...checkpointBuilder.getConstantData(), ...opts },
    );

    try {
      // Wait until we have enough txs to build the block
      const minTxs = this.config.minTxsPerBlock;
      const { availableTxs, canStartBuilding } = await this.waitForMinTxs(opts);
      if (!canStartBuilding) {
        this.log.warn(
          `Not enough txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ${this.slot} (got ${availableTxs} txs but needs ${minTxs})`,
          { blockNumber, slot: this.slot, indexWithinCheckpoint },
        );
        this.eventEmitter.emit('block-tx-count-check-failed', { minTxs, availableTxs, slot: this.slot });
        this.metrics.recordBlockProposalFailed('insufficient_txs');
        return undefined;
      }

      // Create iterator to pending txs. We filter out txs already included in previous blocks in the checkpoint
      // just in case p2p failed to sync the provisional block and didn't get to remove those txs from the mempool yet.
      const pendingTxs = filter(
        this.p2pClient.iteratePendingTxs(),
        tx => !txHashesAlreadyIncluded.has(tx.txHash.toString()),
      );

      this.log.debug(
        `Building block ${blockNumber} at index ${indexWithinCheckpoint} for slot ${this.slot} with ${availableTxs} available txs`,
        { slot: this.slot, blockNumber, indexWithinCheckpoint },
      );
      this.setStateFn(SequencerState.CREATING_BLOCK, this.slot);
      const blockBuilderOptions: PublicProcessorLimits = {
        maxTransactions: this.config.maxTxsPerBlock,
        maxBlockSize: this.config.maxBlockSizeInBytes,
        maxBlockGas: new Gas(this.config.maxDABlockGas, this.config.maxL2BlockGas),
        maxBlobFields: BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB,
        deadline: buildDeadline,
      };

      // Actually build the block by executing txs
      const workTimer = new Timer();
      const { publicGas, block, publicProcessorDuration, numTxs, blockBuildingTimer, usedTxs, failedTxs } =
        await checkpointBuilder.buildBlock(pendingTxs, blockNumber, blockTimestamp, blockBuilderOptions);
      const blockBuildDuration = workTimer.ms();

      // If any txs failed during execution, drop them from the mempool so we don't pick them up again
      await this.dropFailedTxsFromP2P(failedTxs);

      // Check if we have created a block with enough txs. If there were invalid txs in the pool, or if execution took
      // too long, then we may not get to minTxsPerBlock after executing public functions.
      const minValidTxs = this.config.minValidTxsPerBlock ?? minTxs;
      if (!forceCreate && numTxs < minValidTxs) {
        this.log.warn(
          `Block ${blockNumber} at index ${indexWithinCheckpoint} on slot ${this.slot} has too few valid txs to be proposed (got ${numTxs} but required ${minValidTxs})`,
          { slot: this.slot, blockNumber, numTxs, indexWithinCheckpoint },
        );
        this.eventEmitter.emit('block-tx-count-check-failed', {
          minTxs: minValidTxs,
          availableTxs: numTxs,
          slot: this.slot,
        });
        this.metrics.recordBlockProposalFailed('insufficient_valid_txs');
        return undefined;
      }

      // Block creation succeeded, emit stats and metrics
      const blockStats = {
        eventName: 'l2-block-built',
        duration: blockBuildDuration,
        publicProcessDuration: publicProcessorDuration,
        rollupCircuitsDuration: blockBuildingTimer.ms(),
        ...block.getStats(),
      } satisfies L2BlockBuiltStats;

      const blockHash = await block.hash();
      const txHashes = block.body.txEffects.map(tx => tx.txHash);
      const manaPerSec = publicGas.l2Gas / (blockBuildDuration / 1000);

      this.log.info(
        `Built block ${block.number} at checkpoint ${this.checkpointNumber} for slot ${this.slot} with ${numTxs} txs`,
        { blockHash, txHashes, manaPerSec, ...blockStats },
      );

      this.eventEmitter.emit('block-proposed', { blockNumber: block.number, slot: this.slot });
      this.metrics.recordBuiltBlock(blockBuildDuration, publicGas.l2Gas);

      return { block, usedTxs };
    } catch (err: any) {
      this.eventEmitter.emit('block-build-failed', { reason: err.message, slot: this.slot });
      this.log.error(`Error building block`, err, { blockNumber, slot: this.slot });
      this.metrics.recordBlockProposalFailed(err.name || 'unknown_error');
      this.metrics.recordFailedBlock();
      return { error: err };
    }
  }

  /** Waits until minTxs are available on the pool for building a block. */
  @trackSpan('CheckpointProposalJob.waitForMinTxs')
  private async waitForMinTxs(opts: {
    forceCreate?: boolean;
    blockNumber: BlockNumber;
    indexWithinCheckpoint: number;
    buildDeadline: Date | undefined;
  }): Promise<{ canStartBuilding: boolean; availableTxs: number }> {
    const minTxs = this.config.minTxsPerBlock;
    const { indexWithinCheckpoint, blockNumber, buildDeadline, forceCreate } = opts;

    // Deadline is undefined if we are not enforcing the timetable, meaning we'll exit immediately when out of time
    const startBuildingDeadline = buildDeadline
      ? new Date(buildDeadline.getTime() - this.timetable.minExecutionTime * 1000)
      : undefined;

    let availableTxs = await this.p2pClient.getPendingTxCount();

    while (!forceCreate && availableTxs < minTxs) {
      // If we're past deadline, or we have no deadline, give up
      const now = this.dateProvider.nowAsDate();
      if (startBuildingDeadline === undefined || now >= startBuildingDeadline) {
        return { canStartBuilding: false, availableTxs: availableTxs };
      }

      // Wait a bit before checking again
      this.setStateFn(SequencerState.WAITING_FOR_TXS, this.slot);
      this.log.verbose(
        `Waiting for enough txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ${this.slot} (have ${availableTxs} but need ${minTxs})`,
        { blockNumber, slot: this.slot, indexWithinCheckpoint },
      );
      await sleep(TXS_POLLING_MS);
      availableTxs = await this.p2pClient.getPendingTxCount();
    }

    return { canStartBuilding: true, availableTxs };
  }

  /**
   * Waits for enough attestations to be collected via p2p.
   * This is run after all blocks for the checkpoint have been built.
   */
  @trackSpan('CheckpointProposalJob.waitForAttestations')
  private async waitForAttestations(proposal: BlockProposal): Promise<CommitteeAttestationsAndSigners> {
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

    const numberOfRequiredAttestations = Math.floor((committee.length * 2) / 3) + 1;

    if (this.config.skipCollectingAttestations) {
      this.log.warn('Skipping attestation collection as per config (attesting with own keys only)');
      const attestations = await this.validatorClient?.collectOwnAttestations(proposal);
      return new CommitteeAttestationsAndSigners(orderAttestations(attestations ?? [], committee));
    }

    const attestationTimeAllowed = this.config.enforceTimeTable
      ? this.timetable.getMaxAllowedTime(SequencerState.PUBLISHING_CHECKPOINT)!
      : this.l1Constants.slotDuration;
    const attestationDeadline = new Date(this.dateProvider.now() + attestationTimeAllowed * 1000);

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

      // Rollup contract requires that the signatures are provided in the order of the committee
      const sorted = orderAttestations(attestations, committee);

      // Manipulate the attestations if we've been configured to do so
      if (this.config.injectFakeAttestation || this.config.shuffleAttestationOrdering) {
        const checkpoint = proposal.payload.header;
        return this.manipulateAttestations(checkpoint, epoch, seed, committee, sorted);
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
    checkpoint: CheckpointHeader,
    epoch: EpochNumber,
    seed: bigint,
    committee: EthAddress[],
    attestations: CommitteeAttestation[],
  ) {
    // Compute the proposer index in the committee, since we dont want to tweak it.
    // Otherwise, the L1 rollup contract will reject the block outright.
    const { slotNumber } = checkpoint;
    const proposerIndex = Number(
      this.epochCache.computeProposerIndex(slotNumber, epoch, seed, BigInt(committee.length)),
    );

    if (this.config.injectFakeAttestation) {
      // Find non-empty attestations that are not from the proposer
      const nonProposerIndices: number[] = [];
      for (let i = 0; i < attestations.length; i++) {
        if (!attestations[i].signature.isEmpty() && i !== proposerIndex) {
          nonProposerIndices.push(i);
        }
      }
      if (nonProposerIndices.length > 0) {
        const targetIndex = nonProposerIndices[randomInt(nonProposerIndices.length)];
        this.log.warn(`Injecting fake attestation in checkpoint for slot ${slotNumber} at index ${targetIndex}`);
        unfreeze(attestations[targetIndex]).signature = Signature.random();
      }
      return new CommitteeAttestationsAndSigners(attestations);
    }

    if (this.config.shuffleAttestationOrdering) {
      this.log.warn(`Shuffling attestation ordering in checkpoint for slot ${slotNumber} (proposer #${proposerIndex})`);

      const shuffled = [...attestations];
      const [i, j] = [(proposerIndex + 1) % shuffled.length, (proposerIndex + 2) % shuffled.length];
      const valueI = shuffled[i];
      const valueJ = shuffled[j];
      shuffled[i] = valueJ;
      shuffled[j] = valueI;

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
    await this.p2pClient.deleteTxs(failedTxHashes);
  }

  /**
   * Placeholder for pushing block to archiver and waiting for sync.
   * To be implemented when archiver and world-state support proposed blocks.
   */
  private async syncProposedBlockToArchiver(block: L2BlockNew): Promise<void> {
    this.log.debug(`Syncing proposed block ${block.number}`, {
      blockNumber: block.number,
      slot: block.header.globalVariables.slotNumber,
    });
    // TODO(palla/mbps): Implement actual sync to archiver and world-state
    await Promise.resolve();
  }

  /** Runs fee analysis and logs checkpoint outcome as fisherman */
  private async handleCheckpointEndAsFisherman(checkpoint: Checkpoint | undefined) {
    // Perform L1 fee analysis before clearing requests
    // The callback is invoked asynchronously after the next block is mined
    const feeAnalysis = await this.publisher.analyzeL1Fees(this.slot, analysis =>
      this.metrics.recordFishermanFeeAnalysis(analysis),
    );

    if (checkpoint) {
      this.log.info(`Validation checkpoint building SUCCEEDED for slot ${this.slot}`, {
        ...checkpoint.toCheckpointInfo(),
        ...checkpoint.getStats(),
        feeAnalysisId: feeAnalysis?.id,
      });
    } else {
      this.log.warn(`Validation block building FAILED for slot ${this.slot}`, {
        slot: this.slot,
        feeAnalysisId: feeAnalysis?.id,
      });
      this.metrics.recordBlockProposalFailed('block_build_failed');
    }

    this.publisher.clearPendingRequests();
  }

  /** Waits until a specific time within the current slot */
  @trackSpan('CheckpointProposalJob.waitUntilTimeInSlot')
  protected async waitUntilTimeInSlot(targetSecondsIntoSlot: number): Promise<void> {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp();
    const targetTimestamp = slotStartTimestamp + targetSecondsIntoSlot;
    await sleepUntil(new Date(targetTimestamp * 1000), this.dateProvider.nowAsDate());
  }

  private getSlotStartBuildTimestamp(): number {
    return getSlotStartBuildTimestamp(this.slot, this.l1Constants);
  }

  private getSecondsIntoSlot(): number {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp();
    return Number((this.dateProvider.now() / 1000 - slotStartTimestamp).toFixed(3));
  }

  public getPublisher() {
    return this.publisher;
  }
}
