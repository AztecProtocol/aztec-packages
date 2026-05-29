import { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { type L1ContractAddresses, L1ContractsNames } from '@aztec/ethereum/l1-contract-addresses';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';

import omit from 'lodash.omit';
import times from 'lodash.times';

import type { ContractArtifact } from '../abi/abi.js';
import { AztecAddress } from '../aztec-address/index.js';
import type { BlockData } from '../block/block_data.js';
import type { DataInBlock } from '../block/in_block.js';
import { BlockHash, type BlockParameter } from '../block/index.js';
import type { CheckpointsQuery } from '../block/l2_block_source.js';
import type { CheckpointData } from '../checkpoint/checkpoint_data.js';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  type NodeInfo,
  type ProtocolContractAddresses,
  ProtocolContractsNames,
  getContractClassFromArtifact,
} from '../contract/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { PublicKeys } from '../keys/public_keys.js';
import { type LogResult, randomLogResult } from '../logs/log_result.js';
import type { PrivateLogsQuery, PublicLogsQuery } from '../logs/logs_query.js';
import { SiloedTag } from '../logs/siloed_tag.js';
import { Tag } from '../logs/tag.js';
import { getTokenContractArtifact } from '../tests/fixtures.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';
import { NullifierMembershipWitness } from '../trees/nullifier_membership_witness.js';
import { PublicDataWitness } from '../trees/public_data_witness.js';
import type { IndexedTxEffect } from '../tx/indexed_tx_effect.js';
import { PublicSimulationOutput } from '../tx/public_simulation_output.js';
import { Tx } from '../tx/tx.js';
import { TxEffect } from '../tx/tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import {
  DroppedTxReceipt,
  type GetTxReceiptOptions,
  MinedTxReceipt,
  PendingTxReceipt,
  TxExecutionResult,
  type TxReceipt,
  TxStatus,
} from '../tx/tx_receipt.js';
import type { TxValidationResult } from '../tx/validator/tx_validator.js';
import type { SingleValidatorStats, ValidatorsStats } from '../validators/types.js';
import type { AllowedElement } from './allowed_element.js';
import { MAX_RPC_LEN } from './api_limit.js';
import { type AztecNode, AztecNodeApiSchema } from './aztec-node.js';
import type { BlockIncludeOptions, BlockResponse, BlocksIncludeOptions } from './block_response.js';
import type { ChainTip, ChainTips } from './chain_tips.js';
import type { CheckpointParameter } from './checkpoint_parameter.js';
import type { CheckpointIncludeOptions, CheckpointResponse } from './checkpoint_response.js';
import type { SequencerConfig } from './configs.js';
import type { ProverConfig } from './prover-client.js';
import type { WorldStateSyncStatus } from './world_state.js';

describe('AztecNodeApiSchema', () => {
  let handler: MockAztecNode;
  let context: JsonRpcTestContext<AztecNode>;
  let artifact: ContractArtifact;

  const tested: Set<string> = new Set();

  beforeAll(() => {
    artifact = getTokenContractArtifact();
  });

  beforeEach(async () => {
    handler = new MockAztecNode(artifact);
    context = await createJsonRpcTestSetup<AztecNode>(handler, AztecNodeApiSchema);
  });

  afterEach(() => {
    tested.add(/^AztecNodeApiSchema\s+([^(]+?)\s*(\(|$)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(AztecNodeApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getChainTips', async () => {
    const result = await context.client.getChainTips();
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

  it('findLeavesIndexes', async () => {
    const response = await context.client.findLeavesIndexes(BlockNumber(1), MerkleTreeId.ARCHIVE, [
      Fr.random(),
      Fr.random(),
    ]);
    expect(response).toEqual([{ data: 1n, l2BlockNumber: 1, l2BlockHash: new BlockHash(new Fr(1)) }, undefined]);

    await expect(
      context.client.findLeavesIndexes(BlockNumber(1), MerkleTreeId.ARCHIVE, times(MAX_RPC_LEN + 1, Fr.random)),
    ).rejects.toThrow();
  });

  it('getL1ToL2MessageMembershipWitness', async () => {
    const response = await context.client.getL1ToL2MessageMembershipWitness(BlockNumber(1), Fr.random());
    expect(response).toEqual([1n, expect.any(SiblingPath)]);
  });

  it('getL1ToL2MessageCheckpoint', async () => {
    const response = await context.client.getL1ToL2MessageCheckpoint(Fr.random());
    expect(response).toEqual(5);
  });

  it('getL2ToL1Messages', async () => {
    const response = await context.client.getL2ToL1Messages(EpochNumber(1));
    expect(response.length).toBe(3);
    expect(response[0].length).toBe(4);
    expect(response[0][0].length).toBe(2);
    expect(response[0][0][0].length).toBe(3);
    expect(response[0][0][0][0]).toBeInstanceOf(Fr);
  });

  it('getBlockHashMembershipWitness', async () => {
    const response = await context.client.getBlockHashMembershipWitness(BlockNumber(1), BlockHash.random());
    expect(response).toBeInstanceOf(MembershipWitness);
  });

  it('getNoteHashMembershipWitness', async () => {
    const response = await context.client.getNoteHashMembershipWitness(BlockNumber(1), Fr.random());
    expect(response).toBeInstanceOf(MembershipWitness);
  });

  it('getNullifierMembershipWitness', async () => {
    const response = await context.client.getNullifierMembershipWitness(BlockNumber(1), Fr.random());
    expect(response).toBeInstanceOf(NullifierMembershipWitness);
  });

  it('getLowNullifierMembershipWitness', async () => {
    const response = await context.client.getLowNullifierMembershipWitness(BlockNumber(1), Fr.random());
    expect(response).toBeInstanceOf(NullifierMembershipWitness);
  });

  it('getPublicDataWitness', async () => {
    const response = await context.client.getPublicDataWitness(BlockNumber(1), Fr.random());
    expect(response).toBeInstanceOf(PublicDataWitness);
  });

  it('getBlock', async () => {
    const response = await context.client.getBlock(BlockNumber(1));
    expect(response).toBeUndefined();
  });

  it('getBlockData', async () => {
    const response = await context.client.getBlockData(BlockNumber(1));
    expect(response).toBeUndefined();
  });

  it('getCheckpoint', async () => {
    const response = await context.client.getCheckpoint(CheckpointNumber(1));
    expect(response).toBeUndefined();
  });

  it('getCurrentMinFees', async () => {
    const response = await context.client.getCurrentMinFees();
    expect(response).toEqual(GasFees.empty());
  });

  it('getPredictedMinFees', async () => {
    const response = await context.client.getPredictedMinFees();
    expect(response).toEqual([GasFees.empty()]);
  });

  it('getMaxPriorityFees', async () => {
    const response = await context.client.getMaxPriorityFees();
    expect(response).toEqual(GasFees.empty());
  });

  it('getBlockNumber', async () => {
    expect(await context.client.getBlockNumber()).toBe(BlockNumber(1));
    expect(await context.client.getBlockNumber('proven')).toBe(BlockNumber(1));
    expect(await context.client.getBlockNumber('checkpointed')).toBe(BlockNumber(1));
  });

  it('getCheckpointNumber', async () => {
    expect(await context.client.getCheckpointNumber()).toBe(CheckpointNumber(1));
    expect(await context.client.getCheckpointNumber('proven')).toBe(CheckpointNumber(1));
  });

  it('isReady', async () => {
    const response = await context.client.isReady();
    expect(response).toBe(true);
  });

  it('getNodeInfo', async () => {
    const response = await context.client.getNodeInfo();
    expect(response).toEqual({
      ...(await handler.getNodeInfo()),
      l1ContractAddresses: Object.fromEntries(
        L1ContractsNames.map(name => [name, expect.any(EthAddress)]),
      ) as L1ContractAddresses,
      protocolContractAddresses: Object.fromEntries(
        ProtocolContractsNames.map(name => [name, expect.any(AztecAddress)]),
      ) as ProtocolContractAddresses,
    });
  });

  it('getBlocks', async () => {
    const response = await context.client.getBlocks(BlockNumber(1), 1);
    expect(response).toEqual([]);

    await expect(context.client.getBlocks(-1 as BlockNumber, BlockNumber(1))).rejects.toThrow();
    await expect(context.client.getBlocks(BlockNumber.ZERO, BlockNumber(1))).rejects.toThrow();
    await expect(context.client.getBlocks(BlockNumber(1), BlockNumber.ZERO)).rejects.toThrow();
    await expect(context.client.getBlocks(BlockNumber(1), MAX_RPC_LEN + 1)).rejects.toThrow();
  });

  it('getCheckpoints', async () => {
    const response = await context.client.getCheckpoints(CheckpointNumber(1), 1);
    expect(response).toEqual([]);
  });

  it('getCheckpointsData (epoch)', async () => {
    const response = await context.client.getCheckpointsData({ epoch: EpochNumber(1) });
    expect(response).toEqual([]);
  });

  it('getCheckpointsData (range)', async () => {
    const response = await context.client.getCheckpointsData({ from: CheckpointNumber(1), limit: 1 });
    expect(response).toEqual([]);
  });

  it('getNodeVersion', async () => {
    const response = await context.client.getNodeVersion();
    expect(response).toBe('1.0.0');
  });

  it('getVersion', async () => {
    const response = await context.client.getVersion();
    expect(response).toBe(BlockNumber(1));
  });

  it('getChainId', async () => {
    const response = await context.client.getChainId();
    expect(response).toBe(BlockNumber(1));
  });

  it('getL1ContractAddresses', async () => {
    const response = await context.client.getL1ContractAddresses();
    expect(response).toEqual(Object.fromEntries(L1ContractsNames.map(name => [name, expect.any(EthAddress)])));
  });

  it('getProtocolContractAddresses', async () => {
    const response = await context.client.getProtocolContractAddresses();
    expect(response).toEqual(Object.fromEntries(ProtocolContractsNames.map(name => [name, expect.any(AztecAddress)])));
  });

  it('registerContractFunctionSignatures', async () => {
    await context.client.registerContractFunctionSignatures(['test()']);
  });

  it('getPrivateLogsByTags', async () => {
    const response = await context.client.getPrivateLogsByTags({ tags: [SiloedTag.random()] });
    expect(response).toHaveLength(1);
    expect(response[0]).toHaveLength(1);
    expect(response[0][0].txHash).toBeDefined();
  });

  it('getPublicLogsByTags', async () => {
    const contractAddress = await AztecAddress.random();
    const response = await context.client.getPublicLogsByTags({ contractAddress, tags: [Tag.random()] });
    expect(response).toHaveLength(1);
    expect(response[0]).toHaveLength(1);
    expect(response[0][0].txHash).toBeDefined();
  });

  it('sendTx', async () => {
    await context.client.sendTx(Tx.random());
  });

  it('getTxReceipt', async () => {
    // No options: the mock returns a plain mined receipt.
    const response = await context.client.getTxReceipt(TxHash.random());
    expect(response).toBeInstanceOf(MinedTxReceipt);

    // The mock keys its returned variant off the options it receives, so each call below exercises both a distinct
    // variant and the GetTxReceiptOptions wire encoding, round-tripping back to the correct class.
    const mined = await context.client.getTxReceipt(TxHash.random(), { includeTxEffect: true });
    expect(mined).toBeInstanceOf(MinedTxReceipt);
    expect((mined as MinedTxReceipt).txEffect).toBeInstanceOf(TxEffect);

    const pending = await context.client.getTxReceipt(TxHash.random(), { includePendingTx: true });
    expect(pending).toBeInstanceOf(PendingTxReceipt);
    expect((pending as PendingTxReceipt).tx).toBeInstanceOf(Tx);

    const dropped = await context.client.getTxReceipt(TxHash.random(), { includeProof: true });
    expect(dropped).toBeInstanceOf(DroppedTxReceipt);
    expect((dropped as DroppedTxReceipt).error).toEqual('dropped');
  });

  it('getTxEffect', async () => {
    const response = await context.client.getTxEffect(TxHash.random());
    expect(response!.data).toBeInstanceOf(TxEffect);
  });

  it('getPendingTxs', async () => {
    const response = await context.client.getPendingTxs();
    expect(response).toEqual([expect.any(Tx)]);
  });

  it('getPendingTxCount', async () => {
    const response = await context.client.getPendingTxCount();
    expect(response).toBe(BlockNumber(1));
  });

  it('getTxByHash', async () => {
    const response = await context.client.getTxByHash(TxHash.random());
    expect(response).toBeInstanceOf(Tx);
  });

  it('getTxsByHash', async () => {
    const response = await context.client.getTxsByHash([TxHash.random()]);
    expect(response[0]).toBeInstanceOf(Tx);
  });

  it('getPublicStorageAt', async () => {
    const response = await context.client.getPublicStorageAt(BlockNumber(1), await AztecAddress.random(), Fr.random());
    expect(response).toBeInstanceOf(Fr);
  });

  it.each<[string, BlockParameter]>([
    ['BlockNumber', BlockNumber(7)],
    ['BlockHash', new BlockHash(new Fr(0x1234))],
    ['{ archive }', { archive: new Fr(0x5678) }],
    ['tag latest', 'latest'],
    ['tag proven', 'proven'],
  ])('getPublicStorageAt (round-trips %s)', async (_, block) => {
    handler.lastReferenceBlock = undefined;
    await context.client.getPublicStorageAt(block, await AztecAddress.random(), Fr.random());
    if (typeof block === 'object' && 'archive' in block) {
      expect(handler.lastReferenceBlock).toEqual({ archive: expect.any(Fr) });
    } else if (BlockHash.isBlockHash(block)) {
      expect(BlockHash.isBlockHash(handler.lastReferenceBlock)).toBe(true);
      expect((handler.lastReferenceBlock as unknown as BlockHash).toString()).toEqual(block.toString());
    } else {
      expect(handler.lastReferenceBlock).toEqual(block);
    }
  });

  it('getValidatorsStats', async () => {
    handler.validatorStats = {
      stats: {
        [EthAddress.random().toString()]: {
          address: EthAddress.random(),
          totalSlots: 10,
          missedAttestations: {
            currentStreak: 1,
            count: 1,
            total: 1,
          },
          missedProposals: {
            currentStreak: 1,
            rate: 1,
            count: 1,
            total: 1,
          },
          history: [{ slot: SlotNumber(1), status: 'checkpoint-mined' }],
        },
      },
      lastProcessedSlot: SlotNumber(20),
      initialSlot: SlotNumber(1),
      slotWindow: 10,
    };
    const response = await context.client.getValidatorsStats();
    expect(response).toEqual(handler.validatorStats);
  });

  it('getValidatorsStats(empty)', async () => {
    handler.validatorStats = {
      stats: {},
      initialSlot: SlotNumber(1),
      slotWindow: 10,
    };
    const response = await context.client.getValidatorsStats();
    expect(response).toEqual(handler.validatorStats);
  });

  it('getValidatorsStats(noinitialslot)', async () => {
    handler.validatorStats = {
      stats: {},
      slotWindow: 10,
    };
    const response = await context.client.getValidatorsStats();
    expect(response).toEqual(handler.validatorStats);
  });

  it('getValidatorsStats(disabled)', async () => {
    handler.validatorStats = {
      stats: {},
      slotWindow: 0,
    };
    const response = await context.client.getValidatorsStats();
    expect(response).toEqual(handler.validatorStats);
  });

  it('getValidatorStats', async () => {
    const validatorAddress = EthAddress.random();
    handler.singleValidatorStats = {
      validator: {
        address: validatorAddress,
        totalSlots: 5,
        missedAttestations: { currentStreak: 0, count: 0, total: 1 },
        missedProposals: { currentStreak: 0, count: 0, total: 1 },
        history: [{ slot: SlotNumber(1), status: 'checkpoint-mined' }],
      },
      allTimeEpochPerformance: [],
      lastProcessedSlot: SlotNumber(10),
      initialSlot: SlotNumber(1),
      slotWindow: 100,
    };

    const response = await context.client.getValidatorStats(validatorAddress);
    expect(response).toEqual(handler.singleValidatorStats);
  });

  it('getValidatorStats(non-existent)', async () => {
    const response = await context.client.getValidatorStats(EthAddress.random());
    expect(response).toBeUndefined();
  });

  it('getValidatorStats(with-time-range)', async () => {
    const validatorAddress = EthAddress.random();
    handler.singleValidatorStats = {
      validator: {
        address: validatorAddress,
        totalSlots: 3,
        missedAttestations: { currentStreak: 0, count: 0, total: 0 },
        missedProposals: { currentStreak: 0, count: 0, total: 0 },
        history: [{ slot: SlotNumber(5), status: 'attestation-sent' }],
      },
      allTimeEpochPerformance: [],
      lastProcessedSlot: SlotNumber(10),
      initialSlot: SlotNumber(5),
      slotWindow: 5,
    };

    const response = await context.client.getValidatorStats(validatorAddress, SlotNumber(5), SlotNumber(10));
    expect(response).toEqual(handler.singleValidatorStats);
  });

  it('simulatePublicCalls', async () => {
    const response = await context.client.simulatePublicCalls(Tx.random());
    expect(response).toBeInstanceOf(PublicSimulationOutput);
  });

  it('isValidTx(valid)', async () => {
    const response = await context.client.isValidTx(Tx.random(), { isSimulation: true });
    expect(response).toEqual({ result: 'valid' });
  });

  it('isValidTx(invalid)', async () => {
    const response = await context.client.isValidTx(Tx.random());
    expect(response).toEqual({ result: 'invalid', reason: ['Invalid'] });
  });

  it('getContractClass', async () => {
    const contractClass = await getContractClassFromArtifact(artifact);
    const response = await context.client.getContractClass(Fr.random());
    expect(response).toEqual(omit(contractClass, 'publicBytecodeCommitment', 'privateFunctions'));
  });

  it('getContract', async () => {
    const response = await context.client.getContract(await AztecAddress.random());
    expect(response).toEqual({
      address: expect.any(AztecAddress),
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

  it('getEncodedEnr', async () => {
    const response = await context.client.getEncodedEnr();
    expect(response).toBe('enr:-');
  });

  it('getAllowedPublicSetup', async () => {
    const response = await context.client.getAllowedPublicSetup();
    expect(response).toEqual([]);
  });

  it('getWorldStateSyncStatus', async () => {
    const response = await context.client.getWorldStateSyncStatus();
    expect(response).toEqual(await handler.getWorldStateSyncStatus());
  });
});

class MockAztecNode implements AztecNode {
  public validatorStats: ValidatorsStats | undefined;
  public singleValidatorStats: SingleValidatorStats | undefined;
  public lastReferenceBlock: BlockParameter | undefined;

  constructor(private artifact: ContractArtifact) {}

  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    return Promise.resolve({
      finalizedBlockNumber: BlockNumber(1),
      latestBlockHash: '0x',
      latestBlockNumber: BlockNumber(1),
      oldestHistoricBlockNumber: BlockNumber(1),
      treesAreSynched: true,
    });
  }

  getChainTips(): Promise<ChainTips> {
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

  getBlock<Opts extends BlockIncludeOptions = {}>(
    _param: BlockParameter,
    _options?: Opts,
  ): Promise<BlockResponse<Opts> | undefined> {
    return Promise.resolve(undefined);
  }

  getBlockData(_param: BlockParameter): Promise<BlockData | undefined> {
    return Promise.resolve(undefined);
  }

  getBlocks<Opts extends BlocksIncludeOptions = {}>(
    _from: BlockNumber,
    _limit: number,
    _options?: Opts,
  ): Promise<BlockResponse<Opts>[]> {
    return Promise.resolve([]);
  }

  getCheckpoint<Opts extends CheckpointIncludeOptions = {}>(
    _param: CheckpointParameter,
    _options?: Opts,
  ): Promise<CheckpointResponse<Opts> | undefined> {
    return Promise.resolve(undefined);
  }

  getCheckpoints<Opts extends CheckpointIncludeOptions = {}>(
    _from: CheckpointNumber,
    _limit: number,
    _options?: Opts,
  ): Promise<CheckpointResponse<Opts>[]> {
    return Promise.resolve([]);
  }

  getCheckpointsData(_query: CheckpointsQuery): Promise<CheckpointData[]> {
    return Promise.resolve([]);
  }

  findLeavesIndexes(
    referenceBlock: BlockParameter,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(DataInBlock<bigint> | undefined)[]> {
    expect(
      referenceBlock === 'latest' || BlockHash.isBlockHash(referenceBlock) || typeof referenceBlock === 'number',
    ).toBe(true);
    expect(leafValues).toHaveLength(2);
    expect(leafValues[0]).toBeInstanceOf(Fr);
    expect(leafValues[1]).toBeInstanceOf(Fr);
    return Promise.resolve([
      { data: 1n, l2BlockNumber: BlockNumber(1), l2BlockHash: new BlockHash(new Fr(1)) },
      undefined,
    ]);
  }
  getL1ToL2MessageMembershipWitness(
    referenceBlock: BlockParameter,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    expect(
      referenceBlock === 'latest' || BlockHash.isBlockHash(referenceBlock) || typeof referenceBlock === 'number',
    ).toBe(true);
    expect(l1ToL2Message).toBeInstanceOf(Fr);
    return Promise.resolve([1n, SiblingPath.random(L1_TO_L2_MSG_TREE_HEIGHT)]);
  }
  getBlockHashMembershipWitness(
    referenceBlock: BlockParameter,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    expect(
      referenceBlock === 'latest' || BlockHash.isBlockHash(referenceBlock) || typeof referenceBlock === 'number',
    ).toBe(true);
    expect(blockHash).toBeInstanceOf(BlockHash);
    return Promise.resolve(MembershipWitness.random(ARCHIVE_HEIGHT));
  }
  getNoteHashMembershipWitness(
    referenceBlock: BlockParameter,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    expect(
      referenceBlock === 'latest' || BlockHash.isBlockHash(referenceBlock) || typeof referenceBlock === 'number',
    ).toBe(true);
    expect(noteHash).toBeInstanceOf(Fr);
    return Promise.resolve(MembershipWitness.random(NOTE_HASH_TREE_HEIGHT));
  }
  getL1ToL2MessageCheckpoint(l1ToL2Message: Fr): Promise<CheckpointNumber | undefined> {
    expect(l1ToL2Message).toBeInstanceOf(Fr);
    return Promise.resolve(CheckpointNumber(5));
  }
  getL2ToL1Messages(_epoch: EpochNumber): Promise<Fr[][][][]> {
    return Promise.resolve(
      Array.from({ length: 3 }, (_, i) =>
        Array.from({ length: 4 }, (_, j) =>
          Array.from({ length: 2 }, (_, k) =>
            Array.from({ length: 3 }).map((_, l) => new Fr(i * 11 + j * 22 + k * 33 + l * 44)),
          ),
        ),
      ),
    );
  }
  getNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    expect(
      referenceBlock === 'latest' || BlockHash.isBlockHash(referenceBlock) || typeof referenceBlock === 'number',
    ).toBe(true);
    expect(nullifier).toBeInstanceOf(Fr);
    return Promise.resolve(NullifierMembershipWitness.random());
  }
  getLowNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    expect(
      referenceBlock === 'latest' || BlockHash.isBlockHash(referenceBlock) || typeof referenceBlock === 'number',
    ).toBe(true);
    expect(nullifier).toBeInstanceOf(Fr);
    return Promise.resolve(NullifierMembershipWitness.random());
  }
  getPublicDataWitness(referenceBlock: BlockParameter, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    expect(
      referenceBlock === 'latest' || BlockHash.isBlockHash(referenceBlock) || typeof referenceBlock === 'number',
    ).toBe(true);
    expect(leafSlot).toBeInstanceOf(Fr);
    return Promise.resolve(PublicDataWitness.random());
  }
  getCurrentMinFees(): Promise<GasFees> {
    return Promise.resolve(GasFees.empty());
  }
  getPredictedMinFees(): Promise<GasFees[]> {
    return Promise.resolve([GasFees.empty()]);
  }
  getMaxPriorityFees(): Promise<GasFees> {
    return Promise.resolve(GasFees.empty());
  }
  getBlockNumber(_tip?: ChainTip): Promise<BlockNumber> {
    return Promise.resolve(BlockNumber(1));
  }
  getCheckpointNumber(_tip?: ChainTip): Promise<CheckpointNumber> {
    return Promise.resolve(CheckpointNumber(1));
  }
  isReady(): Promise<boolean> {
    return Promise.resolve(true);
  }
  async getNodeInfo(): Promise<NodeInfo> {
    const protocolContracts = await Promise.all(
      ProtocolContractsNames.map(async name => [name, await AztecAddress.random()]),
    );
    return {
      nodeVersion: '1.0',
      l1ChainId: 1,
      rollupVersion: 1,
      enr: 'enr',
      l1ContractAddresses: Object.fromEntries(
        L1ContractsNames.map(name => [name, EthAddress.random()]),
      ) as L1ContractAddresses,
      protocolContractAddresses: Object.fromEntries(protocolContracts) as ProtocolContractAddresses,
      realProofs: true,
    };
  }
  getNodeVersion(): Promise<string> {
    return Promise.resolve('1.0.0');
  }
  getVersion(): Promise<number> {
    return Promise.resolve(BlockNumber(1));
  }
  getChainId(): Promise<number> {
    return Promise.resolve(BlockNumber(1));
  }
  @memoize
  getL1ContractAddresses(): Promise<L1ContractAddresses> {
    return Promise.resolve(
      Object.fromEntries(L1ContractsNames.map(name => [name, EthAddress.random()])) as L1ContractAddresses,
    );
  }
  @memoize
  async getProtocolContractAddresses(): Promise<ProtocolContractAddresses> {
    const protocolContracts = await Promise.all(
      ProtocolContractsNames.map(async name => [name, await AztecAddress.random()]),
    );
    return Object.fromEntries(protocolContracts) as ProtocolContractAddresses;
  }
  registerContractFunctionSignatures(_signatures: string[]): Promise<void> {
    return Promise.resolve();
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
  sendTx(tx: Tx): Promise<void> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve();
  }
  async getTxReceipt(txHash: TxHash, options?: GetTxReceiptOptions): Promise<TxReceipt> {
    expect(txHash).toBeInstanceOf(TxHash);
    if (options?.includePendingTx) {
      return new PendingTxReceipt(txHash, Tx.random());
    }
    if (options?.includeProof) {
      return new DroppedTxReceipt(txHash, 'dropped');
    }
    return new MinedTxReceipt(
      txHash,
      TxStatus.PROVEN,
      TxExecutionResult.SUCCESS,
      1n,
      new BlockHash(new Fr(0x12)),
      BlockNumber(1),
      0,
      EpochNumber(1),
      undefined,
      options?.includeTxEffect ? await TxEffect.random() : undefined,
    );
  }
  async getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return {
      l2BlockNumber: BlockNumber(1),
      l2BlockHash: new BlockHash(new Fr(0x12)),
      data: await TxEffect.random(),
      txIndexInBlock: randomInt(10),
    };
  }
  getPendingTxs(): Promise<Tx[]> {
    return Promise.resolve([Tx.random()]);
  }
  getPendingTxCount(): Promise<number> {
    return Promise.resolve(BlockNumber(1));
  }
  getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(Tx.random());
  }
  getTxsByHash(txHashes: TxHash[]): Promise<Tx[]> {
    expect(txHashes[0]).toBeInstanceOf(TxHash);
    return Promise.resolve([Tx.random()]);
  }
  getPublicStorageAt(block: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr> {
    expect(
      typeof block === 'number' ||
        typeof block === 'string' ||
        BlockHash.isBlockHash(block) ||
        (typeof block === 'object' && block !== null),
    ).toBe(true);
    expect(contract).toBeInstanceOf(AztecAddress);
    expect(slot).toBeInstanceOf(Fr);
    this.lastReferenceBlock = block;
    return Promise.resolve(Fr.random());
  }
  getValidatorsStats(): Promise<ValidatorsStats> {
    return Promise.resolve(this.validatorStats!);
  }
  getValidatorStats(
    validatorAddress: EthAddress,
    fromSlot?: SlotNumber,
    toSlot?: SlotNumber,
  ): Promise<SingleValidatorStats | undefined> {
    expect(validatorAddress).toBeInstanceOf(EthAddress);
    if (fromSlot !== undefined) {
      expect(typeof fromSlot).toBe('number');
    }
    if (toSlot !== undefined) {
      expect(typeof toSlot).toBe('number');
    }
    return Promise.resolve(this.singleValidatorStats);
  }
  simulatePublicCalls(tx: Tx, _enforceFeePayment = false): Promise<PublicSimulationOutput> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve(PublicSimulationOutput.random());
  }
  isValidTx(tx: Tx, { isSimulation }: { isSimulation?: boolean } | undefined = {}): Promise<TxValidationResult> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve(isSimulation ? { result: 'valid' } : { result: 'invalid', reason: ['Invalid'] });
  }
  setConfig(config: Partial<SequencerConfig & ProverConfig>): Promise<void> {
    expect(config.coinbase).toBeInstanceOf(EthAddress);
    return Promise.resolve();
  }
  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    expect(id).toBeInstanceOf(Fr);
    const contractClass = await getContractClassFromArtifact(this.artifact);
    return contractClass;
  }
  async getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    const instance = {
      version: 2 as const,
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      deployer: await AztecAddress.random(),
      initializationHash: Fr.random(),
      immutablesHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
      salt: Fr.random(),
      address: await AztecAddress.random(),
    };
    return instance;
  }
  getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve('enr:-');
  }
  getAllowedPublicSetup(): Promise<AllowedElement[]> {
    return Promise.resolve([]);
  }
}
