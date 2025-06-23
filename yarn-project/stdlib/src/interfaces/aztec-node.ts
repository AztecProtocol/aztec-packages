import {
  ARCHIVE_HEIGHT,
  INITIAL_L2_BLOCK_NUM,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { type L1ContractAddresses, L1ContractAddressesSchema } from '@aztec/ethereum/l1-contract-addresses';
import type { Fr } from '@aztec/foundation/fields';
import { createSafeJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { type InBlock, inBlockSchemaFor } from '../block/in_block.js';
import { L2Block } from '../block/l2_block.js';
import { type L2BlockNumber, L2BlockNumberSchema } from '../block/l2_block_number.js';
import { type L2BlockSource, type L2Tips, L2TipsSchema } from '../block/l2_block_source.js';
import { PublishedL2Block } from '../block/published_l2_block.js';
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
import { GasFees } from '../gas/gas_fees.js';
import { type LogFilter, LogFilterSchema } from '../logs/log_filter.js';
import { PrivateLog } from '../logs/private_log.js';
import { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';
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
import { ValidatorsStatsSchema } from '../validators/schemas.js';
import type { ValidatorsStats } from '../validators/types.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';
import { MAX_RPC_BLOCKS_LEN, MAX_RPC_LEN, MAX_RPC_TXS_LEN } from './api_limit.js';
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
export interface AztecNode
  extends Pick<L2BlockSource, 'getBlocks' | 'getPublishedBlocks' | 'getBlockHeader' | 'getL2Tips'> {
  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips>;

  /**
   * Returns the sync status of the node's world state
   */
  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus>;

  /**
   * Find the indexes of the given leaves in the given tree along with a block metadata pointing to the block in which
   * the leaves were inserted.
   * @param blockNumber - The block number at which to get the data or 'latest' for latest data.
   * @param treeId - The tree to search in.
   * @param leafValues - The values to search for.
   * @returns The indices of leaves and the block metadata of a block in which the leaves were inserted.
   */
  findLeavesIndexes(
    blockNumber: L2BlockNumber,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]>;

  /**
   * Returns a sibling path for the given index in the nullifier tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  getNullifierSiblingPath(
    blockNumber: L2BlockNumber,
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof NULLIFIER_TREE_HEIGHT>>;

  /**
   * Returns a sibling path for the given index in the note hash tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  getNoteHashSiblingPath(
    blockNumber: L2BlockNumber,
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof NOTE_HASH_TREE_HEIGHT>>;

  /**
   * Returns a sibling path for a leaf in the committed historic blocks tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  getArchiveSiblingPath(blockNumber: L2BlockNumber, leafIndex: bigint): Promise<SiblingPath<typeof ARCHIVE_HEIGHT>>;

  /**
   * Returns a sibling path for a leaf in the committed public data tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  getPublicDataSiblingPath(
    blockNumber: L2BlockNumber,
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>>;

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the data.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  getNullifierMembershipWitness(
    blockNumber: L2BlockNumber,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the data.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */
  getLowNullifierMembershipWitness(
    blockNumber: L2BlockNumber,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockNumber - The block number at which to get the data.
   * @param leafSlot - The leaf slot we try to find the witness for.
   * @returns The public data witness (if found).
   * @remarks The witness can be used to compute the current value of the public data tree leaf. If the low leaf preimage corresponds to an
   * "in range" slot, means that the slot doesn't exist and the value is 0. If the low leaf preimage corresponds to the exact slot, the current value
   * is contained in the leaf preimage.
   */
  getPublicDataWitness(blockNumber: L2BlockNumber, leafSlot: Fr): Promise<PublicDataWitness | undefined>;

  /**
   * Returns a membership witness for a given archive leaf at a given block.
   * @param blockNumber - The block number at which to get the data.
   * @param archive - The archive leaf we try to find the witness for.
   */
  getArchiveMembershipWitness(
    blockNumber: L2BlockNumber,
    archive: Fr,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined>;

  /**
   * Returns a membership witness for a given note hash at a given block.
   * @param blockNumber - The block number at which to get the data.
   * @param noteHash - The note hash we try to find the witness for.
   */
  getNoteHashMembershipWitness(
    blockNumber: L2BlockNumber,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined>;

  /**
   * Returns the index and a sibling path for a leaf in the committed l1 to l2 data tree.
   * @param blockNumber - The block number at which to get the data.
   * @param l1ToL2Message - The l1ToL2Message to get the index / sibling path for.
   * @returns A tuple of the index and the sibling path of the L1ToL2Message (undefined if not found).
   */
  getL1ToL2MessageMembershipWitness(
    blockNumber: L2BlockNumber,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined>;

  /**
   * Returns whether an L1 to L2 message is synced by archiver and if it's ready to be included in a block.
   * @param l1ToL2Message - The L1 to L2 message to check.
   * @returns Whether the message is synced and ready to be included in a block.
   */
  isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean>;

  /**
   * Returns all the L2 to L1 messages in a block.
   * @param blockNumber - The block number at which to get the data.
   * @returns The L2 to L1 messages (undefined if the block number is not found).
   */
  getL2ToL1Messages(blockNumber: L2BlockNumber): Promise<Fr[][] | undefined>;

  /**
   * Get a block specified by its number.
   * @param number - The block number being requested.
   * @returns The requested block.
   */
  getBlock(number: L2BlockNumber): Promise<L2Block | undefined>;

  /**
   * Method to fetch the latest block number synchronized by the node.
   * @returns The block number.
   */
  getBlockNumber(): Promise<number>;

  /**
   * Fetches the latest proven block number.
   * @returns The block number.
   */
  getProvenBlockNumber(): Promise<number>;

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
   * Method to request blocks. Will attempt to return all requested blocks but will return only those available.
   * @param from - The start of the range of blocks to return.
   * @param limit - The maximum number of blocks to return.
   * @returns The blocks requested.
   */
  getBlocks(from: number, limit: number): Promise<L2Block[]>;

  /**
   * Method to fetch the current base fees.
   * @returns The current base fees.
   */
  getCurrentBaseFees(): Promise<GasFees>;

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
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]>;

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
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @param logsPerTag - How many logs to return per tag. Default 10 logs are returned for each tag
   * @returns For each received tag, an array of matching logs and metadata (e.g. tx hash) is returned. An empty
   * array implies no logs match that tag. There can be multiple logs for 1 tag because tag reuse can happen
   * --> e.g. when sending a note from multiple unsynched devices.
   */
  getLogsByTags(tags: Fr[], logsPerTag?: number): Promise<TxScopedL2Log[][]>;

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
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @param blockNumber - The block number at which to get the data or 'latest'.
   * @returns Storage value at the given contract slot.
   */
  getPublicStorageAt(blockNumber: L2BlockNumber, contract: AztecAddress, slot: Fr): Promise<Fr>;

  /**
   * Returns the currently committed block header.
   * @returns The current committed block header.
   */
  getBlockHeader(blockNumber?: L2BlockNumber): Promise<BlockHeader | undefined>;

  /** Returns stats for validators if enabled. */
  getValidatorsStats(): Promise<ValidatorsStats>;

  /**
   * Simulates the public part of a transaction with the current state.
   * This currently just checks that the transaction execution succeeds.
   * @param tx - The transaction to simulate.
   **/
  simulatePublicCalls(tx: Tx, skipFeeEnforcement?: boolean): Promise<PublicSimulationOutput>;

  /**
   * Returns true if the transaction is valid for inclusion at the current state. Valid transactions can be
   * made invalid by *other* transactions if e.g. they emit the same nullifiers, or come become invalid
   * due to e.g. the max_block_number property.
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
}

export const MAX_LOGS_PER_TAG = 10;
const MAX_SIGNATURES_PER_REGISTER_CALL = 100;
const MAX_SIGNATURE_LEN = 10000;

export const AztecNodeApiSchema: ApiSchemaFor<AztecNode> = {
  getL2Tips: z.function().args().returns(L2TipsSchema),

  getWorldStateSyncStatus: z.function().args().returns(WorldStateSyncStatusSchema),

  findLeavesIndexes: z
    .function()
    .args(L2BlockNumberSchema, z.nativeEnum(MerkleTreeId), z.array(schemas.Fr).max(MAX_RPC_LEN))
    .returns(z.array(optional(inBlockSchemaFor(schemas.BigInt)))),

  getNullifierSiblingPath: z
    .function()
    .args(L2BlockNumberSchema, schemas.BigInt)
    .returns(SiblingPath.schemaFor(NULLIFIER_TREE_HEIGHT)),

  getNoteHashSiblingPath: z
    .function()
    .args(L2BlockNumberSchema, schemas.BigInt)
    .returns(SiblingPath.schemaFor(NOTE_HASH_TREE_HEIGHT)),

  getArchiveSiblingPath: z
    .function()
    .args(L2BlockNumberSchema, schemas.BigInt)
    .returns(SiblingPath.schemaFor(ARCHIVE_HEIGHT)),

  getPublicDataSiblingPath: z
    .function()
    .args(L2BlockNumberSchema, schemas.BigInt)
    .returns(SiblingPath.schemaFor(PUBLIC_DATA_TREE_HEIGHT)),

  getNullifierMembershipWitness: z
    .function()
    .args(L2BlockNumberSchema, schemas.Fr)
    .returns(NullifierMembershipWitness.schema.optional()),

  getLowNullifierMembershipWitness: z
    .function()
    .args(L2BlockNumberSchema, schemas.Fr)
    .returns(NullifierMembershipWitness.schema.optional()),

  getPublicDataWitness: z.function().args(L2BlockNumberSchema, schemas.Fr).returns(PublicDataWitness.schema.optional()),

  getArchiveMembershipWitness: z
    .function()
    .args(L2BlockNumberSchema, schemas.Fr)
    .returns(MembershipWitness.schemaFor(ARCHIVE_HEIGHT).optional()),

  getNoteHashMembershipWitness: z
    .function()
    .args(L2BlockNumberSchema, schemas.Fr)
    .returns(MembershipWitness.schemaFor(NOTE_HASH_TREE_HEIGHT).optional()),

  getL1ToL2MessageMembershipWitness: z
    .function()
    .args(L2BlockNumberSchema, schemas.Fr)
    .returns(z.tuple([schemas.BigInt, SiblingPath.schemaFor(L1_TO_L2_MSG_TREE_HEIGHT)]).optional()),

  isL1ToL2MessageSynced: z.function().args(schemas.Fr).returns(z.boolean()),

  getL2ToL1Messages: z
    .function()
    .args(L2BlockNumberSchema)
    .returns(z.array(z.array(schemas.Fr)).optional()),

  getBlock: z.function().args(L2BlockNumberSchema).returns(L2Block.schema.optional()),

  getBlockNumber: z.function().returns(z.number()),

  getProvenBlockNumber: z.function().returns(z.number()),

  isReady: z.function().returns(z.boolean()),

  getNodeInfo: z.function().returns(NodeInfoSchema),

  getBlocks: z
    .function()
    .args(z.number().gte(INITIAL_L2_BLOCK_NUM), z.number().gt(0).lte(MAX_RPC_BLOCKS_LEN))
    .returns(z.array(L2Block.schema)),

  getPublishedBlocks: z
    .function()
    .args(z.number().gte(INITIAL_L2_BLOCK_NUM), z.number().gt(0).lte(MAX_RPC_BLOCKS_LEN))
    .returns(z.array(PublishedL2Block.schema)),

  getCurrentBaseFees: z.function().returns(GasFees.schema),

  getNodeVersion: z.function().returns(z.string()),

  getVersion: z.function().returns(z.number()),

  getChainId: z.function().returns(z.number()),

  getL1ContractAddresses: z.function().returns(L1ContractAddressesSchema),

  getProtocolContractAddresses: z.function().returns(ProtocolContractAddressesSchema),

  registerContractFunctionSignatures: z
    .function()
    .args(z.array(z.string().max(MAX_SIGNATURE_LEN)).max(MAX_SIGNATURES_PER_REGISTER_CALL))
    .returns(z.void()),

  getPrivateLogs: z
    .function()
    .args(z.number().gte(INITIAL_L2_BLOCK_NUM), z.number().lte(MAX_RPC_LEN))
    .returns(z.array(PrivateLog.schema)),

  getPublicLogs: z.function().args(LogFilterSchema).returns(GetPublicLogsResponseSchema),

  getContractClassLogs: z.function().args(LogFilterSchema).returns(GetContractClassLogsResponseSchema),

  getLogsByTags: z
    .function()
    .args(
      z.array(schemas.Fr).max(MAX_RPC_LEN),
      optional(z.number().gte(1).lte(MAX_LOGS_PER_TAG).default(MAX_LOGS_PER_TAG)),
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

  getPublicStorageAt: z.function().args(L2BlockNumberSchema, schemas.AztecAddress, schemas.Fr).returns(schemas.Fr),

  getBlockHeader: z.function().args(optional(L2BlockNumberSchema)).returns(BlockHeader.schema.optional()),

  getValidatorsStats: z.function().returns(ValidatorsStatsSchema),

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
