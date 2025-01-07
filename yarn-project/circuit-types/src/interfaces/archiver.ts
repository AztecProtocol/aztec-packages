import {
  BlockHeader,
  ContractClassPublicSchema,
  type ContractDataSource,
  ContractInstanceWithAddressSchema,
  PrivateLog,
  PublicFunctionSchema,
} from '@aztec/circuits.js';
import { type ApiSchemaFor, optional, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { inBlockSchemaFor } from '../in_block.js';
import { L2Block } from '../l2_block.js';
import { type L2BlockSource, L2TipsSchema } from '../l2_block_source.js';
import {
  GetPublicLogsResponseSchema,
  GetUnencryptedLogsResponseSchema,
  TxScopedL2Log,
} from '../logs/get_logs_response.js';
import { type L2LogsSource } from '../logs/l2_logs_source.js';
import { LogFilterSchema } from '../logs/log_filter.js';
import { type L1ToL2MessageSource } from '../messaging/l1_to_l2_message_source.js';
import { type NullifierWithBlockSource } from '../nullifier_with_block_source.js';
import { TxHash } from '../tx/tx_hash.js';
import { TxReceipt } from '../tx/tx_receipt.js';
import { TxEffect } from '../tx_effect.js';

export type ArchiverApi = Omit<
  L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource & NullifierWithBlockSource,
  'start' | 'stop'
>;

export const ArchiverApiSchema: ApiSchemaFor<ArchiverApi> = {
  getRollupAddress: z.function().args().returns(schemas.EthAddress),
  getRegistryAddress: z.function().args().returns(schemas.EthAddress),
  getBlockNumber: z.function().args().returns(schemas.Integer),
  getProvenBlockNumber: z.function().args().returns(schemas.Integer),
  getProvenL2EpochNumber: z.function().args().returns(schemas.Integer.optional()),
  getBlock: z.function().args(schemas.Integer).returns(L2Block.schema.optional()),
  getBlockHeader: z
    .function()
    .args(z.union([schemas.Integer, z.literal('latest')]))
    .returns(BlockHeader.schema.optional()),
  getBlocks: z
    .function()
    .args(schemas.Integer, schemas.Integer, optional(z.boolean()))
    .returns(z.array(L2Block.schema)),
  getTxEffect: z.function().args(TxHash.schema).returns(inBlockSchemaFor(TxEffect.schema).optional()),
  getSettledTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema.optional()),
  getL2SlotNumber: z.function().args().returns(schemas.BigInt),
  getL2EpochNumber: z.function().args().returns(schemas.BigInt),
  getBlocksForEpoch: z.function().args(schemas.BigInt).returns(z.array(L2Block.schema)),
  isEpochComplete: z.function().args(schemas.BigInt).returns(z.boolean()),
  getL2Tips: z.function().args().returns(L2TipsSchema),
  getPrivateLogs: z.function().args(z.number(), z.number()).returns(z.array(PrivateLog.schema)),
  getLogsByTags: z
    .function()
    .args(z.array(schemas.Fr))
    .returns(z.array(z.array(TxScopedL2Log.schema))),
  findNullifiersIndexesWithBlock: z
    .function()
    .args(z.number(), z.array(schemas.Fr))
    .returns(z.array(optional(inBlockSchemaFor(schemas.BigInt)))),
  getPublicLogs: z.function().args(LogFilterSchema).returns(GetPublicLogsResponseSchema),
  getContractClassLogs: z.function().args(LogFilterSchema).returns(GetUnencryptedLogsResponseSchema),
  getPublicFunction: z
    .function()
    .args(schemas.AztecAddress, schemas.FunctionSelector)
    .returns(PublicFunctionSchema.optional()),
  getContractClass: z.function().args(schemas.Fr).returns(ContractClassPublicSchema.optional()),
  getBytecodeCommitment: z.function().args(schemas.Fr).returns(schemas.Fr),
  getContract: z.function().args(schemas.AztecAddress).returns(ContractInstanceWithAddressSchema.optional()),
  getContractClassIds: z.function().args().returns(z.array(schemas.Fr)),
  registerContractFunctionNames: z
    .function()
    .args(schemas.AztecAddress, z.record(z.string(), z.string()))
    .returns(z.void()),
  getL1ToL2Messages: z.function().args(schemas.BigInt).returns(z.array(schemas.Fr)),
  getL1ToL2MessageIndex: z.function().args(schemas.Fr).returns(schemas.BigInt.optional()),
  // TODO(#10007): Remove this method
  addContractClass: z.function().args(ContractClassPublicSchema).returns(z.void()),
  getContractFunctionName: z
    .function()
    .args(schemas.AztecAddress, schemas.FunctionSelector)
    .returns(optional(z.string())),
};
