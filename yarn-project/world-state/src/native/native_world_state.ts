import {
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
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NullifierLeaf,
  PartialStateReference,
  PublicDataTreeLeaf,
  StateReference,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';

import assert from 'assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  type HandleL2BlockAndMessagesResult,
  type MerkleTreeAdminDatabase as MerkleTreeDatabase,
} from '../world-state-db/merkle_tree_db.js';
import { MerkleTreesFacade, MerkleTreesForkFacade, serializeLeaf } from './merkle_trees_facade.js';
import {
  WorldStateMessageType,
  blockStateReference,
  treeStateReferenceToSnapshot,
  worldStateRevision,
} from './message.js';
import { NativeWorldState } from './native_world_state_instance.js';

const ROLLUP_ADDRESS_FILE = 'rollup_address';

export class NativeWorldStateService implements MerkleTreeDatabase {
  protected initialHeader: Header | undefined;

  protected constructor(
    protected readonly instance: NativeWorldState,
    protected readonly log = createDebugLogger('aztec:world-state:database'),
    private readonly cleanup = () => Promise.resolve(),
  ) {}

  static async new(
    rollupAddress: EthAddress,
    dataDir: string,
    log = createDebugLogger('aztec:world-state:database'),
    cleanup = () => Promise.resolve(),
  ): Promise<NativeWorldStateService> {
    const rollupAddressFile = join(dataDir, ROLLUP_ADDRESS_FILE);
    const currentRollupStr = await readFile(rollupAddressFile, 'utf8').catch(() => undefined);
    const currentRollupAddress = currentRollupStr ? EthAddress.fromString(currentRollupStr.trim()) : undefined;

    if (currentRollupAddress && !rollupAddress.equals(currentRollupAddress)) {
      log.warn('Rollup address changed, deleting database');
      await rm(dataDir, { recursive: true, force: true });
    }

    await mkdir(dataDir, { recursive: true });
    await writeFile(rollupAddressFile, rollupAddress.toString(), 'utf8');

    const instance = new NativeWorldState(dataDir);
    const worldState = new this(instance, log, cleanup);
    await worldState.init();
    return worldState;
  }

  static async tmp(rollupAddress = EthAddress.ZERO, cleanupTmpDir = true): Promise<NativeWorldStateService> {
    const log = createDebugLogger('aztec:world-state:database');
    const dataDir = await mkdtemp(join(tmpdir(), 'aztec-world-state-'));
    log.debug(`Created temporary world state database: ${dataDir}`);

    // pass a cleanup callback because process.on('beforeExit', cleanup) does not work under Jest
    const cleanup = async () => {
      if (cleanupTmpDir) {
        await rm(dataDir, { recursive: true, force: true });
        log.debug(`Deleted temporary world state database: ${dataDir}`);
      } else {
        log.debug(`Leaving temporary world state database: ${dataDir}`);
      }
    };

    return this.new(rollupAddress, dataDir, log, cleanup);
  }

  protected async init() {
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

  public async fork(): Promise<MerkleTreeWriteOperations> {
    const resp = await this.instance.call(WorldStateMessageType.CREATE_FORK, { blockNumber: 0 });
    return new MerkleTreesForkFacade(this.instance, this.initialHeader!, worldStateRevision(true, resp.forkId, 0));
  }

  public getInitialHeader(): Header {
    return this.initialHeader!;
  }

  public async handleL2BlockAndMessages(
    l2Block: L2Block,
    l1ToL2Messages: Fr[],
  ): Promise<HandleL2BlockAndMessagesResult> {
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

    // We insert the public data tree leaves with one batch per tx to avoid updating the same key twice
    const batchesOfPaddedPublicDataWrites: PublicDataTreeLeaf[][] = [];
    for (const txEffect of paddedTxEffects) {
      const batch: PublicDataTreeLeaf[] = Array(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX).fill(
        PublicDataTreeLeaf.empty(),
      );
      for (const [i, write] of txEffect.publicDataWrites.entries()) {
        batch[i] = new PublicDataTreeLeaf(write.leafIndex, write.newValue);
      }

      batchesOfPaddedPublicDataWrites.push(batch);
    }

    return await this.instance.call(WorldStateMessageType.SYNC_BLOCK, {
      blockNumber: l2Block.number,
      blockHeaderHash: l2Block.header.hash(),
      paddedL1ToL2Messages: paddedL1ToL2Messages.map(serializeLeaf),
      paddedNoteHashes: paddedNoteHashes.map(serializeLeaf),
      paddedNullifiers: paddedNullifiers.map(serializeLeaf),
      batchesOfPaddedPublicDataWrites: batchesOfPaddedPublicDataWrites.map(batch => batch.map(serializeLeaf)),
      blockStateRef: blockStateReference(l2Block.header.state),
    });
  }

  public async close(): Promise<void> {
    await this.instance.close();
    await this.cleanup();
  }

  private async buildInitialHeader(): Promise<Header> {
    const state = await this.getInitialStateReference();
    return Header.empty({ state });
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
