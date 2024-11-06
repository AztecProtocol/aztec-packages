import {
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  EthAddress,
  Fr,
  FunctionSelector,
  Header,
  type PublicFunction,
  PublicKeys,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import { fileURLToPath } from '@aztec/foundation/url';
import { loadContractArtifact } from '@aztec/types/abi';

import { deepStrictEqual } from 'assert';
import { readFileSync } from 'fs';
import omit from 'lodash.omit';
import { resolve } from 'path';

import { L2Block } from '../l2_block.js';
import { type L2Tips } from '../l2_block_source.js';
import { EncryptedL2NoteLog } from '../logs/encrypted_l2_note_log.js';
import { ExtendedUnencryptedL2Log } from '../logs/extended_unencrypted_l2_log.js';
import { type GetUnencryptedLogsResponse } from '../logs/get_unencrypted_logs_response.js';
import {
  EncryptedL2BlockL2Logs,
  EncryptedNoteL2BlockL2Logs,
  type L2BlockL2Logs,
  UnencryptedL2BlockL2Logs,
} from '../logs/l2_block_l2_logs.js';
import { type LogFilter } from '../logs/log_filter.js';
import { type FromLogType, LogType } from '../logs/log_type.js';
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
    expect(result).toBeInstanceOf(Header);
  });

  it('getBlocks', async () => {
    const result = await context.client.getBlocks(1, 1);
    expect(result).toEqual([expect.any(L2Block)]);
  });

  it('getTxEffect', async () => {
    const result = await context.client.getTxEffect(new TxHash(Buffer.alloc(32, 1)));
    expect(result).toBeInstanceOf(TxEffect);
  });

  it('getSettledTxReceipt', async () => {
    const result = await context.client.getSettledTxReceipt(new TxHash(Buffer.alloc(32, 1)));
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

  it('getLogs(Encrypted)', async () => {
    const result = await context.client.getLogs(1, 1, LogType.ENCRYPTED);
    expect(result).toEqual([expect.any(EncryptedL2BlockL2Logs)]);
  });

  it('getLogs(NoteEncrypted)', async () => {
    const result = await context.client.getLogs(1, 1, LogType.NOTEENCRYPTED);
    expect(result).toEqual([expect.any(EncryptedNoteL2BlockL2Logs)]);
  });

  it('getLogs(Unencrypted)', async () => {
    const result = await context.client.getLogs(1, 1, LogType.UNENCRYPTED);
    expect(result).toEqual([expect.any(UnencryptedL2BlockL2Logs)]);
  });

  it('getLogsByTags', async () => {
    const result = await context.client.getLogsByTags([Fr.random()]);
    expect(result).toEqual([[expect.any(EncryptedL2NoteLog)]]);
  });

  it('getUnencryptedLogs', async () => {
    const result = await context.client.getUnencryptedLogs({
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

  it('getContractArtifact', async () => {
    const result = await context.client.getContractArtifact(AztecAddress.random());
    deepStrictEqual(result, artifact);
  });

  it('addContractArtifact', async () => {
    await context.client.addContractArtifact(AztecAddress.random(), artifact);
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
  getBlockHeader(_number: number | 'latest'): Promise<Header | undefined> {
    return Promise.resolve(Header.empty());
  }
  getBlocks(from: number, _limit: number, _proven?: boolean | undefined): Promise<L2Block[]> {
    return Promise.resolve([L2Block.random(from)]);
  }
  getTxEffect(_txHash: TxHash): Promise<TxEffect | undefined> {
    expect(_txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(TxEffect.empty());
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
  getLogs<TLogType extends LogType>(
    _from: number,
    _limit: number,
    logType: TLogType,
  ): Promise<L2BlockL2Logs<FromLogType<TLogType>>[]> {
    switch (logType) {
      case LogType.ENCRYPTED:
        return Promise.resolve([EncryptedL2BlockL2Logs.random(1, 1, 1)] as L2BlockL2Logs<FromLogType<TLogType>>[]);
      case LogType.NOTEENCRYPTED:
        return Promise.resolve([EncryptedNoteL2BlockL2Logs.random(1, 1, 1)] as L2BlockL2Logs<FromLogType<TLogType>>[]);
      case LogType.UNENCRYPTED:
        return Promise.resolve([UnencryptedL2BlockL2Logs.random(1, 1, 1)] as L2BlockL2Logs<FromLogType<TLogType>>[]);
      default:
        throw new Error(`Unexpected log type: ${logType}`);
    }
  }
  getLogsByTags(tags: Fr[]): Promise<EncryptedL2NoteLog[][]> {
    expect(tags[0]).toBeInstanceOf(Fr);
    return Promise.resolve([Array.from({ length: tags.length }, () => EncryptedL2NoteLog.random())]);
  }
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
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
  addContractArtifact(address: AztecAddress, contract: ContractArtifact): Promise<void> {
    expect(address).toBeInstanceOf(AztecAddress);
    // We use node's native assertion because jest's is too slow
    deepStrictEqual(contract, this.artifact);
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
}
