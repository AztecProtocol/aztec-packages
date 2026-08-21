import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { fromEntries, padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
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
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import type { MerkleTreeAdminDatabase as MerkleTreeDatabase } from '../world-state-db/merkle_tree_db.js';
import { IpcWorldState } from './ipc_world_state_instance.js';
import { MerkleTreesFacade, MerkleTreesForkFacade, serializeLeaf } from './merkle_trees_facade.js';
import {
  type WorldStateStatusFull,
  type WorldStateStatusSummary,
  blockStateReference,
  sanitizeFullStatus,
  sanitizeSummary,
  treeStateReferenceToSnapshot,
} from './message.js';
import type { NativeWorldStateInstance } from './native_world_state_instance.js';

// The current version of the world state database schema
// Increment this when making incompatible changes to the database schema
export const WORLD_STATE_DB_VERSION = 2; // The initial version

export const WORLD_STATE_DIR = 'world_state';

export class NativeWorldStateService implements MerkleTreeDatabase {
  protected initialHeader: BlockHeader | undefined;
  // This is read heavily and only changes when data is persisted, so we cache it
  private cachedStatusSummary: WorldStateStatusSummary | undefined;

  protected constructor(
    protected instance: NativeWorldStateInstance,
    protected readonly worldStateInstrumentation: WorldStateInstrumentation,
    protected readonly log: Logger,
    private readonly genesis: GenesisData = EMPTY_GENESIS_DATA,
    private readonly cleanup = () => Promise.resolve(),
    /** Factory to recreate a fresh IpcWorldState after clear(). */
    private readonly recreateInstance?: () => Promise<NativeWorldStateInstance>,
  ) {}

  static async new(
    rollupAddress: EthAddress,
    dataDir: string,
    wsTreeMapSizes: WorldStateTreeMapSizes,
    genesis: GenesisData = EMPTY_GENESIS_DATA,
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    bindings?: LoggerBindings,
    cleanup = () => Promise.resolve(),
  ): Promise<NativeWorldStateService> {
    for (const [key, value] of Object.entries(wsTreeMapSizes)) {
      if (value <= 0) {
        throw new Error(`Map size must be a positive number, got ${value} for ${key}`);
      }
    }

    const log = createLogger('world-state:database', bindings);
    const worldStateDirectory = join(dataDir, WORLD_STATE_DIR);

    const versionManager = new DatabaseVersionManager({
      schemaVersion: WORLD_STATE_DB_VERSION,
      rollupAddress,
      dataDirectory: worldStateDirectory,
      onOpen: dir => IpcWorldState.spawn(dir, wsTreeMapSizes, genesis, instrumentation, bindings),
    });

    const [instance] = await versionManager.open();

    const recreateInstance = async () => {
      await rm(worldStateDirectory, { recursive: true, force: true, maxRetries: 3 });
      await mkdir(worldStateDirectory, { recursive: true });
      return IpcWorldState.spawn(worldStateDirectory, wsTreeMapSizes, genesis, instrumentation, bindings);
    };

    const worldState = new this(instance, instrumentation, log, genesis, cleanup, recreateInstance);
    try {
      await worldState.init();
    } catch (e) {
      log.error(`Error initializing world state: ${e}`);
      throw e;
    }

    return worldState;
  }

  static async tmp(
    cleanupTmpDir = true,
    genesis: GenesisData = EMPTY_GENESIS_DATA,
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    bindings?: LoggerBindings,
    threads?: number,
  ): Promise<NativeWorldStateService> {
    const log = createLogger('world-state:database', bindings);
    const dataDir = await mkdtemp(join(tmpdir(), 'aztec-world-state-'));
    // Temporary (test/dev) world states are small and short-lived. Keep the LMDB
    // map sizes in the MB range: with the IPC backend each tmp() spawns a separate
    // aztec-wsdb that maps these per tree, and oversized maps add real cold-start
    // I/O under parallel CI load. 256 MB/tree is ample for tests.
    const dbMapSizeKb = 256 * 1024;
    const worldStateTreeMapSizes: WorldStateTreeMapSizes = {
      archiveTreeMapSizeKb: dbMapSizeKb,
      nullifierTreeMapSizeKb: dbMapSizeKb,
      noteHashTreeMapSizeKb: dbMapSizeKb,
      messageTreeMapSizeKb: dbMapSizeKb,
      publicDataTreeMapSizeKb: dbMapSizeKb,
    };
    log.debug(`Created temporary world state database at: ${dataDir} with tree map size: ${dbMapSizeKb}`);

    const instance = await IpcWorldState.spawn(
      dataDir,
      worldStateTreeMapSizes,
      genesis,
      instrumentation,
      bindings,
      threads,
    );

    const cleanup = async () => {
      if (cleanupTmpDir) {
        await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
        log.debug(`Deleted temporary world state database: ${dataDir}`);
      } else {
        log.debug(`Leaving temporary world state database: ${dataDir}`);
      }
    };

    const recreateInstance = async () => {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
      await mkdir(dataDir, { recursive: true });
      return IpcWorldState.spawn(dataDir, worldStateTreeMapSizes, genesis, instrumentation, bindings, threads);
    };

    const worldState = new this(instance, instrumentation, log, genesis, cleanup, recreateInstance);
    try {
      await worldState.init();
    } catch (e) {
      log.error(`Error initializing tmp world state: ${e}`);
      throw e;
    }
    return worldState;
  }

  static ephemeral(
    genesis: GenesisData = EMPTY_GENESIS_DATA,
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    bindings?: LoggerBindings,
  ): Promise<NativeWorldStateService> {
    // The TXE spins up one tiny, short-lived world state per test, many concurrently. Cap the wsdb thread
    // usage to the minimum: a single tree-op thread instead of one per core (the C++ IPC dispatcher pool
    // still floors at 2). This avoids ~32 threads per wsdb multiplied across dozens of concurrent test
    // world states — the trees are cache-sized (see tmp's map-size note), so extra threads buy nothing.
    return this.tmp(/*cleanupTmpDir=*/ true, genesis, instrumentation, bindings, /*threads=*/ 1);
  }

  static async fromIpc(
    wsdbBackend: ConstructorParameters<typeof IpcWorldState>[0],
    instrumentation = new WorldStateInstrumentation(getTelemetryClient()),
    bindings?: LoggerBindings,
    genesis: GenesisData = EMPTY_GENESIS_DATA,
    cleanup = () => Promise.resolve(),
    recreateInstance?: () => Promise<NativeWorldStateInstance>,
  ): Promise<NativeWorldStateService> {
    const log = createLogger('world-state:database', bindings);
    const instance = new IpcWorldState(wsdbBackend, instrumentation, bindings);
    const worldState = new this(instance, instrumentation, log, genesis, cleanup, recreateInstance);
    await worldState.init();
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

  public async clear(): Promise<void> {
    if (!this.recreateInstance) {
      throw new Error('clear() is not available for externally-managed IPC backends');
    }
    this.log.warn('Clearing world state: shutting down WSDB, deleting data, and recreating');
    await this.instance.close();
    this.cachedStatusSummary = undefined;
    this.instance = await this.recreateInstance();
    await this.init();
    this.log.info('World state cleared and reinitialized from genesis');
  }

  /** Returns the IPC path of the underlying IPC backend, if available. */
  public getIpcPath(): string {
    if (this.instance instanceof IpcWorldState) {
      return this.instance.getIpcPath();
    }
    throw new Error('getIpcPath() is only available with IPC world state');
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
    const forkId = await this.instance.createFork({
      latest: blockNumber === undefined,
      blockNumber: blockNumber ?? BlockNumber.ZERO,
    });
    return new MerkleTreesForkFacade(
      this.instance,
      this.initialHeader!,
      new WorldStateRevision(
        /*forkId=*/ forkId,
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
    // Any block may carry an L1-to-L2 message bundle and transition the L1-to-L2 message tree by its real (unpadded,
    // compact) leaves, matching how the circuits build the tree.

    // We have to pad the note hashes and nullifiers within tx effects because that's how the trees are built by
    // circuits.
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
      const status = await this.instance.syncBlock({
        blockNumber: l2Block.number,
        blockHeaderHash: (await l2Block.hash()).toBuffer(),
        // Forwarded so the native sync verifies the archive root against canonical and rejects a divergent tree.
        expectedArchiveRoot: l2Block.archive.root.toBuffer(),
        expectedPreviousArchiveRoot: l2Block.header.lastArchive.root.toBuffer(),
        paddedL1ToL2Messages: l1ToL2Messages.map(serializeLeaf),
        paddedNoteHashes: paddedNoteHashes.map(serializeLeaf),
        paddedNullifiers: paddedNullifiers.map(serializeLeaf),
        publicDataWrites: publicDataWrites.map(serializeLeaf),
        blockStateRef: blockStateReference(l2Block.header.state),
      });
      return this.sanitizeAndCacheSummaryFromFull(status);
    } catch (err) {
      this.deleteCachedSummary();
      this.worldStateInstrumentation.incCriticalErrors('synch_pending_block');
      throw err;
    }
  }

  public async close(): Promise<void> {
    try {
      await this.instance.close();
    } finally {
      await this.cleanup();
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
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

  private deleteCachedSummary() {
    this.cachedStatusSummary = undefined;
  }

  /**
   * Advances the finalized block number to be the number provided
   * @param toBlockNumber The block number that is now the tip of the finalized chain
   * @returns The new WorldStateStatus
   */
  public async setFinalized(toBlockNumber: BlockNumber) {
    try {
      this.sanitizeAndCacheSummary(await this.instance.finalizeBlocks(toBlockNumber));
    } catch (err) {
      this.deleteCachedSummary();
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
      return this.sanitizeAndCacheSummaryFromFull(await this.instance.removeHistoricalBlocks(toBlockNumber));
    } catch (err) {
      this.deleteCachedSummary();
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
      return this.sanitizeAndCacheSummaryFromFull(await this.instance.unwindBlocks(toBlockNumber));
    } catch (err) {
      this.deleteCachedSummary();
      this.worldStateInstrumentation.incCriticalErrors('prune_pending_block');
      throw err;
    }
  }

  public async getStatusSummary() {
    if (this.cachedStatusSummary !== undefined) {
      return { ...this.cachedStatusSummary };
    }
    return this.sanitizeAndCacheSummary(await this.instance.getStatus());
  }

  updateLeaf<ID extends IndexedTreeId>(
    _treeId: ID,
    _leaf: NullifierLeafPreimage | Buffer,
    _index: bigint,
  ): Promise<void> {
    return Promise.reject(new Error('Method not implemented'));
  }

  private async getInitialStateReference(): Promise<StateReference> {
    const state = await this.instance.getInitialStateReference();

    return new StateReference(
      treeStateReferenceToSnapshot(state[MerkleTreeId.L1_TO_L2_MESSAGE_TREE]),
      new PartialStateReference(
        treeStateReferenceToSnapshot(state[MerkleTreeId.NOTE_HASH_TREE]),
        treeStateReferenceToSnapshot(state[MerkleTreeId.NULLIFIER_TREE]),
        treeStateReferenceToSnapshot(state[MerkleTreeId.PUBLIC_DATA_TREE]),
      ),
    );
  }

  public async backupTo(
    dstPath: string,
    compact: boolean = true,
  ): Promise<Record<Exclude<SnapshotDataKeys, 'archiver'>, string>> {
    await this.instance.copyStores(dstPath, compact);
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
