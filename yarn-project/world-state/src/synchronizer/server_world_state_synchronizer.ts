import { L1_TO_L2_MSG_SUBTREE_HEIGHT } from '@aztec/constants';
import { SHA256Trunc } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { elapsed } from '@aztec/foundation/timer';
import { MerkleTreeCalculator } from '@aztec/foundation/trees';
import type {
  L2Block,
  L2BlockId,
  L2BlockSource,
  L2BlockStream,
  L2BlockStreamEvent,
  L2BlockStreamEventHandler,
  L2BlockStreamLocalDataProvider,
  L2Tips,
} from '@aztec/stdlib/block';
import {
  WorldStateRunningState,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  type WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { SnapshotDataKeys } from '@aztec/stdlib/snapshots';
import type { L2BlockHandledStats } from '@aztec/stdlib/stats';
import { MerkleTreeId, type MerkleTreeReadOperations, type MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import { TraceableL2BlockStream, getTelemetryClient } from '@aztec/telemetry-client';

import { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import type { WorldStateStatusFull } from '../native/message.js';
import type { MerkleTreeAdminDatabase } from '../world-state-db/merkle_tree_db.js';
import type { WorldStateConfig } from './config.js';
import { WorldStateSynchronizerError } from './errors.js';

export type { SnapshotDataKeys };

/**
 * Synchronizes the world state with the L2 blocks from a L2BlockSource via a block stream.
 * The synchronizer will download the L2 blocks from the L2BlockSource and update the merkle trees.
 * Handles chain reorgs via the L2BlockStream.
 */
export class ServerWorldStateSynchronizer
  implements WorldStateSynchronizer, L2BlockStreamLocalDataProvider, L2BlockStreamEventHandler
{
  private readonly merkleTreeCommitted: MerkleTreeReadOperations;

  private latestBlockNumberAtStart = 0;
  private historyToKeep: number | undefined;
  private currentState: WorldStateRunningState = WorldStateRunningState.IDLE;
  private latestBlockHashQuery: { blockNumber: number; hash: string | undefined } | undefined = undefined;

  private syncPromise = promiseWithResolvers<void>();
  protected blockStream: L2BlockStream | undefined;

  // WorldState doesn't track the proven block number, it only tracks the latest tips of the pending chain and the finalised chain
  // store the proven block number here, in the synchronizer, so that we don't end up spamming the logs with 'chain-proved' events
  private provenBlockNumber: bigint | undefined;

  constructor(
    private readonly merkleTreeDb: MerkleTreeAdminDatabase,
    private readonly l2BlockSource: L2BlockSource & L1ToL2MessageSource,
    private readonly config: WorldStateConfig,
    private instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    private readonly log: Logger = createLogger('world_state'),
  ) {
    this.merkleTreeCommitted = this.merkleTreeDb.getCommitted();
    this.historyToKeep = config.worldStateBlockHistory < 1 ? undefined : config.worldStateBlockHistory;
    this.log.info(
      `Created world state synchroniser with block history of ${
        this.historyToKeep === undefined ? 'infinity' : this.historyToKeep
      }`,
    );
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

  public backupTo(dstPath: string, compact?: boolean): Promise<Record<Exclude<SnapshotDataKeys, 'archiver'>, string>> {
    return this.merkleTreeDb.backupTo(dstPath, compact);
  }

  public clear(): Promise<void> {
    return this.merkleTreeDb.clear();
  }

  public async start() {
    if (this.currentState === WorldStateRunningState.STOPPED) {
      throw new Error('Synchronizer already stopped');
    }
    if (this.currentState !== WorldStateRunningState.IDLE) {
      return this.syncPromise;
    }

    // Get the current latest block number
    this.latestBlockNumberAtStart = await (this.config.worldStateProvenBlocksOnly
      ? this.l2BlockSource.getProvenBlockNumber()
      : this.l2BlockSource.getBlockNumber());

    const blockToDownloadFrom = (await this.getLatestBlockNumber()) + 1;

    if (blockToDownloadFrom <= this.latestBlockNumberAtStart) {
      // If there are blocks to be retrieved, go to a synching state
      this.setCurrentState(WorldStateRunningState.SYNCHING);
      this.log.verbose(`Starting sync from ${blockToDownloadFrom} to latest block ${this.latestBlockNumberAtStart}`);
    } else {
      // If no blocks to be retrieved, go straight to running
      this.setCurrentState(WorldStateRunningState.RUNNING);
      this.syncPromise.resolve();
      this.log.debug(`Next block ${blockToDownloadFrom} already beyond latest block ${this.latestBlockNumberAtStart}`);
    }

    this.blockStream = this.createBlockStream();
    this.blockStream.start();
    this.log.info(`Started world state synchronizer from block ${blockToDownloadFrom}`);
    return this.syncPromise.promise;
  }

  protected createBlockStream(): L2BlockStream {
    const tracer = this.instrumentation.telemetry.getTracer('WorldStateL2BlockStream');
    const logger = createLogger('world-state:block_stream');
    return new TraceableL2BlockStream(this.l2BlockSource, this, this, tracer, 'WorldStateL2BlockStream', logger, {
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
    const summary = await this.merkleTreeDb.getStatusSummary();
    const status: WorldStateSyncStatus = {
      latestBlockNumber: Number(summary.unfinalisedBlockNumber),
      latestBlockHash: (await this.getL2BlockHash(Number(summary.unfinalisedBlockNumber))) ?? '',
      finalisedBlockNumber: Number(summary.finalisedBlockNumber),
      oldestHistoricBlockNumber: Number(summary.oldestHistoricalBlock),
      treesAreSynched: summary.treesAreSynched,
    };
    return {
      syncSummary: status,
      state: this.currentState,
    };
  }

  public async getLatestBlockNumber() {
    return (await this.getL2Tips()).latest.number;
  }

  public async stopSync() {
    this.log.debug('Stopping sync...');
    await this.blockStream?.stop();
    this.log.info('Stopped sync');
  }

  public resumeSync() {
    if (!this.blockStream) {
      throw new Error('Cannot resume sync as block stream is not initialized');
    }
    this.log.debug('Resuming sync...');
    this.blockStream.start();
    this.log.info('Resumed sync');
  }

  /**
   * Forces an immediate sync.
   * @param targetBlockNumber - The target block number that we must sync to. Will download unproven blocks if needed to reach it.
   * @param skipThrowIfTargetNotReached - Whether to skip throwing if the target block number is not reached.
   * @returns A promise that resolves with the block number the world state was synced to
   */
  public async syncImmediate(targetBlockNumber?: number, skipThrowIfTargetNotReached?: boolean): Promise<number> {
    if (this.currentState !== WorldStateRunningState.RUNNING) {
      throw new Error(`World State is not running. Unable to perform sync.`);
    }

    if (this.blockStream === undefined) {
      throw new Error('Block stream is not initialized. Unable to perform sync.');
    }

    // If we have been given a block number to sync to and we have reached that number then return
    const currentBlockNumber = await this.getLatestBlockNumber();
    if (targetBlockNumber !== undefined && targetBlockNumber <= currentBlockNumber) {
      return currentBlockNumber;
    }
    this.log.debug(`World State at ${currentBlockNumber} told to sync to ${targetBlockNumber ?? 'latest'}`);

    // If the archiver is behind the target block, force an archiver sync
    if (targetBlockNumber) {
      const archiverLatestBlock = await this.l2BlockSource.getBlockNumber();
      if (archiverLatestBlock < targetBlockNumber) {
        this.log.debug(`Archiver is at ${archiverLatestBlock} behind target block ${targetBlockNumber}.`);
        await this.l2BlockSource.syncImmediate();
      }
    }

    // Force the block stream to sync against the archiver now
    await this.blockStream.sync();

    // If we have been given a block number to sync to and we have not reached that number then fail
    const updatedBlockNumber = await this.getLatestBlockNumber();
    if (!skipThrowIfTargetNotReached && targetBlockNumber !== undefined && targetBlockNumber > updatedBlockNumber) {
      throw new WorldStateSynchronizerError(
        `Unable to sync to block number ${targetBlockNumber} (last synced is ${updatedBlockNumber})`,
        {
          cause: {
            reason: 'block_not_available',
            previousBlockNumber: currentBlockNumber,
            updatedBlockNumber,
            targetBlockNumber,
          },
        },
      );
    }

    return updatedBlockNumber;
  }

  /** Returns the L2 block hash for a given number. Used by the L2BlockStream for detecting reorgs. */
  public async getL2BlockHash(number: number): Promise<string | undefined> {
    if (number === 0) {
      return (await this.merkleTreeCommitted.getInitialHeader().hash()).toString();
    }
    if (this.latestBlockHashQuery?.hash === undefined || number !== this.latestBlockHashQuery.blockNumber) {
      this.latestBlockHashQuery = {
        hash: await this.merkleTreeCommitted
          .getLeafValue(MerkleTreeId.ARCHIVE, BigInt(number))
          .then(leaf => leaf?.toString()),
        blockNumber: number,
      };
    }
    return this.latestBlockHashQuery.hash;
  }

  /** Returns the latest L2 block number for each tip of the chain (latest, proven, finalized). */
  public async getL2Tips(): Promise<L2Tips> {
    const status = await this.merkleTreeDb.getStatusSummary();
    const unfinalisedBlockHash = await this.getL2BlockHash(Number(status.unfinalisedBlockNumber));
    const latestBlockId: L2BlockId = { number: Number(status.unfinalisedBlockNumber), hash: unfinalisedBlockHash! };

    return {
      latest: latestBlockId,
      finalized: { number: Number(status.finalisedBlockNumber), hash: '' },
      proven: { number: Number(this.provenBlockNumber ?? status.finalisedBlockNumber), hash: '' }, // TODO(palla/reorg): Using finalised as proven for now
    };
  }

  /** Handles an event emitted by the block stream. */
  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added':
        await this.handleL2Blocks(event.blocks.map(b => b.block));
        break;
      case 'chain-pruned':
        await this.handleChainPruned(event.block.number);
        break;
      case 'chain-proven':
        await this.handleChainProven(event.block.number);
        break;
      case 'chain-finalized':
        await this.handleChainFinalized(event.block.number);
        break;
    }
  }

  /**
   * Handles a list of L2 blocks (i.e. Inserts the new note hashes into the merkle tree).
   * @param l2Blocks - The L2 blocks to handle.
   * @returns Whether the block handled was produced by this same node.
   */
  private async handleL2Blocks(l2Blocks: L2Block[]) {
    this.log.trace(`Handling L2 blocks ${l2Blocks[0].number} to ${l2Blocks.at(-1)!.number}`);

    const messagePromises = l2Blocks.map(block => this.l2BlockSource.getL1ToL2Messages(block.number));
    const l1ToL2Messages: Fr[][] = await Promise.all(messagePromises);
    let updateStatus: WorldStateStatusFull | undefined = undefined;

    for (let i = 0; i < l2Blocks.length; i++) {
      const [duration, result] = await elapsed(() => this.handleL2Block(l2Blocks[i], l1ToL2Messages[i]));
      this.log.info(`World state updated with L2 block ${l2Blocks[i].number}`, {
        eventName: 'l2-block-handled',
        duration,
        unfinalisedBlockNumber: result.summary.unfinalisedBlockNumber,
        finalisedBlockNumber: result.summary.finalisedBlockNumber,
        oldestHistoricBlock: result.summary.oldestHistoricalBlock,
        ...l2Blocks[i].getStats(),
      } satisfies L2BlockHandledStats);
      updateStatus = result;
    }
    if (!updateStatus) {
      return;
    }
    this.instrumentation.updateWorldStateMetrics(updateStatus);
  }

  /**
   * Handles a single L2 block (i.e. Inserts the new note hashes into the merkle tree).
   * @param l2Block - The L2 block to handle.
   * @param l1ToL2Messages - The L1 to L2 messages for the block.
   * @returns Whether the block handled was produced by this same node.
   */
  private async handleL2Block(l2Block: L2Block, l1ToL2Messages: Fr[]): Promise<WorldStateStatusFull> {
    // First we check that the L1 to L2 messages hash to the block inHash.
    // Note that we cannot optimize this check by checking the root of the subtree after inserting the messages
    // to the real L1_TO_L2_MESSAGE_TREE (like we do in merkleTreeDb.handleL2BlockAndMessages(...)) because that
    // tree uses pedersen and we don't have access to the converted root.
    await this.verifyMessagesHashToInHash(l1ToL2Messages, l2Block.header.contentCommitment.inHash);

    // If the above check succeeds, we can proceed to handle the block.
    this.log.trace(`Pushing L2 block ${l2Block.number} to merkle tree db `, {
      blockNumber: l2Block.number,
      blockHash: await l2Block.hash().then(h => h.toString()),
      l1ToL2Messages: l1ToL2Messages.map(msg => msg.toString()),
    });
    const result = await this.merkleTreeDb.handleL2BlockAndMessages(l2Block, l1ToL2Messages);

    if (this.currentState === WorldStateRunningState.SYNCHING && l2Block.number >= this.latestBlockNumberAtStart) {
      this.setCurrentState(WorldStateRunningState.RUNNING);
      this.syncPromise.resolve();
    }

    return result;
  }

  private async handleChainFinalized(blockNumber: number) {
    this.log.verbose(`Finalized chain is now at block ${blockNumber}`);
    const summary = await this.merkleTreeDb.setFinalised(BigInt(blockNumber));
    if (this.historyToKeep === undefined) {
      return;
    }
    const newHistoricBlock = summary.finalisedBlockNumber - BigInt(this.historyToKeep) + 1n;
    if (newHistoricBlock <= 1) {
      return;
    }
    this.log.verbose(`Pruning historic blocks to ${newHistoricBlock}`);
    const status = await this.merkleTreeDb.removeHistoricalBlocks(newHistoricBlock);
    this.log.debug(`World state summary `, status.summary);
  }

  private handleChainProven(blockNumber: number) {
    this.provenBlockNumber = BigInt(blockNumber);
    this.log.debug(`Proven chain is now at block ${blockNumber}`);
    return Promise.resolve();
  }

  private async handleChainPruned(blockNumber: number) {
    this.log.warn(`Chain pruned to block ${blockNumber}`);
    const status = await this.merkleTreeDb.unwindBlocks(BigInt(blockNumber));
    this.latestBlockHashQuery = undefined;
    this.provenBlockNumber = undefined;
    this.instrumentation.updateWorldStateMetrics(status);
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
  protected async verifyMessagesHashToInHash(l1ToL2Messages: Fr[], inHash: Fr) {
    const treeCalculator = await MerkleTreeCalculator.create(
      L1_TO_L2_MSG_SUBTREE_HEIGHT,
      Buffer.alloc(32),
      (lhs, rhs) => Promise.resolve(new SHA256Trunc().hash(lhs, rhs)),
    );

    const root = await treeCalculator.computeTreeRoot(l1ToL2Messages.map(msg => msg.toBuffer()));

    if (!root.equals(inHash.toBuffer())) {
      throw new Error('Obtained L1 to L2 messages failed to be hashed to the block inHash');
    }
  }
}
