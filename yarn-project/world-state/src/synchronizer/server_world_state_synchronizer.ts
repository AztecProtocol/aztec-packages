import { GENESIS_BLOCK_HEADER_HASH, INITIAL_L2_BLOCK_NUM, INITIAL_L2_CHECKPOINT_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { elapsed } from '@aztec/foundation/timer';
import {
  GENESIS_CHECKPOINT_HEADER_HASH,
  type L2Block,
  type L2BlockId,
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
  type L2Tips,
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
import { getTelemetryClient } from '@aztec/telemetry-client';

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

  private latestBlockNumberAtStart = BlockNumber.ZERO;
  private historyToKeep: number | undefined;
  private currentState: WorldStateRunningState = WorldStateRunningState.IDLE;

  private syncPromise = promiseWithResolvers<void>();
  protected blockStream: L2BlockStream | undefined;

  // WorldState doesn't track the proven block number, it only tracks the latest tips of the pending chain and the finalized chain
  // store the proven block number here, in the synchronizer, so that we don't end up spamming the logs with 'chain-proved' events
  private provenBlockNumber: BlockNumber | undefined;

  constructor(
    private readonly merkleTreeDb: MerkleTreeAdminDatabase,
    private readonly l2BlockSource: L2BlockSource & L1ToL2MessageSource,
    private readonly config: WorldStateConfig,
    private instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    private readonly log: Logger = createLogger('world_state'),
  ) {
    this.merkleTreeCommitted = this.merkleTreeDb.getCommitted();
    this.historyToKeep = config.worldStateCheckpointHistory < 1 ? undefined : config.worldStateCheckpointHistory;
    this.log.info(
      `Created world state synchroniser with block history of ${
        this.historyToKeep === undefined ? 'infinity' : this.historyToKeep
      }`,
    );
  }

  public getCommitted(): MerkleTreeReadOperations {
    return this.merkleTreeDb.getCommitted();
  }

  public getSnapshot(blockNumber: BlockNumber): MerkleTreeReadOperations {
    return this.merkleTreeDb.getSnapshot(blockNumber);
  }

  public fork(blockNumber?: BlockNumber, opts?: { closeDelayMs?: number }): Promise<MerkleTreeWriteOperations> {
    return this.merkleTreeDb.fork(blockNumber, opts);
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
    this.latestBlockNumberAtStart = BlockNumber(await this.l2BlockSource.getBlockNumber());

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
    const logger = createLogger('world-state:block_stream');
    return new L2BlockStream(this.l2BlockSource, this, this, logger, {
      pollIntervalMS: this.config.worldStateBlockCheckIntervalMS,
      batchSize: this.config.worldStateBlockRequestBatchSize,
      ignoreCheckpoints: true,
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
      latestBlockNumber: summary.unfinalizedBlockNumber,
      latestBlockHash: (await this.getL2BlockHash(summary.unfinalizedBlockNumber)) ?? '',
      finalizedBlockNumber: summary.finalizedBlockNumber,
      oldestHistoricBlockNumber: summary.oldestHistoricalBlock,
      treesAreSynched: summary.treesAreSynched,
    };
    return {
      syncSummary: status,
      state: this.currentState,
    };
  }

  public async getLatestBlockNumber() {
    return (await this.getL2Tips()).proposed.number;
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
  public async syncImmediate(
    targetBlockNumber?: BlockNumber,
    skipThrowIfTargetNotReached?: boolean,
  ): Promise<BlockNumber> {
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
      const archiverLatestBlock = BlockNumber(await this.l2BlockSource.getBlockNumber());
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
  public async getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    if (number === BlockNumber.ZERO) {
      return (await this.merkleTreeCommitted.getInitialHeader().hash()).toString();
    }
    return this.merkleTreeCommitted.getLeafValue(MerkleTreeId.ARCHIVE, BigInt(number)).then(leaf => leaf?.toString());
  }

  /** Returns the latest L2 block number for each tip of the chain (latest, proven, finalized). */
  public async getL2Tips(): Promise<L2Tips> {
    const status = await this.merkleTreeDb.getStatusSummary();
    const unfinalizedBlockHashPromise = this.getL2BlockHash(status.unfinalizedBlockNumber);
    const finalizedBlockHashPromise = this.getL2BlockHash(status.finalizedBlockNumber);

    const provenBlockNumber = this.provenBlockNumber ?? status.finalizedBlockNumber;
    const provenBlockHashPromise =
      this.provenBlockNumber === undefined ? finalizedBlockHashPromise : this.getL2BlockHash(this.provenBlockNumber);

    const [unfinalizedBlockHash, finalizedBlockHash, provenBlockHash] = await Promise.all([
      unfinalizedBlockHashPromise,
      finalizedBlockHashPromise,
      provenBlockHashPromise,
    ]);
    const latestBlockId: L2BlockId = { number: status.unfinalizedBlockNumber, hash: unfinalizedBlockHash! };

    // World state doesn't track checkpointed blocks or checkpoints themselves.
    // but we use a block stream so we need to provide 'local' L2Tips.
    // We configure the block stream to ignore checkpoints and set checkpoint values to genesis here.
    const genesisCheckpointHeaderHash = GENESIS_CHECKPOINT_HEADER_HASH.toString();
    return {
      proposed: latestBlockId,
      checkpointed: {
        block: { number: INITIAL_L2_BLOCK_NUM, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
        checkpoint: { number: INITIAL_L2_CHECKPOINT_NUM, hash: genesisCheckpointHeaderHash },
      },
      finalized: {
        block: { number: status.finalizedBlockNumber, hash: finalizedBlockHash ?? '' },
        checkpoint: { number: INITIAL_L2_CHECKPOINT_NUM, hash: genesisCheckpointHeaderHash },
      },
      proven: {
        block: { number: provenBlockNumber, hash: provenBlockHash ?? '' },
        checkpoint: { number: INITIAL_L2_CHECKPOINT_NUM, hash: genesisCheckpointHeaderHash },
      },
    };
  }

  /** Handles an event emitted by the block stream. */
  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added':
        await this.handleL2Blocks(event.blocks);
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
    this.log.debug(`Handling L2 blocks ${l2Blocks[0].number} to ${l2Blocks.at(-1)!.number}`);

    // Fetch the L1->L2 messages for the first block in a checkpoint.
    const messagesForBlocks = new Map<BlockNumber, Fr[]>();
    await Promise.all(
      l2Blocks
        .filter(b => b.indexWithinCheckpoint === 0)
        .map(async block => {
          const l1ToL2Messages = await this.l2BlockSource.getL1ToL2Messages(block.checkpointNumber);
          messagesForBlocks.set(block.number, l1ToL2Messages);
        }),
    );

    let updateStatus: WorldStateStatusFull | undefined = undefined;
    for (const block of l2Blocks) {
      const [duration, result] = await elapsed(() =>
        this.handleL2Block(block, messagesForBlocks.get(block.number) ?? []),
      );
      this.log.info(`World state updated with L2 block ${block.number}`, {
        eventName: 'l2-block-handled',
        duration,
        unfinalizedBlockNumber: BigInt(result.summary.unfinalizedBlockNumber),
        finalizedBlockNumber: BigInt(result.summary.finalizedBlockNumber),
        oldestHistoricBlock: BigInt(result.summary.oldestHistoricalBlock),
        ...block.getStats(),
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
    this.log.debug(`Pushing L2 block ${l2Block.number} to merkle tree db `, {
      blockNumber: l2Block.number,
      blockHash: await l2Block.hash().then(h => h.toString()),
      l1ToL2Messages: l1ToL2Messages.map(msg => msg.toString()),
      blockHeader: l2Block.header.toInspect(),
      blockStats: l2Block.getStats(),
    });
    const result = await this.merkleTreeDb.handleL2BlockAndMessages(l2Block, l1ToL2Messages);

    if (this.currentState === WorldStateRunningState.SYNCHING && l2Block.number >= this.latestBlockNumberAtStart) {
      this.setCurrentState(WorldStateRunningState.RUNNING);
      this.syncPromise.resolve();
    }

    return result;
  }

  private async handleChainFinalized(blockNumber: BlockNumber) {
    this.log.verbose(`Finalized chain is now at block ${blockNumber}`);
    const summary = await this.merkleTreeDb.setFinalized(blockNumber);
    if (this.historyToKeep === undefined) {
      return;
    }
    // Get the checkpointed block for the finalized block number
    const finalisedCheckpoint = await this.l2BlockSource.getCheckpointedBlock(summary.finalizedBlockNumber);
    if (finalisedCheckpoint === undefined) {
      this.log.warn(
        `Failed to retrieve checkpointed block for finalized block number: ${summary.finalizedBlockNumber}`,
      );
      return;
    }
    // Compute the required historic checkpoint number
    const newHistoricCheckpointNumber = finalisedCheckpoint.checkpointNumber - this.historyToKeep + 1;
    if (newHistoricCheckpointNumber <= 1) {
      return;
    }
    // Retrieve the historic checkpoint
    const historicCheckpoints = await this.l2BlockSource.getCheckpoints(
      CheckpointNumber(newHistoricCheckpointNumber),
      1,
    );
    if (historicCheckpoints.length === 0 || historicCheckpoints[0] === undefined) {
      this.log.warn(`Failed to retrieve checkpoint number ${newHistoricCheckpointNumber} from Archiver`);
      return;
    }
    const historicCheckpoint = historicCheckpoints[0];
    if (historicCheckpoint.checkpoint.blocks.length === 0 || historicCheckpoint.checkpoint.blocks[0] === undefined) {
      this.log.warn(`Retrieved checkpoint number ${newHistoricCheckpointNumber} has no blocks!`);
      return;
    }
    // Find the block at the start of the checkpoint and remove blocks up to this one
    const newHistoricBlock = historicCheckpoint.checkpoint.blocks[0];
    this.log.verbose(`Pruning historic blocks to ${newHistoricBlock.number}`);
    const status = await this.merkleTreeDb.removeHistoricalBlocks(BlockNumber(newHistoricBlock.number));
    this.log.debug(`World state summary `, status.summary);
  }

  private handleChainProven(blockNumber: BlockNumber) {
    this.provenBlockNumber = blockNumber;
    this.log.debug(`Proven chain is now at block ${blockNumber}`);
    return Promise.resolve();
  }

  private async handleChainPruned(blockNumber: BlockNumber) {
    this.log.warn(`Chain pruned to block ${blockNumber}`);
    const status = await this.merkleTreeDb.unwindBlocks(blockNumber);
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
}
