import { BlockNumberSchema, CheckpointNumberSchema, EpochNumberSchema } from '@aztec/foundation/branded-types';
import type { ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { BlockDataSchema } from '../block/block_data.js';
import { L2Block } from '../block/l2_block.js';
import {
  BlockQuerySchema,
  BlocksQuerySchema,
  CheckpointQuerySchema,
  CheckpointsQuerySchema,
  type L2BlockSource,
  L2TipsSchema,
  ProposedCheckpointQuerySchema,
} from '../block/l2_block_source.js';
import { ValidateCheckpointResultSchema } from '../block/validate_block_result.js';
import { CheckpointDataSchema, ProposedCheckpointDataSchema } from '../checkpoint/checkpoint_data.js';
import { PublishedCheckpoint } from '../checkpoint/published_checkpoint.js';
import {
  ContractClassPublicSchema,
  type ContractDataSource,
  ContractInstanceWithAddressSchema,
} from '../contract/index.js';
import { L1RollupConstantsSchema } from '../epoch-helpers/index.js';
import { LogResultSchema } from '../logs/log_result.js';
import { ResolvedPrivateLogsQuerySchema, ResolvedPublicLogsQuerySchema } from '../logs/logs_query.js';
import type { L1ToL2MessageSource } from '../messaging/l1_to_l2_message_source.js';
import { L2ToL1MembershipWitnessSchema } from '../messaging/l2_to_l1_membership.js';
import { optional, schemas } from '../schemas/schemas.js';
import { indexedTxSchema } from '../tx/indexed_tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import type { L2LogsSource } from './l2_logs_source.js';

/**
 * The archiver configuration.
 */
export type ArchiverSpecificConfig = {
  /** The polling interval in ms for retrieving new L2 blocks and encrypted logs. */
  archiverPollingIntervalMS?: number;

  /** The number of L2 blocks the archiver will attempt to download at a time. */
  archiverBatchSize?: number;

  /** The polling interval viem uses in ms */
  viemPollingIntervalMS?: number;

  /** The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKb. */
  archiverStoreMapSizeKb?: number;

  /** Maximum allowed drift in seconds between the Ethereum client and current time. */
  maxAllowedEthClientDriftSeconds?: number;

  /** Whether to allow starting the archiver without debug/trace method support on Ethereum hosts */
  ethereumAllowNoDebugHosts?: boolean;

  /** Skip the startup check that probes the L1 RPC for historical logs on the Rollup contract. */
  archiverSkipHistoricalLogsCheck?: boolean;

  /** Skip validating checkpoint attestations (for testing purposes only) */
  skipValidateCheckpointAttestations?: boolean;

  /** Skip promoting proposed checkpoints during L1 sync (for testing purposes only) */
  skipPromoteProposedCheckpointDuringL1Sync?: boolean;

  /** Local tolerance in seconds before pruning an orphan block when no checkpoint proposal was received. */
  orphanPruneNoProposalTolerance?: number;

  /** Skip pruning orphan proposed blocks that have no matching proposed checkpoint. */
  skipOrphanProposedBlockPruning?: boolean;

  /**
   * Preload the standard contracts (AuthRegistry, PublicChecks, HandshakeRegistry) into the contract store at block 0.
   * For test environments only: it must only be set when genesis also seeds the matching registration/deployment
   * nullifiers, otherwise a later on-chain publish of a preloaded class would collide with the block-0 preload.
   */
  testPreloadStandardContracts?: boolean;
};

export const ArchiverSpecificConfigSchema = z.object({
  archiverPollingIntervalMS: schemas.Integer.optional(),
  archiverBatchSize: schemas.Integer.optional(),
  viemPollingIntervalMS: schemas.Integer.optional(),
  archiverStoreMapSizeKb: schemas.Integer.optional(),
  maxAllowedEthClientDriftSeconds: schemas.Integer.optional(),
  ethereumAllowNoDebugHosts: z.boolean().optional(),
  archiverSkipHistoricalLogsCheck: z.boolean().optional(),
  skipValidateCheckpointAttestations: z.boolean().optional(),
  skipPromoteProposedCheckpointDuringL1Sync: z.boolean().optional(),
  orphanPruneNoProposalTolerance: schemas.Integer.optional(),
  skipOrphanProposedBlockPruning: z.boolean().optional(),
  testPreloadStandardContracts: z.boolean().optional(),
});

export type ArchiverApi = Omit<
  L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource,
  'start' | 'stop' | 'getGenesisBlockHash'
>;

export const ArchiverApiSchema: ApiSchemaFor<ArchiverApi> = {
  getRollupAddress: z.function({ input: z.tuple([]), output: schemas.EthAddress }),
  getRegistryAddress: z.function({ input: z.tuple([]), output: schemas.EthAddress }),
  getBlockNumber: z.function({ input: z.tuple([optional(BlockQuerySchema)]), output: BlockNumberSchema.optional() }),
  getCheckpointNumber: z.function({ input: z.tuple([]), output: CheckpointNumberSchema }),
  getCheckpoint: z.function({ input: z.tuple([CheckpointQuerySchema]), output: PublishedCheckpoint.schema.optional() }),
  getCheckpoints: z.function({ input: z.tuple([CheckpointsQuerySchema]), output: z.array(PublishedCheckpoint.schema) }),
  getCheckpointData: z.function({ input: z.tuple([CheckpointQuerySchema]), output: CheckpointDataSchema.optional() }),
  getCheckpointsData: z.function({ input: z.tuple([CheckpointsQuerySchema]), output: z.array(CheckpointDataSchema) }),
  getTxEffect: z.function({ input: z.tuple([TxHash.schema]), output: indexedTxSchema().optional() }),
  // Reads Outbox roots lazily, pinned to the node's synced L1 block. Caveat: cached roots that are
  // sealed and L1-finalized are not re-validated, so a reorg deeper than L1 finality could leave the
  // node serving a witness against a no-longer-canonical root.
  getL2ToL1MembershipWitness: z.function({
    input: z.tuple([TxHash.schema, schemas.Fr, optional(schemas.Integer)]),
    output: L2ToL1MembershipWitnessSchema.optional(),
  }),
  getSyncedL2SlotNumber: z.function({ input: z.tuple([]), output: schemas.SlotNumber.optional() }),
  getSyncedL2EpochNumber: z.function({ input: z.tuple([]), output: EpochNumberSchema.optional() }),
  getBlocksForSlot: z.function({ input: z.tuple([schemas.SlotNumber]), output: z.array(L2Block.schema) }),
  isEpochComplete: z.function({ input: z.tuple([EpochNumberSchema]), output: z.boolean() }),
  getL2Tips: z.function({ input: z.tuple([]), output: L2TipsSchema }),
  getPrivateLogsByTags: z.function({
    input: z.tuple([ResolvedPrivateLogsQuerySchema]),
    output: z.array(z.array(LogResultSchema)),
  }),
  getPublicLogsByTags: z.function({
    input: z.tuple([ResolvedPublicLogsQuerySchema]),
    output: z.array(z.array(LogResultSchema)),
  }),
  getContractClass: z.function({ input: z.tuple([schemas.Fr]), output: ContractClassPublicSchema.optional() }),
  getBytecodeCommitment: z.function({ input: z.tuple([schemas.Fr]), output: schemas.Fr }),
  getContract: z.function({
    input: z.tuple([schemas.AztecAddress, schemas.BigInt]),
    output: ContractInstanceWithAddressSchema.optional(),
  }),
  getContractClassIds: z.function({ input: z.tuple([]), output: z.array(schemas.Fr) }),
  registerContractFunctionSignatures: z.function({ input: z.tuple([z.array(z.string())]), output: z.void() }),
  getL1ToL2Messages: z.function({ input: z.tuple([CheckpointNumberSchema]), output: z.array(schemas.Fr) }),
  getL1ToL2MessageIndex: z.function({ input: z.tuple([schemas.Fr]), output: schemas.BigInt.optional() }),
  getDebugFunctionName: z.function({
    input: z.tuple([schemas.AztecAddress, schemas.FunctionSelector]),
    output: optional(z.string()),
  }),
  getL1Constants: z.function({ input: z.tuple([]), output: L1RollupConstantsSchema }),
  isPruneDueAtSlot: z.function({ input: z.tuple([schemas.SlotNumber]), output: z.boolean() }),
  getGenesisValues: z.function({ input: z.tuple([]), output: z.object({ genesisArchiveRoot: schemas.Fr }) }),
  getL1Timestamp: z.function({ input: z.tuple([]), output: schemas.BigInt.optional() }),
  getProposedCheckpointData: z.function({
    input: z.tuple([optional(ProposedCheckpointQuerySchema)]),
    output: ProposedCheckpointDataSchema.optional(),
  }),
  syncImmediate: z.function({ input: z.tuple([]), output: z.void() }),
  isPendingChainInvalid: z.function({ input: z.tuple([]), output: z.boolean() }),
  getPendingChainValidationStatus: z.function({ input: z.tuple([]), output: ValidateCheckpointResultSchema }),
  getBlock: z.function({ input: z.tuple([BlockQuerySchema]), output: L2Block.schema.optional() }),
  getBlocks: z.function({ input: z.tuple([BlocksQuerySchema]), output: z.array(L2Block.schema) }),
  getBlockData: z.function({ input: z.tuple([BlockQuerySchema]), output: BlockDataSchema.optional() }),
  getBlocksData: z.function({ input: z.tuple([BlocksQuerySchema]), output: z.array(BlockDataSchema) }),
};
