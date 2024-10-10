import {
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
  type L2BlockTag,
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  WorldStateRunningState,
  type WorldStateSynchronizer,
  type WorldStateSynchronizerStatus,
} from '@aztec/circuit-types';
import { type L2BlockHandledStats } from '@aztec/circuit-types/stats';
import { MerkleTreeCalculator } from '@aztec/circuits.js';
import { L1_TO_L2_MSG_SUBTREE_HEIGHT } from '@aztec/circuits.js/constants';
import { type Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import { SHA256Trunc } from '@aztec/merkle-tree';

import { type WorldStateStatus } from '../native/message.js';
import { type MerkleTreeAdminDatabase } from '../world-state-db/merkle_tree_db.js';
import { type WorldStateConfig } from './config.js';

/**
 * Synchronizes the world state with the L2 blocks from a L2BlockSource via a block stream.
 * The synchronizer will download the L2 blocks from the L2BlockSource and update the merkle trees.
 * Handles chain reorgs via the L2BlockStream.
 */
export class ServerWorldStateSynchronizer
  implements WorldStateSynchronizer, L2BlockStreamLocalDataProvider, L2BlockStreamEventHandler
{
  private readonly merkleTreeCommitted: MerkleTreeReadOperations;

  private syncPromise: Promise<void> | undefined;

  private currentState: WorldStateRunningState = WorldStateRunningState.IDLE;

  protected blockStream: L2BlockStream | undefined;

  constructor(
    private readonly merkleTreeDb: MerkleTreeAdminDatabase,
    private readonly l2BlockSource: L2BlockSource & L1ToL2MessageSource,
    private readonly config: WorldStateConfig,
    private readonly log = createDebugLogger('aztec:world_state'),
  ) {
    this.merkleTreeCommitted = this.merkleTreeDb.getCommitted();
  }

  public getCommitted(): MerkleTreeReadOperations {
    return this.merkleTreeDb.getCommitted();
  }

  public getSnapshot(blockNumber: number): MerkleTreeReadOperations {
    return this.merkleTreeDb.getSnapshot(blockNumber);
  }

  public fork(blockNumber?: number): Promise<MerkleTreeWriteOperations> {
    return this.merkleTreeDb.fork(blockNumber);
  }

  public async start() {
    if (this.currentState === WorldStateRunningState.STOPPED) {
      throw new Error('Synchronizer already stopped');
    }
    if (this.currentState !== WorldStateRunningState.IDLE) {
      return this.syncPromise;
    }

    this.blockStream = this.createBlockStream();
    const { isSynced, localLatestBlockNumber } = await this.blockStream.isSynced();

    if (!isSynced) {
      this.setCurrentState(WorldStateRunningState.SYNCHING);
      this.log.verbose(`Starting sync from ${localLatestBlockNumber}`);
      this.syncPromise = this.blockStream.sync();
    } else {
      this.setCurrentState(WorldStateRunningState.RUNNING);
      this.log.debug(`Already synced to latest block ${localLatestBlockNumber}`);
      this.syncPromise = Promise.resolve();
    }

    this.syncPromise = this.syncPromise
      .then(() => this.blockStream!.start())
      .then(() => this.log.info(`Started world state synchronizer`));

    return this.syncPromise;
  }

  protected createBlockStream() {
    return new L2BlockStream(this.l2BlockSource, this, this, {
      proven: this.config.worldStateProvenBlocksOnly,
      pollIntervalMS: this.config.worldStateBlockCheckIntervalMS,
      batchSize: this.config.worldStateBlockRequestBatchSize,
    });
  }

  public async stop() {
    this.log.debug('Stopping block stream...');
    await this.blockStream?.stop();
    this.log.debug('Stopping merkle trees...');
    await this.merkleTreeDb.close();
    this.setCurrentState(WorldStateRunningState.STOPPED);
    this.log.info(`Stopped world state synchronizer`);
  }

  public async status(): Promise<WorldStateSynchronizerStatus> {
    return {
      syncedToL2Block: (await this.getL2Tips()).latest,
      state: this.currentState,
    };
  }

  public async getLatestBlockNumber() {
    return (await this.getL2Tips()).latest;
  }

  /**
   * Forces an immediate sync.
   * @param targetBlockNumber - The target block number that we must sync to. Will download unproven blocks if needed to reach it. Throws if cannot be reached.
   * @returns A promise that resolves with the block number the world state was synced to
   */
  public async syncImmediate(targetBlockNumber?: number): Promise<number> {
    if (this.currentState !== WorldStateRunningState.RUNNING || this.blockStream === undefined) {
      throw new Error(`World State is not running. Unable to perform sync.`);
    }

    // If we have been given a block number to sync to and we have reached that number then return
    const currentBlockNumber = await this.getLatestBlockNumber();
    if (targetBlockNumber !== undefined && targetBlockNumber <= currentBlockNumber) {
      return currentBlockNumber;
    }
    this.log.debug(`World State at ${currentBlockNumber} told to sync to ${targetBlockNumber ?? 'latest'}`);

    // Force the block stream to sync against the archiver now
    await this.blockStream.sync();

    // If we have been given a block number to sync to and we have not reached that number then fail
    const updatedBlockNumber = await this.getLatestBlockNumber();
    if (targetBlockNumber !== undefined && targetBlockNumber > updatedBlockNumber) {
      throw new Error(`Unable to sync to block number ${targetBlockNumber} (last synced is ${updatedBlockNumber})`);
    }

    return updatedBlockNumber;
  }

  /** Returns the L2 block hash for a given number. Used by the L2BlockStream for detecting reorgs. */
  public getL2BlockHash(number: number): Promise<string | undefined> {
    return number === 0
      ? Promise.resolve(this.merkleTreeCommitted.getInitialHeader().hash().toString())
      : this.merkleTreeCommitted.getLeafValue(MerkleTreeId.ARCHIVE, BigInt(number)).then(leaf => leaf?.toString());
  }

  /** Returns the latest L2 block number for each tip of the chain (latest, proven, finalized). */
  public async getL2Tips(): Promise<{ latest: number } & Partial<Record<L2BlockTag, number>>> {
    const status = await this.merkleTreeDb.getStatus();
    return {
      latest: Number(status.unfinalisedBlockNumber),
      finalized: Number(status.finalisedBlockNumber),
      proven: Number(status.finalisedBlockNumber), // TODO(palla/reorg): Using finalised as proven for now
    };
  }

  /** Handles an event emitted by the block stream. */
  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'blocks-added':
          await this.handleL2Blocks(event.blocks);
          break;
        case 'chain-pruned':
          await this.handleChainPruned(event.blockNumber);
          break;
        case 'chain-proven':
          await this.handleChainProven(event.blockNumber);
          break;
        case 'chain-finalized':
          await this.handleChainFinalized(event.blockNumber);
          break;
      }
    } catch (err) {
      this.log.error('Error processing block stream', err);
    }
  }

  /**
   * Handles a list of L2 blocks (i.e. Inserts the new note hashes into the merkle tree).
   * @param l2Blocks - The L2 blocks to handle.
   * @returns Whether the block handled was produced by this same node.
   */
  private async handleL2Blocks(l2Blocks: L2Block[]) {
    this.log.verbose(`Handling new L2 blocks from ${l2Blocks[0].number} to ${l2Blocks[l2Blocks.length - 1].number}`);
    const messagePromises = l2Blocks.map(block => this.l2BlockSource.getL1ToL2Messages(BigInt(block.number)));
    const l1ToL2Messages: Fr[][] = await Promise.all(messagePromises);

    for (let i = 0; i < l2Blocks.length; i++) {
      const [duration, result] = await elapsed(() => this.handleL2Block(l2Blocks[i], l1ToL2Messages[i]));
      this.log.verbose(`Handled new L2 block`, {
        eventName: 'l2-block-handled',
        duration,
        unfinalisedBlockNumber: result.unfinalisedBlockNumber,
        finalisedBlockNumber: result.finalisedBlockNumber,
        oldestHistoricBlock: result.oldestHistoricalBlock,
        ...l2Blocks[i].getStats(),
      } satisfies L2BlockHandledStats);
    }
  }

  /**
   * Handles a single L2 block (i.e. Inserts the new note hashes into the merkle tree).
   * @param l2Block - The L2 block to handle.
   * @param l1ToL2Messages - The L1 to L2 messages for the block.
   * @returns Whether the block handled was produced by this same node.
   */
  private async handleL2Block(l2Block: L2Block, l1ToL2Messages: Fr[]): Promise<WorldStateStatus> {
    // First we check that the L1 to L2 messages hash to the block inHash.
    // Note that we cannot optimize this check by checking the root of the subtree after inserting the messages
    // to the real L1_TO_L2_MESSAGE_TREE (like we do in merkleTreeDb.handleL2BlockAndMessages(...)) because that
    // tree uses pedersen and we don't have access to the converted root.
    this.verifyMessagesHashToInHash(l1ToL2Messages, l2Block.header.contentCommitment.inHash);

    // If the above check succeeds, we can proceed to handle the block.
    return await this.merkleTreeDb.handleL2BlockAndMessages(l2Block, l1ToL2Messages);
  }

  private async handleChainFinalized(blockNumber: number) {
    this.log.verbose(`Chain finalized at block ${blockNumber}`);
    await this.merkleTreeDb.setFinalised(BigInt(blockNumber));
  }

  private handleChainProven(blockNumber: number) {
    this.log.verbose(`Chain proven at block ${blockNumber}`);
    return Promise.resolve();
  }

  private async handleChainPruned(blockNumber: number) {
    this.log.info(`Chain pruned to block ${blockNumber}`);
    await this.merkleTreeDb.unwindBlocks(BigInt(blockNumber));
  }

  /**
   * Method to set the value of the current state.
   * @param newState - New state value.
   */
  private setCurrentState(newState: WorldStateRunningState) {
    this.currentState = newState;
    this.log.debug(`Moved to state ${WorldStateRunningState[this.currentState]}`);
  }

  /**
   * Verifies that the L1 to L2 messages hash to the block inHash.
   * @param l1ToL2Messages - The L1 to L2 messages for the block.
   * @param inHash - The inHash of the block.
   * @throws If the L1 to L2 messages do not hash to the block inHash.
   */
  protected verifyMessagesHashToInHash(l1ToL2Messages: Fr[], inHash: Buffer) {
    const treeCalculator = new MerkleTreeCalculator(
      L1_TO_L2_MSG_SUBTREE_HEIGHT,
      Buffer.alloc(32),
      new SHA256Trunc().hash,
    );

    const root = treeCalculator.computeTreeRoot(l1ToL2Messages.map(msg => msg.toBuffer()));

    if (!root.equals(inHash)) {
      throw new Error('Obtained L1 to L2 messages failed to be hashed to the block inHash');
    }
  }
}
