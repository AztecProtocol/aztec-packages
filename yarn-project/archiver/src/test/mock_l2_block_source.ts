import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  L2Block,
  L2BlockHash,
  L2BlockNew,
  type L2BlockSource,
  type L2Tips,
  PublishedL2Block,
  type ValidateBlockResult,
} from '@aztec/stdlib/block';
import { type Checkpoint, L1PublishedData } from '@aztec/stdlib/checkpoint';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants, type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import { type BlockHeader, TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

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
      const block = await L2Block.random(BlockNumber(blockNum));
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
    return Promise.resolve(BlockNumber(this.l2Blocks.length));
  }

  public getProvenBlockNumber() {
    return Promise.resolve(BlockNumber(this.provenBlockNumber));
  }

  public getCheckpointedBlock(_number: BlockNumber) {
    // In this mock, we don't track checkpointed blocks separately
    return Promise.resolve(undefined);
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

  public async getPublishedCheckpoints(from: CheckpointNumber, limit: number) {
    // TODO: Implement this properly. This only works when we have one block per checkpoint.
    return (await this.getPublishedBlocks(from, limit)).map(block => block.toPublishedCheckpoint());
  }

  public async getCheckpointByArchive(archive: Fr): Promise<Checkpoint | undefined> {
    // TODO: Implement this properly. This only works when we have one block per checkpoint.
    return (await this.getPublishedBlockByArchive(archive))?.block.toCheckpoint();
  }

  public async getPublishedBlocks(from: number, limit: number, proven?: boolean) {
    const blocks = await this.getBlocks(from, limit, proven);
    return blocks.map(block =>
      PublishedL2Block.fromFields({
        block,
        l1: new L1PublishedData(BigInt(block.number), BigInt(block.number), Buffer32.random().toString()),
        attestations: [],
      }),
    );
  }

  async getL2BlockNew(number: BlockNumber): Promise<L2BlockNew | undefined> {
    const block = await this.getBlock(number);
    return block.toL2Block();
  }
  async getL2BlocksNew(from: BlockNumber, limit: number, proven?: boolean): Promise<L2BlockNew[]> {
    const blocks = await this.getBlocks(from, limit, proven);
    return blocks.map(x => x.toL2Block());
  }

  public async getPublishedBlockByHash(blockHash: Fr): Promise<PublishedL2Block | undefined> {
    for (const block of this.l2Blocks) {
      const hash = await block.hash();
      if (hash.equals(blockHash)) {
        return PublishedL2Block.fromFields({
          block,
          l1: new L1PublishedData(BigInt(block.number), BigInt(block.number), Buffer32.random().toString()),
          attestations: [],
        });
      }
    }
    return undefined;
  }

  public getPublishedBlockByArchive(archive: Fr): Promise<PublishedL2Block | undefined> {
    const block = this.l2Blocks.find(b => b.archive.root.equals(archive));
    if (!block) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(
      PublishedL2Block.fromFields({
        block,
        l1: new L1PublishedData(BigInt(block.number), BigInt(block.number), Buffer32.random().toString()),
        attestations: [],
      }),
    );
  }

  public async getBlockHeaderByHash(blockHash: Fr): Promise<BlockHeader | undefined> {
    for (const block of this.l2Blocks) {
      const hash = await block.hash();
      if (hash.equals(blockHash)) {
        return block.getBlockHeader();
      }
    }
    return undefined;
  }

  public getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    const block = this.l2Blocks.find(b => b.archive.root.equals(archive));
    return Promise.resolve(block?.getBlockHeader());
  }

  getBlockHeader(number: number | 'latest'): Promise<BlockHeader | undefined> {
    return Promise.resolve(this.l2Blocks.at(typeof number === 'number' ? number - 1 : -1)?.getBlockHeader());
  }

  getCheckpointsForEpoch(epochNumber: EpochNumber): Promise<Checkpoint[]> {
    // TODO: Implement this properly. This only works when we have one block per checkpoint.
    return this.getBlocksForEpoch(epochNumber).then(blocks => blocks.map(b => b.toCheckpoint()));
  }

  getBlocksForEpoch(epochNumber: EpochNumber): Promise<L2Block[]> {
    const epochDuration = DefaultL1ContractsConfig.aztecEpochDuration;
    const [start, end] = getSlotRangeForEpoch(epochNumber, { epochDuration });
    const blocks = this.l2Blocks.filter(b => {
      const slot = b.header.globalVariables.slotNumber;
      return slot >= start && slot <= end;
    });
    return Promise.resolve(blocks);
  }

  async getBlockHeadersForEpoch(epochNumber: EpochNumber): Promise<BlockHeader[]> {
    const blocks = await this.getBlocksForEpoch(epochNumber);
    return blocks.map(b => b.getBlockHeader());
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
      l2BlockHash: L2BlockHash.fromField(await block.hash()),
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
      blocks: {
        latest: {
          number: BlockNumber(latest),
          hash: (await latestBlock?.hash())?.toString(),
        },
        proven: {
          number: BlockNumber(proven),
          hash: (await provenBlock?.hash())?.toString(),
        },
        finalized: {
          number: BlockNumber(finalized),
          hash: (await finalizedBlock?.hash())?.toString(),
        },
      },
    };
  }

  getL2EpochNumber(): Promise<EpochNumber> {
    throw new Error('Method not implemented.');
  }

  getL2SlotNumber(): Promise<SlotNumber> {
    throw new Error('Method not implemented.');
  }

  isEpochComplete(_epochNumber: EpochNumber): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  getL1Constants(): Promise<L1RollupConstants> {
    return Promise.resolve(EmptyL1RollupConstants);
  }

  getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT) });
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

  getContract(_address: AztecAddress, _timestamp?: UInt64): Promise<ContractInstanceWithAddress | undefined> {
    return Promise.resolve(undefined);
  }

  getContractClassIds(): Promise<Fr[]> {
    return Promise.resolve([]);
  }

  getDebugFunctionName(_address: AztecAddress, _selector: FunctionSelector): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  registerContractFunctionSignatures(_signatures: string[]): Promise<void> {
    return Promise.resolve();
  }

  syncImmediate(): Promise<void> {
    return Promise.resolve();
  }

  isPendingChainInvalid(): Promise<boolean> {
    return Promise.resolve(false);
  }

  getPendingChainValidationStatus(): Promise<ValidateBlockResult> {
    return Promise.resolve({ valid: true });
  }
}
