import {
  type IndexedTreeId,
  type L2Block,
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  TxEffect,
} from '@aztec/circuit-types';
import {
  EthAddress,
  Fr,
  Header,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NullifierLeaf,
  type NullifierLeafPreimage,
  PartialStateReference,
  PublicDataTreeLeaf,
  StateReference,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';

import assert from 'assert/strict';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { type MerkleTreeAdminDatabase as MerkleTreeDatabase } from '../world-state-db/merkle_tree_db.js';
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
import { WorldStateVersion } from './world_state_version.js';

export const WORLD_STATE_VERSION_FILE = 'version';

// A crude way of maintaining DB versioning
// We don't currently have any method of performing data migrations
// should the world state db structure change
// For now we will track versions using this hardcoded value and delete
// the state if a change is detected
export const WORLD_STATE_DB_VERSION = 1; // The initial version

export class NativeWorldStateService implements MerkleTreeDatabase {
  protected initialHeader: Header | undefined;
  // This is read heavily and only changes when data is persisted, so we cache it
  private cachedStatusSummary: WorldStateStatusSummary | undefined;

  protected constructor(
    protected readonly instance: NativeWorldState,
    protected readonly log = createDebugLogger('aztec:world-state:database'),
    private readonly cleanup = () => Promise.resolve(),
  ) {}

  static async new(
    rollupAddress: EthAddress,
    dataDir: string,
    dbMapSizeKb: number,
    log = createDebugLogger('aztec:world-state:database'),
    cleanup = () => Promise.resolve(),
  ): Promise<NativeWorldStateService> {
    const worldStateDirectory = join(dataDir, 'world_state');
    const versionFile = join(worldStateDirectory, WORLD_STATE_VERSION_FILE);
    const storedWorldStateVersion = await WorldStateVersion.readVersion(versionFile);

    if (!storedWorldStateVersion) {
      log.warn('No world state version found, deleting world state directory');
      await rm(worldStateDirectory, { recursive: true, force: true });
    } else if (!rollupAddress.equals(storedWorldStateVersion.rollupAddress)) {
      log.warn('Rollup address changed, deleting world state directory');
      await rm(worldStateDirectory, { recursive: true, force: true });
    } else if (storedWorldStateVersion.version != WORLD_STATE_DB_VERSION) {
      log.warn('World state version change detected, deleting world state directory');
      await rm(worldStateDirectory, { recursive: true, force: true });
    }

    const newWorldStateVersion = new WorldStateVersion(WORLD_STATE_DB_VERSION, rollupAddress);

    await mkdir(worldStateDirectory, { recursive: true });
    await newWorldStateVersion.writeVersionFile(versionFile);

    const instance = new NativeWorldState(worldStateDirectory, dbMapSizeKb);
    const worldState = new this(instance, log, cleanup);
    try {
      await worldState.init();
    } catch (e) {
      log.error(`Error initialising world state: ${e}`);
      throw e;
    }

    return worldState;
  }

  static async tmp(rollupAddress = EthAddress.ZERO, cleanupTmpDir = true): Promise<NativeWorldStateService> {
    const log = createDebugLogger('aztec:world-state:database');
    const dataDir = await mkdtemp(join(tmpdir(), 'aztec-world-state-'));
    const dbMapSizeKb = 10 * 1024 * 1024;
    log.debug(`Created temporary world state database at: ${dataDir} with size: ${dbMapSizeKb}`);

    // pass a cleanup callback because process.on('beforeExit', cleanup) does not work under Jest
    const cleanup = async () => {
      if (cleanupTmpDir) {
        await rm(dataDir, { recursive: true, force: true });
        log.debug(`Deleted temporary world state database: ${dataDir}`);
      } else {
        log.debug(`Leaving temporary world state database: ${dataDir}`);
      }
    };

    return this.new(rollupAddress, dataDir, dbMapSizeKb, log, cleanup);
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
    const initialHeaderIndex = await committed.findLeafIndex(MerkleTreeId.ARCHIVE, this.initialHeader.hash());
    assert.strictEqual(initialHeaderIndex, 0n, 'Invalid initial archive state');
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
    });
    return new MerkleTreesForkFacade(this.instance, this.initialHeader!, worldStateRevision(true, resp.forkId, 0));
  }

  public getInitialHeader(): Header {
    return this.initialHeader!;
  }

  public async handleL2BlockAndMessages(l2Block: L2Block, l1ToL2Messages: Fr[]): Promise<WorldStateStatusFull> {
    // We have to pad both the tx effects and the values within tx effects because that's how the trees are built
    // by circuits.
    const paddedTxEffects = padArrayEnd(
      l2Block.body.txEffects,
      TxEffect.empty(),
      l2Block.body.numberOfTxsIncludingPadded,
    );

    const paddedNoteHashes = paddedTxEffects.flatMap(txEffect =>
      padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );
    const paddedL1ToL2Messages = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    const paddedNullifiers = paddedTxEffects
      .flatMap(txEffect => padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX))
      .map(nullifier => new NullifierLeaf(nullifier));

    const publicDataWrites: PublicDataTreeLeaf[] = paddedTxEffects.flatMap(txEffect => {
      return txEffect.publicDataWrites.map(write => {
        if (write.isEmpty()) {
          throw new Error('Public data write must not be empty when syncing');
        }
        return new PublicDataTreeLeaf(write.leafSlot, write.value);
      });
    });

    return await this.instance.call(
      WorldStateMessageType.SYNC_BLOCK,
      {
        blockNumber: l2Block.number,
        blockHeaderHash: l2Block.header.hash(),
        paddedL1ToL2Messages: paddedL1ToL2Messages.map(serializeLeaf),
        paddedNoteHashes: paddedNoteHashes.map(serializeLeaf),
        paddedNullifiers: paddedNullifiers.map(serializeLeaf),
        publicDataWrites: publicDataWrites.map(serializeLeaf),
        blockStateRef: blockStateReference(l2Block.header.state),
      },
      this.sanitiseAndCacheSummaryFromFull.bind(this),
      this.deleteCachedSummary.bind(this),
    );
  }

  public async close(): Promise<void> {
    await this.instance.close();
    await this.cleanup();
  }

  private async buildInitialHeader(): Promise<Header> {
    const state = await this.getInitialStateReference();
    return Header.empty({ state });
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
    await this.instance.call(
      WorldStateMessageType.FINALISE_BLOCKS,
      {
        toBlockNumber,
      },
      this.sanitiseAndCacheSummary.bind(this),
      this.deleteCachedSummary.bind(this),
    );
    return this.getStatusSummary();
  }

  /**
   * Removes all historical snapshots up to but not including the given block number
   * @param toBlockNumber The block number of the new oldest historical block
   * @returns The new WorldStateStatus
   */
  public async removeHistoricalBlocks(toBlockNumber: bigint) {
    return await this.instance.call(
      WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS,
      {
        toBlockNumber,
      },
      this.sanitiseAndCacheSummaryFromFull.bind(this),
      this.deleteCachedSummary.bind(this),
    );
  }

  /**
   * Removes all pending blocks down to but not including the given block number
   * @param toBlockNumber The block number of the new tip of the pending chain,
   * @returns The new WorldStateStatus
   */
  public async unwindBlocks(toBlockNumber: bigint) {
    return await this.instance.call(
      WorldStateMessageType.UNWIND_BLOCKS,
      {
        toBlockNumber,
      },
      this.sanitiseAndCacheSummaryFromFull.bind(this),
      this.deleteCachedSummary.bind(this),
    );
  }

  public async getStatusSummary() {
    if (this.cachedStatusSummary !== undefined) {
      return { ...this.cachedStatusSummary };
    }
    return await this.instance.call(WorldStateMessageType.GET_STATUS, void 0, this.sanitiseAndCacheSummary.bind(this));
  }

  updateLeaf<ID extends IndexedTreeId>(
    _treeId: ID,
    _leaf: NullifierLeafPreimage | Buffer,
    _index: bigint,
  ): Promise<void> {
    return Promise.reject(new Error('Method not implemented'));
  }

  private async getInitialStateReference(): Promise<StateReference> {
    const resp = await this.instance.call(WorldStateMessageType.GET_INITIAL_STATE_REFERENCE, void 0);

    return new StateReference(
      treeStateReferenceToSnapshot(resp.state[MerkleTreeId.L1_TO_L2_MESSAGE_TREE]),
      new PartialStateReference(
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NOTE_HASH_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NULLIFIER_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.PUBLIC_DATA_TREE]),
      ),
    );
  }
}
