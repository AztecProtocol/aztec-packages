import {
  ARCHIVE_HEIGHT,
  type ContractClassPublic,
  ContractClassPublicSchema,
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
  GasFees,
  Header,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  type NodeInfo,
  NodeInfoSchema,
  PUBLIC_DATA_TREE_HEIGHT,
  PrivateLog,
  type ProtocolContractAddresses,
  ProtocolContractAddressesSchema,
} from '@aztec/circuits.js';
import { type L1ContractAddresses, L1ContractAddressesSchema } from '@aztec/ethereum';
import { type ContractArtifact, ContractArtifactSchema } from '@aztec/foundation/abi';
import type { AztecAddress } from '@aztec/foundation/aztec-address';
import type { Fr } from '@aztec/foundation/fields';
import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';
import { type ApiSchemaFor, optional, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type InBlock, inBlockSchemaFor } from '../in_block.js';
import { L2Block } from '../l2_block.js';
import { type L2BlockSource, type L2Tips, L2TipsSchema } from '../l2_block_source.js';
import {
  type GetUnencryptedLogsResponse,
  GetUnencryptedLogsResponseSchema,
  type LogFilter,
  LogFilterSchema,
  TxScopedL2Log,
} from '../logs/index.js';
import { MerkleTreeId } from '../merkle_tree_id.js';
import { EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';
import { PublicDataWitness } from '../public_data_witness.js';
import { SiblingPath } from '../sibling_path/index.js';
import { PublicSimulationOutput, Tx, TxHash, TxReceipt } from '../tx/index.js';
import { TxEffect } from '../tx_effect.js';
import { type SequencerConfig, SequencerConfigSchema } from './configs.js';
import { type L2BlockNumber, L2BlockNumberSchema } from './l2_block_number.js';
import { NullifierMembershipWitness } from './nullifier_tree.js';
import { type ProverConfig, ProverConfigSchema } from './prover-client.js';
import { type ProverCoordination, ProverCoordinationApiSchema } from './prover-coordination.js';

/**
 * The aztec node.
 * We will probably implement the additional interfaces by means other than Aztec Node as it's currently a privacy leak
 */
export interface AztecNode
  extends ProverCoordination,
    Pick<L2BlockSource, 'getBlocks' | 'getBlockHeader' | 'getL2Tips'> {
  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips>;

  /**
   * Find the indexes of the given leaves in the given tree.
   * @param blockNumber - The block number at which to get the data or 'latest' for latest data
   * @param treeId - The tree to search in.
   * @param leafValues - The values to search for
   * @returns The indexes of the given leaves in the given tree or undefined if not found.
   */
  findLeavesIndexes(
    blockNumber: L2BlockNumber,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(bigint | undefined)[]>;

  /**
   * Find the indexes of the given leaves in the given tree.
   * @param blockNumber - The block number at which to get the data or 'latest' for latest data
   * @param treeId - The tree to search in.
   * @param leafIndices - The values to search for
   * @returns The indexes of the given leaves in the given tree or undefined if not found.
   */
  findBlockNumbersForIndexes(
    blockNumber: L2BlockNumber,
    treeId: MerkleTreeId,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]>;

  /**
   * Returns the indexes of the given nullifiers in the nullifier tree,
   * scoped to the block they were included in.
   * @param blockNumber - The block number at which to get the data.
   * @param nullifiers - The nullifiers to search for.
   * @returns The block scoped indexes of the given nullifiers in the nullifier tree, or undefined if not found.
   */
  findNullifiersIndexesWithBlock(
    blockNumber: L2BlockNumber,
    nullifiers: Fr[],
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
   * Returns a membership witness of an l2ToL1Message in an ephemeral l2 to l1 message tree.
   * @dev Membership witness is a consists of the index and the sibling path of the l2ToL1Message.
   * @remarks This tree is considered ephemeral because it is created on-demand by: taking all the l2ToL1 messages
   * in a single block, and then using them to make a variable depth append-only tree with these messages as leaves.
   * The tree is discarded immediately after calculating what we need from it.
   * @param blockNumber - The block number at which to get the data.
   * @param l2ToL1Message - The l2ToL1Message to get the membership witness for.
   * @returns A tuple of the index and the sibling path of the L2ToL1Message.
   */
  getL2ToL1MessageMembershipWitness(
    blockNumber: L2BlockNumber,
    l2ToL1Message: Fr,
  ): Promise<[bigint, SiblingPath<number>]>;

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
  getPublicDataTreeWitness(blockNumber: L2BlockNumber, leafSlot: Fr): Promise<PublicDataWitness | undefined>;

  /**
   * Get a block specified by its number.
   * @param number - The block number being requested.
   * @returns The requested block.
   */
  getBlock(number: number): Promise<L2Block | undefined>;

  /**
   * Fetches the current block number.
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
   * Method to add a contract artifact to the database.
   * @param aztecAddress
   * @param artifact
   */
  addContractArtifact(address: AztecAddress, artifact: ContractArtifact): Promise<void>;

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]>;

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse>;

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse>;

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs and metadata (e.g. tx hash) is returned. An empty
   array implies no logs match that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]>;

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
   * Get a tx effect.
   * @param txHash - The hash of a transaction which resulted in the returned tx effect.
   * @returns The requested tx effect.
   */
  getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined>;

  /**
   * Method to retrieve pending txs.
   * @returns The pending txs.
   */
  getPendingTxs(): Promise<Tx[]>;

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
  getPublicStorageAt(contract: AztecAddress, slot: Fr, blockNumber: L2BlockNumber): Promise<Fr>;

  /**
   * Returns the currently committed block header.
   * @returns The current committed block header.
   */
  getBlockHeader(blockNumber?: L2BlockNumber): Promise<Header>;

  /**
   * Simulates the public part of a transaction with the current state.
   * This currently just checks that the transaction execution succeeds.
   * @param tx - The transaction to simulate.
   **/
  simulatePublicCalls(tx: Tx): Promise<PublicSimulationOutput>;

  /**
   * Returns true if the transaction is valid for inclusion at the current state. Valid transactions can be
   * made invalid by *other* transactions if e.g. they emit the same nullifiers, or come become invalid
   * due to e.g. the max_block_number property.
   * @param tx - The transaction to validate for correctness.
   * @param isSimulation - True if the transaction is a simulated one without generated proofs. (Optional)
   */
  isValidTx(tx: Tx, isSimulation?: boolean): Promise<boolean>;

  /**
   * Updates the configuration of this node.
   * @param config - Updated configuration to be merged with the current one.
   */
  setConfig(config: Partial<SequencerConfig & ProverConfig>): Promise<void>;

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

  /** Forces the next block to be built bypassing all time and pending checks. Useful for testing. */
  flushTxs(): Promise<void>;

  /**
   * Returns the ENR of this node for peer discovery, if available.
   */
  getEncodedEnr(): Promise<string | undefined>;

  /**
   * Receives a quote for an epoch proof and stores it in its EpochProofQuotePool
   * @param quote - The quote to store
   */
  addEpochProofQuote(quote: EpochProofQuote): Promise<void>;

  /**
   * Returns the received quotes for a given epoch
   * @param epoch - The epoch for which to get the quotes
   */
  getEpochProofQuotes(epoch: bigint): Promise<EpochProofQuote[]>;

  /**
   * Adds a contract class bypassing the registerer.
   * TODO(#10007): Remove this method.
   * @param contractClass - The class to register.
   */
  addContractClass(contractClass: ContractClassPublic): Promise<void>;
}

export const AztecNodeApiSchema: ApiSchemaFor<AztecNode> = {
  ...ProverCoordinationApiSchema,

  getL2Tips: z.function().args().returns(L2TipsSchema),
  findLeavesIndexes: z
    .function()
    .args(L2BlockNumberSchema, z.nativeEnum(MerkleTreeId), z.array(schemas.Fr))
    .returns(z.array(optional(schemas.BigInt))),

  findBlockNumbersForIndexes: z
    .function()
    .args(L2BlockNumberSchema, z.nativeEnum(MerkleTreeId), z.array(schemas.BigInt))
    .returns(z.array(optional(schemas.BigInt))),

  findNullifiersIndexesWithBlock: z
    .function()
    .args(L2BlockNumberSchema, z.array(schemas.Fr))
    .returns(z.array(optional(inBlockSchemaFor(schemas.BigInt)))),

  getNullifierSiblingPath: z
    .function()
    .args(L2BlockNumberSchema, schemas.BigInt)
    .returns(SiblingPath.schemaFor(NULLIFIER_TREE_HEIGHT)),

  getNoteHashSiblingPath: z
    .function()
    .args(L2BlockNumberSchema, schemas.BigInt)
    .returns(SiblingPath.schemaFor(NOTE_HASH_TREE_HEIGHT)),

  getL1ToL2MessageMembershipWitness: z
    .function()
    .args(L2BlockNumberSchema, schemas.Fr)
    .returns(z.tuple([schemas.BigInt, SiblingPath.schemaFor(L1_TO_L2_MSG_TREE_HEIGHT)]).optional()),

  isL1ToL2MessageSynced: z.function().args(schemas.Fr).returns(z.boolean()),

  getL2ToL1MessageMembershipWitness: z
    .function()
    .args(L2BlockNumberSchema, schemas.Fr)
    .returns(z.tuple([schemas.BigInt, SiblingPath.schema])),

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

  getPublicDataTreeWitness: z
    .function()
    .args(L2BlockNumberSchema, schemas.Fr)
    .returns(PublicDataWitness.schema.optional()),

  getBlock: z.function().args(z.number()).returns(L2Block.schema.optional()),

  getBlockNumber: z.function().returns(z.number()),

  getProvenBlockNumber: z.function().returns(z.number()),

  isReady: z.function().returns(z.boolean()),

  getNodeInfo: z.function().returns(NodeInfoSchema),

  getBlocks: z.function().args(z.number(), z.number()).returns(z.array(L2Block.schema)),

  getCurrentBaseFees: z.function().returns(GasFees.schema),

  getNodeVersion: z.function().returns(z.string()),

  getVersion: z.function().returns(z.number()),

  getChainId: z.function().returns(z.number()),

  getL1ContractAddresses: z.function().returns(L1ContractAddressesSchema),

  getProtocolContractAddresses: z.function().returns(ProtocolContractAddressesSchema),

  addContractArtifact: z.function().args(schemas.AztecAddress, ContractArtifactSchema).returns(z.void()),

  getPrivateLogs: z.function().args(z.number(), z.number()).returns(z.array(PrivateLog.schema)),

  getUnencryptedLogs: z.function().args(LogFilterSchema).returns(GetUnencryptedLogsResponseSchema),

  getContractClassLogs: z.function().args(LogFilterSchema).returns(GetUnencryptedLogsResponseSchema),

  getLogsByTags: z
    .function()
    .args(z.array(schemas.Fr))
    .returns(z.array(z.array(TxScopedL2Log.schema))),

  sendTx: z.function().args(Tx.schema).returns(z.void()),

  getTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema),

  getTxEffect: z.function().args(TxHash.schema).returns(inBlockSchemaFor(TxEffect.schema).optional()),

  getPendingTxs: z.function().returns(z.array(Tx.schema)),

  getPendingTxCount: z.function().returns(z.number()),

  getTxByHash: z.function().args(TxHash.schema).returns(Tx.schema.optional()),

  getPublicStorageAt: z.function().args(schemas.AztecAddress, schemas.Fr, L2BlockNumberSchema).returns(schemas.Fr),

  getBlockHeader: z.function().args(optional(L2BlockNumberSchema)).returns(Header.schema),

  simulatePublicCalls: z.function().args(Tx.schema).returns(PublicSimulationOutput.schema),

  isValidTx: z.function().args(Tx.schema, optional(z.boolean())).returns(z.boolean()),

  setConfig: z.function().args(SequencerConfigSchema.merge(ProverConfigSchema).partial()).returns(z.void()),

  getContractClass: z.function().args(schemas.Fr).returns(ContractClassPublicSchema.optional()),

  getContract: z.function().args(schemas.AztecAddress).returns(ContractInstanceWithAddressSchema.optional()),

  flushTxs: z.function().returns(z.void()),

  getEncodedEnr: z.function().returns(z.string().optional()),

  addEpochProofQuote: z.function().args(EpochProofQuote.schema).returns(z.void()),

  getEpochProofQuotes: z.function().args(schemas.BigInt).returns(z.array(EpochProofQuote.schema)),

  // TODO(#10007): Remove this method
  addContractClass: z.function().args(ContractClassPublicSchema).returns(z.void()),
};

export function createAztecNodeClient(url: string, fetch = defaultFetch): AztecNode {
  return createSafeJsonRpcClient<AztecNode>(url, AztecNodeApiSchema, false, 'node', fetch);
}
