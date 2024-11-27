import {
  ARCHIVE_HEIGHT,
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  EthAddress,
  Fr,
  GasFees,
  Header,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  PrivateLog,
  type ProtocolContractAddresses,
  ProtocolContractsNames,
  PublicKeys,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { type L1ContractAddresses, L1ContractsNames } from '@aztec/ethereum';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { memoize } from '@aztec/foundation/decorators';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import { fileURLToPath } from '@aztec/foundation/url';
import { loadContractArtifact } from '@aztec/types/abi';

import { deepStrictEqual } from 'assert';
import { readFileSync } from 'fs';
import omit from 'lodash.omit';
import times from 'lodash.times';
import { resolve } from 'path';

import { type InBlock, randomInBlock } from '../in_block.js';
import { L2Block } from '../l2_block.js';
import { type L2Tips } from '../l2_block_source.js';
import { ExtendedUnencryptedL2Log } from '../logs/extended_unencrypted_l2_log.js';
import { type GetUnencryptedLogsResponse, TxScopedL2Log } from '../logs/get_logs_response.js';
import { type LogFilter } from '../logs/log_filter.js';
import { MerkleTreeId } from '../merkle_tree_id.js';
import { EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';
import { PublicDataWitness } from '../public_data_witness.js';
import { SiblingPath } from '../sibling_path/sibling_path.js';
import { PublicSimulationOutput } from '../tx/public_simulation_output.js';
import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';
import { TxReceipt } from '../tx/tx_receipt.js';
import { TxEffect } from '../tx_effect.js';
import { type AztecNode, AztecNodeApiSchema } from './aztec-node.js';
import { type SequencerConfig } from './configs.js';
import { NullifierMembershipWitness } from './nullifier_tree.js';
import { type ProverConfig } from './prover-client.js';

describe('AztecNodeApiSchema', () => {
  let handler: MockAztecNode;
  let context: JsonRpcTestContext<AztecNode>;
  let artifact: ContractArtifact;

  const tested: Set<string> = new Set();

  beforeAll(() => {
    const path = resolve(fileURLToPath(import.meta.url), '../../test/artifacts/token_contract-Token.json');
    artifact = loadContractArtifact(JSON.parse(readFileSync(path, 'utf-8')));
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
    expect(response).toEqual([1n, undefined]);
  });

  it('findNullifiersIndexesWithBlock', async () => {
    const response = await context.client.findNullifiersIndexesWithBlock(1, [Fr.random(), Fr.random()]);
    expect(response).toEqual([
      { data: 1n, l2BlockNumber: expect.any(Number), l2BlockHash: expect.any(String) },
      undefined,
    ]);
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

  it('getL2ToL1MessageMembershipWitness', async () => {
    const response = await context.client.getL2ToL1MessageMembershipWitness(1, Fr.random());
    expect(response).toEqual([1n, expect.any(SiblingPath)]);
  });

  it('getArchiveSiblingPath', async () => {
    const response = await context.client.getArchiveSiblingPath(1, 1n);
    expect(response).toBeInstanceOf(SiblingPath);
  });

  it('getPublicDataSiblingPath', async () => {
    const response = await context.client.getPublicDataSiblingPath(1, 1n);
    expect(response).toBeInstanceOf(SiblingPath);
  });

  it('getNullifierMembershipWitness', async () => {
    const response = await context.client.getNullifierMembershipWitness(1, Fr.random());
    expect(response).toBeInstanceOf(NullifierMembershipWitness);
  });

  it('getLowNullifierMembershipWitness', async () => {
    const response = await context.client.getLowNullifierMembershipWitness(1, Fr.random());
    expect(response).toBeInstanceOf(NullifierMembershipWitness);
  });

  it('getPublicDataTreeWitness', async () => {
    const response = await context.client.getPublicDataTreeWitness(1, Fr.random());
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

  it('getBlocks', async () => {
    const response = await context.client.getBlocks(1, 1);
    expect(response).toHaveLength(1);
    expect(response[0]).toBeInstanceOf(L2Block);
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

  it('addContractArtifact', async () => {
    await context.client.addContractArtifact(AztecAddress.random(), artifact);
  }, 20_000);

  it('getPrivateLogs', async () => {
    const response = await context.client.getPrivateLogs(1, 1);
    expect(response).toEqual([expect.any(PrivateLog)]);
  });

  it('getUnencryptedLogs', async () => {
    const response = await context.client.getUnencryptedLogs({ contractAddress: AztecAddress.random() });
    expect(response).toEqual({ logs: [expect.any(ExtendedUnencryptedL2Log)], maxLogsHit: true });
  });

  it('getContractClassLogs', async () => {
    const response = await context.client.getContractClassLogs({ contractAddress: AztecAddress.random() });
    expect(response).toEqual({ logs: [expect.any(ExtendedUnencryptedL2Log)], maxLogsHit: true });
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

  it('getPublicStorageAt', async () => {
    const response = await context.client.getPublicStorageAt(AztecAddress.random(), Fr.random(), 1);
    expect(response).toBeInstanceOf(Fr);
  });

  it('getBlockHeader', async () => {
    const response = await context.client.getBlockHeader();
    expect(response).toBeInstanceOf(Header);
  });

  it('simulatePublicCalls', async () => {
    const response = await context.client.simulatePublicCalls(Tx.random());
    expect(response).toBeInstanceOf(PublicSimulationOutput);
  });

  it('isValidTx', async () => {
    const response = await context.client.isValidTx(Tx.random());
    expect(response).toBe(true);
  });

  it('setConfig', async () => {
    await context.client.setConfig({ coinbase: EthAddress.random() });
  });

  it('getContractClass', async () => {
    const contractClass = getContractClassFromArtifact(artifact);
    const response = await context.client.getContractClass(Fr.random());
    expect(response).toEqual({
      ...omit(contractClass, 'publicBytecodeCommitment'),
      unconstrainedFunctions: [],
      privateFunctions: [],
    });
  });

  it('getContract', async () => {
    const response = await context.client.getContract(AztecAddress.random());
    expect(response).toEqual({
      address: expect.any(AztecAddress),
      contractClassId: expect.any(Fr),
      deployer: expect.any(AztecAddress),
      initializationHash: expect.any(Fr),
      publicKeys: expect.any(PublicKeys),
      salt: expect.any(Fr),
      version: 1,
    });
  });

  it('flushTxs', async () => {
    await context.client.flushTxs();
  });

  it('getEncodedEnr', async () => {
    const response = await context.client.getEncodedEnr();
    expect(response).toBe('enr:-');
  });

  it('addEpochProofQuote', async () => {
    await context.client.addEpochProofQuote(EpochProofQuote.random());
  });

  it('getEpochProofQuotes', async () => {
    const response = await context.client.getEpochProofQuotes(1n);
    expect(response).toEqual([expect.any(EpochProofQuote)]);
  });

  it('addContractClass', async () => {
    const contractClass = getContractClassFromArtifact(artifact);
    await context.client.addContractClass({ ...contractClass, unconstrainedFunctions: [], privateFunctions: [] });
  });
});

class MockAztecNode implements AztecNode {
  constructor(private artifact: ContractArtifact) {}

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
  ): Promise<(bigint | undefined)[]> {
    expect(leafValues).toHaveLength(2);
    expect(leafValues[0]).toBeInstanceOf(Fr);
    expect(leafValues[1]).toBeInstanceOf(Fr);
    return Promise.resolve([1n, undefined]);
  }
  findNullifiersIndexesWithBlock(
    blockNumber: number | 'latest',
    nullifiers: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    expect(nullifiers).toHaveLength(2);
    expect(nullifiers[0]).toBeInstanceOf(Fr);
    expect(nullifiers[1]).toBeInstanceOf(Fr);
    return Promise.resolve([randomInBlock(1n), undefined]);
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
  isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean> {
    expect(l1ToL2Message).toBeInstanceOf(Fr);
    return Promise.resolve(true);
  }
  getL2ToL1MessageMembershipWitness(
    blockNumber: number | 'latest',
    l2ToL1Message: Fr,
  ): Promise<[bigint, SiblingPath<number>]> {
    expect(l2ToL1Message).toBeInstanceOf(Fr);
    return Promise.resolve([1n, SiblingPath.random(4) as SiblingPath<number>]);
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
  getPublicDataTreeWitness(blockNumber: number | 'latest', leafSlot: Fr): Promise<PublicDataWitness | undefined> {
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
  getBlocks(from: number, limit: number): Promise<L2Block[]> {
    return Promise.resolve(times(limit, i => L2Block.random(from + i)));
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
  getProtocolContractAddresses(): Promise<ProtocolContractAddresses> {
    return Promise.resolve(
      Object.fromEntries(
        ProtocolContractsNames.map(name => [name, AztecAddress.random()]),
      ) as ProtocolContractAddresses,
    );
  }
  addContractArtifact(address: AztecAddress, artifact: ContractArtifact): Promise<void> {
    expect(address).toBeInstanceOf(AztecAddress);
    deepStrictEqual(artifact, this.artifact);
    return Promise.resolve();
  }
  getPrivateLogs(_from: number, _limit: number): Promise<PrivateLog[]> {
    return Promise.resolve([PrivateLog.random()]);
  }
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return Promise.resolve({ logs: [ExtendedUnencryptedL2Log.random()], maxLogsHit: true });
  }
  getContractClassLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return Promise.resolve({ logs: [ExtendedUnencryptedL2Log.random()], maxLogsHit: true });
  }
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    expect(tags).toHaveLength(1);
    expect(tags[0]).toBeInstanceOf(Fr);
    return Promise.resolve([[TxScopedL2Log.random()]]);
  }
  sendTx(tx: Tx): Promise<void> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve();
  }
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(TxReceipt.empty());
  }
  getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve({ l2BlockNumber: 1, l2BlockHash: '0x12', data: TxEffect.random() });
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
  getPublicStorageAt(contract: AztecAddress, slot: Fr, _blockNumber: number | 'latest'): Promise<Fr> {
    expect(contract).toBeInstanceOf(AztecAddress);
    expect(slot).toBeInstanceOf(Fr);
    return Promise.resolve(Fr.random());
  }
  getBlockHeader(_blockNumber?: number | 'latest' | undefined): Promise<Header> {
    return Promise.resolve(Header.empty());
  }
  simulatePublicCalls(tx: Tx): Promise<PublicSimulationOutput> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve(PublicSimulationOutput.random());
  }
  isValidTx(tx: Tx, _isSimulation?: boolean | undefined): Promise<boolean> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve(true);
  }
  setConfig(config: Partial<SequencerConfig & ProverConfig>): Promise<void> {
    expect(config.coinbase).toBeInstanceOf(EthAddress);
    return Promise.resolve();
  }
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    expect(id).toBeInstanceOf(Fr);
    const contractClass = getContractClassFromArtifact(this.artifact);
    return Promise.resolve({ ...contractClass, unconstrainedFunctions: [], privateFunctions: [] });
  }
  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    const instance = {
      version: 1 as const,
      contractClassId: Fr.random(),
      deployer: AztecAddress.random(),
      initializationHash: Fr.random(),
      publicKeys: PublicKeys.random(),
      salt: Fr.random(),
      address: AztecAddress.random(),
    };
    return Promise.resolve(instance);
  }
  flushTxs(): Promise<void> {
    return Promise.resolve();
  }
  getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve('enr:-');
  }
  addEpochProofQuote(quote: EpochProofQuote): Promise<void> {
    expect(quote).toBeInstanceOf(EpochProofQuote);
    return Promise.resolve();
  }
  getEpochProofQuotes(epoch: bigint): Promise<EpochProofQuote[]> {
    expect(epoch).toEqual(1n);
    return Promise.resolve([EpochProofQuote.random()]);
  }
  addContractClass(_contractClass: ContractClassPublic): Promise<void> {
    return Promise.resolve();
  }
}
