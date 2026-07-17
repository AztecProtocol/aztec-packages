import { ARCHIVE_HEIGHT, type L1_TO_L2_MSG_TREE_HEIGHT, type NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { BlockNumber, type CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { MembershipWitness, type SiblingPath } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  type BlockParameter,
  BlockTag,
  type DataInBlock,
  type L2Block,
  type L2Tips,
  type NormalizedBlockParameter,
  inspectBlockParameter,
} from '@aztec/stdlib/block';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { type L1RollupConstants, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import {
  type AztecNode,
  type BlockIncludeOptions,
  type BlockResponse,
  type BlocksIncludeOptions,
  l1PublishInfoFromL1PublishedData,
} from '@aztec/stdlib/interfaces/client';
import type { MerkleTreeReadOperations } from '@aztec/stdlib/interfaces/server';
import type { LogResult, PrivateLogsQuery, PublicLogsQuery } from '@aztec/stdlib/logs';
import { InboxLeaf, type L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import {
  MerkleTreeId,
  type NullifierLeafPreimage,
  NullifierMembershipWitness,
  type PublicDataTreeLeafPreimage,
  PublicDataWitness,
} from '@aztec/stdlib/trees';
import {
  type GetTxReceiptOptions,
  type IndexedTxEffect,
  MinedTxReceipt,
  type MinedTxStatus,
  PendingTxReceipt,
  type TxHash,
  type TxReceipt,
  TxStatus,
} from '@aztec/stdlib/tx';

import type { TXEArchiver } from './archiver.js';
import type { TXESynchronizer } from './synchronizer.js';
import { UnimplementedAztecNode } from './unimplemented_node.js';

const VERSION = 1;
const CHAIN_ID = 1;

/**
 * Minimal {@link AztecNode} implementation serving the read-side queries that the PXE services instantiated by the
 * TXE perform, directly against the TXE's own archiver and world state. Block production doesn't go through this
 * node (see `TXEStateMachine.handleL2Block`), so everything server-side (p2p, sequencing, proving, validation) is
 * inherited as a throwing stub from {@link UnimplementedAztecNode}.
 */
export class TXENode extends UnimplementedAztecNode implements AztecNode {
  constructor(
    private readonly archiver: TXEArchiver,
    private readonly synchronizer: TXESynchronizer,
  ) {
    super();
  }

  public override async findLeavesIndexes(
    referenceBlock: BlockParameter,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(DataInBlock<bigint> | undefined)[]> {
    const committedDb = await this.#getWorldState(referenceBlock);
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

  public override async getNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const db = await this.#getWorldState(referenceBlock);
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

  public override async getLowNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const committedDb = await this.#getWorldState(referenceBlock);
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

  public override async getPublicDataWitness(
    referenceBlock: BlockParameter,
    leafSlot: Fr,
  ): Promise<PublicDataWitness | undefined> {
    const committedDb = await this.#getWorldState(referenceBlock);
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

  public override async getBlockHashMembershipWitness(
    referenceBlock: BlockParameter,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    // The Noir circuit checks the archive membership proof against `anchor_block_header.last_archive.root`,
    // which is the archive tree root BEFORE the anchor block was added (i.e. the state after block N-1).
    // So we need the world state at block N-1, not block N, to produce a sibling path matching that root.
    const referenceBlockNumber = await this.#resolveBlockNumber(normalizeBlockParameter(referenceBlock));
    if (referenceBlockNumber === BlockNumber.ZERO) {
      // Block 0 (the initial block) has an empty archive, so no membership witness can exist.
      return undefined;
    }
    const committedDb = this.synchronizer.getSnapshot(BlockNumber(referenceBlockNumber - 1));
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.ARCHIVE>(MerkleTreeId.ARCHIVE, [blockHash]);
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public override async getNoteHashMembershipWitness(
    referenceBlock: BlockParameter,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    const committedDb = await this.#getWorldState(referenceBlock);
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.NOTE_HASH_TREE>(
      MerkleTreeId.NOTE_HASH_TREE,
      [noteHash],
    );
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public override async getL1ToL2MessageMembershipWitness(
    referenceBlock: BlockParameter,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    const db = await this.#getWorldState(referenceBlock);
    const [witness] = await db.findSiblingPaths(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, [l1ToL2Message]);
    if (!witness) {
      return undefined;
    }

    return [witness.index, witness.path];
  }

  public override async getL1ToL2MessageCheckpoint(l1ToL2Message: Fr): Promise<CheckpointNumber | undefined> {
    const messageIndex = await this.archiver.getL1ToL2MessageIndex(l1ToL2Message);
    return messageIndex !== undefined ? InboxLeaf.checkpointNumberFromIndex(messageIndex) : undefined;
  }

  public override getL2ToL1MembershipWitness(): Promise<L2ToL1MembershipWitness | undefined> {
    return this.archiver.getL2ToL1MembershipWitness();
  }

  public override getBlockNumber(): Promise<BlockNumber> {
    // Every chain tip is the latest block in the TXE, so the tag can be ignored.
    return this.archiver.getBlockNumber();
  }

  public override getChainTips(): Promise<L2Tips> {
    return this.archiver.getL2Tips();
  }

  public override getL1Constants(): Promise<L1RollupConstants> {
    return this.archiver.getL1Constants();
  }

  public override async getBlock<Opts extends BlockIncludeOptions = {}>(
    param: BlockParameter,
    options: Opts = {} as Opts,
  ): Promise<BlockResponse<Opts> | undefined> {
    const query = normalizeBlockParameter(param);
    if (options.includeTransactions) {
      const block = await this.archiver.getBlock(query);
      return block && ((await this.#blockResponseFromL2Block(block, options)) as BlockResponse<Opts>);
    }
    const data = await this.archiver.getBlockData(query);
    return data && ((await this.#blockResponseFromBlockData(data, options)) as BlockResponse<Opts>);
  }

  public override getBlockData(param: BlockParameter): Promise<BlockData | undefined> {
    return this.archiver.getBlockData(normalizeBlockParameter(param));
  }

  public override async getBlocks<Opts extends BlocksIncludeOptions = {}>(
    from: BlockNumber,
    limit: number,
    options: Opts = {} as Opts,
  ): Promise<BlockResponse<Opts>[]> {
    if (options.includeTransactions) {
      const blocks = await this.archiver.getBlocks({ from, limit, onlyCheckpointed: !!options.onlyCheckpointed });
      return (await Promise.all(
        blocks.map(block => this.#blockResponseFromL2Block(block, options)),
      )) as BlockResponse<Opts>[];
    }
    const dataItems = await this.archiver.getBlocksData({ from, limit, onlyCheckpointed: !!options.onlyCheckpointed });
    return (await Promise.all(
      dataItems.map(data => this.#blockResponseFromBlockData(data, options)),
    )) as BlockResponse<Opts>[];
  }

  public override getVersion(): Promise<number> {
    return Promise.resolve(VERSION);
  }

  public override getChainId(): Promise<number> {
    return Promise.resolve(CHAIN_ID);
  }

  public override getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]> {
    return this.archiver.getPrivateLogsByTags(query);
  }

  public override getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]> {
    return this.archiver.getPublicLogsByTags(query);
  }

  public override async getTxReceipt<TGetTxReceiptOptions extends GetTxReceiptOptions = {}>(
    txHash: TxHash,
    options?: TGetTxReceiptOptions,
  ): Promise<TxReceipt<TGetTxReceiptOptions>> {
    const indexed = await this.archiver.getTxEffect(txHash);
    let receipt: TxReceipt;
    if (indexed) {
      receipt = await this.#assembleMinedReceipt(indexed, options);
    } else {
      if (options?.includePendingTx) {
        // The pending tx itself cannot be served (there is no tx pool), so fail loudly rather than return a
        // receipt whose type promises a tx that is silently undefined.
        throw new Error('TXE node does not support "includePendingTx"');
      }
      // The TXE has no tx pool, but tagging sync probes arbitrary tx hashes and expects unknown ones to resolve to a
      // pending receipt rather than a dropped one (the previous node-backed setup reported every tx as known to p2p).
      receipt = new PendingTxReceipt(txHash, undefined);
    }
    return receipt;
  }

  public override getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.archiver.getTxEffect(txHash);
  }

  public override async getPublicStorageAt(
    referenceBlock: BlockParameter,
    contract: AztecAddress,
    slot: Fr,
  ): Promise<Fr> {
    const committedDb = await this.#getWorldState(referenceBlock);
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

  public override getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.archiver.getContractClass(id);
  }

  public override async getContract(
    address: AztecAddress,
    referenceBlock: BlockParameter = 'latest',
  ): Promise<ContractInstanceWithAddress | undefined> {
    const blockData = await this.getBlockData(referenceBlock);
    if (!blockData) {
      throw new Error(
        `Reference block ${inspectBlockParameter(referenceBlock)} not found when querying contract ${address}.`,
      );
    }
    return this.archiver.getContract(address, blockData.header.globalVariables.timestamp);
  }

  /**
   * Returns committed world state at the requested block. The TXE is single-writer with no reorgs and world state
   * is updated synchronously with the archiver (see `TXEStateMachine.handleL2Block`), so no syncing or fork
   * verification is needed: tags resolve to the committed db and concrete blocks to a snapshot.
   */
  async #getWorldState(referenceBlock: BlockParameter): Promise<MerkleTreeReadOperations> {
    const query = normalizeBlockParameter(referenceBlock);
    if ('tag' in query) {
      // Every tag ('proposed', 'checkpointed', 'proven', 'finalized') is the latest block in the TXE.
      return this.synchronizer.getCommitted();
    }
    const blockNumber = await this.#resolveBlockNumber(query);
    return this.synchronizer.getSnapshot(blockNumber);
  }

  /**
   * Resolves any {@link NormalizedBlockParameter} variant to a concrete block number via the archiver. Numeric
   * queries go through the archiver too, so a reference to a block that doesn't exist fails here instead of
   * reaching the native world state.
   */
  async #resolveBlockNumber(query: NormalizedBlockParameter): Promise<BlockNumber> {
    const blockNumber = await this.archiver.getBlockNumber(query);
    if (blockNumber === undefined) {
      throw new Error(`Block not found for ${inspectBlockParameter(query)} when resolving query.`);
    }
    return blockNumber;
  }

  #blockResponseFromBlockData(data: BlockData, options: BlockIncludeOptions): Promise<BlockResponse> {
    const response: BlockResponse = {
      header: data.header,
      archive: data.archive,
      hash: data.blockHash,
      checkpointNumber: data.checkpointNumber,
      indexWithinCheckpoint: data.indexWithinCheckpoint,
      number: data.header.getBlockNumber(),
    };
    return this.#withCheckpointContext(response, options);
  }

  async #blockResponseFromL2Block(block: L2Block, options: BlockIncludeOptions): Promise<BlockResponse> {
    const response: BlockResponse = {
      header: block.header,
      archive: block.archive,
      hash: await block.hash(),
      checkpointNumber: block.checkpointNumber,
      indexWithinCheckpoint: block.indexWithinCheckpoint,
      number: block.number,
    };
    response.body = block.body;
    return this.#withCheckpointContext(response, options);
  }

  /** Attaches L1 publish info and attestations from the checkpoint store when the options request them. */
  async #withCheckpointContext(response: BlockResponse, options: BlockIncludeOptions): Promise<BlockResponse> {
    if (options.includeL1PublishInfo || options.includeAttestations) {
      const checkpoint = await this.archiver.getCheckpointData({ number: response.checkpointNumber });
      if (options.includeL1PublishInfo) {
        response.l1 = l1PublishInfoFromL1PublishedData(checkpoint?.l1);
      }
      if (options.includeAttestations) {
        response.attestations = checkpoint?.attestations ?? [];
      }
    }
    return response;
  }

  /**
   * Assembles a {@link MinedTxReceipt} from a raw {@link IndexedTxEffect}, deriving the epoch from the block's slot
   * number.
   */
  async #assembleMinedReceipt(indexed: IndexedTxEffect, options?: GetTxReceiptOptions): Promise<MinedTxReceipt> {
    const blockNumber = indexed.l2BlockNumber;
    const l1Constants = await this.archiver.getL1Constants();

    const status = this.#deriveMinedStatus();
    const epochNumber = getEpochAtSlot(indexed.slotNumber, l1Constants);

    return new MinedTxReceipt(
      indexed.data.txHash,
      status,
      MinedTxReceipt.executionResultFromRevertCode(indexed.data.revertCode),
      indexed.data.transactionFee.toBigInt(),
      indexed.l2BlockHash,
      blockNumber,
      indexed.slotNumber,
      indexed.txIndexInBlock,
      epochNumber,
      options?.includeTxEffect ? indexed.data : undefined,
      /*debugLogs=*/ undefined,
    );
  }

  #deriveMinedStatus(): MinedTxStatus {
    // The TXE marks every checkpoint proven and finalized the moment it is added (see TXEArchiver.addCheckpoints
    // and getL2Tips), so a mined tx is always finalized.
    return TxStatus.FINALIZED;
  }
}

/**
 * Normalizes a {@link BlockParameter} (which may be a bare value) into a {@link NormalizedBlockParameter}
 * object form. Performs no chain-tip resolution.
 */
function normalizeBlockParameter(param: BlockParameter): NormalizedBlockParameter {
  if (BlockHash.isBlockHash(param)) {
    return { hash: param };
  }
  if (typeof param === 'number') {
    return { number: param };
  }
  if (typeof param === 'string') {
    if (BlockTag.includes(param)) {
      return { tag: param === 'latest' ? 'proposed' : param };
    }
    throw new BadRequestError(`Invalid BlockParameter tag: ${param}`);
  }
  if (typeof param === 'object' && param !== null) {
    if ('number' in param) {
      return { number: param.number };
    }
    if ('hash' in param) {
      return { hash: param.hash };
    }
    if ('archive' in param) {
      return { archive: param.archive };
    }
    if ('tag' in param) {
      if (BlockTag.includes(param.tag)) {
        return { tag: param.tag };
      }
      throw new BadRequestError(`Invalid BlockParameter tag: ${param.tag}`);
    }
  }
  throw new BadRequestError(`Invalid BlockParameter: ${JSON.stringify(param)}`);
}
