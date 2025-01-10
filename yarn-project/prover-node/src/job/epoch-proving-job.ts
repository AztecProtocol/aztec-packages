import {
  type EpochProver,
  type EpochProvingJobState,
  EpochProvingJobTerminalState,
  type ForkMerkleTreeOperations,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  type ProcessedTx,
  type Tx,
} from '@aztec/circuit-types';
import { asyncPool } from '@aztec/foundation/async-pool';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';
import { type L1Publisher } from '@aztec/sequencer-client';
import { type PublicProcessor, type PublicProcessorFactory } from '@aztec/simulator';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import * as crypto from 'node:crypto';

import { type ProverNodeMetrics } from '../metrics.js';

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
  private deadlineTimeoutHandler: NodeJS.Timeout | undefined;

  public readonly tracer: Tracer;

  constructor(
    private dbProvider: ForkMerkleTreeOperations,
    private epochNumber: bigint,
    private blocks: L2Block[],
    private txs: Tx[],
    private prover: EpochProver,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: L1Publisher,
    private l2BlockSource: L2BlockSource,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private metrics: ProverNodeMetrics,
    private deadline: Date | undefined,
    private config: { parallelBlockLimit: number } = { parallelBlockLimit: 32 },
    private cleanUp: (job: EpochProvingJob) => Promise<void> = () => Promise.resolve(),
  ) {
    this.uuid = crypto.randomUUID();
    this.tracer = metrics.client.getTracer('EpochProvingJob');
  }

  public getId(): string {
    return this.uuid;
  }

  public getState(): EpochProvingJobState {
    return this.state;
  }

  /**
   * Proves the given epoch and submits the proof to L1.
   */
  @trackSpan('EpochProvingJob.run', function () {
    return { [Attributes.EPOCH_NUMBER]: Number(this.epochNumber) };
  })
  public async run() {
    this.scheduleDeadlineStop();

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
      this.prover.startNewEpoch(epochNumber, fromBlock, epochSizeBlocks);
      this.prover.startTubeCircuits(this.txs);

      await asyncPool(this.config.parallelBlockLimit, this.blocks, async block => {
        this.checkState();

        const globalVariables = block.header.globalVariables;
        const txs = this.getTxs(block);
        const l1ToL2Messages = await this.getL1ToL2Messages(block);
        const previousHeader = await this.getBlockHeader(block.number - 1);

        this.log.verbose(`Starting processing block ${block.number}`, {
          number: block.number,
          blockHash: block.hash().toString(),
          lastArchive: block.header.lastArchive.root,
          noteHashTreeRoot: block.header.state.partial.noteHashTree.root,
          nullifierTreeRoot: block.header.state.partial.nullifierTree.root,
          publicDataTreeRoot: block.header.state.partial.publicDataTree.root,
          previousHeader: previousHeader?.hash(),
          uuid: this.uuid,
          ...globalVariables,
        });

        // Start block proving
        await this.prover.startNewBlock(globalVariables, l1ToL2Messages);

        // Process public fns
        const db = await this.dbProvider.fork(block.number - 1);
        const publicProcessor = this.publicProcessorFactory.create(db, previousHeader, globalVariables, true);
        const processed = await this.processTxs(publicProcessor, txs);
        await this.prover.addTxs(processed);
        await db.close();
        this.log.verbose(`Processed all ${txs.length} txs for block ${block.number}`, {
          blockNumber: block.number,
          blockHash: block.hash().toString(),
          uuid: this.uuid,
        });

        // Mark block as completed to pad it
        await this.prover.setBlockCompleted(block.number, block.header);
      });

      const executionTime = timer.ms();

      this.progressState('awaiting-prover');
      const { publicInputs, proof } = await this.prover.finaliseEpoch();
      this.log.info(`Finalised proof for epoch ${epochNumber}`, { epochNumber, uuid: this.uuid, duration: timer.ms() });

      this.progressState('publishing-proof');
      const success = await this.publisher.submitEpochProof({ fromBlock, toBlock, epochNumber, publicInputs, proof });
      if (!success) {
        throw new Error('Failed to submit epoch proof to L1');
      }

      this.log.info(`Submitted proof for epoch`, { epochNumber, uuid: this.uuid });
      this.state = 'completed';
      this.metrics.recordProvingJob(executionTime, timer.ms(), epochSizeBlocks, epochSizeTxs);
    } catch (err: any) {
      if (err && err.name === 'HaltExecutionError') {
        this.log.warn(`Halted execution of epoch ${epochNumber} prover job`, { uuid: this.uuid, epochNumber });
        return;
      }
      this.log.error(`Error running epoch ${epochNumber} prover job`, err, { uuid: this.uuid, epochNumber });
      this.state = 'failed';
    } finally {
      clearTimeout(this.deadlineTimeoutHandler);
      await this.cleanUp(this);
      await this.prover.stop();
      resolve();
    }
  }

  private progressState(state: EpochProvingJobState) {
    this.checkState();
    this.state = state;
  }

  private checkState() {
    if (this.state === 'timed-out' || this.state === 'stopped' || this.state === 'failed') {
      throw new HaltExecutionError(this.state);
    }
  }

  public async stop(state: EpochProvingJobState = 'stopped') {
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

  /* Returns the header for the given block number, or undefined for block zero. */
  private getBlockHeader(blockNumber: number) {
    if (blockNumber === 0) {
      return undefined;
    }
    return this.l2BlockSource.getBlockHeader(blockNumber);
  }

  private getTxs(block: L2Block): Tx[] {
    const txHashes = block.body.txEffects.map(tx => tx.txHash.toBigInt());
    return this.txs.filter(tx => txHashes.includes(tx.getTxHash().toBigInt()));
  }

  private getL1ToL2Messages(block: L2Block) {
    return this.l1ToL2MessageSource.getL1ToL2Messages(BigInt(block.number));
  }

  private async processTxs(publicProcessor: PublicProcessor, txs: Tx[]): Promise<ProcessedTx[]> {
    const { deadline } = this;
    const [processedTxs, failedTxs] = await publicProcessor.process(txs, { deadline });

    if (failedTxs.length) {
      throw new Error(
        `Txs failed processing: ${failedTxs.map(({ tx, error }) => `${tx.getTxHash()} (${error})`).join(', ')}`,
      );
    }

    if (processedTxs.length !== txs.length) {
      throw new Error(`Failed to process all txs: processed ${processedTxs.length} out of ${txs.length}`);
    }

    return processedTxs;
  }
}

class HaltExecutionError extends Error {
  constructor(state: EpochProvingJobState) {
    super(`Halted execution due to state ${state}`);
    this.name = 'HaltExecutionError';
  }
}

export { type EpochProvingJobState };
