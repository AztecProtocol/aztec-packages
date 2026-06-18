import { asyncPool } from '@aztec/foundation/async-pool';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';
import { AVM_MAX_CONCURRENT_SIMULATIONS } from '@aztec/native';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { buildFinalBlobChallenges } from '@aztec/prover-client/helpers';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import {
  type EpochProver,
  type EpochProvingJobState,
  EpochProvingJobTerminalState,
  type ForkMerkleTreeOperations,
} from '@aztec/stdlib/interfaces/server';
import { appendL1ToL2MessagesToTree } from '@aztec/stdlib/messaging';
import { CheckpointConstantData } from '@aztec/stdlib/rollup';
import type { ProcessedTx, Tx } from '@aztec/stdlib/tx';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import * as crypto from 'node:crypto';

import type { ProverNodeJobMetrics } from '../metrics.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { type EpochProvingJobData, validateEpochProvingJobData } from './epoch-proving-job-data.js';

export type EpochProvingJobOptions = {
  parallelBlockLimit?: number;
  skipEpochCheck?: boolean;
  skipSubmitProof?: boolean;
};

/**
 * Job that grabs a range of blocks from the unfinalized chain from L1, gets their txs given their hashes,
 * re-executes their public calls, generates a rollup proof, and submits it to L1. This job will update the
 * world state as part of public call execution via the public processor.
 */
export class EpochProvingJob implements Traceable {
  private state: EpochProvingJobState = 'initialized';
  private log: Logger;
  private uuid: string;

  private runPromise: Promise<void> | undefined;
  private abortController = new AbortController();
  private epochCheckPromise: RunningPromise | undefined;
  private deadlineTimeoutHandler: NodeJS.Timeout | undefined;

  public readonly tracer: Tracer;

  constructor(
    private data: EpochProvingJobData,
    private dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>,
    private prover: EpochProver,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: Pick<ProverNodePublisher, 'submitEpochProof' | 'analyzeEpochProofSubmission'>,
    private l2BlockSource: L2BlockSource | undefined,
    private metrics: ProverNodeJobMetrics,
    private deadline: Date | undefined,
    private config: EpochProvingJobOptions,
    bindings?: LoggerBindings,
  ) {
    validateEpochProvingJobData(data);
    this.uuid = crypto.randomUUID();
    this.log = createLogger('prover-node:epoch-proving-job', {
      ...bindings,
      instanceId: `epoch-${data.epochNumber}`,
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
    return this.data.epochNumber;
  }

  public getDeadline(): Date | undefined {
    return this.deadline;
  }

  public getProvingData(): EpochProvingJobData {
    return this.data;
  }

  private get epochNumber() {
    return this.data.epochNumber;
  }

  private get checkpoints() {
    return this.data.checkpoints;
  }

  private get txs() {
    return this.data.txs;
  }

  private get attestations() {
    return this.data.attestations;
  }

  /**
   * Proves the given epoch and submits the proof to L1.
   */
  @trackSpan('EpochProvingJob.run', function () {
    return { [Attributes.EPOCH_NUMBER]: this.data.epochNumber };
  })
  public async run() {
    this.scheduleDeadlineStop();
    if (!this.config.skipEpochCheck) {
      await this.scheduleEpochCheck();
    }

    const attestations = this.attestations.map(attestation => attestation.toViem());
    const epochNumber = this.epochNumber;
    const epochSizeCheckpoints = this.checkpoints.length;
    const epochSizeBlocks = this.checkpoints.reduce((accum, checkpoint) => accum + checkpoint.blocks.length, 0);
    const epochSizeTxs = this.checkpoints.reduce(
      (accum, checkpoint) =>
        accum + checkpoint.blocks.reduce((accumC, block) => accumC + block.body.txEffects.length, 0),
      0,
    );
    const fromCheckpoint = this.checkpoints[0].number;
    const toCheckpoint = this.checkpoints.at(-1)!.number;
    const fromBlock = this.checkpoints[0].blocks[0].number;
    const toBlock = this.checkpoints.at(-1)!.blocks.at(-1)!.number;
    this.log.info(`Starting epoch ${epochNumber} proving job with checkpoints ${fromCheckpoint} to ${toCheckpoint}`, {
      fromBlock,
      toBlock,
      epochSizeTxs,
      epochNumber,
      uuid: this.uuid,
    });

    this.progressState('processing');
    const timer = new Timer();
    const { promise, resolve } = promiseWithResolvers<void>();
    this.runPromise = promise;

    try {
      const blobTimer = new Timer();
      const blobFieldsPerCheckpoint = this.checkpoints.map(checkpoint => checkpoint.toBlobFields());
      const finalBlobBatchingChallenges = await buildFinalBlobChallenges(blobFieldsPerCheckpoint);
      this.metrics.recordBlobProcessing(blobTimer.ms());

      this.prover.startNewEpoch(epochNumber, epochSizeCheckpoints, finalBlobBatchingChallenges);
      const chonkTimer = new Timer();
      await this.prover.startChonkVerifierCircuits(Array.from(this.txs.values()));
      this.metrics.recordChonkVerifier(chonkTimer.ms());

      // Everything in the epoch should have the same chainId and version.
      const { chainId, version } = this.checkpoints[0].blocks[0].header.globalVariables;

      const previousBlockHeaders = this.gatherPreviousBlockHeaders();

      const allCheckpointsTimer = new Timer();

      const parallelism = this.config.parallelBlockLimit
        ? this.config.parallelBlockLimit
        : AVM_MAX_CONCURRENT_SIMULATIONS > 0
          ? AVM_MAX_CONCURRENT_SIMULATIONS
          : this.checkpoints.length;

      await this.processCheckpoints(parallelism, async checkpoint => {
        this.checkState();
        const checkpointTimer = new Timer();

        const checkpointIndex = checkpoint.number - fromCheckpoint;
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
        const previousHeader = previousBlockHeaders[checkpointIndex];
        const l1ToL2Messages = this.getL1ToL2Messages(checkpoint);

        this.log.debug(`Starting processing checkpoint ${checkpoint.number}`, {
          number: checkpoint.number,
          checkpointHash: checkpoint.hash().toString(),
          headerHash: checkpoint.header.hash().toString(),
          numL1ToL2Messages: l1ToL2Messages.length,
          previousBlockNumber: previousHeader.globalVariables.blockNumber,
          uuid: this.uuid,
        });

        await this.prover.startNewCheckpoint(
          checkpointIndex,
          checkpointConstants,
          l1ToL2Messages,
          checkpoint.blocks.length,
          previousHeader,
        );

        for (let blockIndex = 0; blockIndex < checkpoint.blocks.length; blockIndex++) {
          const blockTimer = new Timer();
          const block = checkpoint.blocks[blockIndex];
          const globalVariables = block.header.globalVariables;
          const txs = this.getTxs(block);

          this.log.verbose(`Starting processing block ${block.number}`, {
            number: block.number,
            blockHash: (await block.hash()).toString(),
            lastArchive: block.header.lastArchive.root,
            noteHashTreeRoot: block.header.state.partial.noteHashTree.root,
            nullifierTreeRoot: block.header.state.partial.nullifierTree.root,
            publicDataTreeRoot: block.header.state.partial.publicDataTree.root,
            ...globalVariables,
            numTxs: txs.length,
          });

          // Start block proving
          await this.prover.startNewBlock(block.number, globalVariables.timestamp, txs.length);

          // Process public fns. L1 to L2 messages are only inserted for the first block of a checkpoint,
          // as the fork for subsequent blocks already includes them from the previous block's synced state.
          {
            await using db = await this.createFork(
              BlockNumber(block.number - 1),
              blockIndex === 0 ? l1ToL2Messages : undefined,
            );
            this.checkState();
            const config = PublicSimulatorConfig.from({
              proverId: this.prover.getProverId().toField(),
              skipFeeEnforcement: false,
              collectDebugLogs: false,
              collectHints: true,
              collectPublicInputs: true,
              collectStatistics: false,
            });
            const publicProcessor = this.publicProcessorFactory.create(db, globalVariables, config);
            const processed = await this.processTxs(publicProcessor, txs);
            this.checkState();
            await this.prover.addTxs(processed);
          }
          this.checkState();
          this.log.verbose(`Processed all ${txs.length} txs for block ${block.number}`, {
            blockNumber: block.number,
            blockHash: (await block.hash()).toString(),
            uuid: this.uuid,
          });

          // Mark block as completed to pad it
          const expectedBlockHeader = block.header;
          await this.prover.setBlockCompleted(block.number, expectedBlockHeader);
          this.metrics.recordBlockProcessing(blockTimer.ms());
        }
        this.metrics.recordCheckpointProcessing(checkpointTimer.ms());
      });
      this.metrics.recordAllCheckpointsProcessing(allCheckpointsTimer.ms());

      const executionTime = timer.ms();

      this.progressState('awaiting-prover');
      const { publicInputs, proof, batchedBlobInputs } = await this.prover.finalizeEpoch();
      this.log.info(`Finalized proof for epoch ${epochNumber}`, { epochNumber, uuid: this.uuid, duration: timer.ms() });

      this.progressState('publishing-proof');

      if (this.config.skipSubmitProof) {
        this.log.info(
          `Proof publishing is disabled. Analyzing estimated L1 fees for epoch ${epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`,
        );
        try {
          await this.publisher.analyzeEpochProofSubmission({
            fromCheckpoint,
            toCheckpoint,
            epochNumber,
            publicInputs,
            headers: this.checkpoints.map(checkpoint => checkpoint.header),
            proof,
            batchedBlobInputs,
            attestations,
          });
        } catch (err) {
          this.log.warn(`Failed to analyze estimated L1 fees for epoch ${epochNumber}`, err);
        }
        this.state = 'completed';
        this.metrics.recordProvingJob(executionTime, timer.ms(), epochSizeCheckpoints, epochSizeBlocks, epochSizeTxs);
        return;
      }

      const success = await this.publisher.submitEpochProof({
        fromCheckpoint,
        toCheckpoint,
        epochNumber,
        publicInputs,
        headers: this.checkpoints.map(checkpoint => checkpoint.header),
        proof,
        batchedBlobInputs,
        attestations,
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
      if (this.state === 'processing' || this.state === 'awaiting-prover' || this.state === 'publishing-proof') {
        this.state = 'failed';
      }
    } finally {
      clearTimeout(this.deadlineTimeoutHandler);
      await this.epochCheckPromise?.stop();
      await this.prover.stop();
      resolve();
    }
  }

  /**
   * Create a new db fork for tx processing, optionally inserting L1 to L2 messages.
   * L1 to L2 messages should only be inserted for the first block in a checkpoint,
   * as subsequent blocks' synced state already includes them.
   * REFACTOR: The prover already spawns a db fork of its own for each block, so we may be able to do away with just one fork.
   */
  private async createFork(blockNumber: BlockNumber, l1ToL2Messages: Fr[] | undefined) {
    this.log.verbose(`Creating fork at ${blockNumber}`, { blockNumber });
    // temporary stack to control fork lifetime
    await using cleanup = new AsyncDisposableStack();
    const db = cleanup.use(await this.dbProvider.fork(blockNumber));

    if (l1ToL2Messages !== undefined) {
      this.log.verbose(`Inserting ${l1ToL2Messages.length} L1 to L2 messages in fork`, {
        blockNumber,
        l1ToL2Messages: l1ToL2Messages.map(m => m.toString()),
      });
      await appendL1ToL2MessagesToTree(db, l1ToL2Messages);
    }

    // everything run succesfully so we can release this stack and give control of the fork's lifetime to the caller
    cleanup.move();
    return db;
  }

  private async processCheckpoints(
    parallelism: number,
    processCheckpoint: (checkpoint: Checkpoint) => Promise<void>,
  ): Promise<void> {
    let hasError = false;
    let firstError: unknown;

    await asyncPool(Math.max(parallelism, 1), this.checkpoints, async checkpoint => {
      if (hasError || this.abortController.signal.aborted) {
        return;
      }

      try {
        this.checkState();
        await processCheckpoint(checkpoint);
      } catch (err) {
        if (!hasError) {
          hasError = true;
          firstError = err;
          this.failProcessing();
        }
      }
    });

    if (hasError) {
      throw firstError;
    }

    if (this.abortController.signal.aborted) {
      this.checkState();
    }
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
    this.interruptProcessing();
    if (this.runPromise) {
      await this.runPromise;
    }
  }

  private failProcessing() {
    if (!EpochProvingJobTerminalState.includes(this.state)) {
      this.state = 'failed';
    }
    this.interruptProcessing();
  }

  private interruptProcessing() {
    this.abortController.abort();
    this.prover.cancel();
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

  /**
   * Kicks off a running promise that queries the archiver for the set of L2 blocks of the current epoch.
   * If those change, stops the proving job with a `rerun` state, so the node re-enqueues it.
   */
  private async scheduleEpochCheck() {
    const l2BlockSource = this.l2BlockSource;
    if (!l2BlockSource) {
      this.log.warn(`No L2 block source available, skipping epoch check`);
      return;
    }

    const intervalMs = Math.ceil((await l2BlockSource.getL1Constants()).ethereumSlotDuration / 2) * 1000;
    this.epochCheckPromise = new RunningPromise(
      async () => {
        const blockHeaders = (
          await l2BlockSource.getBlocksData({ epoch: this.epochNumber, onlyCheckpointed: true })
        ).map(d => d.header);
        const blockHashes = await Promise.all(blockHeaders.map(header => header.hash()));
        const thisBlocks = this.checkpoints.flatMap(checkpoint => checkpoint.blocks);
        const thisBlockHashes = await Promise.all(thisBlocks.map(block => block.hash()));
        if (
          blockHeaders.length !== thisBlocks.length ||
          !blockHashes.every((block, i) => block.equals(thisBlockHashes[i]))
        ) {
          this.log.warn('Epoch blocks changed underfoot', {
            uuid: this.uuid,
            epochNumber: this.epochNumber,
            oldBlockHashes: thisBlockHashes,
            newBlockHashes: blockHashes,
          });
          void this.stop('reorg');
        }
      },
      this.log,
      intervalMs,
    ).start();
    this.log.verbose(`Scheduled epoch check for epoch ${this.epochNumber} every ${intervalMs}ms`);
  }

  /* Returns the last block header in the previous checkpoint for all checkpoints in the epoch */
  private gatherPreviousBlockHeaders() {
    const lastBlocks = this.checkpoints.map(checkpoint => checkpoint.blocks.at(-1)!);
    return [this.data.previousBlockHeader, ...lastBlocks.map(block => block.header).slice(0, -1)];
  }

  private getTxs(block: L2Block): Tx[] {
    return block.body.txEffects.map(txEffect => this.txs.get(txEffect.txHash.toString())!);
  }

  private getL1ToL2Messages(checkpoint: Checkpoint) {
    return this.data.l1ToL2Messages[checkpoint.number];
  }

  private async processTxs(publicProcessor: PublicProcessor, txs: Tx[]): Promise<ProcessedTx[]> {
    const { deadline } = this;
    const [processedTxs, failedTxs] = await publicProcessor.process(txs, {
      deadline,
      signal: this.abortController.signal,
    });
    this.checkState();

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
