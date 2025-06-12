import {
  ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { type L1ContractAddresses, L1ContractsNames } from '@aztec/ethereum/l1-contract-addresses';
import { Buffer32 } from '@aztec/foundation/buffer';
import { randomInt } from '@aztec/foundation/crypto';
import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';

import omit from 'lodash.omit';
import times from 'lodash.times';

import type { ContractArtifact } from '../abi/abi.js';
import { AztecAddress } from '../aztec-address/index.js';
import type { InBlock } from '../block/in_block.js';
import { CommitteeAttestation, type L2BlockNumber } from '../block/index.js';
import { L2Block } from '../block/l2_block.js';
import type { L2Tips } from '../block/l2_block_source.js';
import type { PublishedL2Block } from '../block/published_l2_block.js';
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
import { ExtendedContractClassLog } from '../logs/extended_contract_class_log.js';
import { ExtendedPublicLog } from '../logs/extended_public_log.js';
import type { LogFilter } from '../logs/log_filter.js';
import { PrivateLog } from '../logs/private_log.js';
import { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';
import { getTokenContractArtifact } from '../tests/fixtures.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';
import { NullifierMembershipWitness } from '../trees/nullifier_membership_witness.js';
import { PublicDataWitness } from '../trees/public_data_witness.js';
import { BlockHeader } from '../tx/block_header.js';
import type { IndexedTxEffect } from '../tx/indexed_tx_effect.js';
import { PublicSimulationOutput } from '../tx/public_simulation_output.js';
import { Tx } from '../tx/tx.js';
import { TxEffect } from '../tx/tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import { TxReceipt } from '../tx/tx_receipt.js';
import type { TxValidationResult } from '../tx/validator/tx_validator.js';
import type { ValidatorsStats } from '../validators/types.js';
import { MAX_RPC_LEN } from './api_limit.js';
import { type AztecNode, AztecNodeApiSchema } from './aztec-node.js';
import type { SequencerConfig } from './configs.js';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from './get_logs_response.js';
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
    tested.add(/^AztecNodeApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(AztecNodeApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getL2Tips', async () => {
    const result = await context.client.getL2Tips();
    expect(result).toEqual({
      latest: { number: 1, hash: `0x01` },
      proven: { number: 1, hash: `0x01` },
      finalized: { number: 1, hash: `0x01` },
    });
  });

  it('findLeavesIndexes', async () => {
    const response = await context.client.findLeavesIndexes(1, MerkleTreeId.ARCHIVE, [Fr.random(), Fr.random()]);
    expect(response).toEqual([{ data: 1n, l2BlockNumber: 1, l2BlockHash: '0x01' }, undefined]);

    await expect(
      context.client.findLeavesIndexes(1, MerkleTreeId.ARCHIVE, times(MAX_RPC_LEN + 1, Fr.random)),
    ).rejects.toThrow();
  });

  it('getNullifierSiblingPath', async () => {
    const response = await context.client.getNullifierSiblingPath(1, 1n);
    expect(response).toBeInstanceOf(SiblingPath);
  });

  it('getNoteHashSiblingPath', async () => {
    const response = await context.client.getNoteHashSiblingPath(1, 1n);
    expect(response).toBeInstanceOf(SiblingPath);
  });

  it('getL1ToL2MessageMembershipWitness', async () => {
    const response = await context.client.getL1ToL2MessageMembershipWitness(1, Fr.random());
    expect(response).toEqual([1n, expect.any(SiblingPath)]);
  });

  it('isL1ToL2MessageSynced', async () => {
    const response = await context.client.isL1ToL2MessageSynced(Fr.random());
    expect(response).toBe(true);
  });

  it('getL2ToL1Messages', async () => {
    const response = await context.client.getL2ToL1Messages(1);
    expect(response?.length).toBe(3);
  });

  it('getArchiveSiblingPath', async () => {
    const response = await context.client.getArchiveSiblingPath(1, 1n);
    expect(response).toBeInstanceOf(SiblingPath);
  });

  it('getPublicDataSiblingPath', async () => {
    const response = await context.client.getPublicDataSiblingPath(1, 1n);
    expect(response).toBeInstanceOf(SiblingPath);
  });

  it('getArchiveMembershipWitness', async () => {
    const response = await context.client.getArchiveMembershipWitness(1, Fr.random());
    expect(response).toBeInstanceOf(MembershipWitness);
  });

  it('getNoteHashMembershipWitness', async () => {
    const response = await context.client.getNoteHashMembershipWitness(1, Fr.random());
    expect(response).toBeInstanceOf(MembershipWitness);
  });

  it('getNullifierMembershipWitness', async () => {
    const response = await context.client.getNullifierMembershipWitness(1, Fr.random());
    expect(response).toBeInstanceOf(NullifierMembershipWitness);
  });

  it('getLowNullifierMembershipWitness', async () => {
    const response = await context.client.getLowNullifierMembershipWitness(1, Fr.random());
    expect(response).toBeInstanceOf(NullifierMembershipWitness);
  });

  it('getPublicDataWitness', async () => {
    const response = await context.client.getPublicDataWitness(1, Fr.random());
    expect(response).toBeInstanceOf(PublicDataWitness);
  });

  it('getBlock', async () => {
    const response = await context.client.getBlock(1);
    expect(response).toBeInstanceOf(L2Block);
  });

  it('getCurrentBaseFees', async () => {
    const response = await context.client.getCurrentBaseFees();
    expect(response).toEqual(GasFees.empty());
  });

  it('getBlockNumber', async () => {
    const response = await context.client.getBlockNumber();
    expect(response).toBe(1);
  });

  it('getProvenBlockNumber', async () => {
    const response = await context.client.getProvenBlockNumber();
    expect(response).toBe(1);
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
    const response = await context.client.getBlocks(1, 1);
    expect(response).toHaveLength(1);
    expect(response[0]).toBeInstanceOf(L2Block);

    await expect(context.client.getBlocks(-1, 1)).rejects.toThrow();
    await expect(context.client.getBlocks(0, 1)).rejects.toThrow();
    await expect(context.client.getBlocks(1, 0)).rejects.toThrow();
    await expect(context.client.getBlocks(1, MAX_RPC_LEN + 1)).rejects.toThrow();
  });

  it('getPublishedBlocks', async () => {
    const response = await context.client.getPublishedBlocks(1, 1);
    expect(response).toHaveLength(1);
    expect(response[0].block.constructor.name).toEqual('L2Block');
    expect(response[0].attestations[0]).toBeInstanceOf(CommitteeAttestation);
    expect(response[0].l1).toBeDefined();
  });

  it('getNodeVersion', async () => {
    const response = await context.client.getNodeVersion();
    expect(response).toBe('1.0.0');
  });

  it('getVersion', async () => {
    const response = await context.client.getVersion();
    expect(response).toBe(1);
  });

  it('getChainId', async () => {
    const response = await context.client.getChainId();
    expect(response).toBe(1);
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
    await context.client.registerContractFunctionSignatures(await AztecAddress.random(), ['test()']);
  });

  it('getPrivateLogs', async () => {
    const response = await context.client.getPrivateLogs(1, 1);
    expect(response).toEqual([expect.any(PrivateLog)]);
  });

  it('getPublicLogs', async () => {
    const response = await context.client.getPublicLogs({ contractAddress: await AztecAddress.random() });
    expect(response).toEqual({ logs: [expect.any(ExtendedPublicLog)], maxLogsHit: true });
  });

  it('getContractClassLogs', async () => {
    const response = await context.client.getContractClassLogs({ contractAddress: await AztecAddress.random() });
    expect(response).toEqual({ logs: [expect.any(ExtendedContractClassLog)], maxLogsHit: true });
  });

  it('getLogsByTags', async () => {
    const response = await context.client.getLogsByTags([Fr.random()]);
    expect(response).toEqual([[expect.any(TxScopedL2Log)]]);
  });

  it('sendTx', async () => {
    await context.client.sendTx(Tx.random());
  });

  it('getTxReceipt', async () => {
    const response = await context.client.getTxReceipt(TxHash.random());
    expect(response).toBeInstanceOf(TxReceipt);
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
    expect(response).toBe(1);
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
    const response = await context.client.getPublicStorageAt(1, await AztecAddress.random(), Fr.random());
    expect(response).toBeInstanceOf(Fr);
  });

  it('getBlockHeader', async () => {
    const response = await context.client.getBlockHeader();
    expect(response).toBeInstanceOf(BlockHeader);
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
          },
          missedProposals: {
            currentStreak: 1,
            rate: 1,
            count: 1,
          },
          history: [{ slot: 1n, status: 'block-mined' }],
        },
      },
      lastProcessedSlot: 20n,
      initialSlot: 1n,
      slotWindow: 10,
    };
    const response = await context.client.getValidatorsStats();
    expect(response).toEqual(handler.validatorStats);
  });

  it('getValidatorsStats(empty)', async () => {
    handler.validatorStats = {
      stats: {},
      initialSlot: 1n,
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
    expect(response).toEqual({
      ...omit(contractClass, 'publicBytecodeCommitment'),
      utilityFunctions: [],
      privateFunctions: [],
    });
  });

  it('getContract', async () => {
    const response = await context.client.getContract(await AztecAddress.random());
    expect(response).toEqual({
      address: expect.any(AztecAddress),
      currentContractClassId: expect.any(Fr),
      originalContractClassId: expect.any(Fr),
      deployer: expect.any(AztecAddress),
      initializationHash: expect.any(Fr),
      publicKeys: expect.any(PublicKeys),
      salt: expect.any(Fr),
      version: 1,
    });
  });

  it('getEncodedEnr', async () => {
    const response = await context.client.getEncodedEnr();
    expect(response).toBe('enr:-');
  });

  it('getWorldStateSyncStatus', async () => {
    const response = await context.client.getWorldStateSyncStatus();
    expect(response).toEqual(await handler.getWorldStateSyncStatus());
  });
});

class MockAztecNode implements AztecNode {
  public validatorStats: ValidatorsStats | undefined;

  constructor(private artifact: ContractArtifact) {}

  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    return Promise.resolve({
      finalisedBlockNumber: 1,
      latestBlockHash: '0x',
      latestBlockNumber: 1,
      oldestHistoricBlockNumber: 1,
      treesAreSynched: true,
    });
  }

  getL2Tips(): Promise<L2Tips> {
    return Promise.resolve({
      latest: { number: 1, hash: `0x01` },
      proven: { number: 1, hash: `0x01` },
      finalized: { number: 1, hash: `0x01` },
    });
  }

  findLeavesIndexes(
    blockNumber: number | 'latest',
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    expect(leafValues).toHaveLength(2);
    expect(leafValues[0]).toBeInstanceOf(Fr);
    expect(leafValues[1]).toBeInstanceOf(Fr);
    return Promise.resolve([{ data: 1n, l2BlockNumber: 1, l2BlockHash: '0x01' }, undefined]);
  }
  getNullifierSiblingPath(
    blockNumber: number | 'latest',
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof NULLIFIER_TREE_HEIGHT>> {
    expect(leafIndex).toBe(1n);
    return Promise.resolve(SiblingPath.random(NULLIFIER_TREE_HEIGHT));
  }
  getNoteHashSiblingPath(
    blockNumber: number | 'latest',
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof NOTE_HASH_TREE_HEIGHT>> {
    expect(leafIndex).toBe(1n);
    return Promise.resolve(SiblingPath.random(NOTE_HASH_TREE_HEIGHT));
  }
  getL1ToL2MessageMembershipWitness(
    blockNumber: number | 'latest',
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    expect(l1ToL2Message).toBeInstanceOf(Fr);
    return Promise.resolve([1n, SiblingPath.random(L1_TO_L2_MSG_TREE_HEIGHT)]);
  }
  getArchiveMembershipWitness(
    blockNumber: L2BlockNumber,
    archive: Fr,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    expect(archive).toBeInstanceOf(Fr);
    return Promise.resolve(MembershipWitness.random(ARCHIVE_HEIGHT));
  }
  getNoteHashMembershipWitness(
    blockNumber: L2BlockNumber,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    expect(noteHash).toBeInstanceOf(Fr);
    return Promise.resolve(MembershipWitness.random(NOTE_HASH_TREE_HEIGHT));
  }
  isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean> {
    expect(l1ToL2Message).toBeInstanceOf(Fr);
    return Promise.resolve(true);
  }
  getL2ToL1Messages(_blockNumber: number | 'latest'): Promise<Fr[][] | undefined> {
    return Promise.resolve(Array.from({ length: 3 }, (_, i) => [new Fr(i)]));
  }
  getArchiveSiblingPath(
    blockNumber: number | 'latest',
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof ARCHIVE_HEIGHT>> {
    expect(leafIndex).toBe(1n);
    return Promise.resolve(SiblingPath.random(ARCHIVE_HEIGHT));
  }
  getPublicDataSiblingPath(
    blockNumber: number | 'latest',
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>> {
    expect(leafIndex).toBe(1n);
    return Promise.resolve(SiblingPath.random(PUBLIC_DATA_TREE_HEIGHT));
  }
  getNullifierMembershipWitness(
    blockNumber: number | 'latest',
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    expect(nullifier).toBeInstanceOf(Fr);
    return Promise.resolve(NullifierMembershipWitness.random());
  }
  getLowNullifierMembershipWitness(
    blockNumber: number | 'latest',
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    expect(nullifier).toBeInstanceOf(Fr);
    return Promise.resolve(NullifierMembershipWitness.random());
  }
  getPublicDataWitness(blockNumber: number | 'latest', leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    expect(leafSlot).toBeInstanceOf(Fr);
    return Promise.resolve(PublicDataWitness.random());
  }
  getBlock(number: number): Promise<L2Block | undefined> {
    return Promise.resolve(L2Block.random(number));
  }
  getCurrentBaseFees(): Promise<GasFees> {
    return Promise.resolve(GasFees.empty());
  }
  getBlockNumber(): Promise<number> {
    return Promise.resolve(1);
  }
  getProvenBlockNumber(): Promise<number> {
    return Promise.resolve(1);
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
    };
  }
  getBlocks(from: number, limit: number): Promise<L2Block[]> {
    return Promise.all(
      Array(limit)
        .fill(0)
        .map(i => L2Block.random(from + i)),
    );
  }
  getPublishedBlocks(from: number, limit: number): Promise<PublishedL2Block[]> {
    return Promise.all(
      Array(limit)
        .fill(0)
        .map(async i => ({
          block: await L2Block.random(from + i),
          attestations: [CommitteeAttestation.random()],
          l1: { blockHash: Buffer32.random().toString(), blockNumber: 1n, timestamp: 1n },
        })),
    );
  }
  getNodeVersion(): Promise<string> {
    return Promise.resolve('1.0.0');
  }
  getVersion(): Promise<number> {
    return Promise.resolve(1);
  }
  getChainId(): Promise<number> {
    return Promise.resolve(1);
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
  registerContractFunctionSignatures(_address: AztecAddress, _signatures: string[]): Promise<void> {
    return Promise.resolve();
  }
  getPrivateLogs(_from: number, _limit: number): Promise<PrivateLog[]> {
    return Promise.resolve([PrivateLog.random()]);
  }
  async getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return { logs: [await ExtendedPublicLog.random()], maxLogsHit: true };
  }
  async getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return Promise.resolve({ logs: [await ExtendedContractClassLog.random()], maxLogsHit: true });
  }
  async getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    expect(tags).toHaveLength(1);
    expect(tags[0]).toBeInstanceOf(Fr);
    return [[await TxScopedL2Log.random()]];
  }
  sendTx(tx: Tx): Promise<void> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve();
  }
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(TxReceipt.empty());
  }
  async getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return { l2BlockNumber: 1, l2BlockHash: '0x12', data: await TxEffect.random(), txIndexInBlock: randomInt(10) };
  }
  getPendingTxs(): Promise<Tx[]> {
    return Promise.resolve([Tx.random()]);
  }
  getPendingTxCount(): Promise<number> {
    return Promise.resolve(1);
  }
  getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(Tx.random());
  }
  getTxsByHash(txHashes: TxHash[]): Promise<Tx[]> {
    expect(txHashes[0]).toBeInstanceOf(TxHash);
    return Promise.resolve([Tx.random()]);
  }
  getPublicStorageAt(_blockNumber: number | 'latest', contract: AztecAddress, slot: Fr): Promise<Fr> {
    expect(contract).toBeInstanceOf(AztecAddress);
    expect(slot).toBeInstanceOf(Fr);
    return Promise.resolve(Fr.random());
  }
  getBlockHeader(_blockNumber?: number | 'latest'): Promise<BlockHeader> {
    return Promise.resolve(BlockHeader.empty());
  }
  getValidatorsStats(): Promise<ValidatorsStats> {
    return Promise.resolve(this.validatorStats!);
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
    return { ...contractClass, utilityFunctions: [], privateFunctions: [] };
  }
  async getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    const instance = {
      version: 1 as const,
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      deployer: await AztecAddress.random(),
      initializationHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
      salt: Fr.random(),
      address: await AztecAddress.random(),
    };
    return instance;
  }
  flushTxs(): Promise<void> {
    return Promise.resolve();
  }
  getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve('enr:-');
  }
}
