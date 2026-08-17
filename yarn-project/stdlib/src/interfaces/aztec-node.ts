import { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { type L1ContractAddresses, L1ContractAddressesSchema } from '@aztec/ethereum/l1-contract-addresses';
import {
  type BlockNumber,
  BlockNumberPositiveSchema,
  BlockNumberSchema,
  type CheckpointNumber,
  CheckpointNumberPositiveSchema,
  CheckpointNumberSchema,
  type CheckpointProposalHash,
  type EpochNumber,
  EpochNumberSchema,
  type SlotNumber,
  SlotNumberSchema,
} from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import {
  type JsonRpcFetch,
  type JsonRpcFetchConfig,
  createSafeJsonRpcClient,
  makeFetch,
} from '@aztec/foundation/json-rpc/client';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { type BlockData, BlockDataSchema } from '../block/block_data.js';
import { BlockHash } from '../block/block_hash.js';
import { type BlockParameter, BlockParameterSchema, BlockTagWithoutLatestSchema } from '../block/block_parameter.js';
import { type DataInBlock, dataInBlockSchemaFor } from '../block/in_block.js';
import {
  type CheckpointsQuery,
  CheckpointsQuerySchema,
  type L2BlockTag,
  type L2Tips,
  L2TipsSchema,
} from '../block/l2_block_source.js';
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
import { type L1RollupConstants, L1RollupConstantsSchema } from '../epoch-helpers/index.js';
import { ManaUsageEstimate } from '../gas/fee_math.js';
import { GasFees } from '../gas/gas_fees.js';
import { type LogResult, LogResultSchema } from '../logs/log_result.js';
import {
  type PrivateLogsQuery,
  PrivateLogsQuerySchema,
  type PublicLogsQuery,
  PublicLogsQuerySchema,
} from '../logs/logs_query.js';
import { type L2ToL1MembershipWitness, L2ToL1MembershipWitnessSchema } from '../messaging/l2_to_l1_membership.js';
import { CheckpointAttestation } from '../p2p/checkpoint_attestation.js';
import { type ApiSchemaFor, optional, schemas } from '../schemas/schemas.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';
import { NullifierMembershipWitness } from '../trees/nullifier_membership_witness.js';
import { PublicDataWitness } from '../trees/public_data_witness.js';
import {
  type GetTxReceiptOptions,
  GetTxReceiptOptionsSchema,
  type IndexedTxEffect,
  PublicSimulationOutput,
  SimulationOverrides,
  Tx,
  TxHash,
  type TxReceipt,
  TxReceiptSchema,
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
  type BlocksIncludeOptions,
  BlocksIncludeOptionsSchema,
} from './block_response.js';
import { type CheckpointTag, CheckpointTagSchema } from './chain_tips.js';
import { type CheckpointParameter, CheckpointParameterSchema } from './checkpoint_parameter.js';
import {
  type CheckpointIncludeOptions,
  CheckpointIncludeOptionsSchema,
  type CheckpointResponse,
  CheckpointResponseSchema,
} from './checkpoint_response.js';
import { type GetTxByHashOptions, GetTxByHashOptionsSchema } from './get_tx_by_hash_options.js';
import { type PeerInfo, PeerInfoSchema, type ProposalsForSlot, ProposalsForSlotSchema } from './p2p.js';
import { type WorldStateSyncStatus, WorldStateSyncStatusSchema } from './world_state.js';

export type { GetTxByHashOptions } from './get_tx_by_hash_options.js';
export { GetTxByHashOptionsSchema } from './get_tx_by_hash_options.js';

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
   * Returns all the L2 to L1 messages in an epoch.
   *
   * @deprecated Use {@link getL2ToL1MembershipWitness} to get an L2-to-L1 message witness directly.
   *
   * @param epoch - The epoch at which to get the data.
   * @returns A nested array of the L2 to L1 messages in each tx of each block in each checkpoint in the epoch (empty
   * array if the epoch is not found).
   */
  getL2ToL1Messages(epoch: EpochNumber): Promise<Fr[][][][]>;

  /**
   * Returns the L2-to-L1 membership witness for `message` emitted by tx `txHash`. The node selects
   * the smallest partial-proof root on the Outbox that covers the tx's checkpoint and builds the
   * witness against it.
   *
   * The node reads the Outbox roots lazily, pinned to its synced L1 block, so the witness reflects
   * the node's synced view. Returns `undefined` if the tx isn't yet in a block/epoch or no covering
   * root has landed on L1 as of the synced block.
   *
   * Caveat: cached roots that are sealed and L1-finalized are not re-validated. A reorg deeper than
   * L1 finality could leave the node serving a witness against a no-longer-canonical root.
   *
   * @param txHash - The tx whose L2-to-L1 message we want a witness for.
   * @param message - The message hash to prove inclusion of.
   * @param messageIndexInTx - Optional index of the message within the tx's L2-to-L1 messages; pass
   *   this when the same message hash appears multiple times in the tx.
   */
  getL2ToL1MembershipWitness(
    txHash: TxHash,
    message: Fr,
    messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined>;

  /**
   * Returns the block number at a given block tag, or the latest proposed block number when
   * `tip` is omitted.
   */
  getBlockNumber(tip?: L2BlockTag): Promise<BlockNumber>;

  /**
   * Returns the checkpoint number at a given checkpoint tag, or the latest checkpointed number when
   * `tip` is omitted. The proposed-but-unconfirmed checkpoint frontier is archiver-internal and not
   * exposed over RPC, so `'proposed'` is not a valid checkpoint tag (see {@link CheckpointTag}).
   */
  getCheckpointNumber(tip?: CheckpointTag): Promise<CheckpointNumber>;

  /** Returns the tips of the L2 chain. */
  getChainTips(): Promise<L2Tips>;

  /** Returns the rollup constants for the current chain. */
  getL1Constants(): Promise<L1RollupConstants>;

  /**
   * Returns the last L2 slot number for which the node has all L1 data needed to build the next checkpoint.
   */
  getSyncedL2SlotNumber(): Promise<SlotNumber | undefined>;

  /**
   * Returns the last L2 epoch number that has been fully synchronized from L1.
   */
  getSyncedL2EpochNumber(): Promise<EpochNumber | undefined>;

  /** Returns the latest L1 timestamp according to the archiver's synced L1 view. */
  getSyncedL1Timestamp(): Promise<bigint | undefined>;

  /**
   * Gets lightweight checkpoint metadata for a contiguous range or for an entire epoch.
   * @param query - Either `{ from, limit }` or `{ epoch }`.
   */
  getCheckpointsData(query: CheckpointsQuery): Promise<CheckpointData[]>;

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
   * Lightweight block-metadata fetch. Returns the block identified by `param` without transaction
   * bodies or other optional context. Cheaper than `getBlock` for header-only access.
   * @param param - A block number, block hash, archive root, chain-tip name, or object variant.
   */
  getBlockData(param: BlockParameter): Promise<BlockData | undefined>;

  /**
   * Returns up to `limit` blocks starting from `from`, projected to the {@link BlockResponse}
   * shape determined by `options`.
   */
  getBlocks<Opts extends BlocksIncludeOptions = {}>(
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
   * @returns An array of GasFees with current min fees first, followed by one entry per predicted slot.
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
   * Gets private logs matching the given tags. Returns one inner array per element of `query.tags`, in
   * input order. An empty inner array means no logs matched that tag. Set `query.includeEffects` to also
   * receive the tx's note hashes and nullifiers.
   *
   * The return type is the widest {@link LogResult} shape — `noteHashes`/`nullifiers` are typed as
   * optional even when `includeEffects: true` is set. JSON-RPC validation can't preserve a stricter
   * narrowing across the wire. Callers that want a narrowed type at the call site should use the typed
   * helpers in `pxe/src/tagging/get_all_logs_by_tags.ts`.
   */
  getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]>;

  /**
   * Gets public logs matching the given tags for the given contract. Returns one inner array per element
   * of `query.tags`, in input order. An empty inner array means no logs matched that tag. Set
   * `query.includeEffects` to also receive the tx's note hashes and nullifiers.
   *
   * The return type is the widest {@link LogResult} shape — see {@link getPrivateLogsByTags}.
   */
  getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]>;

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   * @returns Nothing.
   */
  sendTx(tx: Tx): Promise<void>;

  /**
   * Fetches a transaction receipt for a given transaction hash. Always resolves to one of the lifecycle variants of
   * the {@link TxReceipt} union: a {@link MinedTxReceipt} if the tx was included in a block, a {@link PendingTxReceipt}
   * if it's still in the mempool of the connected Aztec node, or a {@link DroppedTxReceipt} if not found.
   *
   * @param txHash - The transaction hash.
   * @param options - Optional flags controlling which extra data is attached: `includeTxEffect` attaches the full
   * {@link TxEffect} to a mined receipt, `includePendingTx` attaches the pending {@link Tx} to a pending receipt, and
   * `includeProof` keeps the proof on that attached pending tx (only meaningful with `includePendingTx`).
   * @returns A receipt of the transaction.
   */
  getTxReceipt<TGetTxReceiptOptions extends GetTxReceiptOptions = {}>(
    txHash: TxHash,
    options?: TGetTxReceiptOptions,
  ): Promise<TxReceipt<TGetTxReceiptOptions>>;

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   * @deprecated Use `getTxReceipt(txHash, { includeTxEffect: true })` and read the `.txEffect` field instead.
   */
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined>;

  /**
   * Method to retrieve pending txs. The txs' proofs are stripped unless `includeProof` is set.
   * @param limit - The number of items to return.
   * @param after - The last known pending tx. Used for pagination.
   * @param options - Options for the returned txs (eg whether to include their proofs).
   * @returns The pending txs.
   */
  getPendingTxs(limit?: number, after?: TxHash, options?: GetTxByHashOptions): Promise<Tx[]>;

  /**
   * Retrieves the number of pending txs
   * @returns The number of pending txs.
   */
  getPendingTxCount(): Promise<number>;

  /**
   * Method to retrieve a single pending tx. The tx's proof is stripped unless `includeProof` is set.
   * @param txHash - The transaction hash to return.
   * @param options - Options for the returned tx (eg whether to include its proof).
   * @returns The pending tx if it exists.
   */
  getTxByHash(txHash: TxHash, options?: GetTxByHashOptions): Promise<Tx | undefined>;

  /**
   * Method to retrieve multiple pending txs. The txs' proofs are stripped unless `includeProof` is set.
   * @param txHash - The transaction hashes to return.
   * @param options - Options for the returned txs (eg whether to include their proofs).
   * @returns The pending txs if exist.
   */
  getTxsByHash(txHashes: TxHash[], options?: GetTxByHashOptions): Promise<Tx[]>;

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
   * @param skipFeeEnforcement - If true, fee enforcement is skipped.
   * @param overrides - Optional pre-simulation overrides applied to the ephemeral fork and contract DB
   * (publicStorage writes, contract instance overrides).
   **/
  simulatePublicCalls(
    tx: Tx,
    skipFeeEnforcement?: boolean,
    overrides?: SimulationOverrides,
  ): Promise<PublicSimulationOutput>;

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
   * Returns a publicly deployed contract instance given its address. Its current class id is resolved as of the given
   * reference block.
   *
   * Returns `undefined` if the instance has not been published (i.e. `publish_for_public_execution` was never called
   * on the `ContractInstanceRegistry`). A contract whose class has been updated will never return `undefined`:
   * scheduling an update requires the contract's deployment nullifier, which is only emitted by publishing, so any
   * updatable contract has necessarily been published.
   * @param address - Address of the deployed contract.
   * @param referenceBlock - The block parameter (block number, block hash, or 'latest') at which to get the data.
   *        Defaults to 'latest'.
   */
  getContract(address: AztecAddress, referenceBlock?: BlockParameter): Promise<ContractInstanceWithAddress | undefined>;

  /**
   * Returns the ENR of this node for peer discovery, if available.
   */
  getEncodedEnr(): Promise<string | undefined>;

  /**
   * Returns the list of allowed public setup elements configured for this node.
   * @returns The list of allowed elements.
   */
  getAllowedPublicSetup(): Promise<AllowedElement[]>;

  /**
   * Returns info for all connected, dialing, and cached peers. Only available when P2P is enabled.
   * @param includePending - If true, also include peers in the pending state.
   */
  getPeers(includePending?: boolean): Promise<PeerInfo[]>;

  /**
   * Queries the attestation pool for checkpoint attestations for the given slot.
   * @param slot - The slot to query.
   * @param proposalPayloadHash - Hex-encoded keccak256 of the target proposal's signed payload hash.
   *        When provided, only attestations whose payload hash matches are returned.
   *        When omitted, all attestations for the slot are returned.
   */
  getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]>;

  /**
   * Returns block and checkpoint proposals retained in the attestation pool for the given slot.
   * Only available when P2P is enabled.
   */
  getProposalsForSlot(slot: SlotNumber): Promise<ProposalsForSlot>;
}

export const AztecNodeApiSchema: ApiSchemaFor<AztecNode> = {
  getWorldStateSyncStatus: z.function({ input: z.tuple([]), output: WorldStateSyncStatusSchema }),

  findLeavesIndexes: z.function({
    input: z.tuple([BlockParameterSchema, z.nativeEnum(MerkleTreeId), z.array(schemas.Fr).max(MAX_RPC_LEN)]),
    output: z.array(optional(dataInBlockSchemaFor(schemas.BigInt))),
  }),

  getNullifierMembershipWitness: z.function({
    input: z.tuple([BlockParameterSchema, schemas.Fr]),
    output: NullifierMembershipWitness.schema.optional(),
  }),

  getLowNullifierMembershipWitness: z.function({
    input: z.tuple([BlockParameterSchema, schemas.Fr]),
    output: NullifierMembershipWitness.schema.optional(),
  }),

  getPublicDataWitness: z.function({
    input: z.tuple([BlockParameterSchema, schemas.Fr]),
    output: PublicDataWitness.schema.optional(),
  }),

  getBlockHashMembershipWitness: z.function({
    input: z.tuple([BlockParameterSchema, BlockHash.schema]),
    output: MembershipWitness.schemaFor(ARCHIVE_HEIGHT).optional(),
  }),

  getNoteHashMembershipWitness: z.function({
    input: z.tuple([BlockParameterSchema, schemas.Fr]),
    output: MembershipWitness.schemaFor(NOTE_HASH_TREE_HEIGHT).optional(),
  }),

  getL1ToL2MessageMembershipWitness: z.function({
    input: z.tuple([BlockParameterSchema, schemas.Fr]),
    output: z.tuple([schemas.BigInt, SiblingPath.schemaFor(L1_TO_L2_MSG_TREE_HEIGHT)]).optional(),
  }),

  getL1ToL2MessageCheckpoint: z.function({ input: z.tuple([schemas.Fr]), output: CheckpointNumberSchema.optional() }),

  getL2ToL1Messages: z.function({
    input: z.tuple([EpochNumberSchema]),
    output: z.array(z.array(z.array(z.array(schemas.Fr)))),
  }),

  // Reads Outbox roots lazily, pinned to the node's synced L1 block. Caveat: cached roots that are
  // sealed and L1-finalized are not re-validated, so a reorg deeper than L1 finality could leave the
  // node serving a witness against a no-longer-canonical root.
  getL2ToL1MembershipWitness: z.function({
    input: z.tuple([TxHash.schema, schemas.Fr, optional(schemas.Integer)]),
    output: L2ToL1MembershipWitnessSchema.optional(),
  }),

  getBlockNumber: z.function({ input: z.tuple([optional(BlockTagWithoutLatestSchema)]), output: BlockNumberSchema }),

  getCheckpointNumber: z.function({ input: z.tuple([optional(CheckpointTagSchema)]), output: CheckpointNumberSchema }),

  getChainTips: z.function({ input: z.tuple([]), output: L2TipsSchema }),

  getL1Constants: z.function({ input: z.tuple([]), output: L1RollupConstantsSchema }),

  getSyncedL2SlotNumber: z.function({ input: z.tuple([]), output: SlotNumberSchema.optional() }),

  getSyncedL2EpochNumber: z.function({ input: z.tuple([]), output: EpochNumberSchema.optional() }),

  getSyncedL1Timestamp: z.function({ input: z.tuple([]), output: schemas.BigInt.optional() }),

  getCheckpointsData: z.function({ input: z.tuple([CheckpointsQuerySchema]), output: z.array(CheckpointDataSchema) }),

  getBlock: z.function({
    input: z.tuple([BlockParameterSchema, optional(BlockIncludeOptionsSchema)]),
    output: BlockResponseSchema.optional(),
  }),

  getBlockData: z.function({ input: z.tuple([BlockParameterSchema]), output: BlockDataSchema.optional() }),

  getBlocks: z.function({
    input: z.tuple([
      BlockNumberPositiveSchema,
      z.number().gt(0).lte(MAX_RPC_BLOCKS_LEN),
      optional(BlocksIncludeOptionsSchema),
    ]),
    output: z.array(BlockResponseSchema),
  }),

  getCheckpoint: z.function({
    input: z.tuple([CheckpointParameterSchema, optional(CheckpointIncludeOptionsSchema)]),
    output: CheckpointResponseSchema.optional(),
  }),

  getCheckpoints: z.function({
    input: z.tuple([
      CheckpointNumberPositiveSchema,
      z.number().gt(0).lte(MAX_RPC_CHECKPOINTS_LEN),
      optional(CheckpointIncludeOptionsSchema),
    ]),
    output: z.array(CheckpointResponseSchema),
  }),

  isReady: z.function({ input: z.tuple([]), output: z.boolean() }),

  getNodeInfo: z.function({ input: z.tuple([]), output: NodeInfoSchema }),

  getCurrentMinFees: z.function({ input: z.tuple([]), output: GasFees.schema }),

  getPredictedMinFees: z.function({
    input: z.tuple([optional(z.nativeEnum(ManaUsageEstimate))]),
    output: z.array(GasFees.schema),
  }),

  getMaxPriorityFees: z.function({ input: z.tuple([]), output: GasFees.schema }),

  getNodeVersion: z.function({ input: z.tuple([]), output: z.string() }),

  getVersion: z.function({ input: z.tuple([]), output: z.number() }),

  getChainId: z.function({ input: z.tuple([]), output: z.number() }),

  getL1ContractAddresses: z.function({ input: z.tuple([]), output: L1ContractAddressesSchema }),

  getProtocolContractAddresses: z.function({ input: z.tuple([]), output: ProtocolContractAddressesSchema }),

  getPrivateLogsByTags: z.function({
    input: z.tuple([PrivateLogsQuerySchema]),
    output: z.array(z.array(LogResultSchema)),
  }),

  getPublicLogsByTags: z.function({
    input: z.tuple([PublicLogsQuerySchema]),
    output: z.array(z.array(LogResultSchema)),
  }),

  sendTx: z.function({ input: z.tuple([Tx.schema]), output: z.void() }),

  getTxReceipt: z.function({
    input: z.tuple([TxHash.schema, optional(GetTxReceiptOptionsSchema)]),
    output: TxReceiptSchema,
  }),

  getTxEffect: z.function({ input: z.tuple([TxHash.schema]), output: indexedTxSchema().optional() }),

  getPendingTxs: z.function({
    input: z.tuple([
      optional(z.number().gte(1).lte(MAX_RPC_TXS_LEN).default(MAX_RPC_TXS_LEN)),
      optional(TxHash.schema),
      optional(GetTxByHashOptionsSchema),
    ]),
    output: z.array(Tx.schema),
  }),

  getPendingTxCount: z.function({ input: z.tuple([]), output: z.number() }),

  getTxByHash: z.function({
    input: z.tuple([TxHash.schema, optional(GetTxByHashOptionsSchema)]),
    output: Tx.schema.optional(),
  }),

  getTxsByHash: z.function({
    input: z.tuple([z.array(TxHash.schema).max(MAX_RPC_TXS_LEN), optional(GetTxByHashOptionsSchema)]),
    output: z.array(Tx.schema),
  }),

  getPublicStorageAt: z.function({
    input: z.tuple([BlockParameterSchema, schemas.AztecAddress, schemas.Fr]),
    output: schemas.Fr,
  }),

  getValidatorsStats: z.function({ input: z.tuple([]), output: ValidatorsStatsSchema }),

  getValidatorStats: z.function({
    input: z.tuple([schemas.EthAddress, optional(schemas.SlotNumber), optional(schemas.SlotNumber)]),
    output: SingleValidatorStatsSchema.optional(),
  }),

  simulatePublicCalls: z.function({
    input: z.tuple([Tx.schema, optional(z.boolean()), optional(SimulationOverrides.schema)]),
    output: PublicSimulationOutput.schema,
  }),

  isValidTx: z.function({
    input: z.tuple([
      Tx.schema,
      optional(
        z.object({
          isSimulation: optional(z.boolean()).optional(),
          skipFeeEnforcement: optional(z.boolean()).optional(),
        }),
      ),
    ]),
    output: TxValidationResultSchema,
  }),

  getContractClass: z.function({ input: z.tuple([schemas.Fr]), output: ContractClassPublicSchema.optional() }),

  getContract: z.function({
    input: z.tuple([schemas.AztecAddress, optional(BlockParameterSchema)]),
    output: ContractInstanceWithAddressSchema.optional(),
  }),

  getEncodedEnr: z.function({ input: z.tuple([]), output: z.string().optional() }),

  getAllowedPublicSetup: z.function({ input: z.tuple([]), output: z.array(AllowedElementSchema) }),

  getPeers: z.function({ input: z.tuple([optional(z.boolean())]), output: z.array(PeerInfoSchema) }),

  getCheckpointAttestationsForSlot: z.function({
    input: z.tuple([
      schemas.SlotNumber,
      optional(z.string().regex(/^0x[0-9a-fA-F]+$/) as unknown as z.ZodType<CheckpointProposalHash>),
    ]),
    output: z.array(CheckpointAttestation.schema),
  }),

  getProposalsForSlot: z.function({
    input: z.tuple([schemas.SlotNumber]),
    output: ProposalsForSlotSchema,
  }),
};

/** Options for an Aztec node JSON-RPC client. */
export type AztecNodeClientOptions = {
  /** Expected component versions checked against response headers. */
  versions?: Partial<ComponentsVersions>;
  /** Custom JSON-RPC transport. Takes precedence over fetchOptions. */
  fetch?: JsonRpcFetch;
  /** Configuration for the default retrying fetch transport. */
  fetchOptions?: JsonRpcFetchConfig;
  /** Time in milliseconds to collect calls into a JSON-RPC batch. */
  batchWindowMS?: number;
  /** Maximum number of calls sent in one JSON-RPC batch. */
  maxBatchSize?: number;
};

export function createAztecNodeClient(url: string, options: AztecNodeClientOptions = {}): AztecNode {
  const fetch = options.fetch ?? makeFetch([1, 2, 3], false, undefined, options.fetchOptions);

  return createSafeJsonRpcClient<AztecNode>(url, AztecNodeApiSchema, {
    namespaceMethods: 'aztec',
    fetch,
    batchWindowMS: options.batchWindowMS ?? 0,
    maxBatchSize: options.maxBatchSize,
    onResponse: getVersioningResponseHandler(options.versions ?? {}),
  });
}
