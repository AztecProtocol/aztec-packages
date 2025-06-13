import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { asyncPool } from '@aztec/foundation/async-pool';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import {
  type EpochProver,
  type EpochProvingJobState,
  EpochProvingJobTerminalState,
  type ForkMerkleTreeOperations,
} from '@aztec/stdlib/interfaces/server';
import type { ProcessedTx, Tx } from '@aztec/stdlib/tx';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import * as crypto from 'node:crypto';

import type { ProverNodeJobMetrics } from '../metrics.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { type EpochProvingJobData, validateEpochProvingJobData } from './epoch-proving-job-data.js';

/**
 * Job that grabs a range of blocks from the unfinalised chain from L1, gets their txs given their hashes,
 * re-executes their public calls, generates a rollup proof, and submits it to L1. This job will update the
 * world state as part of public call execution via the public processor.
 */
export class EpochProvingJob implements Traceable {
  private state: EpochProvingJobState = 'initialized';
  private log = createLogger('prover-node:epoch-proving-job');
  private uuid: string;

  private runPromise: Promise<void> | undefined;
  private epochCheckPromise: RunningPromise | undefined;
  private deadlineTimeoutHandler: NodeJS.Timeout | undefined;

  public readonly tracer: Tracer;

  constructor(
    private data: EpochProvingJobData,
    private dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>,
    private prover: EpochProver,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: Pick<ProverNodePublisher, 'submitEpochProof'>,
    private l2BlockSource: L2BlockSource | undefined,
    private metrics: ProverNodeJobMetrics,
    private deadline: Date | undefined,
    private config: { parallelBlockLimit?: number; skipEpochCheck?: boolean },
  ) {
    validateEpochProvingJobData(data);
    this.uuid = crypto.randomUUID();
    this.tracer = metrics.tracer;
  }

  public getId(): string {
    return this.uuid;
  }

  public getState(): EpochProvingJobState {
    return this.state;
  }

  public getEpochNumber(): bigint {
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

  private get blocks() {
    return this.data.blocks;
  }

  private get txs() {
    return this.data.txs;
  }

  /**
   * Proves the given epoch and submits the proof to L1.
   */
  @trackSpan('EpochProvingJob.run', function () {
    return { [Attributes.EPOCH_NUMBER]: Number(this.data.epochNumber) };
  })
  public async run() {
    this.scheduleDeadlineStop();
    if (!this.config.skipEpochCheck) {
      await this.scheduleEpochCheck();
    }

    const epochNumber = Number(this.epochNumber);
    const epochSizeBlocks = this.blocks.length;
    const epochSizeTxs = this.blocks.reduce((total, current) => total + current.body.txEffects.length, 0);
    const [fromBlock, toBlock] = [this.blocks[0].number, this.blocks.at(-1)!.number];
    this.log.info(`Starting epoch ${epochNumber} proving job with blocks ${fromBlock} to ${toBlock}`, {
      fromBlock,
      toBlock,
      epochSizeBlocks,
      epochNumber,
      uuid: this.uuid,
    });

    this.progressState('processing');
    const timer = new Timer();
    const { promise, resolve } = promiseWithResolvers<void>();
    this.runPromise = promise;

    try {
      const allBlobs = (
        await Promise.all(this.blocks.map(async block => await Blob.getBlobsPerBlock(block.body.toBlobFields())))
      ).flat();

      const finalBlobBatchingChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(allBlobs);
      this.prover.startNewEpoch(epochNumber, fromBlock, epochSizeBlocks, finalBlobBatchingChallenges);
      await this.prover.startTubeCircuits(this.txs);

      await asyncPool(this.config.parallelBlockLimit ?? 32, this.blocks, async block => {
        this.checkState();

        const globalVariables = block.header.globalVariables;
        const txs = await this.getTxs(block);
        const l1ToL2Messages = this.getL1ToL2Messages(block);
        const previousHeader = this.getBlockHeader(block.number - 1)!;

        this.log.verbose(`Starting processing block ${block.number}`, {
          number: block.number,
          blockHash: (await block.hash()).toString(),
          lastArchive: block.header.lastArchive.root,
          noteHashTreeRoot: block.header.state.partial.noteHashTree.root,
          nullifierTreeRoot: block.header.state.partial.nullifierTree.root,
          publicDataTreeRoot: block.header.state.partial.publicDataTree.root,
          previousHeader: previousHeader.hash(),
          uuid: this.uuid,
          ...globalVariables,
        });

        // Start block proving
        await this.prover.startNewBlock(globalVariables, l1ToL2Messages, previousHeader);

        // Process public fns
        const db = await this.dbProvider.fork(block.number - 1);
        const publicProcessor = this.publicProcessorFactory.create(db, globalVariables, true);
        const processed = await this.processTxs(publicProcessor, txs);
        await this.prover.addTxs(processed);
        await db.close();
        this.log.verbose(`Processed all ${txs.length} txs for block ${block.number}`, {
          blockNumber: block.number,
          blockHash: (await block.hash()).toString(),
          uuid: this.uuid,
        });

        // Mark block as completed to pad it
        await this.prover.setBlockCompleted(block.number, block.header);
      });

      const executionTime = timer.ms();

      this.progressState('awaiting-prover');
      const { publicInputs, proof, batchedBlobInputs } = await this.prover.finaliseEpoch();
      this.log.info(`Finalised proof for epoch ${epochNumber}`, { epochNumber, uuid: this.uuid, duration: timer.ms() });

      this.progressState('publishing-proof');
      const success = await this.publisher.submitEpochProof({
        fromBlock,
        toBlock,
        epochNumber,
        publicInputs,
        proof,
        batchedBlobInputs,
      });
      if (!success) {
        throw new Error('Failed to submit epoch proof to L1');
      }

      this.log.info(`Submitted proof for epoch ${epochNumber} (blocks ${fromBlock} to ${toBlock})`, {
        epochNumber,
        uuid: this.uuid,
      });
      this.state = 'completed';
      this.metrics.recordProvingJob(executionTime, timer.ms(), epochSizeBlocks, epochSizeTxs);
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
      this.state = 'failed';
    } finally {
      clearTimeout(this.deadlineTimeoutHandler);
      await this.epochCheckPromise?.stop();
      await this.prover.stop();
      resolve();
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
    this.prover.cancel();
    // TODO(palla/prover): Stop the publisher as well
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
        const blocks = await l2BlockSource.getBlockHeadersForEpoch(this.epochNumber);
        const blockHashes = await Promise.all(blocks.map(block => block.hash()));
        const thisBlockHashes = await Promise.all(this.blocks.map(block => block.hash()));
        if (
          blocks.length !== this.blocks.length ||
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

  /* Returns the header for the given block number based on the epoch proving job data. */
  private getBlockHeader(blockNumber: number) {
    const block = this.blocks.find(b => b.number === blockNumber);
    if (block) {
      return block.header;
    }

    if (blockNumber === Number(this.data.previousBlockHeader.getBlockNumber())) {
      return this.data.previousBlockHeader;
    }

    throw new Error(
      `Block header not found for block number ${blockNumber} (got ${this.blocks
        .map(b => b.number)
        .join(', ')} and previous header ${this.data.previousBlockHeader.getBlockNumber()})`,
    );
  }

  private async getTxs(block: L2Block): Promise<Tx[]> {
    const txHashes = block.body.txEffects.map(tx => tx.txHash.toBigInt());
    const txsAndHashes = await Promise.all(this.txs.map(async tx => ({ tx, hash: await tx.getTxHash() })));
    return txsAndHashes
      .filter(txAndHash => txHashes.includes(txAndHash.hash.toBigInt()))
      .map(txAndHash => txAndHash.tx);
  }

  private getL1ToL2Messages(block: L2Block) {
    return this.data.l1ToL2Messages[block.number];
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
