import {
  EmptyTxValidator,
  type EpochProver,
  type EpochProvingJobState,
  type ForkMerkleTreeOperations,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  type ProcessedTx,
  type ProverCoordination,
  type Tx,
  type TxHash,
} from '@aztec/circuit-types';
import { asyncPool } from '@aztec/foundation/async-pool';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';
import { type L1Publisher } from '@aztec/sequencer-client';
import { type PublicProcessor, type PublicProcessorFactory } from '@aztec/simulator';

import * as crypto from 'node:crypto';

import { type ProverNodeMetrics } from '../metrics.js';

/**
 * Job that grabs a range of blocks from the unfinalised chain from L1, gets their txs given their hashes,
 * re-executes their public calls, generates a rollup proof, and submits it to L1. This job will update the
 * world state as part of public call execution via the public processor.
 */
export class EpochProvingJob {
  private state: EpochProvingJobState = 'initialized';
  private log = createLogger('prover-node:epoch-proving-job');
  private uuid: string;

  private runPromise: Promise<void> | undefined;

  constructor(
    private dbProvider: ForkMerkleTreeOperations,
    private epochNumber: bigint,
    private blocks: L2Block[],
    private prover: EpochProver,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: L1Publisher,
    private l2BlockSource: L2BlockSource,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private coordination: ProverCoordination,
    private metrics: ProverNodeMetrics,
    private config: { parallelBlockLimit: number } = { parallelBlockLimit: 32 },
    private cleanUp: (job: EpochProvingJob) => Promise<void> = () => Promise.resolve(),
  ) {
    this.uuid = crypto.randomUUID();
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
  public async run() {
    const epochNumber = Number(this.epochNumber);
    const epochSize = this.blocks.length;
    const firstBlockNumber = this.blocks[0].number;
    this.log.info(`Starting epoch proving job`, { firstBlockNumber, epochSize, epochNumber, uuid: this.uuid });
    this.state = 'processing';
    const timer = new Timer();

    const { promise, resolve } = promiseWithResolvers<void>();
    this.runPromise = promise;

    try {
      this.prover.startNewEpoch(epochNumber, firstBlockNumber, epochSize);

      await asyncPool(this.config.parallelBlockLimit, this.blocks, async block => {
        const globalVariables = block.header.globalVariables;
        const txHashes = block.body.txEffects.map(tx => tx.txHash);
        const txCount = block.body.numberOfTxsIncludingPadded;
        const l1ToL2Messages = await this.getL1ToL2Messages(block);
        const txs = await this.getTxs(txHashes);
        const previousHeader = await this.getBlockHeader(block.number - 1);

        this.log.verbose(`Starting block processing`, {
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
        const publicProcessor = this.publicProcessorFactory.create(db, previousHeader, globalVariables);
        const processed = await this.processTxs(publicProcessor, txs, txCount);
        await this.prover.addTxs(processed);
        this.log.verbose(`Processed all txs for block`, {
          blockNumber: block.number,
          blockHash: block.hash().toString(),
          uuid: this.uuid,
        });

        // Mark block as completed to pad it
        await this.prover.setBlockCompleted(block.number, block.header);
      });

      this.state = 'awaiting-prover';
      const { publicInputs, proof } = await this.prover.finaliseEpoch();
      this.log.info(`Finalised proof for epoch`, { epochNumber, uuid: this.uuid, duration: timer.ms() });

      this.state = 'publishing-proof';
      const [fromBlock, toBlock] = [this.blocks[0].number, this.blocks.at(-1)!.number];
      await this.publisher.submitEpochProof({ fromBlock, toBlock, epochNumber, publicInputs, proof });
      this.log.info(`Submitted proof for epoch`, { epochNumber, uuid: this.uuid });

      this.state = 'completed';
      this.metrics.recordProvingJob(timer);
    } catch (err) {
      this.log.error(`Error running epoch prover job`, err, { uuid: this.uuid });
      this.state = 'failed';
    } finally {
      await this.cleanUp(this);
      resolve();
    }
  }

  public async stop() {
    this.prover.cancel();
    if (this.runPromise) {
      await this.runPromise;
    }
  }

  /* Returns the header for the given block number, or undefined for block zero. */
  private getBlockHeader(blockNumber: number) {
    if (blockNumber === 0) {
      return undefined;
    }
    return this.l2BlockSource.getBlockHeader(blockNumber);
  }

  private async getTxs(txHashes: TxHash[]): Promise<Tx[]> {
    const txs = await Promise.all(
      txHashes.map(txHash => this.coordination.getTxByHash(txHash).then(tx => [txHash, tx] as const)),
    );
    const notFound = txs.filter(([_, tx]) => !tx);
    if (notFound.length) {
      throw new Error(`Txs not found: ${notFound.map(([txHash]) => txHash.toString()).join(', ')}`);
    }
    return txs.map(([_, tx]) => tx!);
  }

  private getL1ToL2Messages(block: L2Block) {
    return this.l1ToL2MessageSource.getL1ToL2Messages(BigInt(block.number));
  }

  private async processTxs(
    publicProcessor: PublicProcessor,
    txs: Tx[],
    totalNumberOfTxs: number,
  ): Promise<ProcessedTx[]> {
    const [processedTxs, failedTxs] = await publicProcessor.process(txs, totalNumberOfTxs, new EmptyTxValidator());

    if (failedTxs.length) {
      throw new Error(
        `Failed to process txs: ${failedTxs.map(({ tx, error }) => `${tx.getTxHash()} (${error})`).join(', ')}`,
      );
    }

    return processedTxs;
  }
}

export { type EpochProvingJobState };
