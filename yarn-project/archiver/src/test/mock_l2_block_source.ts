import {
  L2Block,
  L2BlockHash,
  type L2BlockSource,
  type L2Tips,
  type TxHash,
  TxReceipt,
  TxStatus,
} from '@aztec/circuit-types';
import { getSlotRangeForEpoch } from '@aztec/circuit-types';
import { type BlockHeader, EthAddress } from '@aztec/circuits.js';
import { DefaultL1ContractsConfig } from '@aztec/ethereum';
import { createDebugLogger } from '@aztec/foundation/log';

/**
 * A mocked implementation of L2BlockSource to be used in tests.
 */
export class MockL2BlockSource implements L2BlockSource {
  protected l2Blocks: L2Block[] = [];

  private provenEpochNumber: number = 0;
  private provenBlockNumber: number = 0;

  private log = createDebugLogger('aztec:archiver:mock_l2_block_source');

  public createBlocks(numBlocks: number) {
    for (let i = 0; i < numBlocks; i++) {
      const blockNum = this.l2Blocks.length + 1;
      const block = L2Block.random(blockNum);
      this.l2Blocks.push(block);
    }

    this.log.verbose(`Created ${numBlocks} blocks in the mock L2 block source`);
  }

  public addBlocks(blocks: L2Block[]) {
    this.l2Blocks.push(...blocks);
    this.log.verbose(`Added ${blocks.length} blocks to the mock L2 block source`);
  }

  public removeBlocks(numBlocks: number) {
    this.l2Blocks = this.l2Blocks.slice(0, -numBlocks);
    this.log.verbose(`Removed ${numBlocks} blocks from the mock L2 block source`);
  }

  public setProvenBlockNumber(provenBlockNumber: number) {
    this.provenBlockNumber = provenBlockNumber;
  }

  public setProvenEpochNumber(provenEpochNumber: number) {
    this.provenEpochNumber = provenEpochNumber;
  }

  /**
   * Method to fetch the rollup contract address at the base-layer.
   * @returns The rollup address.
   */
  getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(EthAddress.random());
  }

  /**
   * Method to fetch the registry contract address at the base-layer.
   * @returns The registry address.
   */
  getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(EthAddress.random());
  }

  /**
   * Gets the number of the latest L2 block processed by the block source implementation.
   * @returns In this mock instance, returns the number of L2 blocks that we've mocked.
   */
  public getBlockNumber() {
    return Promise.resolve(this.l2Blocks.length);
  }

  public getProvenBlockNumber(): Promise<number> {
    return Promise.resolve(this.provenBlockNumber);
  }

  public getProvenL2EpochNumber(): Promise<number | undefined> {
    return Promise.resolve(this.provenEpochNumber);
  }

  /**
   * Gets an l2 block.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  public getBlock(number: number) {
    return Promise.resolve(this.l2Blocks[number - 1]);
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The maximum number of blocks to return.
   * @returns The requested mocked L2 blocks.
   */
  public getBlocks(from: number, limit: number, proven?: boolean) {
    return Promise.resolve(
      this.l2Blocks
        .slice(from - 1, from - 1 + limit)
        .filter(b => !proven || this.provenBlockNumber === undefined || b.number <= this.provenBlockNumber),
    );
  }

  getBlockHeader(number: number | 'latest'): Promise<BlockHeader | undefined> {
    return Promise.resolve(this.l2Blocks.at(typeof number === 'number' ? number - 1 : -1)?.header);
  }

  getBlocksForEpoch(epochNumber: bigint): Promise<L2Block[]> {
    const epochDuration = DefaultL1ContractsConfig.aztecEpochDuration;
    const [start, end] = getSlotRangeForEpoch(epochNumber, { epochDuration });
    const blocks = this.l2Blocks.filter(b => {
      const slot = b.header.globalVariables.slotNumber.toBigInt();
      return slot >= start && slot <= end;
    });
    return Promise.resolve(blocks);
  }

  /**
   * Gets a tx effect.
   * @param txHash - The hash of a transaction which resulted in the returned tx effect.
   * @returns The requested tx effect.
   */
  public getTxEffect(txHash: TxHash) {
    const match = this.l2Blocks
      .flatMap(b => b.body.txEffects.map(tx => [tx, b] as const))
      .find(([tx]) => tx.txHash.equals(txHash));
    if (!match) {
      return Promise.resolve(undefined);
    }
    const [txEffect, block] = match;
    return Promise.resolve({ data: txEffect, l2BlockNumber: block.number, l2BlockHash: block.hash().toString() });
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  public getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    for (const block of this.l2Blocks) {
      for (const txEffect of block.body.txEffects) {
        if (txEffect.txHash.equals(txHash)) {
          return Promise.resolve(
            new TxReceipt(
              txHash,
              TxStatus.SUCCESS,
              '',
              txEffect.transactionFee.toBigInt(),
              L2BlockHash.fromField(block.hash()),
              block.number,
            ),
          );
        }
      }
    }
    return Promise.resolve(undefined);
  }

  async getL2Tips(): Promise<L2Tips> {
    const [latest, proven, finalized] = [
      await this.getBlockNumber(),
      await this.getProvenBlockNumber(),
      await this.getProvenBlockNumber(),
    ] as const;

    return {
      latest: { number: latest, hash: this.l2Blocks[latest - 1]?.hash().toString() },
      proven: { number: proven, hash: this.l2Blocks[proven - 1]?.hash().toString() },
      finalized: { number: finalized, hash: this.l2Blocks[finalized - 1]?.hash().toString() },
    };
  }

  getL2EpochNumber(): Promise<bigint> {
    throw new Error('Method not implemented.');
  }

  getL2SlotNumber(): Promise<bigint> {
    throw new Error('Method not implemented.');
  }

  isEpochComplete(_epochNumber: bigint): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  /**
   * Starts the block source. In this mock implementation, this is a noop.
   * @returns A promise that signals the initialization of the l2 block source on completion.
   */
  public start(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Stops the block source. In this mock implementation, this is a noop.
   * @returns A promise that signals the l2 block source is now stopped.
   */
  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
