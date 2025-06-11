import { DefaultL1ContractsConfig } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2Block, L2BlockHash, type L2BlockSource, type L2Tips } from '@aztec/stdlib/block';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import { type BlockHeader, TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';

/**
 * A mocked implementation of L2BlockSource to be used in tests.
 */
export class MockL2BlockSource implements L2BlockSource, ContractDataSource {
  protected l2Blocks: L2Block[] = [];

  private provenBlockNumber: number = 0;
  private finalizedBlockNumber: number = 0;

  private log = createLogger('archiver:mock_l2_block_source');

  public async createBlocks(numBlocks: number) {
    for (let i = 0; i < numBlocks; i++) {
      const blockNum = this.l2Blocks.length + 1;
      const block = await L2Block.random(blockNum);
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

  public setFinalizedBlockNumber(finalizedBlockNumber: number) {
    if (finalizedBlockNumber > this.provenBlockNumber) {
      this.provenBlockNumber = finalizedBlockNumber;
    }
    this.finalizedBlockNumber = finalizedBlockNumber;
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

  public async getPublishedBlocks(from: number, limit: number, proven?: boolean) {
    const blocks = await this.getBlocks(from, limit, proven);
    return blocks.map(block => ({
      block,
      l1: {
        blockNumber: BigInt(block.number),
        blockHash: Buffer32.random().toString(),
        timestamp: BigInt(block.number),
      },
      attestations: [],
    }));
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

  getBlockHeadersForEpoch(epochNumber: bigint): Promise<BlockHeader[]> {
    return this.getBlocksForEpoch(epochNumber).then(blocks => blocks.map(b => b.header));
  }

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   */
  public async getTxEffect(txHash: TxHash) {
    const match = this.l2Blocks
      .flatMap(b => b.body.txEffects.map(tx => [tx, b] as const))
      .find(([tx]) => tx.txHash.equals(txHash));
    if (!match) {
      return Promise.resolve(undefined);
    }
    const [txEffect, block] = match;
    return {
      data: txEffect,
      l2BlockNumber: block.number,
      l2BlockHash: (await block.hash()).toString(),
      txIndexInBlock: block.body.txEffects.indexOf(txEffect),
    };
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  public async getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    for (const block of this.l2Blocks) {
      for (const txEffect of block.body.txEffects) {
        if (txEffect.txHash.equals(txHash)) {
          return new TxReceipt(
            txHash,
            TxStatus.SUCCESS,
            '',
            txEffect.transactionFee.toBigInt(),
            L2BlockHash.fromField(await block.hash()),
            block.number,
          );
        }
      }
    }
    return undefined;
  }

  async getL2Tips(): Promise<L2Tips> {
    const [latest, proven, finalized] = [
      await this.getBlockNumber(),
      await this.getProvenBlockNumber(),
      this.finalizedBlockNumber,
    ] as const;

    const latestBlock = this.l2Blocks[latest - 1];
    const provenBlock = this.l2Blocks[proven - 1];
    const finalizedBlock = this.l2Blocks[finalized - 1];

    return {
      latest: {
        number: latest,
        hash: (await latestBlock?.hash())?.toString(),
      },
      proven: {
        number: proven,
        hash: (await provenBlock?.hash())?.toString(),
      },
      finalized: {
        number: finalized,
        hash: (await finalizedBlock?.hash())?.toString(),
      },
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

  getL1Constants(): Promise<L1RollupConstants> {
    throw new Error('Method not implemented.');
  }

  getL1Timestamp(): Promise<bigint> {
    throw new Error('Method not implemented.');
  }

  /**
   * Starts the block source. In this mock implementation, this is a noop.
   * @returns A promise that signals the initialization of the l2 block source on completion.
   */
  public start(): Promise<void> {
    this.log.verbose('Starting mock L2 block source');
    return Promise.resolve();
  }

  /**
   * Stops the block source. In this mock implementation, this is a noop.
   * @returns A promise that signals the l2 block source is now stopped.
   */
  public stop(): Promise<void> {
    this.log.verbose('Stopping mock L2 block source');
    return Promise.resolve();
  }

  getContractClass(_id: Fr): Promise<ContractClassPublic | undefined> {
    return Promise.resolve(undefined);
  }

  getBytecodeCommitment(_id: Fr): Promise<Fr | undefined> {
    return Promise.resolve(undefined);
  }

  getContract(_address: AztecAddress, _blockNumber?: number): Promise<ContractInstanceWithAddress | undefined> {
    return Promise.resolve(undefined);
  }

  getContractClassIds(): Promise<Fr[]> {
    return Promise.resolve([]);
  }

  getDebugFunctionName(_address: AztecAddress, _selector: FunctionSelector): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  registerContractFunctionSignatures(_address: AztecAddress, _signatures: string[]): Promise<void> {
    return Promise.resolve();
  }

  syncImmediate(): Promise<void> {
    return Promise.resolve();
  }
}
