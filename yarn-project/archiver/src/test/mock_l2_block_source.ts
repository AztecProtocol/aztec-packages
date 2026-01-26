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
  CheckpointedL2Block,
  L2Block,
  L2BlockHash,
  type L2BlockSource,
  type L2Tips,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants, type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import { type BlockHeader, TxExecutionResult, TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

/**
 * A mocked implementation of L2BlockSource to be used in tests.
 */
export class MockL2BlockSource implements L2BlockSource, ContractDataSource {
  protected l2Blocks: L2Block[] = [];

  private provenBlockNumber: number = 0;
  private finalizedBlockNumber: number = 0;
  private checkpointedBlockNumber: number = 0;

  private log = createLogger('archiver:mock_l2_block_source');

  public async createBlocks(numBlocks: number) {
    for (let i = 0; i < numBlocks; i++) {
      const blockNum = this.l2Blocks.length + 1;
      const block = await L2Block.random(BlockNumber(blockNum), { slotNumber: SlotNumber(blockNum) });
      this.l2Blocks.push(block);
    }

    this.log.verbose(`Created ${numBlocks} blocks in the mock L2 block source`);
  }

  public addProposedBlocks(blocks: L2Block[]) {
    this.l2Blocks.push(...blocks);
    this.log.verbose(`Added ${blocks.length} proposed blocks to the mock L2 block source`);
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

  public setCheckpointedBlockNumber(checkpointedBlockNumber: number) {
    this.checkpointedBlockNumber = checkpointedBlockNumber;
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

  public getCheckpointedL2BlockNumber() {
    return Promise.resolve(BlockNumber(this.checkpointedBlockNumber));
  }

  public getFinalizedL2BlockNumber() {
    return Promise.resolve(BlockNumber(this.finalizedBlockNumber));
  }

  public getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    if (number > this.checkpointedBlockNumber) {
      return Promise.resolve(undefined);
    }
    const block = this.l2Blocks[number - 1];
    if (!block) {
      return Promise.resolve(undefined);
    }
    const checkpointedBlock = new CheckpointedL2Block(
      CheckpointNumber.fromBlockNumber(number),
      block,
      new L1PublishedData(BigInt(number), BigInt(number), `0x${number.toString(16).padStart(64, '0')}`),
      [],
    );
    return Promise.resolve(checkpointedBlock);
  }

  public async getCheckpointedBlocks(from: BlockNumber, limit: number): Promise<CheckpointedL2Block[]> {
    const result: CheckpointedL2Block[] = [];
    for (let i = 0; i < limit; i++) {
      const blockNum = from + i;
      if (blockNum > this.checkpointedBlockNumber) {
        break;
      }
      const block = await this.getCheckpointedBlock(BlockNumber(blockNum));
      if (block) {
        result.push(block);
      }
    }
    return result;
  }

  /**
   * Gets an l2 block.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  public getBlock(number: number): Promise<L2Block | undefined> {
    const block = this.l2Blocks[number - 1];
    return Promise.resolve(block);
  }

  /**
   * Gets an L2 block (new format).
   * @param number - The block number to return.
   * @returns The requested L2 block.
   */
  public getL2Block(number: BlockNumber): Promise<L2Block | undefined> {
    const block = this.l2Blocks[number - 1];
    return Promise.resolve(block);
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The maximum number of blocks to return.
   * @returns The requested mocked L2 blocks.
   */
  public getBlocks(from: number, limit: number): Promise<L2Block[]> {
    return Promise.resolve(this.l2Blocks.slice(from - 1, from - 1 + limit));
  }

  public getCheckpoints(from: CheckpointNumber, limit: number) {
    // TODO(mbps): Implement this properly. This only works when we have one block per checkpoint.
    const blocks = this.l2Blocks.slice(from - 1, from - 1 + limit);
    return Promise.all(
      blocks.map(async block => {
        // Create a checkpoint from the block - manually construct since L2Block doesn't have toCheckpoint()
        const checkpoint = await Checkpoint.random(block.checkpointNumber, { numBlocks: 1 });
        checkpoint.blocks = [block];
        return new PublishedCheckpoint(
          checkpoint,
          new L1PublishedData(BigInt(block.number), BigInt(block.number), Buffer32.random().toString()),
          [],
        );
      }),
    );
  }

  public async getCheckpointByArchive(archive: Fr): Promise<Checkpoint | undefined> {
    // TODO(mbps): Implement this properly. This only works when we have one block per checkpoint.
    const block = this.l2Blocks.find(b => b.archive.root.equals(archive));
    if (!block) {
      return undefined;
    }
    // Create a checkpoint from the block - manually construct since L2Block doesn't have toCheckpoint()
    const checkpoint = await Checkpoint.random(block.checkpointNumber, { numBlocks: 1 });
    checkpoint.blocks = [block];
    return checkpoint;
  }

  public async getCheckpointedBlockByHash(blockHash: Fr): Promise<CheckpointedL2Block | undefined> {
    for (const block of this.l2Blocks) {
      const hash = await block.hash();
      if (hash.equals(blockHash)) {
        return CheckpointedL2Block.fromFields({
          checkpointNumber: CheckpointNumber.fromBlockNumber(block.number),
          block,
          l1: new L1PublishedData(BigInt(block.number), BigInt(block.number), Buffer32.random().toString()),
          attestations: [],
        });
      }
    }
    return undefined;
  }

  public getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined> {
    const block = this.l2Blocks.find(b => b.archive.root.equals(archive));
    if (!block) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(
      CheckpointedL2Block.fromFields({
        checkpointNumber: CheckpointNumber.fromBlockNumber(block.number),
        block,
        l1: new L1PublishedData(BigInt(block.number), BigInt(block.number), Buffer32.random().toString()),
        attestations: [],
      }),
    );
  }

  public async getL2BlockByHash(blockHash: Fr): Promise<L2Block | undefined> {
    for (const block of this.l2Blocks) {
      const hash = await block.hash();
      if (hash.equals(blockHash)) {
        return block;
      }
    }
    return undefined;
  }

  public getL2BlockByArchive(archive: Fr): Promise<L2Block | undefined> {
    const block = this.l2Blocks.find(b => b.archive.root.equals(archive));
    return Promise.resolve(block);
  }

  public async getBlockHeaderByHash(blockHash: Fr): Promise<BlockHeader | undefined> {
    for (const block of this.l2Blocks) {
      const hash = await block.hash();
      if (hash.equals(blockHash)) {
        return block.header;
      }
    }
    return undefined;
  }

  public getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    const block = this.l2Blocks.find(b => b.archive.root.equals(archive));
    return Promise.resolve(block?.header);
  }

  getBlockHeader(number: number | 'latest'): Promise<BlockHeader | undefined> {
    return Promise.resolve(this.l2Blocks.at(typeof number === 'number' ? number - 1 : -1)?.header);
  }

  getCheckpointsForEpoch(epochNumber: EpochNumber): Promise<Checkpoint[]> {
    // TODO(mbps): Implement this properly. This only works when we have one block per checkpoint.
    const epochDuration = DefaultL1ContractsConfig.aztecEpochDuration;
    const [start, end] = getSlotRangeForEpoch(epochNumber, { epochDuration });
    const blocks = this.l2Blocks.filter(b => {
      const slot = b.header.globalVariables.slotNumber;
      return slot >= start && slot <= end;
    });
    // Create checkpoints from blocks - manually construct since L2Block doesn't have toCheckpoint()
    return Promise.all(
      blocks.map(async block => {
        const checkpoint = await Checkpoint.random(block.checkpointNumber, { numBlocks: 1 });
        checkpoint.blocks = [block];
        return checkpoint;
      }),
    );
  }

  getCheckpointedBlocksForEpoch(epochNumber: EpochNumber): Promise<CheckpointedL2Block[]> {
    const epochDuration = DefaultL1ContractsConfig.aztecEpochDuration;
    const [start, end] = getSlotRangeForEpoch(epochNumber, { epochDuration });
    const blocks = this.l2Blocks.filter(b => {
      const slot = b.header.globalVariables.slotNumber;
      return slot >= start && slot <= end;
    });
    return Promise.resolve(
      blocks.map(block =>
        CheckpointedL2Block.fromFields({
          checkpointNumber: CheckpointNumber.fromBlockNumber(block.number),
          block,
          l1: new L1PublishedData(BigInt(block.number), BigInt(block.number), Buffer32.random().toString()),
          attestations: [],
        }),
      ),
    );
  }

  getBlocksForSlot(slotNumber: SlotNumber): Promise<L2Block[]> {
    const blocks = this.l2Blocks.filter(b => b.header.globalVariables.slotNumber === slotNumber);
    return Promise.resolve(blocks);
  }

  async getCheckpointedBlockHeadersForEpoch(epochNumber: EpochNumber): Promise<BlockHeader[]> {
    const checkpointedBlocks = await this.getCheckpointedBlocksForEpoch(epochNumber);
    return checkpointedBlocks.map(b => b.block.header);
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
          // In mock, assume all txs are checkpointed with successful execution
          return new TxReceipt(
            txHash,
            TxStatus.CHECKPOINTED,
            TxExecutionResult.SUCCESS,
            undefined,
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
    const [latest, proven, finalized, checkpointed] = [
      await this.getBlockNumber(),
      await this.getProvenBlockNumber(),
      this.finalizedBlockNumber,
      this.checkpointedBlockNumber,
    ] as const;

    const latestBlock = this.l2Blocks[latest - 1];
    const provenBlock = this.l2Blocks[proven - 1];
    const finalizedBlock = this.l2Blocks[finalized - 1];
    const checkpointedBlock = this.l2Blocks[checkpointed - 1];

    const latestBlockId = {
      number: BlockNumber(latest),
      hash: (await latestBlock?.hash())?.toString(),
    };
    const provenBlockId = {
      number: BlockNumber(proven),
      hash: (await provenBlock?.hash())?.toString(),
    };
    const finalizedBlockId = {
      number: BlockNumber(finalized),
      hash: (await finalizedBlock?.hash())?.toString(),
    };
    const checkpointedBlockId = {
      number: BlockNumber(checkpointed),
      hash: (await checkpointedBlock?.hash())?.toString(),
    };

    const makeTipId = (blockId: typeof latestBlockId) => ({
      block: blockId,
      checkpoint: { number: CheckpointNumber.fromBlockNumber(blockId.number), hash: blockId.hash },
    });

    return {
      proposed: latestBlockId,
      checkpointed: makeTipId(checkpointedBlockId),
      proven: makeTipId(provenBlockId),
      finalized: makeTipId(finalizedBlockId),
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

  getPendingChainValidationStatus(): Promise<ValidateCheckpointResult> {
    return Promise.resolve({ valid: true });
  }
}
