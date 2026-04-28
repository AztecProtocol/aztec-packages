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
  type BlockData,
  type BlockQuery,
  type BlockTag,
  type BlocksQuery,
  L2Block,
  type L2BlockSource,
  type L2Tips,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import {
  Checkpoint,
  type CheckpointData,
  L1PublishedData,
  type ProposedCheckpointData,
  PublishedCheckpoint,
} from '@aztec/stdlib/checkpoint';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import {
  EmptyL1RollupConstants,
  type L1RollupConstants,
  getEpochAtSlot,
  getSlotRangeForEpoch,
} from '@aztec/stdlib/epoch-helpers';
import { computeCheckpointOutHash } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { TxExecutionResult, TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

/**
 * A mocked implementation of L2BlockSource to be used in tests.
 */
export class MockL2BlockSource implements L2BlockSource, ContractDataSource {
  protected l2Blocks: L2Block[] = [];
  protected checkpointList: Checkpoint[] = [];

  private provenBlockNumber: number = 0;
  private finalizedBlockNumber: number = 0;
  private checkpointedBlockNumber: number = 0;
  private proposedCheckpointBlockNumber: number = 0;

  private log = createLogger('archiver:mock_l2_block_source');

  /** Creates blocks grouped into single-block checkpoints. */
  public async createBlocks(numBlocks: number) {
    await this.createCheckpoints(numBlocks, 1);
  }

  public getCheckpointNumber(): Promise<CheckpointNumber> {
    return Promise.resolve(
      this.checkpointList.length === 0 ? CheckpointNumber.ZERO : CheckpointNumber(this.checkpointList.length),
    );
  }

  /** Creates checkpoints, each containing `blocksPerCheckpoint` blocks. */
  public async createCheckpoints(numCheckpoints: number, blocksPerCheckpoint: number = 1) {
    for (let c = 0; c < numCheckpoints; c++) {
      const checkpointNum = CheckpointNumber(this.checkpointList.length + 1);
      const startBlockNum = this.l2Blocks.length + 1;
      const slotNumber = SlotNumber(Number(checkpointNum));
      const checkpoint = await Checkpoint.random(checkpointNum, {
        numBlocks: blocksPerCheckpoint,
        startBlockNumber: startBlockNum,
        slotNumber,
        checkpointNumber: checkpointNum,
      });
      this.checkpointList.push(checkpoint);
      this.l2Blocks.push(...checkpoint.blocks);
    }

    this.log.verbose(
      `Created ${numCheckpoints} checkpoints with ${blocksPerCheckpoint} blocks each in the mock L2 block source`,
    );
  }

  public addProposedBlocks(blocks: L2Block[]) {
    this.l2Blocks.push(...blocks);
    this.log.verbose(`Added ${blocks.length} proposed blocks to the mock L2 block source`);
  }

  public removeBlocks(numBlocks: number) {
    this.l2Blocks = this.l2Blocks.slice(0, -numBlocks);
    const maxBlockNum = this.l2Blocks.length;
    // Remove any checkpoint whose last block is beyond the remaining blocks.
    this.checkpointList = this.checkpointList.filter(c => {
      const lastBlockNum = c.blocks[0].number + c.blocks.length - 1;
      return lastBlockNum <= maxBlockNum;
    });
    // Keep tip numbers consistent with remaining blocks.
    this.checkpointedBlockNumber = Math.min(this.checkpointedBlockNumber, maxBlockNum);
    this.proposedCheckpointBlockNumber = Math.min(this.proposedCheckpointBlockNumber, maxBlockNum);
    this.provenBlockNumber = Math.min(this.provenBlockNumber, maxBlockNum);
    this.finalizedBlockNumber = Math.min(this.finalizedBlockNumber, maxBlockNum);
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

  public setProposedCheckpointBlockNumber(blockNumber: number) {
    this.proposedCheckpointBlockNumber = blockNumber;
  }

  public setCheckpointedBlockNumber(checkpointedBlockNumber: number) {
    const prevCheckpointed = this.checkpointedBlockNumber;
    this.checkpointedBlockNumber = checkpointedBlockNumber;
    // Proposed checkpoint is always at least as advanced as checkpointed
    if (this.proposedCheckpointBlockNumber < checkpointedBlockNumber) {
      this.proposedCheckpointBlockNumber = checkpointedBlockNumber;
    }
    // Auto-create single-block checkpoints for newly checkpointed blocks that don't have one yet.
    // This handles blocks added via addProposedBlocks that are now being marked as checkpointed.
    const newCheckpoints: Checkpoint[] = [];
    for (let blockNum = prevCheckpointed + 1; blockNum <= checkpointedBlockNumber; blockNum++) {
      const block = this.l2Blocks[blockNum - 1];
      if (!block) {
        continue;
      }
      if (this.checkpointList.some(c => c.blocks.some(b => b.number === block.number))) {
        continue;
      }
      const checkpointNum = CheckpointNumber(this.checkpointList.length + newCheckpoints.length + 1);
      const checkpoint = new Checkpoint(
        block.archive,
        CheckpointHeader.random({ slotNumber: block.header.globalVariables.slotNumber }),
        [block],
        checkpointNum,
      );
      newCheckpoints.push(checkpoint);
    }
    // Insert new checkpoints in order by number.
    if (newCheckpoints.length > 0) {
      this.checkpointList.push(...newCheckpoints);
      this.checkpointList.sort((a, b) => a.number - b.number);
    }
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
  public getBlockNumber(): Promise<BlockNumber>;
  public getBlockNumber(query: BlockQuery): Promise<BlockNumber | undefined>;
  public async getBlockNumber(query?: BlockQuery): Promise<BlockNumber | undefined> {
    if (!query) {
      return BlockNumber(this.l2Blocks.length);
    }
    if ('number' in query) {
      return query.number;
    }
    if ('tag' in query) {
      return BlockNumber(this.resolveBlockTag(query.tag));
    }
    const block = await this.getBlock(query);
    return block ? block.header.globalVariables.blockNumber : undefined;
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

  public getProposedCheckpointL2BlockNumber() {
    return Promise.resolve(BlockNumber(this.proposedCheckpointBlockNumber));
  }

  public getCheckpoints(from: CheckpointNumber, limit: number) {
    const checkpoints = this.checkpointList.slice(from - 1, from - 1 + limit);
    return Promise.resolve(
      checkpoints.map(checkpoint => new PublishedCheckpoint(checkpoint, this.mockL1DataForCheckpoint(checkpoint), [])),
    );
  }

  public getCheckpointByArchive(archive: Fr): Promise<Checkpoint | undefined> {
    const checkpoint = this.checkpointList.find(c => c.archive.root.equals(archive));
    return Promise.resolve(checkpoint);
  }

  public getCheckpointData(_n: CheckpointNumber): Promise<CheckpointData | undefined> {
    return Promise.resolve(undefined);
  }

  public getCheckpointDataRange(_from: CheckpointNumber, _limit: number): Promise<CheckpointData[]> {
    return Promise.resolve([]);
  }

  public getCheckpointNumberBySlot(_slot: SlotNumber): Promise<CheckpointNumber | undefined> {
    return Promise.resolve(undefined);
  }

  getCheckpointsForEpoch(epochNumber: EpochNumber): Promise<Checkpoint[]> {
    return Promise.resolve(this.getCheckpointsInEpoch(epochNumber));
  }

  getCheckpointsDataForEpoch(epochNumber: EpochNumber): Promise<CheckpointData[]> {
    const checkpoints = this.getCheckpointsInEpoch(epochNumber);
    return Promise.resolve(
      checkpoints.map(
        (checkpoint): CheckpointData => ({
          checkpointNumber: checkpoint.number,
          header: checkpoint.header,
          archive: checkpoint.archive,
          checkpointOutHash: computeCheckpointOutHash(
            checkpoint.blocks.map(b => b.body.txEffects.map(tx => tx.l2ToL1Msgs)),
          ),
          startBlock: checkpoint.blocks[0].number,
          blockCount: checkpoint.blocks.length,
          feeAssetPriceModifier: checkpoint.feeAssetPriceModifier,
          attestations: [],
          l1: this.mockL1DataForCheckpoint(checkpoint),
        }),
      ),
    );
  }

  getBlocksForSlot(slotNumber: SlotNumber): Promise<L2Block[]> {
    const blocks = this.l2Blocks.filter(b => b.header.globalVariables.slotNumber === slotNumber);
    return Promise.resolve(blocks);
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
      l2BlockHash: await block.hash(),
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
            await block.hash(),
            block.number,
            getEpochAtSlot(block.slot, EmptyL1RollupConstants),
          );
        }
      }
    }
    return undefined;
  }

  async getL2Tips(): Promise<L2Tips> {
    const [latest, proven, finalized, checkpointed, proposedCheckpoint] = [
      await this.getBlockNumber(),
      await this.getProvenBlockNumber(),
      this.finalizedBlockNumber,
      this.checkpointedBlockNumber,
      await this.getProposedCheckpointL2BlockNumber(),
    ] as const;

    const latestBlock = this.l2Blocks[latest - 1];
    const provenBlock = this.l2Blocks[proven - 1];
    const finalizedBlock = this.l2Blocks[finalized - 1];
    const checkpointedBlock = this.l2Blocks[checkpointed - 1];
    const proposedCheckpointBlock = this.l2Blocks[proposedCheckpoint - 1];

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
    const proposedCheckpointBlockId = {
      number: BlockNumber(proposedCheckpoint),
      hash: (await proposedCheckpointBlock?.hash())?.toString(),
    };

    const makeTipId = (blockId: typeof latestBlockId) => ({
      block: blockId,
      checkpoint: {
        number: this.findCheckpointNumberForBlock(blockId.number) ?? CheckpointNumber(0),
        hash: blockId.hash,
      },
    });

    return {
      proposed: latestBlockId,
      checkpointed: makeTipId(checkpointedBlockId),
      proven: makeTipId(provenBlockId),
      finalized: makeTipId(finalizedBlockId),
      proposedCheckpoint: makeTipId(proposedCheckpointBlockId),
    };
  }

  getSyncedL2EpochNumber(): Promise<EpochNumber> {
    throw new Error('Method not implemented.');
  }

  getSyncedL2SlotNumber(): Promise<SlotNumber> {
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

  async getBlock(query: BlockQuery): Promise<L2Block | undefined> {
    let block: L2Block | undefined;
    if ('number' in query) {
      block = this.l2Blocks[query.number - 1];
    } else if ('hash' in query) {
      for (const b of this.l2Blocks) {
        const hash = await b.hash();
        if (hash.equals(query.hash)) {
          block = b;
          break;
        }
      }
    } else if ('archive' in query) {
      block = this.l2Blocks.find(b => b.archive.root.equals(query.archive));
    } else {
      const number = this.resolveBlockTag(query.tag);
      block = number > 0 ? this.l2Blocks[number - 1] : undefined;
    }
    return block;
  }

  private resolveBlockTag(tag: BlockTag): number {
    switch (tag) {
      case 'latest':
      case 'proposed':
        return this.l2Blocks.length;
      case 'checkpointed':
        return this.checkpointedBlockNumber;
      case 'proven':
        return this.provenBlockNumber;
      case 'finalized':
        return this.finalizedBlockNumber;
    }
  }

  getBlocks(query: BlocksQuery): Promise<L2Block[]> {
    let blocks: L2Block[];
    if ('from' in query) {
      blocks = this.l2Blocks.slice(query.from - 1, query.from - 1 + query.limit);
    } else {
      const epochCheckpoints = this.getCheckpointsInEpoch(query.epoch);
      blocks = epochCheckpoints.flatMap(c => c.blocks);
    }
    if (query.onlyCheckpointed) {
      blocks = blocks.filter(b => b.header.globalVariables.blockNumber <= this.checkpointedBlockNumber);
    }
    return Promise.resolve(blocks);
  }

  async getBlockData(query: BlockQuery): Promise<BlockData | undefined> {
    const block = await this.getBlock(query);
    if (!block) {
      return undefined;
    }
    return {
      header: block.header,
      archive: block.archive,
      blockHash: await block.hash(),
      checkpointNumber: block.checkpointNumber,
      indexWithinCheckpoint: block.indexWithinCheckpoint,
    };
  }

  async getBlocksData(query: BlocksQuery): Promise<BlockData[]> {
    const blocks = await this.getBlocks(query);
    return Promise.all(
      blocks.map(async block => ({
        header: block.header,
        archive: block.archive,
        blockHash: await block.hash(),
        checkpointNumber: block.checkpointNumber,
        indexWithinCheckpoint: block.indexWithinCheckpoint,
      })),
    );
  }

  isPendingChainInvalid(): Promise<boolean> {
    return Promise.resolve(false);
  }

  getPendingChainValidationStatus(): Promise<ValidateCheckpointResult> {
    return Promise.resolve({ valid: true });
  }

  getLastCheckpoint(): Promise<ProposedCheckpointData | undefined> {
    return Promise.resolve(undefined);
  }

  getLastProposedCheckpoint(): Promise<ProposedCheckpointData | undefined> {
    return Promise.resolve(undefined);
  }

  /** Returns checkpoints whose slot falls within the given epoch. */
  private getCheckpointsInEpoch(epochNumber: EpochNumber): Checkpoint[] {
    const epochDuration = DefaultL1ContractsConfig.aztecEpochDuration;
    const [start, end] = getSlotRangeForEpoch(epochNumber, { epochDuration });
    return this.checkpointList.filter(c => c.header.slotNumber >= start && c.header.slotNumber <= end);
  }

  /** Creates a mock L1PublishedData for a checkpoint. */
  private mockL1DataForCheckpoint(checkpoint: Checkpoint): L1PublishedData {
    return new L1PublishedData(BigInt(checkpoint.number), BigInt(checkpoint.number), Buffer32.random().toString());
  }

  /** Finds the checkpoint number for a block, or undefined if the block is not in any checkpoint. */
  private findCheckpointNumberForBlock(blockNumber: BlockNumber): CheckpointNumber | undefined {
    const checkpoint = this.checkpointList.find(c => c.blocks.some(b => b.number === blockNumber));
    return checkpoint?.number;
  }
}
