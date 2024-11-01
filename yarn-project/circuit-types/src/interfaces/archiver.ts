import {
  AztecAddress,
  ContractClassPublic,
  ContractClassPublicSchema,
  ContractDataSource,
  ContractInstanceWithAddress,
  EthAddress,
  Fr,
  FunctionSelector,
  Header,
  PublicFunction,
  PublicFunctionSchema,
} from '@aztec/circuits.js';
import { ContractArtifact } from '@aztec/foundation/abi';
import { ApiSchemaFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { L2Block } from '../l2_block.js';
import { L2BlockSource, L2Tips, L2TipsSchema } from '../l2_block_source.js';
import { EncryptedL2NoteLog } from '../logs/encrypted_l2_note_log.js';
import { GetUnencryptedLogsResponse, GetUnencryptedLogsResponseSchema } from '../logs/get_unencrypted_logs_response.js';
import { L2BlockL2Logs } from '../logs/l2_block_l2_logs.js';
import { L2LogsSource } from '../logs/l2_logs_source.js';
import { LogFilter, LogFilterSchema } from '../logs/log_filter.js';
import { FromLogType, LogType } from '../logs/log_type.js';
import { L1ToL2MessageSource } from '../messaging/l1_to_l2_message_source.js';
import { TxHash } from '../tx/tx_hash.js';
import { TxReceipt } from '../tx/tx_receipt.js';
import { TxEffect } from '../tx_effect.js';

export type ArchiverApi = Omit<
  L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource,
  'start' | 'stop'
>;

class Foo implements ArchiveSource {
  getRollupAddress(): Promise<EthAddress> {
    throw new Error('Method not implemented.');
  }
  getRegistryAddress(): Promise<EthAddress> {
    throw new Error('Method not implemented.');
  }
  getBlockNumber(): Promise<number>;
  getBlockNumber(): Promise<number> {
    throw new Error('Method not implemented.');
  }
  getProvenBlockNumber(): Promise<number> {
    throw new Error('Method not implemented.');
  }
  getProvenL2EpochNumber(): Promise<number | undefined> {
    throw new Error('Method not implemented.');
  }
  getBlock(number: number): Promise<L2Block | undefined> {
    throw new Error('Method not implemented.');
  }
  getBlockHeader(number: number | 'latest'): Promise<Header | undefined> {
    throw new Error('Method not implemented.');
  }
  getBlocks(from: number, limit: number, proven?: boolean | undefined): Promise<L2Block[]> {
    throw new Error('Method not implemented.');
  }
  getTxEffect(txHash: TxHash): Promise<TxEffect | undefined> {
    throw new Error('Method not implemented.');
  }
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    throw new Error('Method not implemented.');
  }
  getL2SlotNumber(): Promise<bigint> {
    throw new Error('Method not implemented.');
  }
  getL2EpochNumber(): Promise<bigint> {
    throw new Error('Method not implemented.');
  }
  getBlocksForEpoch(epochNumber: bigint): Promise<L2Block[]> {
    throw new Error('Method not implemented.');
  }
  isEpochComplete(epochNumber: bigint): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  getL2Tips(): Promise<L2Tips> {
    throw new Error('Method not implemented.');
  }
  start(blockUntilSynced: boolean): Promise<void> {
    throw new Error('Method not implemented.');
  }
  stop(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getLogs<TLogType extends LogType>(
    from: number,
    limit: number,
    logType: TLogType,
  ): Promise<L2BlockL2Logs<FromLogType<TLogType>>[]> {
    throw new Error('Method not implemented.');
  }
  getLogsByTags(tags: Fr[]): Promise<EncryptedL2NoteLog[][]> {
    throw new Error('Method not implemented.');
  }
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    throw new Error('Method not implemented.');
  }
  getPublicFunction(address: AztecAddress, selector: FunctionSelector): Promise<PublicFunction | undefined> {
    throw new Error('Method not implemented.');
  }
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    throw new Error('Method not implemented.');
  }
  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    throw new Error('Method not implemented.');
  }
  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }
  getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    throw new Error('Method not implemented.');
  }
  addContractArtifact(address: AztecAddress, contract: ContractArtifact): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    throw new Error('Method not implemented.');
  }
}

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
    .returns(Header.schema.optional()),
  getBlocks: z
    .function()
    .args(schemas.Integer, schemas.Integer, z.boolean().optional())
    .returns(z.array(L2Block.schema)),
  getTxEffect: z.function().args(TxHash.schema).returns(TxEffect.schema.optional()),
  getSettledTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema.optional()),
  getL2SlotNumber: z.function().args().returns(schemas.BigInt),
  getL2EpochNumber: z.function().args().returns(schemas.BigInt),
  getBlocksForEpoch: z.function().args(schemas.BigInt).returns(z.array(L2Block.schema)),
  isEpochComplete: z.function().args(schemas.BigInt).returns(z.boolean()),
  getL2Tips: z.function().args().returns(L2TipsSchema),
  getLogs: z.function().args(schemas.Integer, schemas.Integer, LogTypeSchema).returns(z.array(L2BlockL2LogsSchema)),
  getLogsByTags: z
    .function()
    .args(z.array(schemas.Fr))
    .returns(z.array(z.array(EncryptedL2NoteLog.schema))),
  getUnencryptedLogs: z.function().args(LogFilterSchema).returns(GetUnencryptedLogsResponseSchema),
  getPublicFunction: z
    .function()
    .args(schemas.AztecAddress, schemas.FunctionSelector)
    .returns(PublicFunctionSchema.optional()),
  getContractClass: z.function().args(schemas.Fr).returns(ContractClassPublicSchema.optional()),
  getContract: z.function().args(schemas.AztecAddress).returns(ContractInstanceWithAddressSchema.optional()),
  getContractClassIds: z.function().args().returns(z.array(schemas.Fr)),
  getContractArtifact: z.function().args(schemas.AztecAddress).returns(ContractArtifactSchema.optional()),
  addContractArtifact: z.function().args(schemas.AztecAddress, ContractArtifactSchema).returns(z.void()),
  getL1ToL2Messages: z.function().args(schemas.BigInt).returns(z.array(schemas.Fr)),
  getL1ToL2MessageIndex: z.function().args(schemas.Fr).returns(schemas.BigInt.optional()),
};
