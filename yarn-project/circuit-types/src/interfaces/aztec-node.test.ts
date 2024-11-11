import {
  ARCHIVE_HEIGHT,
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  EthAddress,
  Fr,
  Header,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
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

import { L2Block } from '../l2_block.js';
import { ExtendedUnencryptedL2Log } from '../logs/extended_unencrypted_l2_log.js';
import { type GetUnencryptedLogsResponse, TxScopedEncryptedL2NoteLog } from '../logs/get_logs_response.js';
import {
  EncryptedL2BlockL2Logs,
  EncryptedNoteL2BlockL2Logs,
  type L2BlockL2Logs,
  UnencryptedL2BlockL2Logs,
} from '../logs/l2_block_l2_logs.js';
import { type LogFilter } from '../logs/log_filter.js';
import { type FromLogType, LogType } from '../logs/log_type.js';
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

  it('findLeafIndex', async () => {
    const response = await context.client.findLeafIndex(1, MerkleTreeId.ARCHIVE, Fr.random());
    expect(response).toBe(1n);
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
  });

  it('getLogs(Encrypted)', async () => {
    const response = await context.client.getLogs(1, 1, LogType.ENCRYPTED);
    expect(response).toEqual([expect.any(EncryptedL2BlockL2Logs)]);
  });

  it('getLogs(NoteEncrypted)', async () => {
    const response = await context.client.getLogs(1, 1, LogType.NOTEENCRYPTED);
    expect(response).toEqual([expect.any(EncryptedNoteL2BlockL2Logs)]);
  });

  it('getLogs(Unencrypted)', async () => {
    const response = await context.client.getLogs(1, 1, LogType.UNENCRYPTED);
    expect(response).toEqual([expect.any(UnencryptedL2BlockL2Logs)]);
  });

  it('getUnencryptedLogs', async () => {
    const response = await context.client.getUnencryptedLogs({ contractAddress: AztecAddress.random() });
    expect(response).toEqual({ logs: [expect.any(ExtendedUnencryptedL2Log)], maxLogsHit: true });
  });

  it('getLogsByTags', async () => {
    const response = await context.client.getLogsByTags([Fr.random()]);
    expect(response).toEqual([[expect.any(TxScopedEncryptedL2NoteLog)]]);
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
    expect(response).toBeInstanceOf(TxEffect);
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

  it('getHeader', async () => {
    const response = await context.client.getHeader();
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
});

class MockAztecNode implements AztecNode {
  constructor(private artifact: ContractArtifact) {}

  findLeafIndex(blockNumber: number | 'latest', treeId: MerkleTreeId, leafValue: Fr): Promise<bigint | undefined> {
    expect(leafValue).toBeInstanceOf(Fr);
    return Promise.resolve(1n);
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
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    expect(filter.contractAddress).toBeInstanceOf(AztecAddress);
    return Promise.resolve({ logs: [ExtendedUnencryptedL2Log.random()], maxLogsHit: true });
  }
  getLogsByTags(tags: Fr[]): Promise<TxScopedEncryptedL2NoteLog[][]> {
    expect(tags).toHaveLength(1);
    expect(tags[0]).toBeInstanceOf(Fr);
    return Promise.resolve([[TxScopedEncryptedL2NoteLog.random()]]);
  }
  sendTx(tx: Tx): Promise<void> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve();
  }
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(TxReceipt.empty());
  }
  getTxEffect(txHash: TxHash): Promise<TxEffect | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(TxEffect.random());
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
  getHeader(_blockNumber?: number | 'latest' | undefined): Promise<Header> {
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
}
