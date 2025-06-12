import { randomInt } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import omit from 'lodash.omit';

import type { ContractArtifact } from '../abi/abi.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { AztecAddress } from '../aztec-address/index.js';
import { CommitteeAttestation } from '../block/index.js';
import { L2Block } from '../block/l2_block.js';
import type { L2Tips } from '../block/l2_block_source.js';
import type { PublishedL2Block } from '../block/published_l2_block.js';
import { getContractClassFromArtifact } from '../contract/contract_class.js';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  computePublicBytecodeCommitment,
} from '../contract/index.js';
import { EmptyL1RollupConstants, type L1RollupConstants } from '../epoch-helpers/index.js';
import { PublicKeys } from '../keys/public_keys.js';
import { ExtendedContractClassLog } from '../logs/extended_contract_class_log.js';
import { ExtendedPublicLog } from '../logs/extended_public_log.js';
import type { LogFilter } from '../logs/log_filter.js';
import { PrivateLog } from '../logs/private_log.js';
import { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';
import { getTokenContractArtifact } from '../tests/fixtures.js';
import { BlockHeader } from '../tx/block_header.js';
import type { IndexedTxEffect } from '../tx/indexed_tx_effect.js';
import { TxEffect } from '../tx/tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import { TxReceipt } from '../tx/tx_receipt.js';
import { type ArchiverApi, ArchiverApiSchema } from './archiver.js';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from './get_logs_response.js';

describe('ArchiverApiSchema', () => {
  let handler: MockArchiver;
  let context: JsonRpcTestContext<ArchiverApi>;
  let artifact: ContractArtifact;

  const tested: Set<string> = new Set();

  beforeAll(() => {
    artifact = getTokenContractArtifact();
  });

  beforeEach(async () => {
    handler = new MockArchiver(artifact);
    context = await createJsonRpcTestSetup<ArchiverApi>(handler, ArchiverApiSchema);
  });

  afterEach(() => {
    tested.add(/^ArchiverApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(ArchiverApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getRollupAddress', async () => {
    const result = await context.client.getRollupAddress();
    expect(result).toBeInstanceOf(EthAddress);
  });

  it('getRegistryAddress', async () => {
    const result = await context.client.getRegistryAddress();
    expect(result).toBeInstanceOf(EthAddress);
  });

  it('getBlockNumber', async () => {
    const result = await context.client.getBlockNumber();
    expect(result).toBe(1);
  });

  it('getProvenBlockNumber', async () => {
    const result = await context.client.getProvenBlockNumber();
    expect(result).toBe(1);
  });

  it('getBlock', async () => {
    const result = await context.client.getBlock(1);
    expect(result).toBeInstanceOf(L2Block);
  });

  it('getBlockHeader', async () => {
    const result = await context.client.getBlockHeader(1);
    expect(result).toBeInstanceOf(BlockHeader);
  });

  it('getBlocks', async () => {
    const result = await context.client.getBlocks(1, 1);
    expect(result).toEqual([expect.any(L2Block)]);
  });

  it('getPublishedBlocks', async () => {
    const response = await context.client.getPublishedBlocks(1, 1);
    expect(response).toHaveLength(1);
    expect(response[0].block.constructor.name).toEqual('L2Block');
    expect(response[0].attestations[0]).toBeInstanceOf(CommitteeAttestation);
    expect(response[0].l1).toBeDefined();
  });

  it('getTxEffect', async () => {
    const result = await context.client.getTxEffect(TxHash.fromBuffer(Buffer.alloc(32, 1)));
    expect(result!.data).toBeInstanceOf(TxEffect);
  });

  it('getSettledTxReceipt', async () => {
    const result = await context.client.getSettledTxReceipt(TxHash.fromBuffer(Buffer.alloc(32, 1)));
    expect(result).toBeInstanceOf(TxReceipt);
  });

  it('getL2SlotNumber', async () => {
    const result = await context.client.getL2SlotNumber();
    expect(result).toBe(1n);
  });

  it('getL2EpochNumber', async () => {
    const result = await context.client.getL2EpochNumber();
    expect(result).toBe(1n);
  });

  it('getBlocksForEpoch', async () => {
    const result = await context.client.getBlocksForEpoch(1n);
    expect(result).toEqual([expect.any(L2Block)]);
  });

  it('getBlockHeadersForEpoch', async () => {
    const result = await context.client.getBlockHeadersForEpoch(1n);
    expect(result).toEqual([expect.any(BlockHeader)]);
  });

  it('isEpochComplete', async () => {
    const result = await context.client.isEpochComplete(1n);
    expect(result).toBe(true);
  });

  it('getL2Tips', async () => {
    const result = await context.client.getL2Tips();
    expect(result).toEqual({
      latest: { number: 1, hash: `0x01` },
      proven: { number: 1, hash: `0x01` },
      finalized: { number: 1, hash: `0x01` },
    });
  });

  it('getPrivateLogs', async () => {
    const result = await context.client.getPrivateLogs(1, 1);
    expect(result).toEqual([expect.any(PrivateLog)]);
  });

  it('getLogsByTags', async () => {
    const result = await context.client.getLogsByTags([Fr.random()]);
    expect(result).toEqual([[expect.any(TxScopedL2Log)]]);
  });

  it('getPublicLogs', async () => {
    const result = await context.client.getPublicLogs({
      txHash: TxHash.random(),
      contractAddress: await AztecAddress.random(),
    });
    expect(result).toEqual({ logs: [expect.any(ExtendedPublicLog)], maxLogsHit: true });
  });

  it('getContractClassLogs', async () => {
    const result = await context.client.getContractClassLogs({
      txHash: TxHash.random(),
      contractAddress: await AztecAddress.random(),
    });
    expect(result).toEqual({ logs: [expect.any(ExtendedContractClassLog)], maxLogsHit: true });
  });

  it('getContractClass', async () => {
    const contractClass = await getContractClassFromArtifact(artifact);
    const result = await context.client.getContractClass(Fr.random());
    expect(result).toEqual({
      ...omit(contractClass, 'publicBytecodeCommitment'),
      utilityFunctions: [],
      privateFunctions: [],
    });
  });

  it('getDebugFunctionName', async () => {
    const selector = await FunctionSelector.fromNameAndParameters(
      artifact.functions[0].name,
      artifact.functions[0].parameters,
    );
    const result = await context.client.getDebugFunctionName(await AztecAddress.random(), selector);
    expect(result).toEqual(artifact.functions[0].name);
  });

  it('getBytecodeCommitment', async () => {
    const contractClass = await getContractClassFromArtifact(artifact);
    const result = await context.client.getBytecodeCommitment(Fr.random());
    expect(result).toEqual(await computePublicBytecodeCommitment(contractClass.packedBytecode));
  });

  it('getContractClassIds', async () => {
    const result = await context.client.getContractClassIds();
    expect(result).toEqual([expect.any(Fr)]);
  });

  it('getL1ToL2Messages', async () => {
    const result = await context.client.getL1ToL2Messages(1n);
    expect(result).toEqual([expect.any(Fr)]);
  });

  it('getL1ToL2MessageIndex', async () => {
    const result = await context.client.getL1ToL2MessageIndex(Fr.random());
    expect(result).toBe(1n);
  });

  it('registerContractFunctionSignatures', async () => {
    await context.client.registerContractFunctionSignatures(['test()']);
  });

  it('getContract', async () => {
    const address = await AztecAddress.random();
    const result = await context.client.getContract(address, 27);
    expect(result).toEqual({
      address,
      currentContractClassId: expect.any(Fr),
      originalContractClassId: expect.any(Fr),
      deployer: expect.any(AztecAddress),
      initializationHash: expect.any(Fr),
      publicKeys: expect.any(PublicKeys),
      salt: expect.any(Fr),
      version: 1,
    });
  });

  it('getL1Constants', async () => {
    const result = await context.client.getL1Constants();
    expect(result).toEqual(EmptyL1RollupConstants);
  });

  it('syncImmediate', async () => {
    await context.client.syncImmediate();
  });

  it('getL1Timestamp', async () => {
    const result = await context.client.getL1Timestamp();
    expect(result).toBe(1n);
  });
});

class MockArchiver implements ArchiverApi {
  constructor(private artifact: ContractArtifact) {}

  syncImmediate() {
    return Promise.resolve();
  }
  getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(EthAddress.random());
  }
  getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(EthAddress.random());
  }
  getBlockNumber(): Promise<number> {
    return Promise.resolve(1);
  }
  getProvenBlockNumber(): Promise<number> {
    return Promise.resolve(1);
  }
  getBlock(number: number): Promise<L2Block | undefined> {
    return Promise.resolve(L2Block.random(number));
  }
  getBlockHeader(_number: number | 'latest'): Promise<BlockHeader | undefined> {
    return Promise.resolve(BlockHeader.empty());
  }
  async getBlocks(from: number, _limit: number, _proven?: boolean): Promise<L2Block[]> {
    return [await L2Block.random(from)];
  }
  async getPublishedBlocks(from: number, _limit: number, _proven?: boolean): Promise<PublishedL2Block[]> {
    return [
      {
        block: await L2Block.random(from),
        attestations: [CommitteeAttestation.random()],
        l1: { blockHash: `0x`, blockNumber: 1n, timestamp: 0n },
      },
    ];
  }
  async getTxEffect(_txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    expect(_txHash).toBeInstanceOf(TxHash);
    return { l2BlockNumber: 1, l2BlockHash: '0x12', data: await TxEffect.random(), txIndexInBlock: randomInt(10) };
  }
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(TxReceipt.empty());
  }
  getL2SlotNumber(): Promise<bigint> {
    return Promise.resolve(1n);
  }
  getL2EpochNumber(): Promise<bigint> {
    return Promise.resolve(1n);
  }
  async getBlocksForEpoch(epochNumber: bigint): Promise<L2Block[]> {
    expect(epochNumber).toEqual(1n);
    return [await L2Block.random(Number(epochNumber))];
  }
  async getBlockHeadersForEpoch(epochNumber: bigint): Promise<BlockHeader[]> {
    expect(epochNumber).toEqual(1n);
    const { header } = await L2Block.random(Number(epochNumber));
    return [header];
  }
  isEpochComplete(epochNumber: bigint): Promise<boolean> {
    expect(epochNumber).toEqual(1n);
    return Promise.resolve(true);
  }
  getL2Tips(): Promise<L2Tips> {
    return Promise.resolve({
      latest: { number: 1, hash: `0x01` },
      proven: { number: 1, hash: `0x01` },
      finalized: { number: 1, hash: `0x01` },
    });
  }
  getL2BlockHash(blockNumber: number): Promise<string | undefined> {
    expect(blockNumber).toEqual(1);
    return Promise.resolve(`0x01`);
  }
  getPrivateLogs(_from: number, _limit: number): Promise<PrivateLog[]> {
    return Promise.resolve([PrivateLog.random()]);
  }
  async getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    expect(tags[0]).toBeInstanceOf(Fr);
    return [await Promise.all(tags.map(() => TxScopedL2Log.random()))];
  }
  async getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    expect(filter.txHash).toBeInstanceOf(TxHash);
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return { logs: [await ExtendedPublicLog.random()], maxLogsHit: true };
  }
  async getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    expect(filter.txHash).toBeInstanceOf(TxHash);
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return Promise.resolve({ logs: [await ExtendedContractClassLog.random()], maxLogsHit: true });
  }
  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    expect(id).toBeInstanceOf(Fr);
    const contractClass = await getContractClassFromArtifact(this.artifact);
    return Promise.resolve({ ...contractClass, utilityFunctions: [], privateFunctions: [] });
  }
  async getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    expect(id).toBeInstanceOf(Fr);
    const contractClass = await getContractClassFromArtifact(this.artifact);
    return computePublicBytecodeCommitment(contractClass.packedBytecode);
  }
  async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    expect(selector).toBeInstanceOf(FunctionSelector);
    const functionsAndSelectors = await Promise.all(
      this.artifact.functions.map(async f => ({
        name: f.name,
        selector: await FunctionSelector.fromNameAndParameters({ name: f.name, parameters: f.parameters }),
      })),
    );
    return functionsAndSelectors.find(f => f.selector.equals(selector))?.name;
  }
  async getContract(address: AztecAddress, blockNumber?: number): Promise<ContractInstanceWithAddress | undefined> {
    expect(blockNumber).toEqual(27);
    return {
      address,
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      deployer: await AztecAddress.random(),
      initializationHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
      salt: Fr.random(),
      version: 1,
    };
  }
  getContractClassIds(): Promise<Fr[]> {
    return Promise.resolve([Fr.random()]);
  }
  getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    return Promise.resolve(this.artifact);
  }
  registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    expect(Array.isArray(signatures)).toBe(true);
    return Promise.resolve();
  }
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    expect(blockNumber).toEqual(1n);
    return Promise.resolve([Fr.random()]);
  }
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    expect(l1ToL2Message).toBeInstanceOf(Fr);
    return Promise.resolve(1n);
  }
  getL1Constants(): Promise<L1RollupConstants> {
    return Promise.resolve(EmptyL1RollupConstants);
  }
  getL1Timestamp(): Promise<bigint> {
    return Promise.resolve(1n);
  }
}
