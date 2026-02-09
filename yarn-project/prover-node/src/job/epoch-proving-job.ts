import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
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
};

/** Data needed to process a single checkpoint within an epoch proving job. */
type CheckpointData = {
  checkpoint: Checkpoint;
  txs: Map<string, Tx>;
  l1ToL2Messages: Fr[];
  previousBlockHeader: BlockHeader;
};

/**
 * Job that proves an epoch and submits the proof to L1. Supports both push-based (optimistic)
 * and batch modes. In push-based mode, checkpoints are added via addCheckpoint() as they arrive
 * during the epoch, and setEpochComplete() signals finalization. In batch mode, all data is
 * provided upfront via addCheckpoint() followed immediately by setEpochComplete().
 */
export class EpochProvingJob implements Traceable {
  private state: EpochProvingJobState = 'initialized';
  private log: Logger;
  private uuid: string;

  private runPromise: Promise<void> | undefined;
  private deadlineTimeoutHandler: NodeJS.Timeout | undefined;

  /** Promises for all checkpoint processing tasks. */
  private checkpointProcessingPromises: Promise<void>[] = [];
  /** Successfully processed checkpoints, in order they completed. */
  private processedCheckpoints: Checkpoint[] = [];
  /** Resolves when the epoch is complete and we know all checkpoints. */
  private epochCompleteResolver = promiseWithResolvers<{ attestations: CommitteeAttestation[] }>();

  /** Resolves to unblock the submission gate on stop/timeout. */
  private stopResolver = promiseWithResolvers<void>();

  /** Tracks the next expected checkpoint index. */
  private nextCheckpointIndex = 0;
  /** Checkpoint numbers already added, for dedup. */
  private addedCheckpointNumbers: Set<number> = new Set();

  public readonly tracer: Tracer;

  constructor(
    private readonly epochNumber: EpochNumber,
    private dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>,
    private prover: EpochProver,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: Pick<ProverNodePublisher, 'submitEpochProof'>,
    private metrics: ProverNodeJobMetrics,
    private deadline: Date | undefined,
    private config: EpochProvingJobOptions,
    private submissionGate?: Promise<void>,
    bindings?: LoggerBindings,
  ) {
    this.uuid = crypto.randomUUID();
    this.log = createLogger('prover-node:epoch-proving-job', {
      ...bindings,
      instanceId: `epoch-${epochNumber}`,
    });
    this.tracer = metrics.tracer;
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

  /**
   * Returns proving data for failure upload. Collects all processed checkpoints into the legacy format.
   * Note: This may be incomplete if the job failed before all checkpoints were processed.
   */
  public getProvingData(): EpochProvingJobData {
    const checkpoints = this.processedCheckpoints.sort((a, b) => a.number - b.number);
    const txs = new Map<string, Tx>();
    const l1ToL2Messages: Record<number, Fr[]> = {};

    // We don't have perfect data reconstruction — this is best-effort for debugging.
    return {
      epochNumber: this.epochNumber,
      checkpoints,
      txs,
      l1ToL2Messages,
      previousBlockHeader: undefined as any, // May not be available
      attestations: [],
    };
  }

  /**
   * Called by ProverNode when a new checkpoint arrives for this epoch.
   * Gathers checkpoint data and starts processing immediately.
   */
  addCheckpoint(
    checkpoint: Checkpoint,
    l1ToL2Messages: Fr[],
    previousBlockHeader: BlockHeader,
    txs: Map<string, Tx>,
  ): void {
    if (this.addedCheckpointNumbers.has(checkpoint.number)) {
      this.log.warn(`Duplicate checkpoint ${checkpoint.number} ignored`, { uuid: this.uuid });
      return;
    }
    this.addedCheckpointNumbers.add(checkpoint.number);
    const checkpointIndex = this.nextCheckpointIndex++;
    this.log.verbose(`Adding checkpoint ${checkpoint.number} (index ${checkpointIndex}) for processing`, {
      uuid: this.uuid,
      checkpointNumber: checkpoint.number,
    });

    const data: CheckpointData = {
      checkpoint,
      txs,
      l1ToL2Messages,
      previousBlockHeader,
    };

    const promise = this.processCheckpoint(checkpointIndex, data).catch(err => {
      if (err && err.name === 'HaltExecutionError') {
        return;
      }
      this.log.error(`Error processing checkpoint ${checkpoint.number}`, err, { uuid: this.uuid });
      throw err;
    });
    this.checkpointProcessingPromises.push(promise);
  }

  /**
   * Called by ProverNode when epoch is complete.
   * @param attestations - The attestations for the last checkpoint.
   */
  setEpochComplete(attestations: CommitteeAttestation[]): void {
    this.log.verbose(`Epoch ${this.epochNumber} marked complete`, { uuid: this.uuid });
    this.epochCompleteResolver.resolve({ attestations });
  }

  /**
   * Proves the epoch and submits the proof to L1.
   * Waits for epoch completion signal and all checkpoint processing to finish,
   * then finalizes the epoch proof.
   */
  @trackSpan('EpochProvingJob.run', function () {
    return { [Attributes.EPOCH_NUMBER]: this.epochNumber };
  })
  public async run() {
    this.scheduleDeadlineStop();

    const epochNumber = this.epochNumber;
    this.log.info(`Starting epoch ${epochNumber} proving job`, {
      epochNumber,
      uuid: this.uuid,
    });

    this.progressState('processing');
    const timer = new Timer();
    const { promise, resolve } = promiseWithResolvers<void>();
    this.runPromise = promise;

    try {
      this.prover.startNewEpoch(epochNumber);

      // Wait for epoch completion signal.
      const { attestations } = await this.epochCompleteResolver.promise;

      // Wait for all checkpoint processing to finish.
      await Promise.all(this.checkpointProcessingPromises);

      // === Phase 2: Finalize ===
      const allCheckpoints = this.processedCheckpoints.sort((a, b) => a.number - b.number);
      const epochSizeCheckpoints = allCheckpoints.length;
      const epochSizeBlocks = allCheckpoints.reduce((accum, cp) => accum + cp.blocks.length, 0);
      const epochSizeTxs = allCheckpoints.reduce(
        (accum, cp) => accum + cp.blocks.reduce((accumC, block) => accumC + block.body.txEffects.length, 0),
        0,
      );
      const fromCheckpoint = allCheckpoints[0].number;
      const toCheckpoint = allCheckpoints.at(-1)!.number;

      this.log.info(`All ${epochSizeCheckpoints} checkpoints processed. Setting epoch structure and finalizing.`, {
        epochNumber,
        fromCheckpoint,
        toCheckpoint,
        epochSizeBlocks,
        epochSizeTxs,
        uuid: this.uuid,
      });

      // Compute final blob challenges and set epoch structure.
      const blobFieldsPerCheckpoint = allCheckpoints.map(checkpoint => checkpoint.toBlobFields());
      const finalBlobBatchingChallenges = await buildFinalBlobChallenges(blobFieldsPerCheckpoint);
      await this.prover.setEpochStructure(epochSizeCheckpoints, finalBlobBatchingChallenges);

      const executionTime = timer.ms();

      this.progressState('awaiting-prover');
      const { publicInputs, proof, batchedBlobInputs } = await this.prover.finalizeEpoch();
      this.log.info(`Finalized proof for epoch ${epochNumber}`, { epochNumber, uuid: this.uuid, duration: timer.ms() });

      if (this.submissionGate) {
        this.progressState('awaiting-submission');
        this.log.verbose(`Awaiting submission gate for epoch ${epochNumber}`, { uuid: this.uuid });
        await Promise.race([this.submissionGate, this.stopResolver.promise]);
        this.checkState();
      }

      this.progressState('publishing-proof');

      const viemAttestations = attestations.map(a => a.toViem());

      if (this.config.skipSubmitProof) {
        this.log.info(
          `Proof publishing is disabled. Dropping valid proof for epoch ${epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`,
        );
        this.state = 'completed';
        this.metrics.recordProvingJob(executionTime, timer.ms(), epochSizeCheckpoints, epochSizeBlocks, epochSizeTxs);
        return;
      }

      const success = await this.publisher.submitEpochProof({
        fromCheckpoint,
        toCheckpoint,
        epochNumber,
        publicInputs,
        proof,
        batchedBlobInputs,
        attestations: viemAttestations,
      });
      if (!success) {
        throw new Error('Failed to submit epoch proof to L1');
      }

      this.log.info(`Submitted proof for epoch ${epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`, {
        epochNumber,
        uuid: this.uuid,
      });
      this.state = 'completed';
      this.metrics.recordProvingJob(executionTime, timer.ms(), epochSizeCheckpoints, epochSizeBlocks, epochSizeTxs);
    } catch (err: any) {
      if (err && err.name === 'HaltExecutionError') {
        this.log.warn(`Halted execution of epoch ${epochNumber} prover job`, {
          uuid: this.uuid,
          epochNumber,
          details: err.message,
        });
        return;
      }
      this.log.error(`Error running epoch ${epochNumber} prover job`, err, { uuid: this.uuid, epochNumber });
      if (
        this.state === 'processing' ||
        this.state === 'awaiting-prover' ||
        this.state === 'awaiting-submission' ||
        this.state === 'publishing-proof'
      ) {
        this.state = 'failed';
      }
    } finally {
      clearTimeout(this.deadlineTimeoutHandler);
      await this.prover.stop();
      resolve();
    }
  }

  /** Processes a single checkpoint: starts chonk verifiers, processes each block. */
  private async processCheckpoint(checkpointIndex: number, data: CheckpointData) {
    this.checkState();

    const { checkpoint, txs, l1ToL2Messages, previousBlockHeader } = data;

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
      lastArchive: checkpoint.header.lastArchiveRoot,
      previousHeader: previousBlockHeader.hash(),
      uuid: this.uuid,
    });

    await this.prover.startNewCheckpoint(
      checkpointIndex,
      checkpointConstants,
      l1ToL2Messages,
      checkpoint.blocks.length,
      previousBlockHeader,
    );

    // Start chonk verifiers for this checkpoint's txs.
    const allTxs = checkpoint.blocks.flatMap(block =>
      block.body.txEffects.map(txEffect => txs.get(txEffect.txHash.toString())!),
    );
    await this.prover.startChonkVerifierCircuits(allTxs);

    for (const block of checkpoint.blocks) {
      const globalVariables = block.header.globalVariables;
      const blockTxs = this.getBlockTxs(block, txs);

      this.log.verbose(`Starting processing block ${block.number}`, {
        number: block.number,
        blockHash: (await block.hash()).toString(),
        lastArchive: block.header.lastArchive.root,
        noteHashTreeRoot: block.header.state.partial.noteHashTree.root,
        nullifierTreeRoot: block.header.state.partial.nullifierTree.root,
        publicDataTreeRoot: block.header.state.partial.publicDataTree.root,
        ...globalVariables,
        numTxs: blockTxs.length,
      });

      // Start block proving.
      await this.prover.startNewBlock(block.number, globalVariables.timestamp, blockTxs.length);

      // Process public fns.
      const db = await this.createFork(BlockNumber(block.number - 1), l1ToL2Messages);
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
      await this.prover.addTxs(processed);
      await db.close();
      this.log.verbose(`Processed all ${blockTxs.length} txs for block ${block.number}`, {
        blockNumber: block.number,
        blockHash: (await block.hash()).toString(),
        uuid: this.uuid,
      });

      // Mark block as completed.
      const expectedBlockHeader = block.header;
      await this.prover.setBlockCompleted(block.number, expectedBlockHeader);
    }

    this.processedCheckpoints.push(checkpoint);
  }

  private getBlockTxs(block: L2Block, txs: Map<string, Tx>): Tx[] {
    return block.body.txEffects.map(txEffect => txs.get(txEffect.txHash.toString())!);
  }

  /**
   * Create a new db fork for tx processing, inserting all L1 to L2.
   * REFACTOR: The prover already spawns a db fork of its own for each block, so we may be able to do away with just one fork.
   */
  private async createFork(blockNumber: BlockNumber, l1ToL2Messages: Fr[]) {
    const db = await this.dbProvider.fork(blockNumber);
    const l1ToL2MessagesPadded = padArrayEnd<Fr, number>(
      l1ToL2Messages,
      Fr.ZERO,
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      'Too many L1 to L2 messages',
    );
    this.log.verbose(`Creating fork at ${blockNumber} with ${l1ToL2Messages.length} L1 to L2 messages`, {
      blockNumber,
      l1ToL2Messages: l1ToL2Messages.map(m => m.toString()),
    });
    await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
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
    this.prover.cancel();
    // Resolve the stop resolver to unblock the submission gate if waiting.
    this.stopResolver.resolve();
    // Resolve the epoch complete promise to unblock run() if waiting.
    this.epochCompleteResolver.resolve({ attestations: [] });
    if (this.runPromise) {
      await this.runPromise;
    }
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
