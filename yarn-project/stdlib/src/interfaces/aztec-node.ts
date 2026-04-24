import { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { type L1ContractAddresses, L1ContractAddressesSchema } from '@aztec/ethereum/l1-contract-addresses';
import {
  type BlockNumber,
  BlockNumberPositiveSchema,
  BlockNumberSchema,
  type CheckpointNumber,
  CheckpointNumberPositiveSchema,
  CheckpointNumberSchema,
  type EpochNumber,
  EpochNumberSchema,
  type SlotNumber,
} from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { createSafeJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { BlockHash } from '../block/block_hash.js';
import { type BlockParameter, BlockParameterSchema } from '../block/block_parameter.js';
import { CheckpointedL2Block } from '../block/checkpointed_l2_block.js';
import { type DataInBlock, dataInBlockSchemaFor } from '../block/in_block.js';
import { type L2Tips, L2TipsSchema } from '../block/l2_block_source.js';
import { type CheckpointData, CheckpointDataSchema } from '../checkpoint/checkpoint_data.js';
import {
  type ContractClassPublic,
  ContractClassPublicSchema,
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
  type NodeInfo,
  NodeInfoSchema,
  type ProtocolContractAddresses,
  ProtocolContractAddressesSchema,
} from '../contract/index.js';
import { ManaUsageEstimate } from '../gas/fee_math.js';
import { GasFees } from '../gas/gas_fees.js';
import { SiloedTag, Tag, TxScopedL2Log } from '../logs/index.js';
import { type LogFilter, LogFilterSchema } from '../logs/log_filter.js';
import { type ApiSchemaFor, optional, schemas } from '../schemas/schemas.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';
import { NullifierMembershipWitness } from '../trees/nullifier_membership_witness.js';
import { PublicDataWitness } from '../trees/public_data_witness.js';
import {
  BlockHeader,
  type IndexedTxEffect,
  PublicSimulationOutput,
  Tx,
  TxHash,
  TxReceipt,
  type TxValidationResult,
  TxValidationResultSchema,
  indexedTxSchema,
} from '../tx/index.js';
import { SingleValidatorStatsSchema, ValidatorsStatsSchema } from '../validators/schemas.js';
import type { SingleValidatorStats, ValidatorsStats } from '../validators/types.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';
import { type AllowedElement, AllowedElementSchema } from './allowed_element.js';
import { MAX_RPC_BLOCKS_LEN, MAX_RPC_CHECKPOINTS_LEN, MAX_RPC_LEN, MAX_RPC_TXS_LEN } from './api_limit.js';
import {
  type BlockIncludeOptions,
  BlockIncludeOptionsSchema,
  type BlockResponse,
  BlockResponseSchema,
} from './block_response.js';
import { type ChainTip, ChainTipSchema, type ChainTips, ChainTipsSchema } from './chain_tips.js';
import { type CheckpointParameter, CheckpointParameterSchema } from './checkpoint_parameter.js';
import {
  type CheckpointIncludeOptions,
  CheckpointIncludeOptionsSchema,
  type CheckpointResponse,
  CheckpointResponseSchema,
} from './checkpoint_response.js';
import {
  type GetContractClassLogsResponse,
  GetContractClassLogsResponseSchema,
  type GetPublicLogsResponse,
  GetPublicLogsResponseSchema,
} from './get_logs_response.js';
import { type WorldStateSyncStatus, WorldStateSyncStatusSchema } from './world_state.js';

/**
 * The aztec node.
 * We will probably implement the additional interfaces by means other than Aztec Node as it's currently a privacy leak
 */
export interface AztecNode {
  /**
   * Returns the sync status of the node's world state
   */
  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus>;

  /**
   * Find the indexes of the given leaves in the given tree along with a block metadata pointing to the block in which
   * the leaves were inserted.
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @param treeId - The tree to search in.
   * @param leafValues - The values to search for.
   * @returns The indices of leaves and the block metadata of a block in which the leaves were inserted.
   */
  findLeavesIndexes(
    referenceBlock: BlockParameter,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(DataInBlock<bigint> | undefined)[]>;

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  getNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @throws If the nullifier already exists in the tree, since non-inclusion cannot be proven.
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */
  getLowNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @param leafSlot - The leaf slot we try to find the witness for.
   * @returns The public data witness (if found).
   * @remarks The witness can be used to compute the current value of the public data tree leaf. If the low leaf preimage corresponds to an
   * "in range" slot, means that the slot doesn't exist and the value is 0. If the low leaf preimage corresponds to the exact slot, the current value
   * is contained in the leaf preimage.
   */
  getPublicDataWitness(referenceBlock: BlockParameter, leafSlot: Fr): Promise<PublicDataWitness | undefined>;

  /**
   * Returns a membership witness for a given block hash in the archive tree.
   *
   * Block hashes are the leaves of the archive tree. Each time a new block is added to the chain,
   * its block hash is appended as a new leaf to the archive tree. This method finds the membership
   * witness (leaf index and sibling path) for a given block hash, which can be used to prove that
   * a specific block exists in the chain's history.
   *
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data
   * (which contains the root of the archive tree in which we are searching for the block hash).
   * @param blockHash - The block hash to find in the archive tree.
   */
  getBlockHashMembershipWitness(
    referenceBlock: BlockParameter,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined>;

  /**
   * Returns a membership witness for a given note hash at a given block.
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @param noteHash - The note hash we try to find the witness for.
   */
  getNoteHashMembershipWitness(
    referenceBlock: BlockParameter,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined>;

  /**
   * Returns the index and a sibling path for a leaf in the committed l1 to l2 data tree.
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @param l1ToL2Message - The l1ToL2Message to get the index / sibling path for.
   * @returns A tuple of the index and the sibling path of the L1ToL2Message (undefined if not found).
   */
  getL1ToL2MessageMembershipWitness(
    referenceBlock: BlockParameter,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined>;

  /** Returns the L2 checkpoint number in which this L1 to L2 message becomes available, or undefined if not found. */
  getL1ToL2MessageCheckpoint(l1ToL2Message: Fr): Promise<CheckpointNumber | undefined>;

  /**
   * Returns whether an L1 to L2 message is synced by archiver.
   * @param l1ToL2Message - The L1 to L2 message to check.
   * @returns Whether the message is synced.
   * @deprecated Use `getL1ToL2MessageCheckpoint` instead. This method may return true even if the message is not ready to use.
   */
  isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean>;

  /**
   * Returns all the L2 to L1 messages in an epoch.
   * @param epoch - The epoch at which to get the data.
   * @returns A nested array of the L2 to L1 messages in each tx of each block in each checkpoint in the epoch (empty
   * array if the epoch is not found).
   */
  getL2ToL1Messages(epoch: EpochNumber): Promise<Fr[][][][]>;

  /**
   * Returns the block number at a given chain tip, or the latest proposed block number when
   * `tip` is omitted.
   */
  getBlockNumber(tip?: ChainTip): Promise<BlockNumber>;

  /**
   * Returns the checkpoint number at a given chain tip, or the latest checkpoint number when
   * `tip` is omitted.
   *
   * @remarks **Semantic foot-gun**: block-side `'proposed'` means "latest proposed block" (chain
   * head), but checkpoint-side `'proposed'` means "latest confirmed checkpoint" — pre-L1-confirm
   * checkpoints are not exposed over RPC. `'checkpointed'` on the checkpoint side is equivalent.
   */
  getCheckpointNumber(tip?: ChainTip): Promise<CheckpointNumber>;

  /** Returns the tips of the L2 chain. */
  getChainTips(): Promise<ChainTips>;

  // TODO(spl/new-rpc-api): the following methods are kept on the interface as a stop-gap because
  // `L2BlockStream` (used by PXE's block synchronizer) and `computeL2ToL1MembershipWitness` (used
  // by end-to-end tests) still consume the internal archiver shapes. Remove them when those
  // consumers are rewired to the unified `BlockResponse` / `CheckpointResponse` API.
  /** @deprecated Scheduled for removal; use `getChainTips` for public callers. */
  getL2Tips(): Promise<L2Tips>;
  /** @deprecated Scheduled for removal; use `getBlock(param).then(r => r?.header)`. */
  getBlockHeader(number: BlockNumber | 'latest'): Promise<BlockHeader | undefined>;
  /** @deprecated Scheduled for removal; use `getBlocks(from, limit, { includeL1PublishInfo: true, includeAttestations: true })`. */
  getCheckpointedBlocks(from: BlockNumber, limit: number): Promise<CheckpointedL2Block[]>;
  /** @deprecated Scheduled for removal; use `getCheckpoints(from, limit)` over an explicit checkpoint range. */
  getCheckpointsDataForEpoch(epoch: EpochNumber): Promise<CheckpointData[]>;

  /**
   * Unified block fetch. Returns the block identified by `param`, with optional fields controlled
   * by `options`.
   * @param param - A block number, block hash, archive root, chain-tip name, or object variant.
   * @param options - Narrowing options: `includeTransactions`, `includeL1PublishInfo`, `includeAttestations`.
   */
  getBlock<Opts extends BlockIncludeOptions = {}>(
    param: BlockParameter,
    options?: Opts,
  ): Promise<BlockResponse<Opts> | undefined>;

  /**
   * Returns up to `limit` blocks starting from `from`, projected to the {@link BlockResponse}
   * shape determined by `options`.
   */
  getBlocks<Opts extends BlockIncludeOptions = {}>(
    from: BlockNumber,
    limit: number,
    options?: Opts,
  ): Promise<BlockResponse<Opts>[]>;

  /**
   * Unified checkpoint fetch. Returns the checkpoint identified by `param`, with optional fields
   * controlled by `options`.
   */
  getCheckpoint<Opts extends CheckpointIncludeOptions = {}>(
    param: CheckpointParameter,
    options?: Opts,
  ): Promise<CheckpointResponse<Opts> | undefined>;

  /**
   * Returns up to `limit` checkpoints starting from `from`, projected to the
   * {@link CheckpointResponse} shape determined by `options`.
   */
  getCheckpoints<Opts extends CheckpointIncludeOptions = {}>(
    from: CheckpointNumber,
    limit: number,
    options?: Opts,
  ): Promise<CheckpointResponse<Opts>[]>;

  /**
   * Method to determine if the node is ready to accept transactions.
   * @returns - Flag indicating the readiness for tx submission.
   */
  isReady(): Promise<boolean>;

  /**
   * Returns the information about the server's node. Includes current Node version, compatible Noir version,
   * L1 chain identifier, protocol version, and L1 address of the rollup contract.
   * @returns - The node information.
   */
  getNodeInfo(): Promise<NodeInfo>;

  /**
   * Method to fetch the current min fees.
   * @returns The current min fees.
   */
  getCurrentMinFees(): Promise<GasFees>;

  /**
   * Returns predicted min fees for the current slot and next N slots.
   * Each entry accounts for the L1 gas oracle transition and congestion growth based on the
   * given mana usage estimate. Defaults to target usage (steady state).
   * @param manaUsage - Expected mana usage per checkpoint (none, target, or limit).
   * @returns An array of GasFees, one per slot in the prediction window.
   */
  getPredictedMinFees(manaUsage?: ManaUsageEstimate): Promise<GasFees[]>;

  /**
   * Method to fetch the current max priority fee of txs in the mempool.
   * @returns The current max priority fees.
   */
  getMaxPriorityFees(): Promise<GasFees>;

  /**
   * Method to fetch the version of the package.
   * @returns The node package version
   */
  getNodeVersion(): Promise<string>;

  /**
   * Method to fetch the version of the rollup the node is connected to.
   * @returns The rollup version.
   */
  getVersion(): Promise<number>;

  /**
   * Method to fetch the chain id of the base-layer for the rollup.
   * @returns The chain id.
   */
  getChainId(): Promise<number>;

  /**
   * Method to fetch the currently deployed l1 contract addresses.
   * @returns The deployed contract addresses.
   */
  getL1ContractAddresses(): Promise<L1ContractAddresses>;

  /**
   * Method to fetch the protocol contract addresses.
   */
  getProtocolContractAddresses(): Promise<ProtocolContractAddresses>;

  /**
   * Registers contract function signatures for debugging purposes.
   * @param functionSignatures - An array of function signatures to register by selector.
   */
  registerContractFunctionSignatures(functionSignatures: string[]): Promise<void>;

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse>;

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse>;

  /**
   * Gets private logs that match any of the `tags`. For each tag, an array of matching logs is returned. An empty
   * array implies no logs match that tag.
   * @param tags - The tags to search for.
   * @param page - The page number (0-indexed) for pagination.
   * @param referenceBlock - Optional block hash used to ensure the block still exists before logs are retrieved.
   * This block is expected to represent the latest block to which the client has synced (called anchor block in PXE).
   * If specified and the block is not found, an error is thrown. This helps detect reorgs, which could result in
   * undefined behavior in the client's code.
   * @returns An array of log arrays, one per tag. Returns at most 10 logs per tag per page. If 10 logs are returned
   * for a tag, the caller should fetch the next page to check for more logs.
   */
  getPrivateLogsByTags(tags: SiloedTag[], page?: number, referenceBlock?: BlockHash): Promise<TxScopedL2Log[][]>;

  /**
   * Gets public logs that match any of the `tags` from the specified contract. For each tag, an array of matching
   * logs is returned. An empty array implies no logs match that tag.
   * @param contractAddress - The contract address to search logs for.
   * @param tags - The tags to search for.
   * @param page - The page number (0-indexed) for pagination.
   * @param referenceBlock - Optional block hash used to ensure the block still exists before logs are retrieved.
   * This block is expected to represent the latest block to which the client has synced (called anchor block in PXE).
   * If specified and the block is not found, an error is thrown. This helps detect reorgs, which could result in
   * undefined behavior in the client's code.
   * @returns An array of log arrays, one per tag. Returns at most 10 logs per tag per page. If 10 logs are returned
   * for a tag, the caller should fetch the next page to check for more logs.
   */
  getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    page?: number,
    referenceBlock?: BlockHash,
  ): Promise<TxScopedL2Log[][]>;

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   * @returns Nothing.
   */
  sendTx(tx: Tx): Promise<void>;

  /**
   * Fetches a transaction receipt for a given transaction hash. Returns a mined receipt if it was added
   * to the chain, a pending receipt if it's still in the mempool of the connected Aztec node, or a dropped
   * receipt if not found in the connected Aztec node.
   *
   * @param txHash - The transaction hash.
   * @returns A receipt of the transaction.
   */
  getTxReceipt(txHash: TxHash): Promise<TxReceipt>;

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   */
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined>;

  /**
   * Method to retrieve pending txs.
   * @returns The pending txs.
   */
  getPendingTxs(limit?: number, after?: TxHash): Promise<Tx[]>;

  /**
   * Retrieves the number of pending txs
   * @returns The number of pending txs.
   */
  getPendingTxCount(): Promise<number>;

  /**
   * Method to retrieve a single pending tx.
   * @param txHash - The transaction hash to return.
   * @returns The pending tx if it exists.
   */
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Method to retrieve multiple pending txs.
   * @param txHash - The transaction hashes to return.
   * @returns The pending txs if exist.
   */
  getTxsByHash(txHashes: TxHash[]): Promise<Tx[]>;

  /**
   * Gets the storage value at the given contract storage slot.
   *
   * @remarks The storage slot here refers to the slot as it is defined in Noir not the index in the merkle tree.
   * Aztec's version of `eth_getStorageAt`.
   *
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @returns Storage value at the given contract slot.
   */
  getPublicStorageAt(referenceBlock: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr>;

  /** Returns stats for validators if enabled. */
  getValidatorsStats(): Promise<ValidatorsStats>;

  /** Returns stats for a single validator if enabled. */
  getValidatorStats(
    validatorAddress: EthAddress,
    fromSlot?: SlotNumber,
    toSlot?: SlotNumber,
  ): Promise<SingleValidatorStats | undefined>;

  /**
   * Simulates the public part of a transaction with the current state.
   * This currently just checks that the transaction execution succeeds.
   * @param tx - The transaction to simulate.
   **/
  simulatePublicCalls(tx: Tx, skipFeeEnforcement?: boolean): Promise<PublicSimulationOutput>;

  /**
   * Returns true if the transaction is valid for inclusion at the current state. Valid transactions can be
   * made invalid by *other* transactions if e.g. they emit the same nullifiers, or come become invalid
   * due to e.g. the expiration_timestamp property.
   * @param tx - The transaction to validate for correctness.
   * @param isSimulation - True if the transaction is a simulated one without generated proofs. (Optional)
   * @param skipFeeEnforcement - True if the validation of the fee should be skipped. Useful when the simulation is for estimating fee (Optional)
   */
  isValidTx(tx: Tx, options?: { isSimulation?: boolean; skipFeeEnforcement?: boolean }): Promise<TxValidationResult>;

  /**
   * Returns a registered contract class given its id.
   * @param id - Id of the contract class.
   */
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined>;

  /**
   * Returns a publicly deployed contract instance given its address.
   * @param address - Address of the deployed contract.
   */
  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined>;

  /**
   * Returns the ENR of this node for peer discovery, if available.
   */
  getEncodedEnr(): Promise<string | undefined>;

  /**
   * Returns the list of allowed public setup elements configured for this node.
   * @returns The list of allowed elements.
   */
  getAllowedPublicSetup(): Promise<AllowedElement[]>;
}

const MAX_SIGNATURES_PER_REGISTER_CALL = 100;
const MAX_SIGNATURE_LEN = 10000;

export const AztecNodeApiSchema: ApiSchemaFor<AztecNode> = {
  getWorldStateSyncStatus: z.function().args().returns(WorldStateSyncStatusSchema),

  findLeavesIndexes: z
    .function()
    .args(BlockParameterSchema, z.nativeEnum(MerkleTreeId), z.array(schemas.Fr).max(MAX_RPC_LEN))
    .returns(z.array(optional(dataInBlockSchemaFor(schemas.BigInt)))),

  getNullifierMembershipWitness: z
    .function()
    .args(BlockParameterSchema, schemas.Fr)
    .returns(NullifierMembershipWitness.schema.optional()),

  getLowNullifierMembershipWitness: z
    .function()
    .args(BlockParameterSchema, schemas.Fr)
    .returns(NullifierMembershipWitness.schema.optional()),

  getPublicDataWitness: z
    .function()
    .args(BlockParameterSchema, schemas.Fr)
    .returns(PublicDataWitness.schema.optional()),

  getBlockHashMembershipWitness: z
    .function()
    .args(BlockParameterSchema, BlockHash.schema)
    .returns(MembershipWitness.schemaFor(ARCHIVE_HEIGHT).optional()),

  getNoteHashMembershipWitness: z
    .function()
    .args(BlockParameterSchema, schemas.Fr)
    .returns(MembershipWitness.schemaFor(NOTE_HASH_TREE_HEIGHT).optional()),

  getL1ToL2MessageMembershipWitness: z
    .function()
    .args(BlockParameterSchema, schemas.Fr)
    .returns(z.tuple([schemas.BigInt, SiblingPath.schemaFor(L1_TO_L2_MSG_TREE_HEIGHT)]).optional()),

  getL1ToL2MessageCheckpoint: z.function().args(schemas.Fr).returns(CheckpointNumberSchema.optional()),

  isL1ToL2MessageSynced: z.function().args(schemas.Fr).returns(z.boolean()),

  getL2ToL1Messages: z
    .function()
    .args(EpochNumberSchema)
    .returns(z.array(z.array(z.array(z.array(schemas.Fr))))),

  getBlockNumber: z.function().args(optional(ChainTipSchema)).returns(BlockNumberSchema),

  getCheckpointNumber: z.function().args(optional(ChainTipSchema)).returns(CheckpointNumberSchema),

  getChainTips: z.function().args().returns(ChainTipsSchema),

  getL2Tips: z.function().args().returns(L2TipsSchema),

  getBlockHeader: z
    .function()
    .args(z.union([BlockNumberSchema, z.literal('latest')]))
    .returns(BlockHeader.schema.optional()),

  getCheckpointedBlocks: z
    .function()
    .args(BlockNumberPositiveSchema, z.number().gt(0).lte(MAX_RPC_BLOCKS_LEN))
    .returns(z.array(CheckpointedL2Block.schema)),

  getCheckpointsDataForEpoch: z.function().args(EpochNumberSchema).returns(z.array(CheckpointDataSchema)),

  getBlock: z
    .function()
    .args(BlockParameterSchema, optional(BlockIncludeOptionsSchema))
    .returns(BlockResponseSchema.optional()),

  getBlocks: z
    .function()
    .args(BlockNumberPositiveSchema, z.number().gt(0).lte(MAX_RPC_BLOCKS_LEN), optional(BlockIncludeOptionsSchema))
    .returns(z.array(BlockResponseSchema)),

  getCheckpoint: z
    .function()
    .args(CheckpointParameterSchema, optional(CheckpointIncludeOptionsSchema))
    .returns(CheckpointResponseSchema.optional()),

  getCheckpoints: z
    .function()
    .args(
      CheckpointNumberPositiveSchema,
      z.number().gt(0).lte(MAX_RPC_CHECKPOINTS_LEN),
      optional(CheckpointIncludeOptionsSchema),
    )
    .returns(z.array(CheckpointResponseSchema)),

  isReady: z.function().returns(z.boolean()),

  getNodeInfo: z.function().returns(NodeInfoSchema),

  getCurrentMinFees: z.function().returns(GasFees.schema),

  getPredictedMinFees: z
    .function()
    .args(optional(z.nativeEnum(ManaUsageEstimate)))
    .returns(z.array(GasFees.schema)),

  getMaxPriorityFees: z.function().returns(GasFees.schema),

  getNodeVersion: z.function().returns(z.string()),

  getVersion: z.function().returns(z.number()),

  getChainId: z.function().returns(z.number()),

  getL1ContractAddresses: z.function().returns(L1ContractAddressesSchema),

  getProtocolContractAddresses: z.function().returns(ProtocolContractAddressesSchema),

  registerContractFunctionSignatures: z
    .function()
    .args(z.array(z.string().max(MAX_SIGNATURE_LEN)).max(MAX_SIGNATURES_PER_REGISTER_CALL))
    .returns(z.void()),

  getPublicLogs: z.function().args(LogFilterSchema).returns(GetPublicLogsResponseSchema),

  getContractClassLogs: z.function().args(LogFilterSchema).returns(GetContractClassLogsResponseSchema),

  getPrivateLogsByTags: z
    .function()
    .args(z.array(SiloedTag.schema).max(MAX_RPC_LEN), optional(z.number().gte(0)), optional(BlockHash.schema))
    .returns(z.array(z.array(TxScopedL2Log.schema))),

  getPublicLogsByTagsFromContract: z
    .function()
    .args(
      schemas.AztecAddress,
      z.array(Tag.schema).max(MAX_RPC_LEN),
      optional(z.number().gte(0)),
      optional(BlockHash.schema),
    )
    .returns(z.array(z.array(TxScopedL2Log.schema))),

  sendTx: z.function().args(Tx.schema).returns(z.void()),

  getTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema),

  getTxEffect: z.function().args(TxHash.schema).returns(indexedTxSchema().optional()),

  getPendingTxs: z
    .function()
    .args(optional(z.number().gte(1).lte(MAX_RPC_TXS_LEN).default(MAX_RPC_TXS_LEN)), optional(TxHash.schema))
    .returns(z.array(Tx.schema)),

  getPendingTxCount: z.function().returns(z.number()),

  getTxByHash: z.function().args(TxHash.schema).returns(Tx.schema.optional()),

  getTxsByHash: z.function().args(z.array(TxHash.schema).max(MAX_RPC_TXS_LEN)).returns(z.array(Tx.schema)),

  getPublicStorageAt: z.function().args(BlockParameterSchema, schemas.AztecAddress, schemas.Fr).returns(schemas.Fr),

  getValidatorsStats: z.function().returns(ValidatorsStatsSchema),

  getValidatorStats: z
    .function()
    .args(schemas.EthAddress, optional(schemas.SlotNumber), optional(schemas.SlotNumber))
    .returns(SingleValidatorStatsSchema.optional()),

  simulatePublicCalls: z.function().args(Tx.schema, optional(z.boolean())).returns(PublicSimulationOutput.schema),

  isValidTx: z
    .function()
    .args(
      Tx.schema,
      optional(z.object({ isSimulation: optional(z.boolean()), skipFeeEnforcement: optional(z.boolean()) })),
    )
    .returns(TxValidationResultSchema),

  getContractClass: z.function().args(schemas.Fr).returns(ContractClassPublicSchema.optional()),

  getContract: z.function().args(schemas.AztecAddress).returns(ContractInstanceWithAddressSchema.optional()),

  getEncodedEnr: z.function().returns(z.string().optional()),

  getAllowedPublicSetup: z.function().args().returns(z.array(AllowedElementSchema)),
};

export function createAztecNodeClient(
  url: string,
  versions: Partial<ComponentsVersions> = {},
  fetch = makeFetch([1, 2, 3], false),
  batchWindowMS = 0,
): AztecNode {
  return createSafeJsonRpcClient<AztecNode>(url, AztecNodeApiSchema, {
    namespaceMethods: 'node',
    fetch,
    batchWindowMS,
    onResponse: getVersioningResponseHandler(versions),
  });
}
