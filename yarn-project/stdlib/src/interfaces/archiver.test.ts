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
  CheckpointsQuerySchema,
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
import { type LogResult, randomLogResult } from '../logs/log_result.js';
import type { PrivateLogsQuery, PublicLogsQuery } from '../logs/logs_query.js';
import { SiloedTag } from '../logs/siloed_tag.js';
import { Tag } from '../logs/tag.js';
import type { InboxMessagePosition, InboxMessageRange } from '../messaging/l1_to_l2_message_source.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { getTokenContractArtifact } from '../tests/fixtures.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import type { IndexedTxEffect } from '../tx/indexed_tx_effect.js';
import { TxEffect } from '../tx/tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import { MAX_RPC_CHECKPOINTS_DATA_LEN } from './api_limit.js';
import { type ArchiverApi, ArchiverApiSchema } from './archiver.js';

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

    // Slot-anchored range variant round-trips through the schema.
    const bySlot = await context.client.getCheckpointsData({ fromSlot: SlotNumber(1), limit: 1, reverse: true });
    expect(bySlot).toHaveLength(1);
  });

  it('getTxEffect', async () => {
    const result = await context.client.getTxEffect(TxHash.fromBuffer(Buffer.alloc(32, BlockNumber(1))));
    expect(result!.data).toBeInstanceOf(TxEffect);
  });

  it('getL2ToL1MembershipWitness', async () => {
    const result = await context.client.getL2ToL1MembershipWitness(TxHash.random(), Fr.random());
    expect(result).toBeUndefined();
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
      proven: expectedTipId,
      finalized: expectedTipId,
    });
  });

  it('getPrivateLogsByTags', async () => {
    const result = await context.client.getPrivateLogsByTags({ tags: [SiloedTag.random()] });
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].txHash).toBeDefined();
  });

  it('getPublicLogsByTags', async () => {
    const contractAddress = await AztecAddress.random();
    const result = await context.client.getPublicLogsByTags({ contractAddress, tags: [Tag.random()] });
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].txHash).toBeDefined();
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

  it('getL1ToL2MessageIndex', async () => {
    const result = await context.client.getL1ToL2MessageIndex(Fr.random());
    expect(result).toBe(1n);
  });

  it('getL1ToL2MessagesBetweenLeafCounts', async () => {
    const result = await context.client.getL1ToL2MessagesBetweenLeafCounts(0n, 3n);
    expect(result).toEqual([expect.any(Fr)]);
  });

  it('getMessagePosition', async () => {
    const result = await context.client.getMessagePosition(3n);
    expect(result).toEqual({ totalMessageCount: 3n, rollingHash: expect.any(Fr) });
  });

  it('getSyncedMessagePosition', async () => {
    const result = await context.client.getSyncedMessagePosition();
    expect(result).toEqual({ totalMessageCount: 3n, rollingHash: expect.any(Fr) });
  });

  it('getL1ToL2MessageRange', async () => {
    const result = await context.client.getL1ToL2MessageRange(2n, 3n);
    expect(result).toEqual({
      messages: [expect.any(Fr)],
      start: { totalMessageCount: 2n, rollingHash: expect.any(Fr) },
      end: { totalMessageCount: 3n, rollingHash: expect.any(Fr) },
    });
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
      inboxMsgTotal: 1n,
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

describe('CheckpointsQuerySchema', () => {
  it.each<[string, CheckpointsQuery]>([
    ['{ from, limit }', { from: CheckpointNumber(1), limit: 10 }],
    ['{ fromSlot, limit, reverse }', { fromSlot: SlotNumber(1), limit: 10, reverse: true }],
    ['{ epoch }', { epoch: EpochNumber(5) }],
  ])('roundtrips %s', (_, query) => {
    const json = JSON.parse(JSON.stringify(query));
    expect(CheckpointsQuerySchema.parse(json)).toEqual(query);
  });

  it('accepts a limit at MAX_RPC_CHECKPOINTS_DATA_LEN', () => {
    const limit = MAX_RPC_CHECKPOINTS_DATA_LEN;
    expect(CheckpointsQuerySchema.safeParse({ from: 1, limit }).success).toBe(true);
    expect(CheckpointsQuerySchema.safeParse({ fromSlot: 1, limit }).success).toBe(true);
  });

  it('rejects a limit over MAX_RPC_CHECKPOINTS_DATA_LEN', () => {
    const limit = MAX_RPC_CHECKPOINTS_DATA_LEN + 1;
    expect(CheckpointsQuerySchema.safeParse({ from: 1, limit }).success).toBe(false);
    expect(CheckpointsQuerySchema.safeParse({ fromSlot: 1, limit }).success).toBe(false);
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
      inboxMsgTotal: 1n,
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
      slotNumber: SlotNumber(1),
    };
  }
  getL2ToL1MembershipWitness(): Promise<undefined> {
    return Promise.resolve(undefined);
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
      proven: tipId,
      finalized: tipId,
    });
  }
  getL2BlockHash(blockNumber: BlockNumber): Promise<string | undefined> {
    expect(blockNumber).toEqual(BlockNumber(1));
    return Promise.resolve(`0x01`);
  }
  getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]> {
    expect(Array.isArray(query.tags)).toBe(true);
    return Promise.resolve([query.tags.map(() => randomLogResult())]);
  }
  getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]> {
    expect(query.contractAddress).toBeInstanceOf(AztecAddress);
    expect(Array.isArray(query.tags)).toBe(true);
    return Promise.resolve([query.tags.map(() => randomLogResult())]);
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
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    expect(l1ToL2Message).toBeInstanceOf(Fr);
    return Promise.resolve(1n);
  }
  getL1ToL2MessagesBetweenLeafCounts(startLeafCount: bigint, endLeafCount: bigint): Promise<Fr[]> {
    expect(typeof startLeafCount).toEqual('bigint');
    expect(typeof endLeafCount).toEqual('bigint');
    return Promise.resolve([Fr.random()]);
  }
  getMessagePosition(totalMessageCount: bigint): Promise<InboxMessagePosition | undefined> {
    expect(typeof totalMessageCount).toEqual('bigint');
    return Promise.resolve({ totalMessageCount, rollingHash: Fr.random() });
  }
  getSyncedMessagePosition(): Promise<InboxMessagePosition> {
    return Promise.resolve({ totalMessageCount: 3n, rollingHash: Fr.random() });
  }
  getL1ToL2MessageRange(startLeafCount: bigint, endLeafCount: bigint): Promise<InboxMessageRange> {
    expect(typeof startLeafCount).toEqual('bigint');
    expect(typeof endLeafCount).toEqual('bigint');
    return Promise.resolve({
      messages: [Fr.random()],
      start: { totalMessageCount: startLeafCount, rollingHash: Fr.random() },
      end: { totalMessageCount: endLeafCount, rollingHash: Fr.random() },
    });
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
