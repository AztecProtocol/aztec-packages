import {
  EmptyTxValidator,
  type EpochProver,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  PROVING_STATUS,
  type ProcessedTx,
  type Tx,
  type TxHash,
  type TxProvider,
} from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
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
  private log = createDebugLogger('aztec:epoch-proving-job');
  private uuid: string;

  constructor(
    private prover: EpochProver,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: L1Publisher,
    private l2BlockSource: L2BlockSource,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private txProvider: TxProvider,
    private metrics: ProverNodeMetrics,
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
   * Proves the given block range and submits the proof to L1.
   * @param fromBlock - Start block.
   * @param toBlock - Last block (inclusive).
   */
  public async run(fromBlock: number, toBlock: number) {
    if (fromBlock > toBlock) {
      throw new Error(`Invalid block range: ${fromBlock} to ${toBlock}`);
    }

    const epochNumber = fromBlock; // Use starting block number as epoch number
    const epochSize = toBlock - fromBlock + 1;
    this.log.info(`Starting epoch proving job`, { fromBlock, toBlock, epochNumber, uuid: this.uuid });
    this.state = 'processing';
    const timer = new Timer();

    try {
      const provingTicket = this.prover.startNewEpoch(epochNumber, epochSize);
      let previousHeader = (await this.l2BlockSource.getBlock(fromBlock - 1))?.header;

      for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
        // Gather all data to prove this block
        const block = await this.getBlock(blockNumber);
        const globalVariables = block.header.globalVariables;
        const txHashes = block.body.txEffects.map(tx => tx.txHash);
        const txCount = block.body.numberOfTxsIncludingPadded;
        const l1ToL2Messages = await this.getL1ToL2Messages(block);
        const txs = await this.getTxs(txHashes);

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
        await this.prover.startNewBlock(txCount, globalVariables, l1ToL2Messages);

        // Process public fns
        const publicProcessor = this.publicProcessorFactory.create(previousHeader, globalVariables);
        await this.processTxs(publicProcessor, txs, txCount);
        this.log.verbose(`Processed all txs for block`, {
          blockNumber: block.number,
          blockHash: block.hash().toString(),
          uuid: this.uuid,
        });

        // Mark block as completed and update archive tree
        await this.prover.setBlockCompleted();
        previousHeader = block.header;
      }

      this.state = 'awaiting-prover';
      const result = await provingTicket.provingPromise;
      if (result.status === PROVING_STATUS.FAILURE) {
        throw new Error(`Epoch proving failed: ${result.reason}`);
      }

      const { publicInputs, proof } = this.prover.finaliseEpoch();
      this.log.info(`Finalised proof for epoch`, { epochNumber, fromBlock, toBlock, uuid: this.uuid });

      this.state = 'publishing-proof';
      await this.publisher.submitEpochProof({ epochNumber, fromBlock, toBlock, publicInputs, proof });
      this.log.info(`Submitted proof for epoch`, { epochNumber, fromBlock, toBlock, uuid: this.uuid });

      this.state = 'completed';
      this.metrics.recordProvingJob(timer);
    } catch (err) {
      this.log.error(`Error running epoch prover job`, err, { uuid: this.uuid });
      this.state = 'failed';
    } finally {
      await this.cleanUp(this);
    }
  }

  public stop() {
    this.prover.cancel();
  }

  private async getBlock(blockNumber: number): Promise<L2Block> {
    const block = await this.l2BlockSource.getBlock(blockNumber);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found in L2 block source`);
    }
    return block;
  }

  private async getTxs(txHashes: TxHash[]): Promise<Tx[]> {
    const txs = await Promise.all(
      txHashes.map(txHash => this.txProvider.getTxByHash(txHash).then(tx => [txHash, tx] as const)),
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
    const [processedTxs, failedTxs] = await publicProcessor.process(
      txs,
      totalNumberOfTxs,
      this.prover,
      new EmptyTxValidator(),
    );

    if (failedTxs.length) {
      throw new Error(
        `Failed to process txs: ${failedTxs.map(({ tx, error }) => `${tx.getTxHash()} (${error})`).join(', ')}`,
      );
    }

    return processedTxs;
  }
}

export type EpochProvingJobState =
  | 'initialized'
  | 'processing'
  | 'awaiting-prover'
  | 'publishing-proof'
  | 'completed'
  | 'failed';
