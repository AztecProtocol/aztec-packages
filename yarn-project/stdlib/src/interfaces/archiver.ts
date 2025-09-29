import type { L1ContractAddresses } from '@aztec/ethereum';
import type { ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { L2Block } from '../block/l2_block.js';
import { type L2BlockSource, L2TipsSchema } from '../block/l2_block_source.js';
import { PublishedL2Block } from '../block/published_l2_block.js';
import { ValidateBlockResultSchema } from '../block/validate_block_result.js';
import {
  ContractClassPublicSchema,
  type ContractDataSource,
  ContractInstanceWithAddressSchema,
} from '../contract/index.js';
import { L1RollupConstantsSchema } from '../epoch-helpers/index.js';
import { LogFilterSchema } from '../logs/log_filter.js';
import { PrivateLog } from '../logs/private_log.js';
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

  /** The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKB. */
  archiverStoreMapSizeKb?: number;

  /** Whether to skip validating block attestations (use only for testing). */
  skipValidateBlockAttestations?: boolean;
};

export const ArchiverSpecificConfigSchema = z.object({
  archiverPollingIntervalMS: schemas.Integer.optional(),
  archiverBatchSize: schemas.Integer.optional(),
  viemPollingIntervalMS: schemas.Integer.optional(),
  maxLogs: schemas.Integer.optional(),
  archiverStoreMapSizeKb: schemas.Integer.optional(),
  skipValidateBlockAttestations: z.boolean().optional(),
});

export type ArchiverApi = Omit<
  L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource,
  'start' | 'stop'
>;

export const ArchiverApiSchema: ApiSchemaFor<ArchiverApi> = {
  getRollupAddress: z.function().args().returns(schemas.EthAddress),
  getRegistryAddress: z.function().args().returns(schemas.EthAddress),
  getBlockNumber: z.function().args().returns(schemas.Integer),
  getProvenBlockNumber: z.function().args().returns(schemas.Integer),
  getBlock: z.function().args(schemas.Integer).returns(L2Block.schema.optional()),
  getBlockHeader: z
    .function()
    .args(z.union([schemas.Integer, z.literal('latest')]))
    .returns(BlockHeader.schema.optional()),
  getBlocks: z
    .function()
    .args(schemas.Integer, schemas.Integer, optional(z.boolean()))
    .returns(z.array(L2Block.schema)),
  getPublishedBlocks: z
    .function()
    .args(schemas.Integer, schemas.Integer, optional(z.boolean()))
    .returns(z.array(PublishedL2Block.schema)),
  getTxEffect: z.function().args(TxHash.schema).returns(indexedTxSchema().optional()),
  getSettledTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema.optional()),
  getL2SlotNumber: z.function().args().returns(schemas.BigInt),
  getL2EpochNumber: z.function().args().returns(schemas.BigInt),
  getBlocksForEpoch: z.function().args(schemas.BigInt).returns(z.array(L2Block.schema)),
  getBlockHeadersForEpoch: z.function().args(schemas.BigInt).returns(z.array(BlockHeader.schema)),
  isEpochComplete: z.function().args(schemas.BigInt).returns(z.boolean()),
  getL2Tips: z.function().args().returns(L2TipsSchema),
  getPrivateLogs: z.function().args(z.number(), z.number()).returns(z.array(PrivateLog.schema)),
  getLogsByTags: z
    .function()
    .args(z.array(schemas.Fr))
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
  getL1ToL2Messages: z.function().args(schemas.Integer).returns(z.array(schemas.Fr)),
  getL1ToL2MessageIndex: z.function().args(schemas.Fr).returns(schemas.BigInt.optional()),
  getDebugFunctionName: z.function().args(schemas.AztecAddress, schemas.FunctionSelector).returns(optional(z.string())),
  getL1Constants: z.function().args().returns(L1RollupConstantsSchema),
  getL1Timestamp: z.function().args().returns(schemas.BigInt),
  syncImmediate: z.function().args().returns(z.void()),
  isPendingChainInvalid: z.function().args().returns(z.boolean()),
  getPendingChainValidationStatus: z.function().args().returns(ValidateBlockResultSchema),
};
