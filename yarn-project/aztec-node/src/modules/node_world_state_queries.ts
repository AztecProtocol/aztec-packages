import { ARCHIVE_HEIGHT, type L1_TO_L2_MSG_TREE_HEIGHT, type NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { BlockNumber, type CheckpointNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import { chunkBy } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { MembershipWitness, type SiblingPath } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockHash,
  type BlockParameter,
  type DataInBlock,
  type L2BlockSource,
  inspectBlockParameter,
} from '@aztec/stdlib/block';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { InboxLeaf, type L1ToL2MessageSource, type L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import {
  MerkleTreeId,
  type NullifierLeafPreimage,
  NullifierMembershipWitness,
  type PublicDataTreeLeafPreimage,
  PublicDataWitness,
} from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { normalizeBlockParameter } from './block_parameter.js';

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
    const referenceBlockNumber = await this.resolveBlockNumber(referenceBlock);
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
    return messageIndex !== undefined ? InboxLeaf.checkpointNumberFromIndex(messageIndex) : undefined;
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
   * Returns an instance of MerkleTreeOperations having first ensured the world state is fully synched
   * @param block - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @returns An instance of a committed MerkleTreeOperations
   */
  public async getWorldState(block: BlockParameter) {
    const query = normalizeBlockParameter(block);

    // When the request anchors on a specific block hash, resolve it against the archiver up front and
    // drive the world-state sync to that exact block number and hash. Resolving against the archiver
    // first fails fast with a clear reorg error if the hash is unknown, and passing the hash to the
    // synchronizer makes the sync reorg-aware: it barriers until the archive-tree commit for that block
    // has landed and verifies it matches the requested fork, instead of syncing to bare latest height
    // and then racing the snapshot read below against an in-flight archive-tree write.
    const requestedHash = 'hash' in query ? query.hash : undefined;
    const anchorBlockNumber = requestedHash !== undefined ? await this.resolveBlockNumber(query) : undefined;

    let blockSyncedTo: BlockNumber = BlockNumber.ZERO;
    try {
      // Attempt to sync the world state if necessary
      blockSyncedTo = await this.#syncWorldState(anchorBlockNumber, requestedHash);
    } catch (err) {
      this.log.error(`Error getting world state: ${err}`);
    }

    if ('tag' in query && query.tag === 'proposed') {
      this.log.debug(`Using committed db for latest block, world state synced upto ${blockSyncedTo}`);
      return this.worldStateSynchronizer.getCommitted();
    }

    const blockNumber = anchorBlockNumber ?? (await this.resolveBlockNumber(query));

    // Check it's within world state sync range
    if (blockNumber > blockSyncedTo) {
      throw new Error(
        `Queried block ${inspectBlockParameter(block)} not yet synced by the node (node is synced upto ${blockSyncedTo}).`,
      );
    }
    this.log.debug(`Using snapshot for block ${blockNumber}, world state synced upto ${blockSyncedTo}`);

    const snapshot = this.worldStateSynchronizer.getSnapshot(blockNumber);

    // Double-check world-state synced to the same block hash as was requested.
    // Block 0 is skipped: the snapshot returned by `getSnapshot(0)` is the *pre*-genesis archive
    // (size 0), so leaf 0 is not yet inserted from that snapshot's view even though block 0's hash
    // does live at archive index 0 in the committed tree. The genesis hash is already validated by
    // the archiver when it resolves the hash query to block number 0.
    if (requestedHash !== undefined && blockNumber !== BlockNumber.ZERO) {
      const blockHash = await snapshot.getLeafValue(MerkleTreeId.ARCHIVE, BigInt(blockNumber));
      if (!blockHash || !requestedHash.equals(blockHash)) {
        throw new Error(
          `Block hash ${requestedHash.toString()} not found in world state at block number ${blockNumber} (world state has ${blockHash?.toString() ?? 'no hash'} at that index, genesis header hash is ${this.blockSource.getGenesisBlockHash().toString()}). If the node API has been queried with anchor block hash possibly a reorg has occurred.`,
        );
      }
    }

    return snapshot;
  }

  /** Resolves any {@link BlockParameter} variant to a concrete block number. */
  public async resolveBlockNumber(block: BlockParameter): Promise<BlockNumber> {
    const query = normalizeBlockParameter(block);
    const blockNumber = await this.blockSource.getBlockNumber(query);
    if (blockNumber === undefined) {
      if ('hash' in query) {
        throw new Error(
          `Block hash ${query.hash.toString()} not found when querying world state. If the node API has been queried with anchor block hash possibly a reorg has occurred.`,
        );
      }
      if ('archive' in query) {
        throw new Error(`Block with archive ${query.archive.toString()} not found.`);
      }
      throw new Error(`Block not found for ${inspectBlockParameter(block)}.`);
    }
    return blockNumber;
  }

  /**
   * Ensure the world state is synced.
   * @param targetBlockNumber - Block to sync up to. Defaults to the latest block known to the archiver.
   * @param blockHash - If provided, the synchronizer verifies the block at `targetBlockNumber` matches this
   * hash, resyncing (and so detecting reorgs) if it does not yet match or has been reorged away.
   * @returns A promise that fulfils once the world state is synced
   */
  async #syncWorldState(targetBlockNumber?: BlockNumber, blockHash?: BlockHash): Promise<BlockNumber> {
    const target = targetBlockNumber ?? (await this.blockSource.getBlockNumber());
    return await this.worldStateSynchronizer.syncImmediate(target, blockHash);
  }
}
