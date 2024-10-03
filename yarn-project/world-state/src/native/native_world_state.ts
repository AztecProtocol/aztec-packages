import {
  type BatchInsertionResult,
  type HandleL2BlockAndMessagesResult,
  type IndexedTreeId,
  type L2Block,
  type MerkleTreeAdminOperations,
  MerkleTreeId,
  type MerkleTreeLeafType,
  SiblingPath,
  type TreeInfo,
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
  NullifierLeafPreimage,
  PartialStateReference,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
  StateReference,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger, fmtLogData } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import type { IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import assert from 'assert/strict';
import bindings from 'bindings';
import { rmSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { Decoder, Encoder, addExtension } from 'msgpackr';
import { tmpdir } from 'os';
import { join } from 'path';
import { isAnyArrayBuffer } from 'util/types';

import { type MerkleTreeAdminDb, type MerkleTreeDb } from '../world-state-db/merkle_tree_db.js';
import { MerkleTreeAdminOperationsFacade } from '../world-state-db/merkle_tree_operations_facade.js';
import {
  MessageHeader,
  type SerializedIndexedLeaf,
  type SerializedLeafValue,
  TypedMessage,
  WorldStateMessageType,
  type WorldStateRequest,
  type WorldStateResponse,
  blockStateReference,
  treeStateReferenceToSnapshot,
  worldStateRevision,
} from './message.js';

const NATIVE_LIBRARY_NAME = 'world_state_napi';
const NATIVE_CLASS_NAME = 'WorldState';

// small extension to pack an NodeJS Fr instance to a representation that the C++ code can understand
// this only works for writes. Unpacking from C++ can't create Fr instances because the data is passed
// as raw, untagged, buffers. On the NodeJS side we don't know what the buffer represents
// Adding a tag would be a solution, but it would have to be done on both sides and it's unclear where else
// C++ fr instances are sent/received/stored.
addExtension({
  Class: Fr,
  write: fr => fr.toBuffer(),
});

const ROLLUP_ADDRESS_FILE = 'rollup_address';

export interface NativeInstance {
  call(msg: Buffer | Uint8Array): Promise<any>;
}

export class NativeWorldStateService implements MerkleTreeDb, MerkleTreeAdminDb {
  private nextMessageId = 1;
  private initialHeader: Header | undefined;

  private encoder = new Encoder({
    // always encode JS objects as MessagePack maps
    // this makes it compatible with other MessagePack decoders
    useRecords: false,
    int64AsType: 'bigint',
  });

  private decoder = new Decoder({
    useRecords: false,
    int64AsType: 'bigint',
  });

  protected constructor(
    private instance: NativeInstance | undefined,
    private queue: SerialQueue,
    private forkId: number = 0,
    private blockNumber?: number,
    private log = createDebugLogger('aztec:world-state:database'),
  ) {}

  static async create(
    rollupAddress: EthAddress,
    dataDir: string,
    log = createDebugLogger('aztec:world-state:database'),
  ): Promise<NativeWorldStateService> {
    const rollupAddressFile = join(dataDir, ROLLUP_ADDRESS_FILE);
    const currentRollupStr = await readFile(rollupAddressFile, 'utf8').catch(() => undefined);
    const currentRollupAddress = currentRollupStr ? EthAddress.fromString(currentRollupStr) : undefined;

    if (currentRollupAddress && !rollupAddress.equals(currentRollupAddress)) {
      log.warn('Rollup address changed, deleting database');
      await rm(dataDir, { recursive: true, force: true });
    }

    await mkdir(dataDir, { recursive: true });
    await writeFile(rollupAddressFile, rollupAddress.toString(), 'utf8');

    const library = bindings(NATIVE_LIBRARY_NAME);
    const instance = new library[NATIVE_CLASS_NAME](join(dataDir, 'trees'));
    const queue = new SerialQueue();
    queue.start();
    const worldState = new NativeWorldStateService(instance, queue, undefined, undefined, log);
    await worldState.init();
    return worldState;
  }

  static async tmp(rollupAddress = EthAddress.ZERO): Promise<NativeWorldStateService> {
    const log = createDebugLogger('aztec:world-state:database');
    const dataDir = await mkdtemp(join(tmpdir(), 'aztec-world-state-'));
    log.verbose(`Created temporary world state database: ${dataDir}`);
    process.on('beforeExit', () => {
      rmSync(dataDir, { recursive: true, force: true });
      log.verbose(`Deleted temporary world state database: ${dataDir}`);
    });

    return NativeWorldStateService.create(rollupAddress, dataDir, log);
  }

  protected async init() {
    this.initialHeader = await this.buildInitialHeader();

    // validate the initial state
    if (this.forkId === 0 && this.blockNumber === undefined) {
      const archive = await this.getTreeInfo(MerkleTreeId.ARCHIVE, false);
      if (archive.size === 0n) {
        throw new Error("Archive tree can't be empty");
      }

      // the initial header _must_ be the first element in the archive tree
      // if this assertion fails, check that the hashing done in Header in yarn-project matches the initial header hash done in world_state.cpp
      const initialHeaderIndex = await this.findLeafIndex(MerkleTreeId.ARCHIVE, this.initialHeader.hash(), false);
      assert.strictEqual(initialHeaderIndex, 0n, 'Invalid initial archive state');
    }
  }

  public getLatest(): Promise<MerkleTreeAdminOperations> {
    return Promise.resolve(new MerkleTreeAdminOperationsFacade(this, true));
  }

  public getCommitted(): Promise<MerkleTreeAdminOperations> {
    return Promise.resolve(new MerkleTreeAdminOperationsFacade(this, false));
  }

  public async getSnapshot(blockNumber: number): Promise<MerkleTreeAdminOperations> {
    const ws = new NativeWorldStateService(this.instance, this.queue, 0, blockNumber);
    await ws.init();
    return new MerkleTreeAdminOperationsFacade(ws, false);
  }

  async buildInitialHeader(): Promise<Header> {
    const state = await this.getInitialStateReference();
    return Header.empty({ state });
  }

  public getInitialHeader(): Header {
    return this.initialHeader!;
  }

  async appendLeaves<ID extends MerkleTreeId>(treeId: ID, leaves: MerkleTreeLeafType<ID>[]): Promise<void> {
    await this.call(WorldStateMessageType.APPEND_LEAVES, {
      leaves: leaves.map(leaf => leaf as any),
      forkId: this.forkId,
      treeId,
    });
  }

  async batchInsert<TreeHeight extends number, SubtreeSiblingPathHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    rawLeaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>> {
    const leaves = rawLeaves.map((leaf: Buffer) => hydrateLeaf(treeId, leaf)).map(serializeLeaf);
    const resp = await this.call(WorldStateMessageType.BATCH_INSERT, {
      leaves,
      treeId,
      forkId: this.forkId,
      subtreeDepth: subtreeHeight,
    });

    return {
      newSubtreeSiblingPath: new SiblingPath<SubtreeSiblingPathHeight>(
        resp.subtree_path.length as any,
        resp.subtree_path,
      ),
      sortedNewLeaves: resp.sorted_leaves
        .map(([leaf]) => leaf)
        .map(deserializeLeafValue)
        .map(serializeToBuffer),
      sortedNewLeavesIndexes: resp.sorted_leaves.map(([, index]) => index),
      lowLeavesWitnessData: resp.low_leaf_witness_data.map(data => ({
        index: BigInt(data.index),
        leafPreimage: deserializeIndexedLeaf(data.leaf),
        siblingPath: new SiblingPath<TreeHeight>(data.path.length as any, data.path),
      })),
    };
  }

  async commit(): Promise<void> {
    if (this.forkId) {
      throw new Error('Committing a fork is forbidden');
    }
    await this.call(WorldStateMessageType.COMMIT, void 0);
  }

  findLeafIndex(
    treeId: MerkleTreeId,
    value: MerkleTreeLeafType<MerkleTreeId>,
    includeUncommitted: boolean,
  ): Promise<bigint | undefined> {
    return this.findLeafIndexAfter(treeId, value, 0n, includeUncommitted);
  }

  async findLeafIndexAfter(
    treeId: MerkleTreeId,
    leaf: MerkleTreeLeafType<MerkleTreeId>,
    startIndex: bigint,
    includeUncommitted: boolean,
  ): Promise<bigint | undefined> {
    const index = await this.call(WorldStateMessageType.FIND_LEAF_INDEX, {
      leaf: serializeLeaf(hydrateLeaf(treeId, leaf)),
      revision: this.buildWorldStateRevision(includeUncommitted),
      treeId,
      startIndex,
    });

    if (typeof index === 'number' || typeof index === 'bigint') {
      return BigInt(index);
    } else {
      return undefined;
    }
  }

  async getLeafPreimage(
    treeId: IndexedTreeId,
    leafIndex: bigint,
    args: boolean,
  ): Promise<IndexedTreeLeafPreimage | undefined> {
    const resp = await this.call(WorldStateMessageType.GET_LEAF_PREIMAGE, {
      leafIndex,
      revision: this.buildWorldStateRevision(args),
      treeId,
    });

    return resp ? deserializeIndexedLeaf(resp) : undefined;
  }

  async getLeafValue(
    treeId: MerkleTreeId,
    leafIndex: bigint,
    includeUncommitted: boolean,
  ): Promise<MerkleTreeLeafType<MerkleTreeId> | undefined> {
    const resp = await this.call(WorldStateMessageType.GET_LEAF_VALUE, {
      leafIndex,
      revision: this.buildWorldStateRevision(includeUncommitted),
      treeId,
    });

    if (!resp) {
      return undefined;
    }

    const leaf = deserializeLeafValue(resp);
    if (leaf instanceof Fr) {
      return leaf;
    } else {
      return leaf.toBuffer();
    }
  }

  async getPreviousValueIndex(
    treeId: IndexedTreeId,
    value: bigint,
    includeUncommitted: boolean,
  ): Promise<{ index: bigint; alreadyPresent: boolean } | undefined> {
    const resp = await this.call(WorldStateMessageType.FIND_LOW_LEAF, {
      key: new Fr(value),
      revision: this.buildWorldStateRevision(includeUncommitted),
      treeId,
    });
    return {
      alreadyPresent: resp.alreadyPresent,
      index: BigInt(resp.index),
    };
  }

  async getSiblingPath(
    treeId: MerkleTreeId,
    leafIndex: bigint,
    includeUncommitted: boolean,
  ): Promise<SiblingPath<number>> {
    const siblingPath = await this.call(WorldStateMessageType.GET_SIBLING_PATH, {
      leafIndex,
      revision: this.buildWorldStateRevision(includeUncommitted),
      treeId,
    });

    return new SiblingPath(siblingPath.length, siblingPath);
  }

  async getStateReference(includeUncommitted: boolean): Promise<StateReference> {
    const resp = await this.call(WorldStateMessageType.GET_STATE_REFERENCE, {
      revision: this.buildWorldStateRevision(includeUncommitted),
    });

    return new StateReference(
      treeStateReferenceToSnapshot(resp.state[MerkleTreeId.L1_TO_L2_MESSAGE_TREE]),
      new PartialStateReference(
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NOTE_HASH_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NULLIFIER_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.PUBLIC_DATA_TREE]),
      ),
    );
  }

  async getInitialStateReference(): Promise<StateReference> {
    const resp = await this.call(WorldStateMessageType.GET_INITIAL_STATE_REFERENCE, void 0);

    return new StateReference(
      treeStateReferenceToSnapshot(resp.state[MerkleTreeId.L1_TO_L2_MESSAGE_TREE]),
      new PartialStateReference(
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NOTE_HASH_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NULLIFIER_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.PUBLIC_DATA_TREE]),
      ),
    );
  }

  async getTreeInfo(treeId: MerkleTreeId, includeUncommitted: boolean): Promise<TreeInfo> {
    const resp = await this.call(WorldStateMessageType.GET_TREE_INFO, {
      treeId: treeId,
      revision: this.buildWorldStateRevision(includeUncommitted),
    });

    return {
      depth: resp.depth,
      root: resp.root,
      size: BigInt(resp.size),
      treeId,
    };
  }

  async handleL2BlockAndMessages(l2Block: L2Block, l1ToL2Messages: Fr[]): Promise<HandleL2BlockAndMessagesResult> {
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

    return await this.call(WorldStateMessageType.SYNC_BLOCK, {
      blockHeaderHash: l2Block.header.hash(),
      paddedL1ToL2Messages: paddedL1ToL2Messages.map(serializeLeaf),
      paddedNoteHashes: paddedNoteHashes.map(serializeLeaf),
      paddedNullifiers: paddedNullifiers.map(serializeLeaf),
      batchesOfPaddedPublicDataWrites: batchesOfPaddedPublicDataWrites.map(batch => batch.map(serializeLeaf)),
      blockStateRef: blockStateReference(l2Block.header.state),
    });
  }

  async rollback(): Promise<void> {
    await this.call(WorldStateMessageType.ROLLBACK, void 0);
  }

  async updateArchive(header: Header): Promise<void> {
    await this.call(WorldStateMessageType.UPDATE_ARCHIVE, {
      forkId: this.forkId,
      blockHeaderHash: header.hash().toBuffer(),
      blockStateRef: blockStateReference(header.state),
    });
  }

  async closeRootDatabase(): Promise<void> {
    if (this.forkId || this.blockNumber) {
      throw new Error('Closing a fork or a snapshot or fork is forbidden');
    }

    await this.call(WorldStateMessageType.CLOSE, void 0);
    this.instance = undefined;
  }

  private call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T],
  ): Promise<WorldStateResponse[T]> {
    return this.queue.put(async () => {
      if (!this.instance) {
        throw new Error('NativeWorldStateService is stopped');
      }

      if (body) {
        let data: Record<string, any> = {};
        if ('treeId' in body) {
          data['treeId'] = MerkleTreeId[body.treeId];
        }

        if ('revision' in body) {
          data = { ...data, ...body.revision };
        }

        if ('forkId' in body) {
          data['forkId'] = body.forkId;
        }

        if ('blockNumber' in body) {
          data['blockNumber'] = body.blockNumber;
        }

        this.log.debug(`Calling ${WorldStateMessageType[messageType]} on ${fmtLogData(data)}`);
      } else {
        this.log.debug(`Calling ${WorldStateMessageType[messageType]}`);
      }

      const request = new TypedMessage(messageType, new MessageHeader({ messageId: this.nextMessageId++ }), body);

      const encodedRequest = this.encoder.encode(request);
      const encodedResponse = await this.instance.call(encodedRequest);

      const buf = Buffer.isBuffer(encodedResponse)
        ? encodedResponse
        : isAnyArrayBuffer(encodedResponse)
        ? Buffer.from(encodedResponse)
        : encodedResponse;

      if (!Buffer.isBuffer(buf)) {
        throw new TypeError(
          'Invalid encoded response: expected Buffer or ArrayBuffer, got ' +
            (encodedResponse === null ? 'null' : typeof encodedResponse),
        );
      }

      const decodedResponse = this.decoder.unpack(buf);
      if (!TypedMessage.isTypedMessageLike(decodedResponse)) {
        throw new TypeError(
          'Invalid response: expected TypedMessageLike, got ' +
            (decodedResponse === null ? 'null' : typeof decodedResponse),
        );
      }

      const response = TypedMessage.fromMessagePack<T, WorldStateResponse[T]>(decodedResponse);

      if (response.header.requestId !== request.header.messageId) {
        throw new Error(
          'Response ID does not match request: ' + response.header.requestId + ' != ' + request.header.messageId,
        );
      }

      if (response.msgType !== messageType) {
        throw new Error('Invalid response message type: ' + response.msgType + ' != ' + messageType);
      }

      return response.value;
    });
  }

  public async stop(): Promise<void> {
    if (this.forkId !== 0 || this.blockNumber !== undefined) {
      throw new Error('Stopping a fork or a snapshot is forbidden');
    }

    // only the canonical fork can stop the queue
    await this.queue.end();
  }

  public async delete(): Promise<void> {
    if (this.forkId !== undefined) {
      await this.call(WorldStateMessageType.DELETE_FORK, { forkId: this.forkId });
    }
  }

  public async fork(): Promise<MerkleTreeAdminDb> {
    const resp = await this.call(WorldStateMessageType.CREATE_FORK, { blockNumber: 0 });
    const ws = new NativeWorldStateService(this.instance, this.queue, resp.forkId, 0);
    await ws.init();
    return ws;
  }

  private buildWorldStateRevision(includeUncommitted: boolean) {
    return worldStateRevision(includeUncommitted, this.forkId, this.blockNumber);
  }
}

function hydrateLeaf<ID extends MerkleTreeId>(treeId: ID, leaf: Fr | Buffer) {
  if (leaf instanceof Fr) {
    return leaf;
  } else if (treeId === MerkleTreeId.NULLIFIER_TREE) {
    return NullifierLeaf.fromBuffer(leaf);
  } else if (treeId === MerkleTreeId.PUBLIC_DATA_TREE) {
    return PublicDataTreeLeaf.fromBuffer(leaf);
  } else {
    return Fr.fromBuffer(leaf);
  }
}

function serializeLeaf(leaf: Fr | NullifierLeaf | PublicDataTreeLeaf): SerializedLeafValue {
  if (leaf instanceof Fr) {
    return leaf.toBuffer();
  } else if (leaf instanceof NullifierLeaf) {
    return { value: leaf.nullifier.toBuffer() };
  } else {
    return { value: leaf.value.toBuffer(), slot: leaf.slot.toBuffer() };
  }
}

function deserializeLeafValue(leaf: SerializedLeafValue): Fr | NullifierLeaf | PublicDataTreeLeaf {
  if (Buffer.isBuffer(leaf)) {
    return Fr.fromBuffer(leaf);
  } else if ('slot' in leaf) {
    return new PublicDataTreeLeaf(Fr.fromBuffer(leaf.slot), Fr.fromBuffer(leaf.value));
  } else {
    return new NullifierLeaf(Fr.fromBuffer(leaf.value));
  }
}

function deserializeIndexedLeaf(leaf: SerializedIndexedLeaf): IndexedTreeLeafPreimage {
  if ('slot' in leaf.value) {
    return new PublicDataTreeLeafPreimage(
      Fr.fromBuffer(leaf.value.slot),
      Fr.fromBuffer(leaf.value.value),
      Fr.fromBuffer(leaf.nextValue),
      BigInt(leaf.nextIndex),
    );
  } else if ('value' in leaf.value) {
    return new NullifierLeafPreimage(
      Fr.fromBuffer(leaf.value.value),
      Fr.fromBuffer(leaf.nextValue),
      BigInt(leaf.nextIndex),
    );
  } else {
    throw new Error('Invalid leaf type');
  }
}
