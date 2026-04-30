import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { buildFinalBlobChallenges } from '@aztec/prover-client/helpers';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import {
  type EpochProver,
  type EpochProvingJobState,
  EpochProvingJobTerminalState,
  type ForkMerkleTreeOperations,
} from '@aztec/stdlib/interfaces/server';
import { CheckpointConstantData } from '@aztec/stdlib/rollup';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader, ProcessedTx, Tx } from '@aztec/stdlib/tx';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import * as crypto from 'node:crypto';

import type { ProverNodeJobMetrics } from '../metrics.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import type { EpochProvingJobData } from './epoch-proving-job-data.js';

export type EpochProvingJobOptions = {
  parallelBlockLimit?: number;
  skipSubmitProof?: boolean;
  /**
   * If set, the job sleeps this many ms after `completeEpoch` (and any pending
   * gathering settling) and before invoking `finalizeAndProve`. Lets late-arriving
   * events (e.g. an L1 reorg's prune) be processed before the orchestrator
   * structure is finalised.
   */
  finalizationDelayMs?: number;
};

/**
 * Status of a checkpoint registered with the job.
 *  - `pending`: the checkpoint has been registered. Its tx-gathering task may still be
 *    running, or `addCheckpoint` may be in progress. The entry is in `pending` until
 *    `addCheckpoint` has finished all of its orchestrator work.
 *  - `tracked`: `addCheckpoint` has completed and the checkpoint is fully added to the
 *    orchestrator.
 */
type CheckpointStatus = 'pending' | 'tracked';

/** Data tracked per checkpoint registered with the job, regardless of its status. */
type CheckpointEntry = {
  checkpoint: Checkpoint;
  status: CheckpointStatus;
  abortController: AbortController;
  /** Index in the orchestrator's checkpoint list. Supplied by the caller at register time. */
  checkpointIndex: number;
  /** Committee attestations for this checkpoint. The job uses the highest-numbered tracked entry's at finalize time. */
  attestations: CommitteeAttestation[];
  /**
   * Header of the block immediately before this checkpoint's first block. Set when
   * `addCheckpoint` runs. Used by `getProvingData` for the lowest-numbered tracked entry
   * (i.e. the predecessor of the epoch's first checkpoint).
   */
  previousBlockHeader?: BlockHeader;
  /**
   * Promise resolved when an in-flight `addCheckpoint` for this entry has fully unwound
   * (success, error, or abort). Set at the start of `addCheckpoint`. `removeCheckpoint`
   * awaits this so a subsequent re-registration of the same checkpoint number does not
   * race with the previous `addCheckpoint`'s orchestrator work.
   */
  addCheckpointPromise?: Promise<void>;
};

/** Public view of a tracked checkpoint. */
type TrackedCheckpoint = {
  checkpoint: Checkpoint;
  checkpointIndex: number;
};

/**
 * Orchestrates the proving of an epoch incrementally, one checkpoint at a time.
 *
 * Unlike the previous batch model, this job does not require all data upfront.
 * Checkpoints are added as they arrive from L1 via `addCheckpoint()`. When the
 * epoch is complete, `finalizeAndProve()` is called to finalize the epoch structure,
 * await the proof, and publish it to L1.
 */
export class EpochProvingJob implements Traceable {
  private state: EpochProvingJobState = 'initialized';
  private log: Logger;
  private uuid: string;

  private runPromise: Promise<void> | undefined;
  private deadlineTimeoutHandler: NodeJS.Timeout | undefined;

  /** All checkpoints registered with the job, keyed by checkpoint number. Pending and tracked alike. */
  private checkpoints: Map<number, CheckpointEntry> = new Map();

  /** Accumulated data for failure upload — txs and l1ToL2Messages per checkpoint. */
  private accumulatedTxs: Map<string, Tx> = new Map();
  private accumulatedL1ToL2Messages: Record<number, Fr[]> = {};

  /**
   * Set true once `completeEpoch` is called, signalling that no more new checkpoints
   * will be produced for this epoch on L1. Existing pending entries may still settle and
   * existing tracked entries may still be removed by a re-org, but no new ones will be
   * registered.
   */
  private epochComplete = false;
  /**
   * Set once `runFinalization` has been scheduled. Prevents double-scheduling.
   * Distinct from `finalizationStarted` because `runFinalization` may sleep for
   * `config.finalizationDelayMs` before actually invoking `finalizeAndProve`, and
   * during that delay `removeCheckpoint` is still allowed.
   */
  private finalizationScheduled = false;
  /**
   * Set once `finalizeAndProve` has actually begun (after any configured delay).
   * Prevents `removeCheckpoint` from mutating orchestrator state past the point
   * where it can no longer be undone.
   */
  private finalizationStarted = false;
  /** Resolves when the job reaches a terminal state. Returned by `whenComplete`. */
  private readonly completionPromise: Promise<EpochProvingJobState>;
  private resolveCompletion!: (state: EpochProvingJobState) => void;

  public readonly tracer: Tracer;

  constructor(
    private readonly epochNumber: EpochNumber,
    private readonly dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>,
    private readonly prover: EpochProver,
    private readonly publicProcessorFactory: PublicProcessorFactory,
    private readonly publisher: Pick<ProverNodePublisher, 'submitEpochProof' | 'analyzeEpochProofSubmission'>,
    private readonly metrics: ProverNodeJobMetrics,
    private readonly deadline: Date | undefined,
    private readonly config: EpochProvingJobOptions,
    bindings?: LoggerBindings,
  ) {
    this.uuid = crypto.randomUUID();
    this.log = createLogger('prover-node:epoch-proving-job', {
      ...bindings,
      instanceId: `epoch-${epochNumber}`,
    });
    this.tracer = metrics.tracer;

    this.completionPromise = new Promise<EpochProvingJobState>(resolve => {
      this.resolveCompletion = resolve;
    });

    // Initialize the epoch in the orchestrator.
    this.prover.startNewEpoch(epochNumber);
    this.state = 'processing';

    this.scheduleDeadlineStop();
  }

  public getId(): string {
    return this.uuid;
  }

  public getState(): EpochProvingJobState {
    return this.state;
  }

  public getEpochNumber(): EpochNumber {
    return this.epochNumber;
  }

  public getDeadline(): Date | undefined {
    return this.deadline;
  }

  /** Returns the tracked checkpoints for this job, in checkpoint-number (= index) order. */
  public getTrackedCheckpoints(): TrackedCheckpoint[] {
    return Array.from(this.checkpoints.values())
      .filter(e => e.status === 'tracked')
      .sort((a, b) => a.checkpoint.number - b.checkpoint.number)
      .map(e => ({ checkpoint: e.checkpoint, checkpointIndex: e.checkpointIndex }));
  }

  /** Returns the checkpoint numbers currently in pending status. */
  public getPendingCheckpointNumbers(): CheckpointNumber[] {
    const result: CheckpointNumber[] = [];
    for (const entry of this.checkpoints.values()) {
      if (entry.status === 'pending') {
        result.push(CheckpointNumber(entry.checkpoint.number));
      }
    }
    return result;
  }

  /** Returns true if the job knows about this checkpoint number (pending or tracked). */
  public hasCheckpoint(checkpointNumber: CheckpointNumber): boolean {
    return this.checkpoints.has(checkpointNumber);
  }

  /** Returns true if `completeEpoch` has been called for this job. */
  public isEpochComplete(): boolean {
    return this.epochComplete;
  }

  /**
   * Signals that the epoch is complete on L1 — no more new checkpoints will be produced.
   * Existing pending entries may still settle (transition to tracked) and existing
   * tracked entries may still be removed by a re-org, but no new registrations will be
   * accepted.
   *
   * Idempotent. Once both `completeEpoch` has been called and there are no pending
   * entries left, `finalizeAndProve` is run internally; await `whenComplete` to observe
   * the result. The attestations used for finalization are taken from the
   * highest-numbered tracked entry at finalize time.
   */
  public completeEpoch(): void {
    this.epochComplete = true;
    this.checkStartFinalization();
  }

  /**
   * Returns a promise that resolves when the job reaches a terminal state — successful
   * finalization, failure, timeout, or stop. The promise will not resolve until either
   * `completeEpoch` triggers finalization or the job is stopped.
   */
  public whenComplete(): Promise<EpochProvingJobState> {
    return this.completionPromise;
  }

  /**
   * Registers a checkpoint with the job in `pending` status. The caller must supply:
   *  - `checkpointIndex` — computed from the archiver as the source of truth, since
   *    checkpoints can register and add out of order.
   *  - `attestations` — the committee attestations for this checkpoint, as published.
   *    The job uses the highest-numbered tracked entry's attestations at finalize time.
   *
   * Returns the AbortSignal that the caller should pass to its gathering task — if
   * `removeCheckpoint` is called before the entry transitions to `tracked`, the signal
   * is fired so the task can bail out early.
   */
  public registerPendingCheckpoint(
    checkpoint: Checkpoint,
    checkpointIndex: number,
    attestations: CommitteeAttestation[],
  ): AbortSignal {
    this.checkState();
    const key = checkpoint.number;
    if (this.checkpoints.has(key)) {
      throw new Error(`Checkpoint ${checkpoint.number} is already registered with the job`);
    }
    const abortController = new AbortController();
    this.checkpoints.set(key, {
      checkpoint,
      status: 'pending',
      abortController,
      checkpointIndex,
      attestations,
    });
    return abortController.signal;
  }

  /** Returns the accumulated proving data for failure upload. */
  public getProvingData(): EpochProvingJobData {
    // The previousBlockHeader belongs to the predecessor of the epoch's first checkpoint —
    // i.e. the lowest-numbered tracked entry's stored header. Both the entry and its
    // header are present whenever this is called (after at least one addCheckpoint has
    // run on a tracked checkpoint).
    const lowestTracked = Array.from(this.checkpoints.values())
      .filter(e => e.status === 'tracked')
      .sort((a, b) => a.checkpoint.number - b.checkpoint.number)[0];
    return {
      epochNumber: this.epochNumber,
      checkpoints: this.getTrackedCheckpoints().map(tc => tc.checkpoint),
      txs: this.accumulatedTxs,
      l1ToL2Messages: this.accumulatedL1ToL2Messages,
      previousBlockHeader: lowestTracked!.previousBlockHeader!,
      attestations: [],
    };
  }

  /**
   * Adds a checkpoint to the epoch and processes its blocks immediately.
   * Proving of block-level proofs starts as soon as blocks are processed.
   * Can be called out of order — the orchestrator supports sparse checkpoint indices.
   *
   * The checkpoint must have been registered via `registerPendingCheckpoint` first.
   * The entry stays in `pending` status throughout this call's async work — it only
   * transitions to `tracked` once the orchestrator has fully accepted the checkpoint.
   * If `removeCheckpoint` is called concurrently, the abort signal fires; this method
   * stops doing further orchestrator work, rolls back any orchestrator state already
   * created, and returns without throwing. `removeCheckpoint` awaits this rollback so
   * the orchestrator slot is clean before any subsequent re-registration.
   */
  @trackSpan('EpochProvingJob.addCheckpoint', function (_cp: Checkpoint) {
    return { [Attributes.EPOCH_NUMBER]: this.epochNumber };
  })
  public async addCheckpoint(
    checkpoint: Checkpoint,
    txs: Map<string, Tx>,
    l1ToL2Messages: Fr[],
    previousBlockHeader: BlockHeader,
  ) {
    this.checkState();

    const key = checkpoint.number;
    const entry = this.checkpoints.get(key);
    if (!entry || entry.status !== 'pending') {
      throw new Error(
        `Checkpoint ${checkpoint.number} is not registered as pending — was it removed before tx gathering completed?`,
      );
    }
    if (entry.addCheckpointPromise) {
      throw new Error(`addCheckpoint already in flight for checkpoint ${checkpoint.number}`);
    }

    let resolveAddCheckpoint: () => void = () => {};
    entry.addCheckpointPromise = new Promise<void>(resolve => {
      resolveAddCheckpoint = resolve;
    });

    const signal = entry.abortController.signal;
    let orchestratorStarted = false;
    // Index was supplied at register time by the caller (computed from the archiver).
    const checkpointIndex = entry.checkpointIndex;

    try {
      // Stash the predecessor header on the entry; getProvingData reads it from the
      // lowest-numbered tracked entry at upload time.
      entry.previousBlockHeader = previousBlockHeader;

      // Accumulate data for potential failure upload.
      for (const [hash, tx] of txs) {
        this.accumulatedTxs.set(hash, tx);
      }
      this.accumulatedL1ToL2Messages[checkpoint.number] = l1ToL2Messages;

      const checkpointTimer = new Timer();

      // Start chonk verifier for public txs in this checkpoint.
      const allTxs = checkpoint.blocks.flatMap(block =>
        block.body.txEffects.map(txEffect => txs.get(txEffect.txHash.toString())!),
      );
      const publicTxs = allTxs.filter(tx => tx?.data.forPublic);
      if (publicTxs.length > 0) {
        await this.prover.startChonkVerifierCircuits(publicTxs);
        if (signal.aborted) {
          return;
        }
      }

      const { chainId, version } = checkpoint.blocks[0].header.globalVariables;
      const checkpointConstants = CheckpointConstantData.from({
        chainId,
        version,
        vkTreeRoot: getVKTreeRoot(),
        protocolContractsHash: protocolContractsHash,
        proverId: this.prover.getProverId().toField(),
        slotNumber: checkpoint.header.slotNumber,
        coinbase: checkpoint.header.coinbase,
        feeRecipient: checkpoint.header.feeRecipient,
        gasFees: checkpoint.header.gasFees,
      });

      this.log.verbose(`Starting processing checkpoint ${checkpoint.number}`, {
        number: checkpoint.number,
        checkpointHash: checkpoint.hash().toString(),
        checkpointIndex,
        uuid: this.uuid,
      });

      await this.prover.startNewCheckpoint(
        checkpointIndex,
        checkpointConstants,
        l1ToL2Messages,
        checkpoint.blocks.length,
        previousBlockHeader,
      );
      orchestratorStarted = true;
      if (signal.aborted) {
        return;
      }

      // Process each block in the checkpoint.
      for (let blockIndex = 0; blockIndex < checkpoint.blocks.length; blockIndex++) {
        const blockTimer = new Timer();
        const block = checkpoint.blocks[blockIndex];
        const globalVariables = block.header.globalVariables;
        const blockTxs = this.getTxsForBlock(block, txs);

        this.log.verbose(`Starting processing block ${block.number}`, {
          number: block.number,
          blockHash: (await block.hash()).toString(),
          numTxs: blockTxs.length,
        });

        await this.prover.startNewBlock(block.number, globalVariables.timestamp, blockTxs.length);
        if (signal.aborted) {
          return;
        }

        // L1 to L2 messages are only inserted for the first block of a checkpoint.
        const db = await this.createFork(BlockNumber(block.number - 1), blockIndex === 0 ? l1ToL2Messages : undefined);
        try {
          if (signal.aborted) {
            return;
          }
          const config = PublicSimulatorConfig.from({
            proverId: this.prover.getProverId().toField(),
            skipFeeEnforcement: false,
            collectDebugLogs: false,
            collectHints: true,
            collectPublicInputs: true,
            collectStatistics: false,
          });
          const publicProcessor = this.publicProcessorFactory.create(db, globalVariables, config);
          const processed = await this.processTxs(publicProcessor, blockTxs);
          if (signal.aborted) {
            return;
          }
          await this.prover.addTxs(processed);
        } finally {
          await db.close();
        }
        if (signal.aborted) {
          return;
        }

        this.log.verbose(`Processed all ${blockTxs.length} txs for block ${block.number}`, {
          blockNumber: block.number,
          uuid: this.uuid,
        });

        await this.prover.setBlockCompleted(block.number, block.header);
        this.metrics.recordBlockProcessing(blockTimer.ms());
        if (signal.aborted) {
          return;
        }
      }

      entry.status = 'tracked';
      this.metrics.recordCheckpointProcessing(checkpointTimer.ms());
    } finally {
      // If we did not transition to tracked but already created orchestrator state, undo it.
      // This covers abort, thrown errors, and the entry being deleted concurrently.
      if (entry.status !== 'tracked' && orchestratorStarted) {
        this.log.info(`Rolling back orchestrator state for checkpoint ${checkpoint.number}`, {
          checkpointNumber: checkpoint.number,
          epochNumber: this.epochNumber,
        });
        this.prover.removeCheckpoint(checkpointIndex);
      }
      resolveAddCheckpoint();
      // The pending count just dropped (the entry either transitioned to 'tracked' or
      // its slot was removed). If the epoch has been marked complete, this may have been
      // the last pending and finalization should kick off.
      this.checkStartFinalization();
    }
  }

  /**
   * Removes a specific checkpoint from the job. Used for L1 prune handling.
   * Handles whatever status the checkpoint is in:
   *  - `pending`: aborts the gathering task and any in-flight `addCheckpoint`. Awaits
   *    the rollback of orchestrator state so the next call sees a clean slot — important
   *    when a re-org delivers a replacement checkpoint with the same number.
   *  - `tracked`: removes from the orchestrator at the entry's index.
   *  - Job is in a terminal state: no-op (caller should cancel the whole job).
   * Returns true if the checkpoint was known to the job.
   */
  public async removeCheckpoint(checkpointNumber: CheckpointNumber): Promise<boolean> {
    if (EpochProvingJobTerminalState.includes(this.state)) {
      return false;
    }
    // Once finalization has started, the orchestrator will reject mutations to the
    // checkpoint set. Treat removal as a no-op so a late re-org doesn't crash the caller.
    if (this.finalizationStarted) {
      return false;
    }

    const key = checkpointNumber;
    const entry = this.checkpoints.get(key);
    if (!entry) {
      return false;
    }

    if (entry.status === 'pending') {
      entry.abortController.abort();
      // If `addCheckpoint` is mid-flight for this entry, wait for it to finish unwinding
      // (its `finally` rolls back orchestrator state). This guarantees that a subsequent
      // re-registration of the same checkpoint number sees a clean orchestrator slot.
      if (entry.addCheckpointPromise) {
        await entry.addCheckpointPromise;
      }
      this.checkpoints.delete(key);
      this.log.info(`Cancelled pending checkpoint ${checkpointNumber} from epoch ${this.epochNumber}`);
      // Pending count just dropped — finalization may now be ready.
      this.checkStartFinalization();
      return true;
    }

    this.prover.removeCheckpoint(entry.checkpointIndex);
    this.checkpoints.delete(key);
    this.log.info(`Removed tracked checkpoint ${checkpointNumber} from epoch ${this.epochNumber}`);
    return true;
  }

  /**
   * Internal: starts finalization if all conditions are met (epoch marked complete, no
   * pending entries, not already started, not in a terminal state). Idempotent.
   */
  private checkStartFinalization() {
    if (!this.epochComplete || this.finalizationScheduled) {
      return;
    }
    if (EpochProvingJobTerminalState.includes(this.state)) {
      return;
    }
    if (this.checkpoints.size === 0) {
      return;
    }
    for (const entry of this.checkpoints.values()) {
      if (entry.status === 'pending') {
        return;
      }
    }
    this.finalizationScheduled = true;
    void this.runFinalization();
  }

  /**
   * Internal: drives the full finalization flow (finalizeAndProve) and resolves the
   * completion promise with the final state. Errors are absorbed — `finalizeAndProve`
   * already maps them to a `failed` state. Attestations are taken from the
   * highest-numbered tracked entry, which is the one whose attestations the L1 contract
   * verifies.
   *
   * If `config.finalizationDelayMs` is set, this sleeps for that duration before
   * invoking `finalizeAndProve` — `removeCheckpoint` is still allowed during the delay,
   * so a late-arriving prune can still mutate orchestrator state. After the delay we
   * re-check that there are no pending entries; if a new one appeared we postpone and
   * let the next `checkStartFinalization` call retry.
   */
  private async runFinalization(): Promise<void> {
    const delayMs = this.config.finalizationDelayMs;
    if (delayMs && delayMs > 0) {
      this.log.warn(`Waiting ${delayMs}ms before finalising epoch ${this.epochNumber}`);
      await sleep(delayMs);
      // After the delay, bail if the job was stopped or a new pending entry appeared
      // (e.g. a re-org replacement registered while we were sleeping). Resetting the
      // scheduled flag lets the next `checkStartFinalization` call retry once pending
      // settles back to zero.
      if (EpochProvingJobTerminalState.includes(this.state)) {
        this.resolveCompletion(this.state);
        return;
      }
      for (const entry of this.checkpoints.values()) {
        if (entry.status === 'pending') {
          this.log.info(`Pending checkpoint ${entry.checkpoint.number} appeared during finalisation delay; postponing`);
          this.finalizationScheduled = false;
          return;
        }
      }
    }
    this.finalizationStarted = true;
    const tracked = this.getTrackedCheckpoints();
    const highestTrackedNumber = tracked.at(-1)?.checkpoint.number;
    const attestations =
      highestTrackedNumber !== undefined ? (this.checkpoints.get(highestTrackedNumber)?.attestations ?? []) : [];
    try {
      await this.finalizeAndProve(attestations);
    } catch (err) {
      this.log.error(`Unexpected error during finalization`, err);
    } finally {
      this.resolveCompletion(this.state);
    }
  }

  /**
   * Finalizes the epoch structure, awaits the proof, and publishes it to L1.
   * Called when the epoch is confirmed complete on L1.
   */
  @trackSpan('EpochProvingJob.finalizeAndProve', function () {
    return { [Attributes.EPOCH_NUMBER]: this.epochNumber };
  })
  public async finalizeAndProve(attestations: CommitteeAttestation[]) {
    this.checkState();
    const timer = new Timer();

    const trackedCheckpoints = this.getTrackedCheckpoints();
    const checkpointCount = trackedCheckpoints.length;
    const fromCheckpoint = trackedCheckpoints[0]?.checkpoint.number;
    const toCheckpoint = trackedCheckpoints.at(-1)?.checkpoint.number;

    this.log.info(`Finalizing epoch ${this.epochNumber} with ${checkpointCount} checkpoints`, {
      fromCheckpoint,
      toCheckpoint,
      uuid: this.uuid,
    });

    const { promise, resolve } = promiseWithResolvers<void>();
    this.runPromise = promise;

    try {
      // Wait for all block-level proving to complete.
      await this.prover.waitForAllCheckpointsReady();

      // Compute blob challenges from the surviving checkpoints.
      const blobTimer = new Timer();
      const blobFieldsPerCheckpoint = trackedCheckpoints.map(tc => tc.checkpoint.toBlobFields());
      const finalBlobBatchingChallenges = await buildFinalBlobChallenges(blobFieldsPerCheckpoint);
      this.metrics.recordBlobProcessing(blobTimer.ms());

      // Finalize the epoch structure — triggers checkpoint root proving via two-input gate.
      await this.prover.finalizeEpochStructure(checkpointCount, finalBlobBatchingChallenges);

      const executionTime = timer.ms();

      // Await the final epoch proof.
      this.progressState('awaiting-prover');
      const { publicInputs, proof, batchedBlobInputs } = await this.prover.finalizeEpoch();
      this.log.info(`Finalized proof for epoch ${this.epochNumber}`, {
        epochNumber: this.epochNumber,
        uuid: this.uuid,
        duration: timer.ms(),
      });

      // Publish the proof.
      this.progressState('publishing-proof');

      const viemAttestations = attestations.map(a => a.toViem());
      const epochSizeBlocks = trackedCheckpoints.reduce((acc, tc) => acc + tc.checkpoint.blocks.length, 0);
      const epochSizeTxs = trackedCheckpoints.reduce(
        (acc, tc) => acc + tc.checkpoint.blocks.reduce((bAcc, block) => bAcc + block.body.txEffects.length, 0),
        0,
      );

      if (this.config.skipSubmitProof) {
        this.log.info(`Proof publishing is disabled. Analyzing estimated L1 fees for epoch ${this.epochNumber}`);
        try {
          await this.publisher.analyzeEpochProofSubmission({
            fromCheckpoint: fromCheckpoint!,
            toCheckpoint: toCheckpoint!,
            epochNumber: this.epochNumber,
            publicInputs,
            proof,
            batchedBlobInputs,
            attestations: viemAttestations,
          });
        } catch (err) {
          this.log.warn(`Failed to analyze estimated L1 fees for epoch ${this.epochNumber}`, err);
        }
        this.state = 'completed';
        this.metrics.recordProvingJob(executionTime, timer.ms(), checkpointCount, epochSizeBlocks, epochSizeTxs);
        return;
      }

      const success = await this.publisher.submitEpochProof({
        fromCheckpoint: fromCheckpoint!,
        toCheckpoint: toCheckpoint!,
        epochNumber: this.epochNumber,
        publicInputs,
        proof,
        batchedBlobInputs,
        attestations: viemAttestations,
      });
      if (!success) {
        throw new Error('Failed to submit epoch proof to L1');
      }

      this.log.info(
        `Submitted proof for epoch ${this.epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`,
        { epochNumber: this.epochNumber, uuid: this.uuid },
      );
      this.state = 'completed';
      this.metrics.recordProvingJob(executionTime, timer.ms(), checkpointCount, epochSizeBlocks, epochSizeTxs);
    } catch (err: any) {
      if (err && err.name === 'HaltExecutionError') {
        this.log.warn(`Halted execution of epoch ${this.epochNumber} prover job`, {
          uuid: this.uuid,
          epochNumber: this.epochNumber,
          details: err.message,
        });
        return;
      }
      this.log.error(`Error finalizing epoch ${this.epochNumber} prover job`, err, {
        uuid: this.uuid,
        epochNumber: this.epochNumber,
      });
      if (this.state === 'processing' || this.state === 'awaiting-prover' || this.state === 'publishing-proof') {
        this.state = 'failed';
      }
    } finally {
      clearTimeout(this.deadlineTimeoutHandler);
      await this.prover.stop();
      resolve();
    }
  }

  /**
   * Create a new db fork for tx processing, optionally inserting L1 to L2 messages.
   * L1 to L2 messages should only be inserted for the first block in a checkpoint,
   * as subsequent blocks' synced state already includes them.
   */
  private async createFork(blockNumber: BlockNumber, l1ToL2Messages: Fr[] | undefined) {
    this.log.verbose(`Creating fork at ${blockNumber}`, { blockNumber });
    const db = await this.dbProvider.fork(blockNumber);

    if (l1ToL2Messages !== undefined) {
      this.log.verbose(`Inserting ${l1ToL2Messages.length} L1 to L2 messages in fork`, {
        blockNumber,
        l1ToL2Messages: l1ToL2Messages.map(m => m.toString()),
      });
      const l1ToL2MessagesPadded = padArrayEnd<Fr, number>(
        l1ToL2Messages,
        Fr.ZERO,
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
        'Too many L1 to L2 messages',
      );
      await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
    }

    return db;
  }

  private progressState(state: EpochProvingJobState) {
    this.checkState();
    this.state = state;
  }

  private checkState() {
    if (this.state === 'timed-out' || this.state === 'stopped' || this.state === 'failed' || this.state === 'reorg') {
      throw new HaltExecutionError(this.state);
    }
  }

  public async stop(state: EpochProvingJobTerminalState = 'stopped') {
    this.state = state;
    for (const entry of this.checkpoints.values()) {
      if (entry.status === 'pending') {
        entry.abortController.abort();
      }
    }
    this.checkpoints.clear();
    this.prover.cancel();
    if (this.runPromise) {
      await this.runPromise;
    }
    // Resolve the completion promise so any awaiter unblocks. The `finally` in
    // runFinalization also resolves it, but resolving twice is safe (the first wins)
    // and we need to handle the case where finalization never started.
    this.resolveCompletion(this.state);
  }

  /** Cancels the job. Equivalent to stop('stopped'). */
  public async cancel() {
    await this.stop('stopped');
  }

  private scheduleDeadlineStop() {
    const deadline = this.deadline;
    if (deadline) {
      const timeout = deadline.getTime() - Date.now();
      if (timeout <= 0) {
        throw new Error('Cannot start job with deadline in the past');
      }

      this.deadlineTimeoutHandler = setTimeout(() => {
        if (EpochProvingJobTerminalState.includes(this.state)) {
          return;
        }
        this.log.warn('Stopping job due to deadline hit', { uuid: this.uuid, epochNumber: this.epochNumber });
        this.stop('timed-out').catch(err => {
          this.log.error('Error stopping job', err, { uuid: this.uuid, epochNumber: this.epochNumber });
        });
      }, timeout);
    }
  }

  private getTxsForBlock(block: L2Block, txs: Map<string, Tx>): Tx[] {
    return block.body.txEffects.map(txEffect => txs.get(txEffect.txHash.toString())!);
  }

  private async processTxs(publicProcessor: PublicProcessor, txs: Tx[]): Promise<ProcessedTx[]> {
    const { deadline } = this;
    const [processedTxs, failedTxs] = await publicProcessor.process(txs, { deadline });

    if (failedTxs.length) {
      const failedTxHashes = await Promise.all(failedTxs.map(({ tx }) => tx.getTxHash()));
      throw new Error(
        `Txs failed processing: ${failedTxs
          .map(({ error }, index) => `${failedTxHashes[index]} (${error})`)
          .join(', ')}`,
      );
    }

    if (processedTxs.length !== txs.length) {
      throw new Error(`Failed to process all txs: processed ${processedTxs.length} out of ${txs.length}`);
    }

    return processedTxs;
  }
}

class HaltExecutionError extends Error {
  constructor(public readonly state: EpochProvingJobState) {
    super(`Halted execution due to state ${state}`);
    this.name = 'HaltExecutionError';
  }
}

export { type EpochProvingJobState };
