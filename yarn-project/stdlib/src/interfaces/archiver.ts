import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { BlockNumberSchema, CheckpointNumberSchema, EpochNumberSchema } from '@aztec/foundation/branded-types';
import type { ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { BlockDataSchema } from '../block/block_data.js';
import { BlockHash } from '../block/block_hash.js';
import { CheckpointedL2Block } from '../block/checkpointed_l2_block.js';
import { L2Block } from '../block/l2_block.js';
import { type L2BlockSource, L2TipsSchema } from '../block/l2_block_source.js';
import { ValidateCheckpointResultSchema } from '../block/validate_block_result.js';
import { Checkpoint } from '../checkpoint/checkpoint.js';
import { CheckpointDataSchema } from '../checkpoint/checkpoint_data.js';
import { PublishedCheckpoint } from '../checkpoint/published_checkpoint.js';
import {
  ContractClassPublicSchema,
  type ContractDataSource,
  ContractInstanceWithAddressSchema,
} from '../contract/index.js';
import { L1RollupConstantsSchema } from '../epoch-helpers/index.js';
import { LogFilterSchema } from '../logs/log_filter.js';
import { SiloedTag } from '../logs/siloed_tag.js';
import { Tag } from '../logs/tag.js';
import { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';
import type { L1ToL2MessageSource } from '../messaging/l1_to_l2_message_source.js';
import { optional, schemas } from '../schemas/schemas.js';
import { BlockHeader } from '../tx/block_header.js';
import { indexedTxSchema } from '../tx/indexed_tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import { TxReceipt } from '../tx/tx_receipt.js';
import { GetContractClassLogsResponseSchema, GetPublicLogsResponseSchema } from './get_logs_response.js';
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

  /** The deployed L1 contract addresses */
  l1Contracts: L1ContractAddresses;

  /** The max number of logs that can be obtained in 1 "getPublicLogs" call. */
  maxLogs?: number;

  /** The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKb. */
  archiverStoreMapSizeKb?: number;

  /** Maximum allowed drift in seconds between the Ethereum client and current time. */
  maxAllowedEthClientDriftSeconds?: number;

  /** Whether to allow starting the archiver without debug/trace method support on Ethereum hosts */
  ethereumAllowNoDebugHosts?: boolean;

  /** Skip validating checkpoint attestations (for testing purposes only) */
  skipValidateCheckpointAttestations?: boolean;
};

export const ArchiverSpecificConfigSchema = z.object({
  archiverPollingIntervalMS: schemas.Integer.optional(),
  archiverBatchSize: schemas.Integer.optional(),
  viemPollingIntervalMS: schemas.Integer.optional(),
  maxLogs: schemas.Integer.optional(),
  archiverStoreMapSizeKb: schemas.Integer.optional(),
  maxAllowedEthClientDriftSeconds: schemas.Integer.optional(),
  ethereumAllowNoDebugHosts: z.boolean().optional(),
  skipValidateCheckpointAttestations: z.boolean().optional(),
});

export type ArchiverApi = Omit<
  L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource,
  'start' | 'stop'
>;

export const ArchiverApiSchema: ApiSchemaFor<ArchiverApi> = {
  getRollupAddress: z.function().args().returns(schemas.EthAddress),
  getRegistryAddress: z.function().args().returns(schemas.EthAddress),
  getBlockNumber: z.function().args().returns(BlockNumberSchema),
  getProvenBlockNumber: z.function().args().returns(BlockNumberSchema),
  getCheckpointedL2BlockNumber: z.function().args().returns(BlockNumberSchema),
  getFinalizedL2BlockNumber: z.function().args().returns(BlockNumberSchema),
  getBlock: z.function().args(BlockNumberSchema).returns(L2Block.schema.optional()),
  getBlockHeader: z
    .function()
    .args(z.union([BlockNumberSchema, z.literal('latest')]))
    .returns(BlockHeader.schema.optional()),
  getCheckpointedBlock: z.function().args(BlockNumberSchema).returns(CheckpointedL2Block.schema.optional()),
  getCheckpointedBlocks: z
    .function()
    .args(BlockNumberSchema, schemas.Integer)
    .returns(z.array(CheckpointedL2Block.schema)),
  getBlocks: z.function().args(BlockNumberSchema, schemas.Integer).returns(z.array(L2Block.schema)),
  getCheckpoints: z
    .function()
    .args(CheckpointNumberSchema, schemas.Integer)
    .returns(z.array(PublishedCheckpoint.schema)),
  getCheckpointedBlockByHash: z.function().args(BlockHash.schema).returns(CheckpointedL2Block.schema.optional()),
  getCheckpointedBlockByArchive: z.function().args(schemas.Fr).returns(CheckpointedL2Block.schema.optional()),
  getBlockHeaderByHash: z.function().args(BlockHash.schema).returns(BlockHeader.schema.optional()),
  getBlockHeaderByArchive: z.function().args(schemas.Fr).returns(BlockHeader.schema.optional()),
  getBlockData: z.function().args(BlockNumberSchema).returns(BlockDataSchema.optional()),
  getBlockDataByArchive: z.function().args(schemas.Fr).returns(BlockDataSchema.optional()),
  getL2Block: z.function().args(BlockNumberSchema).returns(L2Block.schema.optional()),
  getL2BlockByHash: z.function().args(BlockHash.schema).returns(L2Block.schema.optional()),
  getL2BlockByArchive: z.function().args(schemas.Fr).returns(L2Block.schema.optional()),
  getTxEffect: z.function().args(TxHash.schema).returns(indexedTxSchema().optional()),
  getSettledTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema.optional()),
  getL2SlotNumber: z.function().args().returns(schemas.SlotNumber.optional()),
  getL2EpochNumber: z.function().args().returns(EpochNumberSchema.optional()),
  getCheckpointsForEpoch: z.function().args(EpochNumberSchema).returns(z.array(Checkpoint.schema)),
  getCheckpointsDataForEpoch: z.function().args(EpochNumberSchema).returns(z.array(CheckpointDataSchema)),
  getCheckpointedBlocksForEpoch: z.function().args(EpochNumberSchema).returns(z.array(CheckpointedL2Block.schema)),
  getBlocksForSlot: z.function().args(schemas.SlotNumber).returns(z.array(L2Block.schema)),
  getCheckpointedBlockHeadersForEpoch: z.function().args(EpochNumberSchema).returns(z.array(BlockHeader.schema)),
  isEpochComplete: z.function().args(EpochNumberSchema).returns(z.boolean()),
  getL2Tips: z.function().args().returns(L2TipsSchema),
  getPrivateLogsByTags: z
    .function()
    .args(z.array(SiloedTag.schema), optional(z.number().gte(0)))
    .returns(z.array(z.array(TxScopedL2Log.schema))),
  getPublicLogsByTagsFromContract: z
    .function()
    .args(schemas.AztecAddress, z.array(Tag.schema), optional(z.number().gte(0)))
    .returns(z.array(z.array(TxScopedL2Log.schema))),
  getPublicLogs: z.function().args(LogFilterSchema).returns(GetPublicLogsResponseSchema),
  getContractClassLogs: z.function().args(LogFilterSchema).returns(GetContractClassLogsResponseSchema),
  getContractClass: z.function().args(schemas.Fr).returns(ContractClassPublicSchema.optional()),
  getBytecodeCommitment: z.function().args(schemas.Fr).returns(schemas.Fr),
  getContract: z
    .function()
    .args(schemas.AztecAddress, optional(schemas.BigInt))
    .returns(ContractInstanceWithAddressSchema.optional()),
  getContractClassIds: z.function().args().returns(z.array(schemas.Fr)),
  registerContractFunctionSignatures: z.function().args(z.array(z.string())).returns(z.void()),
  getL1ToL2Messages: z.function().args(CheckpointNumberSchema).returns(z.array(schemas.Fr)),
  getL1ToL2MessageIndex: z.function().args(schemas.Fr).returns(schemas.BigInt.optional()),
  getDebugFunctionName: z.function().args(schemas.AztecAddress, schemas.FunctionSelector).returns(optional(z.string())),
  getL1Constants: z.function().args().returns(L1RollupConstantsSchema),
  getGenesisValues: z
    .function()
    .args()
    .returns(z.object({ genesisArchiveRoot: schemas.Fr })),
  getL1Timestamp: z.function().args().returns(schemas.BigInt.optional()),
  syncImmediate: z.function().args().returns(z.void()),
  isPendingChainInvalid: z.function().args().returns(z.boolean()),
  getPendingChainValidationStatus: z.function().args().returns(ValidateCheckpointResultSchema),
};
