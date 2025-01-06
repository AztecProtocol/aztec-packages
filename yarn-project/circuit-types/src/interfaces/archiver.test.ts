import {
  AztecAddress,
  BlockHeader,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  EthAddress,
  Fr,
  FunctionSelector,
  PrivateLog,
  type PublicFunction,
  PublicKeys,
  computePublicBytecodeCommitment,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import { fileURLToPath } from '@aztec/foundation/url';
import { loadContractArtifact } from '@aztec/types/abi';

import { readFileSync } from 'fs';
import omit from 'lodash.omit';
import { resolve } from 'path';

import { type InBlock, randomInBlock } from '../in_block.js';
import { L2Block } from '../l2_block.js';
import { type L2Tips } from '../l2_block_source.js';
import { ExtendedUnencryptedL2Log } from '../logs/extended_unencrypted_l2_log.js';
import { type GetUnencryptedLogsResponse, TxScopedL2Log } from '../logs/get_logs_response.js';
import { type LogFilter } from '../logs/log_filter.js';
import { TxHash } from '../tx/tx_hash.js';
import { TxReceipt } from '../tx/tx_receipt.js';
import { TxEffect } from '../tx_effect.js';
import { type ArchiverApi, ArchiverApiSchema } from './archiver.js';

describe('ArchiverApiSchema', () => {
  let handler: MockArchiver;
  let context: JsonRpcTestContext<ArchiverApi>;
  let artifact: ContractArtifact;

  const tested: Set<string> = new Set();

  beforeAll(() => {
    const path = resolve(fileURLToPath(import.meta.url), '../../test/artifacts/token_contract-Token.json');
    artifact = loadContractArtifact(JSON.parse(readFileSync(path, 'utf-8')));
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

  it('getProvenL2EpochNumber', async () => {
    const result = await context.client.getProvenL2EpochNumber();
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

  it('findNullifiersIndexesWithBlock', async () => {
    const result = await context.client.findNullifiersIndexesWithBlock(1, [Fr.random(), Fr.random()]);
    expect(result).toEqual([
      {
        data: expect.any(BigInt),
        l2BlockNumber: expect.any(Number),
        l2BlockHash: expect.any(String),
      },
      undefined,
    ]);
  });

  it('getPrivateLogs', async () => {
    const result = await context.client.getPrivateLogs(1, 1);
    expect(result).toEqual([expect.any(PrivateLog)]);
  });

  it('getLogsByTags', async () => {
    const result = await context.client.getLogsByTags([Fr.random()]);
    expect(result).toEqual([[expect.any(TxScopedL2Log)]]);
  });

  it('getUnencryptedLogs', async () => {
    const result = await context.client.getUnencryptedLogs({
      txHash: TxHash.random(),
      contractAddress: AztecAddress.random(),
    });
    expect(result).toEqual({ logs: [expect.any(ExtendedUnencryptedL2Log)], maxLogsHit: true });
  });

  it('getContractClassLogs', async () => {
    const result = await context.client.getContractClassLogs({
      txHash: TxHash.random(),
      contractAddress: AztecAddress.random(),
    });
    expect(result).toEqual({ logs: [expect.any(ExtendedUnencryptedL2Log)], maxLogsHit: true });
  });

  it('getPublicFunction', async () => {
    const selector = FunctionSelector.random();
    const result = await context.client.getPublicFunction(AztecAddress.random(), selector);
    expect(result).toEqual({ selector, bytecode: Buffer.alloc(10, 10) });
  });

  it('getContractClass', async () => {
    const contractClass = getContractClassFromArtifact(artifact);
    const result = await context.client.getContractClass(Fr.random());
    expect(result).toEqual({
      ...omit(contractClass, 'publicBytecodeCommitment'),
      unconstrainedFunctions: [],
      privateFunctions: [],
    });
  });

  it('getContractFunctionName', async () => {
    const selector = FunctionSelector.fromNameAndParameters(
      artifact.functions[0].name,
      artifact.functions[0].parameters,
    );
    const result = await context.client.getContractFunctionName(AztecAddress.random(), selector);
    expect(result).toEqual(artifact.functions[0].name);
  });

  it('getBytecodeCommitment', async () => {
    const contractClass = getContractClassFromArtifact(artifact);
    const result = await context.client.getBytecodeCommitment(Fr.random());
    expect(result).toEqual(computePublicBytecodeCommitment(contractClass.packedBytecode));
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

  it('registerContractFunctionNames', async () => {
    await context.client.registerContractFunctionNames(AztecAddress.random(), {
      [FunctionSelector.random().toString()]: 'test_fn',
    });
  });

  it('getContract', async () => {
    const address = AztecAddress.random();
    const result = await context.client.getContract(address);
    expect(result).toEqual({
      address,
      contractClassId: expect.any(Fr),
      deployer: expect.any(AztecAddress),
      initializationHash: expect.any(Fr),
      publicKeys: expect.any(PublicKeys),
      salt: expect.any(Fr),
      version: 1,
    });
  });

  it('addContractClass', async () => {
    const contractClass = getContractClassFromArtifact(artifact);
    await context.client.addContractClass({
      ...omit(contractClass, 'publicBytecodeCommitment'),
      unconstrainedFunctions: [],
      privateFunctions: [],
    });
  });
});

class MockArchiver implements ArchiverApi {
  constructor(private artifact: ContractArtifact) {}

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
  getProvenL2EpochNumber(): Promise<number | undefined> {
    return Promise.resolve(1);
  }
  getBlock(number: number): Promise<L2Block | undefined> {
    return Promise.resolve(L2Block.random(number));
  }
  getBlockHeader(_number: number | 'latest'): Promise<BlockHeader | undefined> {
    return Promise.resolve(BlockHeader.empty());
  }
  getBlocks(from: number, _limit: number, _proven?: boolean | undefined): Promise<L2Block[]> {
    return Promise.resolve([L2Block.random(from)]);
  }
  getTxEffect(_txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    expect(_txHash).toBeInstanceOf(TxHash);
    return Promise.resolve({ l2BlockNumber: 1, l2BlockHash: '0x12', data: TxEffect.random() });
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
  getBlocksForEpoch(epochNumber: bigint): Promise<L2Block[]> {
    expect(epochNumber).toEqual(1n);
    return Promise.resolve([L2Block.random(Number(epochNumber))]);
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
  findNullifiersIndexesWithBlock(blockNumber: number, nullifiers: Fr[]): Promise<(InBlock<bigint> | undefined)[]> {
    expect(blockNumber).toEqual(1);
    expect(nullifiers).toHaveLength(2);
    expect(nullifiers[0]).toBeInstanceOf(Fr);
    expect(nullifiers[1]).toBeInstanceOf(Fr);
    return Promise.resolve([randomInBlock(Fr.random().toBigInt()), undefined]);
  }
  getPrivateLogs(_from: number, _limit: number): Promise<PrivateLog[]> {
    return Promise.resolve([PrivateLog.random()]);
  }
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    expect(tags[0]).toBeInstanceOf(Fr);
    return Promise.resolve([Array.from({ length: tags.length }, () => TxScopedL2Log.random())]);
  }
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    expect(filter.txHash).toBeInstanceOf(TxHash);
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return Promise.resolve({ logs: [ExtendedUnencryptedL2Log.random()], maxLogsHit: true });
  }
  getContractClassLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    expect(filter.txHash).toBeInstanceOf(TxHash);
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return Promise.resolve({ logs: [ExtendedUnencryptedL2Log.random()], maxLogsHit: true });
  }
  getPublicFunction(address: AztecAddress, selector: FunctionSelector): Promise<PublicFunction | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    expect(selector).toBeInstanceOf(FunctionSelector);
    return Promise.resolve({ selector, bytecode: Buffer.alloc(10, 10) });
  }
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    expect(id).toBeInstanceOf(Fr);
    const contractClass = getContractClassFromArtifact(this.artifact);
    return Promise.resolve({ ...contractClass, unconstrainedFunctions: [], privateFunctions: [] });
  }
  getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    expect(id).toBeInstanceOf(Fr);
    const contractClass = getContractClassFromArtifact(this.artifact);
    return Promise.resolve(computePublicBytecodeCommitment(contractClass.packedBytecode));
  }
  getContractFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    expect(selector).toBeInstanceOf(FunctionSelector);
    return Promise.resolve(
      this.artifact.functions.find(f =>
        FunctionSelector.fromNameAndParameters({ name: f.name, parameters: f.parameters }).equals(selector),
      )?.name,
    );
  }
  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return Promise.resolve({
      address,
      contractClassId: Fr.random(),
      deployer: AztecAddress.random(),
      initializationHash: Fr.random(),
      publicKeys: PublicKeys.random(),
      salt: Fr.random(),
      version: 1,
    });
  }
  getContractClassIds(): Promise<Fr[]> {
    return Promise.resolve([Fr.random()]);
  }
  getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    return Promise.resolve(this.artifact);
  }
  registerContractFunctionNames(address: AztecAddress, names: Record<string, string>): Promise<void> {
    expect(address).toBeInstanceOf(AztecAddress);
    expect(names).toEqual(expect.any(Object));
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
  addContractClass(_contractClass: ContractClassPublic): Promise<void> {
    return Promise.resolve();
  }
}
