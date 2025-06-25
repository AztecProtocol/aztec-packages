import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { fromEntries, padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { tryRmDir } from '@aztec/foundation/fs';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { L2Block } from '@aztec/stdlib/block';
import { DatabaseVersionManager } from '@aztec/stdlib/database-version';
import type {
  IndexedTreeId,
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import type { SnapshotDataKeys } from '@aztec/stdlib/snapshots';
import { MerkleTreeId, NullifierLeaf, type NullifierLeafPreimage, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { BlockHeader, PartialStateReference, StateReference } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import assert from 'assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import type { MerkleTreeAdminDatabase as MerkleTreeDatabase } from '../world-state-db/merkle_tree_db.js';
import { MerkleTreesFacade, MerkleTreesForkFacade, serializeLeaf } from './merkle_trees_facade.js';
import {
  WorldStateMessageType,
  type WorldStateStatusFull,
  type WorldStateStatusSummary,
  blockStateReference,
  sanitiseFullStatus,
  sanitiseSummary,
  treeStateReferenceToSnapshot,
  worldStateRevision,
} from './message.js';
import { NativeWorldState } from './native_world_state_instance.js';

// The current version of the world state database schema
// Increment this when making incompatible changes to the database schema
export const WORLD_STATE_DB_VERSION = 2; // The initial version

export const WORLD_STATE_DIR = 'world_state';

export class NativeWorldStateService implements MerkleTreeDatabase {
  protected initialHeader: BlockHeader | undefined;
  // This is read heavily and only changes when data is persisted, so we cache it
  private cachedStatusSummary: WorldStateStatusSummary | undefined;

  protected constructor(
    protected instance: NativeWorldState,
    protected readonly worldStateInstrumentation: WorldStateInstrumentation,
    protected readonly log: Logger = createLogger('world-state:database'),
    private readonly cleanup = () => Promise.resolve(),
  ) {}

  static async new(
    rollupAddress: EthAddress,
    dataDir: string,
    wsTreeMapSizes: WorldStateTreeMapSizes,
    prefilledPublicData: PublicDataTreeLeaf[] = [],
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    log = createLogger('world-state:database'),
    cleanup = () => Promise.resolve(),
  ): Promise<NativeWorldStateService> {
    const worldStateDirectory = join(dataDir, WORLD_STATE_DIR);
    // Create a version manager to handle versioning
    const versionManager = new DatabaseVersionManager({
      schemaVersion: WORLD_STATE_DB_VERSION,
      rollupAddress,
      dataDirectory: worldStateDirectory,
      onOpen: (dir: string) => {
        return Promise.resolve(new NativeWorldState(dir, wsTreeMapSizes, prefilledPublicData, instrumentation));
      },
    });

    const [instance] = await versionManager.open();
    const worldState = new this(instance, instrumentation, log, cleanup);
    try {
      await worldState.init();
    } catch (e) {
      log.error(`Error initialising world state: ${e}`);
      throw e;
    }

    return worldState;
  }

  static async tmp(
    rollupAddress = EthAddress.ZERO,
    cleanupTmpDir = true,
    prefilledPublicData: PublicDataTreeLeaf[] = [],
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
  ): Promise<NativeWorldStateService> {
    const log = createLogger('world-state:database');
    const dataDir = await mkdtemp(join(tmpdir(), 'aztec-world-state-'));
    const dbMapSizeKb = 10 * 1024 * 1024;
    const worldStateTreeMapSizes: WorldStateTreeMapSizes = {
      archiveTreeMapSizeKb: dbMapSizeKb,
      nullifierTreeMapSizeKb: dbMapSizeKb,
      noteHashTreeMapSizeKb: dbMapSizeKb,
      messageTreeMapSizeKb: dbMapSizeKb,
      publicDataTreeMapSizeKb: dbMapSizeKb,
    };
    log.debug(`Created temporary world state database at: ${dataDir} with tree map size: ${dbMapSizeKb}`);

    // pass a cleanup callback because process.on('beforeExit', cleanup) does not work under Jest
    const cleanup = async () => {
      if (cleanupTmpDir) {
        await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
        log.debug(`Deleted temporary world state database: ${dataDir}`);
      } else {
        log.debug(`Leaving temporary world state database: ${dataDir}`);
      }
    };

    return this.new(rollupAddress, dataDir, worldStateTreeMapSizes, prefilledPublicData, instrumentation, log, cleanup);
  }

  protected async init() {
    const status = await this.getStatusSummary();
    if (!status.treesAreSynched) {
      throw new Error('World state trees are out of sync, please delete your data directory and re-sync');
    }
    this.initialHeader = await this.buildInitialHeader();
    const committed = this.getCommitted();

    // validate the initial state
    const archive = await committed.getTreeInfo(MerkleTreeId.ARCHIVE);
    if (archive.size === 0n) {
      throw new Error("Archive tree can't be empty");
    }

    // the initial header _must_ be the first element in the archive tree
    // if this assertion fails, check that the hashing done in Header in yarn-project matches the initial header hash done in world_state.cpp
    const indices = await committed.findLeafIndices(MerkleTreeId.ARCHIVE, [await this.initialHeader.hash()]);
    const initialHeaderIndex = indices[0];
    assert.strictEqual(initialHeaderIndex, 0n, 'Invalid initial archive state');
  }

  public async clear() {
    await this.instance.close();
    this.cachedStatusSummary = undefined;
    await tryRmDir(this.instance.getDataDir(), this.log);
    this.instance = this.instance.clone();
  }

  public getCommitted(): MerkleTreeReadOperations {
    return new MerkleTreesFacade(this.instance, this.initialHeader!, worldStateRevision(false, 0, 0));
  }

  public getSnapshot(blockNumber: number): MerkleTreeReadOperations {
    return new MerkleTreesFacade(this.instance, this.initialHeader!, worldStateRevision(false, 0, blockNumber));
  }

  public async fork(blockNumber?: number): Promise<MerkleTreeWriteOperations> {
    const resp = await this.instance.call(WorldStateMessageType.CREATE_FORK, {
      latest: blockNumber === undefined,
      blockNumber: blockNumber ?? 0,
      canonical: true,
    });
    return new MerkleTreesForkFacade(this.instance, this.initialHeader!, worldStateRevision(true, resp.forkId, 0));
  }

  public getInitialHeader(): BlockHeader {
    return this.initialHeader!;
  }

  public async handleL2BlockAndMessages(l2Block: L2Block, l1ToL2Messages: Fr[]): Promise<WorldStateStatusFull> {
    // We have to pad both the values within tx effects because that's how the trees are built by circuits.
    const paddedNoteHashes = l2Block.body.txEffects.flatMap(txEffect =>
      padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );
    const paddedL1ToL2Messages = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    const paddedNullifiers = l2Block.body.txEffects
      .flatMap(txEffect => padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX))
      .map(nullifier => new NullifierLeaf(nullifier));

    const publicDataWrites: PublicDataTreeLeaf[] = l2Block.body.txEffects.flatMap(txEffect => {
      return txEffect.publicDataWrites.map(write => {
        if (write.isEmpty()) {
          throw new Error('Public data write must not be empty when syncing');
        }
        return new PublicDataTreeLeaf(write.leafSlot, write.value);
      });
    });

    try {
      return await this.instance.call(
        WorldStateMessageType.SYNC_BLOCK,
        {
          blockNumber: l2Block.number,
          blockHeaderHash: await l2Block.header.hash(),
          paddedL1ToL2Messages: paddedL1ToL2Messages.map(serializeLeaf),
          paddedNoteHashes: paddedNoteHashes.map(serializeLeaf),
          paddedNullifiers: paddedNullifiers.map(serializeLeaf),
          publicDataWrites: publicDataWrites.map(serializeLeaf),
          blockStateRef: blockStateReference(l2Block.header.state),
          canonical: true,
        },
        this.sanitiseAndCacheSummaryFromFull.bind(this),
        this.deleteCachedSummary.bind(this),
      );
    } catch (err) {
      this.worldStateInstrumentation.incCriticalErrors('synch_pending_block');
      throw err;
    }
  }

  public async close(): Promise<void> {
    await this.instance.close();
    await this.cleanup();
  }

  private async buildInitialHeader(): Promise<BlockHeader> {
    const state = await this.getInitialStateReference();
    return BlockHeader.empty({ state });
  }

  private sanitiseAndCacheSummaryFromFull(response: WorldStateStatusFull) {
    const sanitised = sanitiseFullStatus(response);
    this.cachedStatusSummary = { ...sanitised.summary };
    return sanitised;
  }

  private sanitiseAndCacheSummary(response: WorldStateStatusSummary) {
    const sanitised = sanitiseSummary(response);
    this.cachedStatusSummary = { ...sanitised };
    return sanitised;
  }

  private deleteCachedSummary(_: string) {
    this.cachedStatusSummary = undefined;
  }

  /**
   * Advances the finalised block number to be the number provided
   * @param toBlockNumber The block number that is now the tip of the finalised chain
   * @returns The new WorldStateStatus
   */
  public async setFinalised(toBlockNumber: bigint) {
    try {
      await this.instance.call(
        WorldStateMessageType.FINALISE_BLOCKS,
        {
          toBlockNumber,
          canonical: true,
        },
        this.sanitiseAndCacheSummary.bind(this),
        this.deleteCachedSummary.bind(this),
      );
    } catch (err) {
      this.worldStateInstrumentation.incCriticalErrors('finalize_block');
      throw err;
    }
    return this.getStatusSummary();
  }

  /**
   * Removes all historical snapshots up to but not including the given block number
   * @param toBlockNumber The block number of the new oldest historical block
   * @returns The new WorldStateStatus
   */
  public async removeHistoricalBlocks(toBlockNumber: bigint) {
    try {
      return await this.instance.call(
        WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS,
        {
          toBlockNumber,
          canonical: true,
        },
        this.sanitiseAndCacheSummaryFromFull.bind(this),
        this.deleteCachedSummary.bind(this),
      );
    } catch (err) {
      this.worldStateInstrumentation.incCriticalErrors('prune_historical_block');
      throw err;
    }
  }

  /**
   * Removes all pending blocks down to but not including the given block number
   * @param toBlockNumber The block number of the new tip of the pending chain,
   * @returns The new WorldStateStatus
   */
  public async unwindBlocks(toBlockNumber: bigint) {
    try {
      return await this.instance.call(
        WorldStateMessageType.UNWIND_BLOCKS,
        {
          toBlockNumber,
          canonical: true,
        },
        this.sanitiseAndCacheSummaryFromFull.bind(this),
        this.deleteCachedSummary.bind(this),
      );
    } catch (err) {
      this.worldStateInstrumentation.incCriticalErrors('prune_pending_block');
      throw err;
    }
  }

  public async getStatusSummary() {
    if (this.cachedStatusSummary !== undefined) {
      return { ...this.cachedStatusSummary };
    }
    return await this.instance.call(
      WorldStateMessageType.GET_STATUS,
      { canonical: true },
      this.sanitiseAndCacheSummary.bind(this),
    );
  }

  updateLeaf<ID extends IndexedTreeId>(
    _treeId: ID,
    _leaf: NullifierLeafPreimage | Buffer,
    _index: bigint,
  ): Promise<void> {
    return Promise.reject(new Error('Method not implemented'));
  }

  private async getInitialStateReference(): Promise<StateReference> {
    const resp = await this.instance.call(WorldStateMessageType.GET_INITIAL_STATE_REFERENCE, { canonical: true });

    return new StateReference(
      treeStateReferenceToSnapshot(resp.state[MerkleTreeId.L1_TO_L2_MESSAGE_TREE]),
      new PartialStateReference(
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NOTE_HASH_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NULLIFIER_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.PUBLIC_DATA_TREE]),
      ),
    );
  }

  public async backupTo(
    dstPath: string,
    compact: boolean = true,
  ): Promise<Record<Exclude<SnapshotDataKeys, 'archiver'>, string>> {
    await this.instance.call(WorldStateMessageType.COPY_STORES, {
      dstPath,
      compact,
      canonical: true,
    });
    return fromEntries(NATIVE_WORLD_STATE_DBS.map(([name, dir]) => [name, join(dstPath, dir, 'data.mdb')] as const));
  }
}

// The following paths are defined in cpp-land
export const NATIVE_WORLD_STATE_DBS = [
  ['l1-to-l2-message-tree', 'L1ToL2MessageTree'],
  ['archive-tree', 'ArchiveTree'],
  ['public-data-tree', 'PublicDataTree'],
  ['note-hash-tree', 'NoteHashTree'],
  ['nullifier-tree', 'NullifierTree'],
] as const;
