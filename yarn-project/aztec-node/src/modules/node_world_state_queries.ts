import {
  ARCHIVE_HEIGHT,
  INITIAL_L2_BLOCK_NUM,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  type NOTE_HASH_TREE_HEIGHT,
} from '@aztec/constants';
import { BlockNumber, type CheckpointNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import { chunkBy } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { MembershipWitness, type SiblingPath } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  type BlockHash,
  type BlockParameter,
  type DataInBlock,
  type L2BlockSource,
  type NormalizedBlockParameter,
  inspectBlockParameter,
} from '@aztec/stdlib/block';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource, L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import {
  MerkleTreeId,
  type NullifierLeafPreimage,
  NullifierMembershipWitness,
  type PublicDataTreeLeafPreimage,
  PublicDataWitness,
} from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';
import { WorldStateSynchronizerError } from '@aztec/world-state';

import { normalizeBlockParameter } from './block_parameter.js';

/** Attempts at resolving a query and syncing world state to it before giving up (see {@link NodeWorldStateQueries.getWorldState}). */
const WORLD_STATE_SYNC_ATTEMPTS = 3;

/** Delay between world-state sync attempts. */
const WORLD_STATE_SYNC_RETRY_DELAY_MS = 100;

/** Dependencies required to build a {@link NodeWorldStateQueries}. */
export interface NodeWorldStateQueriesDeps {
  worldStateSynchronizer: WorldStateSynchronizer;
  blockSource: L2BlockSource;
  l1ToL2MessageSource: L1ToL2MessageSource;
  log?: Logger;
}

/**
 * Serves the node's Merkle-tree and membership-witness queries against committed world-state at a
 * requested block. Extracted from `AztecNodeService` so the block-resolution and reorg-aware sync logic
 * can be unit-tested without standing up the whole node, and to keep `server.ts` smaller.
 */
export class NodeWorldStateQueries {
  private readonly worldStateSynchronizer: WorldStateSynchronizer;
  private readonly blockSource: L2BlockSource;
  private readonly l1ToL2MessageSource: L1ToL2MessageSource;
  private readonly log: Logger;

  constructor(deps: NodeWorldStateQueriesDeps) {
    this.worldStateSynchronizer = deps.worldStateSynchronizer;
    this.blockSource = deps.blockSource;
    this.l1ToL2MessageSource = deps.l1ToL2MessageSource;
    this.log = deps.log ?? createLogger('node:world-state-queries');
  }

  public async findLeavesIndexes(
    referenceBlock: BlockParameter,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(DataInBlock<bigint> | undefined)[]> {
    const committedDb = await this.getWorldState(referenceBlock);
    const maybeIndices = await committedDb.findLeafIndices(
      treeId,
      leafValues.map(x => x.toBuffer()),
    );
    // Filter out undefined values to query block numbers only for found leaves
    const definedIndices = maybeIndices.filter(x => x !== undefined);

    // Now we find the block numbers for the defined indices
    const blockNumbers = await committedDb.getBlockNumbersForLeafIndices(treeId, definedIndices);

    // Build a map from leaf index to block number
    const indexToBlockNumber = new Map<bigint, BlockNumber>();
    for (let i = 0; i < definedIndices.length; i++) {
      const blockNumber = blockNumbers[i];
      if (blockNumber === undefined) {
        throw new Error(
          `Block number is undefined for leaf index ${definedIndices[i]} in tree ${MerkleTreeId[treeId]}`,
        );
      }
      indexToBlockNumber.set(definedIndices[i], blockNumber);
    }

    // Get unique block numbers in order to optimize num calls to getLeafValue function.
    const uniqueBlockNumbers = [...new Set(indexToBlockNumber.values())];

    // Now we obtain the block hashes from the archive tree (block number = leaf index in archive tree).
    const blockHashes = await Promise.all(
      uniqueBlockNumbers.map(blockNumber => {
        return committedDb.getLeafValue(MerkleTreeId.ARCHIVE, BigInt(blockNumber));
      }),
    );

    // Build a map from block number to block hash
    const blockNumberToHash = new Map<BlockNumber, BlockHash>();
    for (let i = 0; i < uniqueBlockNumbers.length; i++) {
      const blockHash = blockHashes[i];
      if (blockHash === undefined) {
        throw new Error(`Block hash is undefined for block number ${uniqueBlockNumbers[i]}`);
      }
      blockNumberToHash.set(uniqueBlockNumbers[i], blockHash);
    }

    // Create DataInBlock objects by combining indices, blockNumbers and blockHashes and return them.
    return maybeIndices.map(index => {
      if (index === undefined) {
        return undefined;
      }
      const blockNumber = indexToBlockNumber.get(index);
      if (blockNumber === undefined) {
        throw new Error(`Block number not found for leaf index ${index} in tree ${MerkleTreeId[treeId]}`);
      }
      const l2BlockHash = blockNumberToHash.get(blockNumber);
      if (l2BlockHash === undefined) {
        throw new Error(`Block hash not found for block number ${blockNumber}`);
      }
      return {
        l2BlockNumber: blockNumber,
        l2BlockHash,
        data: index,
      };
    });
  }

  public async getBlockHashMembershipWitness(
    referenceBlock: BlockParameter,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    // The Noir circuit checks the archive membership proof against `anchor_block_header.last_archive.root`,
    // which is the archive tree root BEFORE the anchor block was added (i.e. the state after block N-1).
    // So we need the world state at block N-1, not block N, to produce a sibling path matching that root.
    const referenceBlockNumber = await this.#resolveBlockNumber(referenceBlock);
    if (referenceBlockNumber === BlockNumber.ZERO) {
      // Block 0 (the initial block) has an empty archive, so no membership witness can exist.
      return undefined;
    }
    const committedDb = await this.getWorldState(BlockNumber(referenceBlockNumber - 1));
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.ARCHIVE>(MerkleTreeId.ARCHIVE, [blockHash]);
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public async getNoteHashMembershipWitness(
    referenceBlock: BlockParameter,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.NOTE_HASH_TREE>(
      MerkleTreeId.NOTE_HASH_TREE,
      [noteHash],
    );
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public async getL1ToL2MessageMembershipWitness(
    referenceBlock: BlockParameter,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    const db = await this.getWorldState(referenceBlock);
    const [witness] = await db.findSiblingPaths(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, [l1ToL2Message]);
    if (!witness) {
      return undefined;
    }

    // REFACTOR: Return a MembershipWitness object
    return [witness.index, witness.path];
  }

  public async getL1ToL2MessageCheckpoint(l1ToL2Message: Fr): Promise<CheckpointNumber | undefined> {
    const messageIndex = await this.l1ToL2MessageSource.getL1ToL2MessageIndex(l1ToL2Message);
    if (messageIndex === undefined) {
      return undefined;
    }
    // Post-flip, an L1-to-L2 message at compact leaf index `i` is consumed by the first block whose L1-to-L2 tree leaf
    // count exceeds `i` (leaf counts are monotonic in block number); that block's checkpoint is the answer, sourced
    // from the stored block records rather than 1024-per-checkpoint index arithmetic (AZIP-22 Fast Inbox).
    const block = await this.#findBlockConsumingL1ToL2MessageIndex(messageIndex);
    return block?.checkpointNumber;
  }

  /** Binary-searches the block records for the first block whose L1-to-L2 tree leaf count exceeds `messageIndex`. */
  async #findBlockConsumingL1ToL2MessageIndex(messageIndex: bigint): Promise<BlockData | undefined> {
    let lo: number = INITIAL_L2_BLOCK_NUM;
    let hi: number = await this.blockSource.getBlockNumber();
    let result: BlockData | undefined;
    while (lo <= hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      const block = await this.blockSource.getBlockData({ number: BlockNumber(mid) });
      if (block === undefined) {
        break;
      }
      if (BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex) > messageIndex) {
        result = block;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return result;
  }

  /**
   * Returns all the L2 to L1 messages in an epoch (empty array if the epoch is not found). The public
   * `AztecNodeService.getL2ToL1Messages` that delegates here is deprecated in favor of
   * {@link getL2ToL1MembershipWitness}.
   * @param epoch - The epoch at which to get the data.
   */
  public async getL2ToL1Messages(epoch: EpochNumber): Promise<Fr[][][][]> {
    const blocks = await this.blockSource.getBlocks({ epoch, onlyCheckpointed: true });
    const blocksInCheckpoints = chunkBy(blocks, block => block.header.globalVariables.slotNumber);
    return blocksInCheckpoints.map(slotBlocks =>
      slotBlocks.map(block => block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs)),
    );
  }

  /**
   * Returns the L2-to-L1 membership witness for a message in `txHash`. Passthrough to the
   * archiver's locally-cached resolver — see {@link Archiver.getL2ToL1MembershipWitness}.
   */
  public getL2ToL1MembershipWitness(
    txHash: TxHash,
    message: Fr,
    messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined> {
    return this.blockSource.getL2ToL1MembershipWitness(txHash, message, messageIndexInTx);
  }

  public async getNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const db = await this.getWorldState(referenceBlock);
    const [witness] = await db.findSiblingPaths(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]);
    if (!witness) {
      return undefined;
    }

    const { index, path } = witness;
    const leafPreimage = await db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index);
    if (!leafPreimage) {
      return undefined;
    }

    return new NullifierMembershipWitness(index, leafPreimage as NullifierLeafPreimage, path);
  }

  public async getLowNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const findResult = await committedDb.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!findResult) {
      return undefined;
    }
    const { index, alreadyPresent } = findResult;
    if (alreadyPresent) {
      throw new Error(
        `Cannot prove nullifier non-inclusion: nullifier ${nullifier.toBigInt()} already exists in the tree`,
      );
    }
    const preimageData = (await committedDb.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index))!;

    const siblingPath = await committedDb.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, BigInt(index));
    return new NullifierMembershipWitness(BigInt(index), preimageData as NullifierLeafPreimage, siblingPath);
  }

  async getPublicDataWitness(referenceBlock: BlockParameter, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult) {
      return undefined;
    } else {
      const preimage = (await committedDb.getLeafPreimage(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      )) as PublicDataTreeLeafPreimage;
      const path = await committedDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
      return new PublicDataWitness(lowLeafResult.index, preimage, path);
    }
  }

  public async getPublicStorageAt(referenceBlock: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr> {
    const committedDb = await this.getWorldState(referenceBlock);
    const leafSlot = await computePublicDataTreeLeafSlot(contract, slot);

    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }
    const preimage = (await committedDb.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;
    return preimage.leaf.value;
  }

  /**
   * Returns an instance of MerkleTreeOperations having first ensured the world state is synced to the requested
   * block on the correct fork. Every query variant is resolved to a concrete (block number, block hash), which is
   * threaded through both the sync and the snapshot read so a reorg that replaced the block at that height is
   * detected rather than served silently. Transient failures — a prune landing between resolution and sync, or a
   * fork flip caught at either the sync or the snapshot stage — are retried a few times, re-resolving the query
   * against the updated chain each time; terminal failures — an unknown block hash at resolution, or a block whose
   * history world state has pruned away — are thrown immediately.
   * @param block - The block parameter (block number, block hash, or tag) at which to get the data.
   * @returns An instance of a committed MerkleTreeOperations
   */
  public async getWorldState(block: BlockParameter) {
    const query = normalizeBlockParameter(block);

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#resolveWorldState(query);
      } catch (err) {
        if (attempt >= WORLD_STATE_SYNC_ATTEMPTS || !(err instanceof WorldStateSynchronizerError)) {
          throw err;
        }
        this.log.verbose(`Retrying world state query after sync failure: ${err.message}`, {
          attempt,
          block: inspectBlockParameter(block),
        });
        await sleep(WORLD_STATE_SYNC_RETRY_DELAY_MS);
      }
    }
  }

  /**
   * Resolves `query` to a concrete (block number, block hash), syncs world state to that exact fork, and returns
   * the committed db (for `proposed` queries) or the fork-verified snapshot at the resolved block.
   */
  async #resolveWorldState(query: NormalizedBlockParameter) {
    // User requests 'latest on the current fork', so the committed db is returned unverified
    if ('tag' in query && query.tag === 'proposed') {
      this.log.debug(`Using committed db for latest block`);
      await this.worldStateSynchronizer.syncImmediate();
      return this.worldStateSynchronizer.getCommitted();
    }

    // Resolve the query against the block source BEFORE syncing to a concrete (number, hash), and drive the sync to
    // that exact fork. Resolving after the sync races the block source: the resolved tip can advance past what world
    // state synced while the sync is in flight. Passing the hash makes the sync reorg-aware — it barriers until the
    // archive-tree commit for that block has landed and verifies it matches the requested fork, throwing otherwise.
    const { blockNumber, blockHash } = await this.#resolveBlockNumberAndHash(query);
    const blockSyncedTo = await this.worldStateSynchronizer.syncImmediate(blockNumber, blockHash);

    // The fork could flip between it returning and the snapshot being read, so getVerifiedSnapshot pins the
    // returned view to the resolved fork (re-resolved by the retry loop on mismatch).
    this.log.debug(`Using verified snapshot for block ${blockNumber}, world state synced upto ${blockSyncedTo}`);
    return await this.worldStateSynchronizer.getVerifiedSnapshot(blockNumber, blockHash);
  }

  /** Resolves any {@link BlockParameter} variant to its concrete `(blockNumber, blockHash)` via the block source. */
  async #resolveBlockNumberAndHash(
    query: NormalizedBlockParameter,
  ): Promise<{ blockNumber: BlockNumber; blockHash: BlockHash }> {
    const blockData = await this.blockSource.getBlockData(query);
    if (blockData === undefined) {
      this.#throwOnUndefinedBlockData(query);
    }
    return { blockNumber: blockData.header.getBlockNumber(), blockHash: blockData.blockHash };
  }

  /** Resolves any {@link BlockParameter} variant to a concrete block number. */
  async #resolveBlockNumber(block: BlockParameter): Promise<BlockNumber> {
    const blockQuery = normalizeBlockParameter(block);
    const blockNumber = await this.blockSource.getBlockNumber(blockQuery);
    if (blockNumber === undefined) {
      this.#throwOnUndefinedBlockData(blockQuery);
    }
    return blockNumber;
  }

  /**
   * Hash and archive misses are terminal (an unknown block, likely a reorg); tag and number misses are transient —
   * the block may have been pruned between the tag->number resolution and this data read, or may simply not have
   * arrived yet — and surface as {@link WorldStateSynchronizerError} so the retry loop re-resolves against the
   * current chain.
   */
  #throwOnUndefinedBlockData(query: NormalizedBlockParameter): never {
    if ('hash' in query) {
      throw new Error(
        `Block hash ${query.hash.toString()} not found when resolving query. If the node API has been queried with anchor block hash possibly a reorg has occurred.`,
      );
    }
    if ('archive' in query) {
      throw new Error(`Block with archive ${query.archive.toString()} not found when resolving query.`);
    }
    throw new WorldStateSynchronizerError(`Block not found for ${inspectBlockParameter(query)} when resolving query.`);
  }
}
