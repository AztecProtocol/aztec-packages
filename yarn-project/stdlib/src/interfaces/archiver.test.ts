import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import omit from 'lodash.omit';

import type { ContractArtifact } from '../abi/abi.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { AztecAddress } from '../aztec-address/index.js';
import { type BlockData, BlockHash, CommitteeAttestation, L2Block } from '../block/index.js';
import {
  type BlockQuery,
  BlockQuerySchema,
  type BlocksQuery,
  BlocksQuerySchema,
  type CheckpointQuery,
  type CheckpointsQuery,
  type L2Tips,
  type ProposedCheckpointQuery,
} from '../block/l2_block_source.js';
import type { ValidateCheckpointResult } from '../block/validate_block_result.js';
import { Checkpoint } from '../checkpoint/checkpoint.js';
import type { CheckpointData, ProposedCheckpointData } from '../checkpoint/checkpoint_data.js';
import { L1PublishedData, PublishedCheckpoint } from '../checkpoint/published_checkpoint.js';
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
import { SiloedTag } from '../logs/siloed_tag.js';
import { Tag } from '../logs/tag.js';
import { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { randomTxScopedPrivateL2Log } from '../tests/factories.js';
import { getTokenContractArtifact } from '../tests/fixtures.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
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
    expect(result).toEqual(BlockNumber(1));
  });

  it('getCheckpointNumber', async () => {
    const result = await context.client.getCheckpointNumber();
    expect(result).toEqual(CheckpointNumber(1));
  });

  it('getCheckpoint', async () => {
    const response = await context.client.getCheckpoint({ number: CheckpointNumber(1) });
    expect(response).toBeDefined();
    expect(response!.checkpoint.constructor.name).toEqual('Checkpoint');
    expect(response!.attestations[0]).toBeInstanceOf(CommitteeAttestation);
    expect(response!.l1).toBeDefined();
  });

  it('getCheckpoints', async () => {
    const response = await context.client.getCheckpoints({ from: CheckpointNumber(1), limit: 1 });
    expect(response).toHaveLength(1);
    expect(response[0].checkpoint.constructor.name).toEqual('Checkpoint');
    expect(response[0].attestations[0]).toBeInstanceOf(CommitteeAttestation);
    expect(response[0].l1).toBeDefined();
  });

  it('getCheckpointsData', async () => {
    const result = await context.client.getCheckpointsData({ epoch: EpochNumber(1) });
    expect(result).toHaveLength(1);
    expect(result[0].checkpointNumber).toBeDefined();
    expect(result[0].checkpointOutHash).toBeDefined();
    expect(result[0].attestations[0]).toBeInstanceOf(CommitteeAttestation);
  });

  it('getTxEffect', async () => {
    const result = await context.client.getTxEffect(TxHash.fromBuffer(Buffer.alloc(32, BlockNumber(1))));
    expect(result!.data).toBeInstanceOf(TxEffect);
  });

  it('getSettledTxReceipt', async () => {
    const result = await context.client.getSettledTxReceipt(TxHash.fromBuffer(Buffer.alloc(32, BlockNumber(1))));
    expect(result).toBeInstanceOf(TxReceipt);
  });

  it('getSyncedL2SlotNumber', async () => {
    const result = await context.client.getSyncedL2SlotNumber();
    expect(result).toBe(SlotNumber(1));
  });

  it('getSyncedL2EpochNumber', async () => {
    const result = await context.client.getSyncedL2EpochNumber();
    expect(result).toBe(EpochNumber(1));
  });

  it('getBlocksForSlot', async () => {
    const result = await context.client.getBlocksForSlot(SlotNumber(1));
    expect(result).toEqual([expect.any(L2Block)]);
  });

  it('isEpochComplete', async () => {
    const result = await context.client.isEpochComplete(EpochNumber(1));
    expect(result).toBe(true);
  });

  it('getL2Tips', async () => {
    const result = await context.client.getL2Tips();
    const expectedTipId = {
      block: { number: 1, hash: `0x01` },
      checkpoint: { number: 1, hash: `0x01` },
    };
    expect(result).toEqual({
      proposed: { number: 1, hash: `0x01` },
      checkpointed: expectedTipId,
      proposedCheckpoint: expectedTipId,
      proven: expectedTipId,
      finalized: expectedTipId,
    });
  });

  it('getPrivateLogsByTags', async () => {
    const result = await context.client.getPrivateLogsByTags([SiloedTag.random()]);
    expect(result).toEqual([[expect.any(TxScopedL2Log)]]);

    const resultWithOptionals = await context.client.getPrivateLogsByTags([SiloedTag.random()], 3, BlockNumber(4));
    expect(resultWithOptionals).toEqual([[expect.any(TxScopedL2Log)]]);
  });

  it('getPublicLogsByTagsFromContract', async () => {
    const contractAddress = await AztecAddress.random();
    const result = await context.client.getPublicLogsByTagsFromContract(contractAddress, [Tag.random()]);
    expect(result).toEqual([[expect.any(TxScopedL2Log)]]);

    const resultWithOptionals = await context.client.getPublicLogsByTagsFromContract(
      contractAddress,
      [Tag.random()],
      3,
      BlockNumber(4),
    );
    expect(resultWithOptionals).toEqual([[expect.any(TxScopedL2Log)]]);
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
    expect(result).toEqual(omit(contractClass, 'publicBytecodeCommitment', 'privateFunctions'));
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
    const result = await context.client.getL1ToL2Messages(CheckpointNumber(1));
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
    const result = await context.client.getContract(address, 27n);
    expect(result).toEqual({
      address,
      currentContractClassId: expect.any(Fr),
      originalContractClassId: expect.any(Fr),
      deployer: expect.any(AztecAddress),
      initializationHash: expect.any(Fr),
      immutablesHash: expect.any(Fr),
      publicKeys: expect.any(PublicKeys),
      salt: expect.any(Fr),
      version: 2,
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

  it('getProposedCheckpointData', async () => {
    const result = await context.client.getProposedCheckpointData();
    expect(result).toEqual({
      checkpointNumber: 1,
      header: expect.any(CheckpointHeader),
      archive: expect.any(AppendOnlyTreeSnapshot),
      checkpointOutHash: expect.any(Fr),
      blockCount: 1,
      startBlock: 1,
      totalManaUsed: 1n,
      feeAssetPriceModifier: 1n,
    });
  });

  it('getPendingChainValidationStatus', async () => {
    const result = await context.client.getPendingChainValidationStatus();
    expect(result).toEqual({ valid: true });
  });

  it('isPendingChainInvalid', async () => {
    const result = await context.client.isPendingChainInvalid();
    expect(result).toBe(false);
  });

  it('getCheckpointData', async () => {
    const result = await context.client.getCheckpointData({ number: CheckpointNumber(1) });
    expect(result).toBeUndefined();
  });

  it('getGenesisValues', async () => {
    const result = await context.client.getGenesisValues();
    expect(result).toEqual({ genesisArchiveRoot: expect.any(Fr) });
  });

  it('getBlock', async () => {
    const result = await context.client.getBlock({ number: BlockNumber(1) });
    expect(result).toBeInstanceOf(L2Block);
  });

  it('getBlocks', async () => {
    const result = await context.client.getBlocks({ from: BlockNumber(1), limit: 1 });
    expect(result).toEqual([expect.any(L2Block)]);
  });

  it('getBlockData', async () => {
    const result = await context.client.getBlockData({ number: BlockNumber(1) });
    expect(result).toBeUndefined();
  });

  it('getBlocksData', async () => {
    const result = await context.client.getBlocksData({ from: BlockNumber(1), limit: 1 });
    expect(result).toEqual([]);
  });

  it('isPruneDueAtSlot', async () => {
    const result = await context.client.isPruneDueAtSlot(SlotNumber(1));
    expect(result).toBe(false);
  });
});

describe('BlockQuerySchema', () => {
  it.each<[string, BlockQuery]>([
    ['{ number }', { number: BlockNumber(1) }],
    ['{ hash }', { hash: BlockHash.fromBuffer(Buffer.alloc(32, 1)) }],
    ['{ archive }', { archive: new Fr(123) }],
    ['{ tag: proposed }', { tag: 'proposed' }],
    ['{ tag: checkpointed }', { tag: 'checkpointed' }],
    ['{ tag: proven }', { tag: 'proven' }],
    ['{ tag: finalized }', { tag: 'finalized' }],
  ])('roundtrips %s', (_, query) => {
    const json = JSON.parse(JSON.stringify(query));
    const parsed = BlockQuerySchema.parse(json);
    expect(parsed).toEqual(query);
  });

  it('rejects mixed-key inputs', () => {
    expect(BlockQuerySchema.safeParse({ number: 1, tag: 'proven' }).success).toBe(false);
    expect(BlockQuerySchema.safeParse({ hash: '0x1', archive: '0x2' }).success).toBe(false);
  });

  it('rejects extra keys (onlyCheckpointed is plural-only)', () => {
    expect(BlockQuerySchema.safeParse({ number: 1, onlyCheckpointed: true }).success).toBe(false);
    expect(BlockQuerySchema.safeParse({ tag: 'checkpointed', onlyCheckpointed: true }).success).toBe(false);
  });
});

describe('BlocksQuerySchema', () => {
  it.each<[string, BlocksQuery]>([
    ['{ from, limit }', { from: BlockNumber(1), limit: 10 }],
    ['{ from, limit, onlyCheckpointed }', { from: BlockNumber(1), limit: 10, onlyCheckpointed: true }],
    ['{ epoch, onlyCheckpointed: true }', { epoch: EpochNumber(5), onlyCheckpointed: true }],
  ])('roundtrips %s', (_, query) => {
    const json = JSON.parse(JSON.stringify(query));
    const parsed = BlocksQuerySchema.parse(json);
    expect(parsed).toEqual(query);
  });

  it('rejects mixed-key inputs', () => {
    expect(BlocksQuerySchema.safeParse({ from: 0, limit: 10, epoch: 5 }).success).toBe(false);
  });

  it('rejects epoch query without onlyCheckpointed', () => {
    expect(BlocksQuerySchema.safeParse({ epoch: 1 }).success).toBe(false);
  });

  it('rejects epoch query with onlyCheckpointed: false', () => {
    expect(BlocksQuerySchema.safeParse({ epoch: 1, onlyCheckpointed: false }).success).toBe(false);
  });
});

class MockArchiver implements ArchiverApi {
  constructor(private artifact: ContractArtifact) {}

  getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: Fr.random() });
  }
  isPendingChainInvalid(): Promise<boolean> {
    return Promise.resolve(false);
  }
  getPendingChainValidationStatus(): Promise<ValidateCheckpointResult> {
    return Promise.resolve({ valid: true });
  }
  getProposedCheckpointData(_query?: ProposedCheckpointQuery): Promise<ProposedCheckpointData | undefined> {
    return Promise.resolve({
      checkpointNumber: CheckpointNumber(1),
      header: CheckpointHeader.random(),
      archive: AppendOnlyTreeSnapshot.random(),
      checkpointOutHash: Fr.random(),
      blockCount: 1,
      startBlock: BlockNumber(1),
      totalManaUsed: 1n,
      feeAssetPriceModifier: 1n,
    });
  }
  syncImmediate() {
    return Promise.resolve();
  }
  getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(EthAddress.random());
  }
  getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(EthAddress.random());
  }
  getBlockNumber(): Promise<BlockNumber>;
  getBlockNumber(query: BlockQuery): Promise<BlockNumber | undefined>;
  getBlockNumber(_query?: BlockQuery): Promise<BlockNumber | undefined> {
    return Promise.resolve(BlockNumber(1));
  }
  getCheckpointNumber(): Promise<CheckpointNumber> {
    return Promise.resolve(CheckpointNumber(1));
  }
  getBlock(_query: BlockQuery): Promise<L2Block | undefined> {
    return L2Block.random(BlockNumber(1));
  }
  async getBlocks(_query: BlocksQuery): Promise<L2Block[]> {
    return [await L2Block.random(BlockNumber(1))];
  }
  getBlockData(_query: BlockQuery): Promise<BlockData | undefined> {
    return Promise.resolve(undefined);
  }
  getBlocksData(_query: BlocksQuery): Promise<BlockData[]> {
    return Promise.resolve([]);
  }
  async getCheckpoint(_query: CheckpointQuery): Promise<PublishedCheckpoint | undefined> {
    return PublishedCheckpoint.from({
      checkpoint: await Checkpoint.random(CheckpointNumber(1)),
      attestations: [CommitteeAttestation.random()],
      l1: new L1PublishedData(1n, 0n, `0x`),
    });
  }
  async getCheckpoints(_query: CheckpointsQuery): Promise<PublishedCheckpoint[]> {
    return [
      PublishedCheckpoint.from({
        checkpoint: await Checkpoint.random(CheckpointNumber(1)),
        attestations: [CommitteeAttestation.random()],
        l1: new L1PublishedData(1n, 0n, `0x`),
      }),
    ];
  }
  async getTxEffect(_txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    expect(_txHash).toBeInstanceOf(TxHash);
    return {
      l2BlockNumber: BlockNumber(1),
      l2BlockHash: new BlockHash(new Fr(0x12)),
      data: await TxEffect.random(),
      txIndexInBlock: randomInt(10),
    };
  }
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(TxReceipt.empty());
  }
  getSyncedL2SlotNumber(): Promise<SlotNumber> {
    return Promise.resolve(SlotNumber(1));
  }
  getSyncedL2EpochNumber(): Promise<EpochNumber | undefined> {
    return Promise.resolve(EpochNumber(1));
  }
  getCheckpointData(_query: CheckpointQuery): Promise<CheckpointData | undefined> {
    return Promise.resolve(undefined);
  }
  async getCheckpointsData(_query: CheckpointsQuery): Promise<CheckpointData[]> {
    const checkpoint = await Checkpoint.random(CheckpointNumber(1));
    return [
      {
        checkpointNumber: checkpoint.number,
        header: checkpoint.header,
        archive: checkpoint.archive,
        checkpointOutHash: checkpoint.getCheckpointOutHash(),
        startBlock: BlockNumber(1),
        blockCount: checkpoint.blocks.length,
        feeAssetPriceModifier: 0n,
        attestations: [CommitteeAttestation.random()],
        l1: L1PublishedData.random(),
      },
    ];
  }
  async getBlocksForSlot(slotNumber: SlotNumber): Promise<L2Block[]> {
    expect(slotNumber).toEqual(SlotNumber(1));
    return [await L2Block.random(BlockNumber(Number(slotNumber)))];
  }
  isEpochComplete(epochNumber: EpochNumber): Promise<boolean> {
    expect(epochNumber).toEqual(EpochNumber(1));
    return Promise.resolve(true);
  }
  getL2Tips(): Promise<L2Tips> {
    const tipId = {
      block: { number: BlockNumber(1), hash: `0x01` },
      checkpoint: { number: CheckpointNumber(1), hash: `0x01` },
    };
    return Promise.resolve({
      proposed: { number: BlockNumber(1), hash: `0x01` },
      checkpointed: tipId,
      proposedCheckpoint: tipId,
      proven: tipId,
      finalized: tipId,
    });
  }
  getL2BlockHash(blockNumber: BlockNumber): Promise<string | undefined> {
    expect(blockNumber).toEqual(BlockNumber(1));
    return Promise.resolve(`0x01`);
  }
  getPrivateLogsByTags(tags: SiloedTag[], page?: number, upToBlockNumber?: BlockNumber): Promise<TxScopedL2Log[][]> {
    expect(tags[0]).toBeInstanceOf(SiloedTag);
    if (page !== undefined) {
      expect(page).toBe(3);
    }
    if (upToBlockNumber !== undefined) {
      expect(upToBlockNumber).toBe(BlockNumber(4));
    }
    return Promise.resolve([tags.map(() => randomTxScopedPrivateL2Log())]);
  }
  getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    page?: number,
    upToBlockNumber?: BlockNumber,
  ): Promise<TxScopedL2Log[][]> {
    expect(contractAddress).toBeInstanceOf(AztecAddress);
    expect(tags[0]).toBeInstanceOf(Tag);
    if (page !== undefined) {
      expect(page).toBe(3);
    }
    if (upToBlockNumber !== undefined) {
      expect(upToBlockNumber).toBe(BlockNumber(4));
    }
    return Promise.resolve([tags.map(() => randomTxScopedPrivateL2Log())]);
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
    return Promise.resolve(contractClass);
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
  async getContract(address: AztecAddress, timestamp?: bigint): Promise<ContractInstanceWithAddress | undefined> {
    expect(timestamp).toEqual(27n);
    return {
      address,
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      deployer: await AztecAddress.random(),
      initializationHash: Fr.random(),
      immutablesHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
      salt: Fr.random(),
      version: 2,
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
  getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    expect(checkpointNumber).toEqual(CheckpointNumber(1));
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
  isPruneDueAtSlot(_slot: SlotNumber): Promise<boolean> {
    return Promise.resolve(false);
  }
}
