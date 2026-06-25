import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { fromEntries, padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { tryRmDir } from '@aztec/foundation/fs';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { L2Block } from '@aztec/stdlib/block';
import { DatabaseVersionManager } from '@aztec/stdlib/database-version/manager';
import type {
  IndexedTreeId,
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import type { SnapshotDataKeys } from '@aztec/stdlib/snapshots';
import { MerkleTreeId, NullifierLeaf, type NullifierLeafPreimage, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, PartialStateReference, StateReference } from '@aztec/stdlib/tx';
import { EMPTY_GENESIS_DATA, type GenesisData, WorldStateRevision } from '@aztec/stdlib/world-state';
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
  sanitizeFullStatus,
  sanitizeSummary,
  treeStateReferenceToSnapshot,
} from './message.js';
import { NativeWorldState } from './native_world_state_instance.js';

// The current version of the world state database schema
// Increment this when making incompatible changes to the database schema
export const WORLD_STATE_DB_VERSION = 2; // The initial version

export const WORLD_STATE_DIR = 'world_state';

const DEFAULT_TMP_TREE_MAP_SIZE_KB = 10 * 1024 * 1024;

/**
 * Sets up a fresh `mkdtemp` directory + default `WorldStateTreeMapSizes` shared by both
 * the `.tmp` (fsync-on) and `.ephemeral` (fsync-off) factories. Returns the raw tmpdir,
 * the tree map sizes, and the package logger.
 */
async function createTmpWorldStateDir(
  bindings?: LoggerBindings,
): Promise<{ dataDir: string; wsTreeMapSizes: WorldStateTreeMapSizes; log: Logger }> {
  const log = createLogger('world-state:database', bindings);
  const dataDir = await mkdtemp(join(tmpdir(), 'aztec-world-state-'));
  const wsTreeMapSizes: WorldStateTreeMapSizes = {
    archiveTreeMapSizeKb: DEFAULT_TMP_TREE_MAP_SIZE_KB,
    nullifierTreeMapSizeKb: DEFAULT_TMP_TREE_MAP_SIZE_KB,
    noteHashTreeMapSizeKb: DEFAULT_TMP_TREE_MAP_SIZE_KB,
    messageTreeMapSizeKb: DEFAULT_TMP_TREE_MAP_SIZE_KB,
    publicDataTreeMapSizeKb: DEFAULT_TMP_TREE_MAP_SIZE_KB,
  };
  log.debug(`Created temporary world state database at: ${dataDir} (map size ${DEFAULT_TMP_TREE_MAP_SIZE_KB} KB)`);
  return { dataDir, wsTreeMapSizes, log };
}

export class NativeWorldStateService implements MerkleTreeDatabase {
  protected initialHeader: BlockHeader | undefined;
  // This is read heavily and only changes when data is persisted, so we cache it
  private cachedStatusSummary: WorldStateStatusSummary | undefined;

  protected constructor(
    protected instance: NativeWorldState,
    protected readonly worldStateInstrumentation: WorldStateInstrumentation,
    protected readonly log: Logger,
    private readonly genesis: GenesisData = EMPTY_GENESIS_DATA,
    private readonly cleanup = () => Promise.resolve(),
  ) {}

  /**
   * Opens a persistent world state at `dataDir`. Goes through `DatabaseVersionManager` so the
   * caller's rollup address is bound to the on-disk schema and incompatible versions surface
   * loudly. The LMDB envs commit with full fsync.
   */
  static async new(
    rollupAddress: EthAddress,
    dataDir: string,
    wsTreeMapSizes: WorldStateTreeMapSizes,
    genesis: GenesisData = EMPTY_GENESIS_DATA,
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    bindings?: LoggerBindings,
    cleanup = () => Promise.resolve(),
  ): Promise<NativeWorldStateService> {
    const log = createLogger('world-state:database', bindings);
    const worldStateDirectory = join(dataDir, WORLD_STATE_DIR);
    const versionManager = new DatabaseVersionManager({
      schemaVersion: WORLD_STATE_DB_VERSION,
      rollupAddress,
      dataDirectory: worldStateDirectory,
      onOpen: (dir: string) =>
        Promise.resolve(
          new NativeWorldState(
            dir,
            wsTreeMapSizes,
            genesis,
            instrumentation,
            bindings,
            undefined,
            /*ephemeral=*/ false,
          ),
        ),
    });

    const [instance] = await versionManager.open();
    const worldState = new this(instance, instrumentation, log, genesis, cleanup);
    try {
      await worldState.init();
    } catch (e) {
      log.error(`Error initializing world state: ${e}`);
      throw e;
    }

    return worldState;
  }

  /**
   * Opens a world state in a fresh tmpdir with full fsync semantics. Use when you need the
   * on-disk file to remain crash-recoverable (e.g. for snapshot/backup tests) but don't
   * want a persistent dataDir. Pass `cleanupTmpDir=false` to keep the directory after
   * close for inspection.
   *
   * If you don't care about crash-recoverability — i.e. you just want a fast scratch
   * database for tests — use {@link ephemeral} instead.
   */
  static async tmp(
    rollupAddress = EthAddress.ZERO,
    cleanupTmpDir = true,
    genesis: GenesisData = EMPTY_GENESIS_DATA,
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    bindings?: LoggerBindings,
  ): Promise<NativeWorldStateService> {
    const { dataDir, wsTreeMapSizes, log } = await createTmpWorldStateDir(bindings);
    const cleanup = async () => {
      if (cleanupTmpDir) {
        await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
        log.debug(`Deleted temporary world state database: ${dataDir}`);
      } else {
        log.debug(`Leaving temporary world state database: ${dataDir}`);
      }
    };
    return this.new(rollupAddress, dataDir, wsTreeMapSizes, genesis, instrumentation, bindings, cleanup);
  }

  /**
   * Opens a fully-ephemeral world state. The directory is created in `os.tmpdir()`, the LMDB
   * envs open with `MDB_NOSYNC | MDB_NOMETASYNC` so commits never block on fsync, and the
   * directory is removed on dispose. A crash mid-write leaves the env unrecoverable.
   *
   * For unit tests and other isolated runs. Use {@link tmp} when you need fsync semantics in a
   * tmp dir, and {@link new} for a persistent store. Skips {@link DatabaseVersionManager} —
   * there is no on-disk schema to bind to and no rollup address is taken.
   */
  static async ephemeral(
    genesis: GenesisData = EMPTY_GENESIS_DATA,
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    bindings?: LoggerBindings,
  ): Promise<NativeWorldStateService> {
    const { dataDir, wsTreeMapSizes, log } = await createTmpWorldStateDir(bindings);
    const cleanup = async () => {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
      log.debug(`Deleted ephemeral world state database: ${dataDir}`);
    };
    const instance = new NativeWorldState(
      join(dataDir, WORLD_STATE_DIR),
      wsTreeMapSizes,
      genesis,
      instrumentation,
      bindings,
      undefined,
      /*ephemeral=*/ true,
    );
    const worldState = new this(instance, instrumentation, log, genesis, cleanup);
    try {
      await worldState.init();
    } catch (e) {
      log.error(`Error initializing ephemeral world state: ${e}`);
      throw e;
    }
    return worldState;
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
    return new MerkleTreesFacade(this.instance, this.initialHeader!, WorldStateRevision.empty());
  }

  public getSnapshot(blockNumber: BlockNumber): MerkleTreeReadOperations {
    return new MerkleTreesFacade(
      this.instance,
      this.initialHeader!,
      new WorldStateRevision(/*forkId=*/ 0, /* blockNumber=*/ blockNumber, /* includeUncommitted=*/ false),
    );
  }

  public async fork(
    blockNumber?: BlockNumber,
    opts: { closeDelayMs?: number } = {},
  ): Promise<MerkleTreeWriteOperations> {
    const resp = await this.instance.call(WorldStateMessageType.CREATE_FORK, {
      latest: blockNumber === undefined,
      blockNumber: blockNumber ?? BlockNumber.ZERO,
      canonical: true,
    });
    return new MerkleTreesForkFacade(
      this.instance,
      this.initialHeader!,
      new WorldStateRevision(
        /*forkId=*/ resp.forkId,
        /* blockNumber=*/ WorldStateRevision.LATEST,
        /* includeUncommitted=*/ true,
      ),
      opts,
    );
  }

  public getInitialHeader(): BlockHeader {
    return this.initialHeader!;
  }

  public async handleL2BlockAndMessages(l2Block: L2Block, l1ToL2Messages: Fr[]): Promise<WorldStateStatusFull> {
    const isFirstBlock = l2Block.indexWithinCheckpoint === 0;
    if (!isFirstBlock && l1ToL2Messages.length > 0) {
      throw new Error(
        `L1 to L2 messages must be empty for non-first blocks, but got ${l1ToL2Messages.length} messages for block ${l2Block.number}.`,
      );
    }

    // We have to pad the given l1 to l2 messages, and the note hashes and nullifiers within tx effects, because that's
    // how the trees are built by circuits.
    const paddedL1ToL2Messages = isFirstBlock
      ? padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP)
      : [];

    const paddedNoteHashes = l2Block.body.txEffects.flatMap(txEffect =>
      padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );

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
          blockHeaderHash: (await l2Block.hash()).toBuffer(),
          // Forwarded so the native sync verifies the archive root against canonical and rejects a divergent tree.
          expectedArchiveRoot: l2Block.archive.root.toBuffer(),
          expectedPreviousArchiveRoot: l2Block.header.lastArchive.root.toBuffer(),
          paddedL1ToL2Messages: paddedL1ToL2Messages.map(serializeLeaf),
          paddedNoteHashes: paddedNoteHashes.map(serializeLeaf),
          paddedNullifiers: paddedNullifiers.map(serializeLeaf),
          publicDataWrites: publicDataWrites.map(serializeLeaf),
          blockStateRef: blockStateReference(l2Block.header.state),
          canonical: true,
        },
        this.sanitizeAndCacheSummaryFromFull.bind(this),
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
    return BlockHeader.empty({
      state,
      globalVariables: GlobalVariables.empty({ timestamp: this.genesis.genesisTimestamp }),
    });
  }

  private sanitizeAndCacheSummaryFromFull(response: WorldStateStatusFull) {
    const sanitized = sanitizeFullStatus(response);
    this.cachedStatusSummary = { ...sanitized.summary };
    return sanitized;
  }

  private sanitizeAndCacheSummary(response: WorldStateStatusSummary) {
    const sanitized = sanitizeSummary(response);
    this.cachedStatusSummary = { ...sanitized };
    return sanitized;
  }

  private deleteCachedSummary(_: string) {
    this.cachedStatusSummary = undefined;
  }

  /**
   * Advances the finalized block number to be the number provided
   * @param toBlockNumber The block number that is now the tip of the finalized chain
   * @returns The new WorldStateStatus
   */
  public async setFinalized(toBlockNumber: BlockNumber) {
    try {
      await this.instance.call(
        WorldStateMessageType.FINALIZE_BLOCKS,
        {
          toBlockNumber,
          canonical: true,
        },
        this.sanitizeAndCacheSummary.bind(this),
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
  public async removeHistoricalBlocks(toBlockNumber: BlockNumber) {
    try {
      return await this.instance.call(
        WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS,
        {
          toBlockNumber,
          canonical: true,
        },
        this.sanitizeAndCacheSummaryFromFull.bind(this),
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
  public async unwindBlocks(toBlockNumber: BlockNumber) {
    try {
      return await this.instance.call(
        WorldStateMessageType.UNWIND_BLOCKS,
        {
          toBlockNumber,
          canonical: true,
        },
        this.sanitizeAndCacheSummaryFromFull.bind(this),
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
      this.sanitizeAndCacheSummary.bind(this),
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
