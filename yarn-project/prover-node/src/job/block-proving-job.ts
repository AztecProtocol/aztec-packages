import {
  type BlockProver,
  EmptyTxValidator,
  type L2Block,
  type L2BlockSource,
  type ProcessedTx,
  type Tx,
  type TxHash,
  type TxProvider,
} from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { type L1Publisher } from '@aztec/sequencer-client';
import { type PublicProcessor, type PublicProcessorFactory } from '@aztec/simulator';

export class BlockProvingJob {
  private state: BlockProvingJobState = 'initialized';
  private log = createDebugLogger('aztec:block-proving-job');

  constructor(
    private prover: BlockProver,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: L1Publisher,
    private l2BlockSource: L2BlockSource,
    private txProvider: TxProvider,
  ) {}

  public getState(): BlockProvingJobState {
    return this.state;
  }

  public async run(fromBlock: number, toBlock: number) {
    if (fromBlock !== toBlock) {
      throw new Error(`Block ranges are not yet supported`);
    }

    this.log.info(`Starting block proving job`, { fromBlock, toBlock });
    this.state = 'started';

    // TODO: Fast-forward world state to fromBlock and/or await fromBlock to be published to the unproven chain

    this.state = 'processing';

    let historicalHeader = (await this.l2BlockSource.getBlock(fromBlock - 1))?.header;
    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
      const block = await this.getBlock(blockNumber);
      const globalVariables = block.header.globalVariables;
      const txHashes = block.body.txEffects.map(tx => tx.txHash);
      const l1ToL2Messages: Fr[] = []; // TODO: grab L1 to L2 messages for this block

      this.log.debug(`Starting block processing`, { blockNumber: block.number, blockHash: block.hash().toString() });
      await this.prover.startNewBlock(txHashes.length, globalVariables, l1ToL2Messages);
      const publicProcessor = await this.publicProcessorFactory.create(historicalHeader, globalVariables);

      const txs = await this.getTxs(txHashes);
      const txCount = block.body.numberOfTxsIncludingPadded;
      await this.processTxs(publicProcessor, txs, txCount);

      this.log.debug(`Processed all txs for block`, { blockNumber: block.number, blockHash: block.hash().toString() });
      await this.prover.setBlockCompleted();

      historicalHeader = block.header;
    }

    this.state = 'awaiting-prover';
    const { block, aggregationObject, proof } = await this.prover.finaliseBlock();
    this.log.info(`Finalised proof for block range`, { fromBlock, toBlock });

    this.state = 'publishing-proof';
    await this.publisher.submitProof(block.header, block.archive.root, aggregationObject, proof);
    this.log.info(`Submitted proof for block range`, { fromBlock, toBlock });

    this.state = 'completed';
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

export type BlockProvingJobState =
  | 'initialized'
  | 'started'
  | 'processing'
  | 'awaiting-prover'
  | 'publishing-proof'
  | 'completed';
