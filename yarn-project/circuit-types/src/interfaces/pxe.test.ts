import {
  AztecAddress,
  ClientIvcProof,
  CompleteAddress,
  type ContractInstanceWithAddress,
  EthAddress,
  Fr,
  GasFees,
  L1_TO_L2_MSG_TREE_HEIGHT,
  type NodeInfo,
  Point,
  PrivateKernelTailCircuitPublicInputs,
  type ProtocolContractAddresses,
  ProtocolContractsNames,
  PublicKeys,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { type L1ContractAddresses, L1ContractsNames } from '@aztec/ethereum/l1-contract-addresses';
import { type AbiDecoded, type ContractArtifact, EventSelector } from '@aztec/foundation/abi';
import { memoize } from '@aztec/foundation/decorators';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import { fileURLToPath } from '@aztec/foundation/url';
import { loadContractArtifact } from '@aztec/types/abi';

import { jest } from '@jest/globals';
import { deepStrictEqual } from 'assert';
import { readFileSync } from 'fs';
import omit from 'lodash.omit';
import times from 'lodash.times';
import { resolve } from 'path';

import { AuthWitness } from '../auth_witness.js';
import { type InBlock } from '../in_block.js';
import { L2Block } from '../l2_block.js';
import {
  ExtendedPublicLog,
  ExtendedUnencryptedL2Log,
  type GetContractClassLogsResponse,
  type GetPublicLogsResponse,
  type LogFilter,
} from '../logs/index.js';
import { ExtendedNote, UniqueNote } from '../notes/index.js';
import { type NotesFilter } from '../notes/notes_filter.js';
import { PrivateExecutionResult } from '../private_execution_result.js';
import { type EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';
import { SiblingPath } from '../sibling_path/sibling_path.js';
import { Tx, TxHash, TxProvingResult, TxReceipt, TxSimulationResult } from '../tx/index.js';
import { TxEffect } from '../tx_effect.js';
import { TxExecutionRequest } from '../tx_execution_request.js';
import {
  type ContractClassMetadata,
  type ContractMetadata,
  type EventMetadataDefinition,
  type PXE,
  type PXEInfo,
  PXESchema,
} from './pxe.js';

jest.setTimeout(12_000);

describe('PXESchema', () => {
  let handler: MockPXE;
  let context: JsonRpcTestContext<PXE>;

  let address: AztecAddress;
  let artifact: ContractArtifact;
  let instance: ContractInstanceWithAddress;

  const tested = new Set<string>();

  beforeAll(() => {
    const path = resolve(fileURLToPath(import.meta.url), '../../test/artifacts/token_contract-Token.json');
    artifact = loadContractArtifact(JSON.parse(readFileSync(path, 'utf-8')));
  });

  beforeEach(async () => {
    address = await AztecAddress.random();
    instance = {
      version: 1,
      contractClassId: Fr.random(),
      deployer: await AztecAddress.random(),
      initializationHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
      salt: Fr.random(),
      address,
    };
    handler = new MockPXE(address, artifact, instance);
    context = await createJsonRpcTestSetup<PXE>(handler, PXESchema);
  });

  afterEach(() => {
    tested.add(/^PXESchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(PXESchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('isL1ToL2MessageSynced', async () => {
    await context.client.isL1ToL2MessageSynced(Fr.random());
  });

  it('addAuthWitness', async () => {
    await context.client.addAuthWitness(AuthWitness.random());
  });

  it('getAuthWitness', async () => {
    const result = await context.client.getAuthWitness(Fr.random());
    expect(result).toEqual([expect.any(Fr)]);
  });

  it('storeCapsule', async () => {
    await context.client.storeCapsule(address, Fr.random(), times(3, Fr.random));
  });

  it('registerAccount', async () => {
    const result = await context.client.registerAccount(Fr.random(), Fr.random());
    expect(result).toBeInstanceOf(CompleteAddress);
  });

  it('getRegisteredAccounts', async () => {
    const result = await context.client.getRegisteredAccounts();
    expect(result).toEqual([expect.any(CompleteAddress)]);
  });

  it('registerSender', async () => {
    const result = await context.client.registerSender(address);
    expect(result).toEqual(address);
  });

  it('getSenders', async () => {
    const result = await context.client.getSenders();
    expect(result).toEqual([address]);
  });

  it('removeSender', async () => {
    await context.client.removeSender(address);
  });

  it('registerContractClass', async () => {
    await context.client.registerContractClass(artifact);
  });

  it('registerContract', async () => {
    await context.client.registerContract({ instance, artifact });
  });

  it('getContracts', async () => {
    const result = await context.client.getContracts();
    expect(result).toEqual([address]);
  });

  it('proveTx', async () => {
    const result = await context.client.proveTx(
      await TxExecutionRequest.random(),
      await PrivateExecutionResult.random(),
    );
    expect(result).toBeInstanceOf(TxProvingResult);
  });

  it('simulateTx(all)', async () => {
    const result = await context.client.simulateTx(
      await TxExecutionRequest.random(),
      true,
      address,
      false,
      true,
      false,
      [],
    );
    expect(result).toBeInstanceOf(TxSimulationResult);
  });

  it('simulateTx(required)', async () => {
    const result = await context.client.simulateTx(await TxExecutionRequest.random(), true);
    expect(result).toBeInstanceOf(TxSimulationResult);
  });

  it('simulateTx(undefined)', async () => {
    const result = await context.client.simulateTx(
      await TxExecutionRequest.random(),
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(result).toBeInstanceOf(TxSimulationResult);
  });

  it('sendTx', async () => {
    const result = await context.client.sendTx(await Tx.random());
    expect(result).toBeInstanceOf(TxHash);
  });

  it('getTxReceipt', async () => {
    const result = await context.client.getTxReceipt(TxHash.random());
    expect(result).toBeInstanceOf(TxReceipt);
  });

  it('getTxEffect', async () => {
    const { l2BlockHash, l2BlockNumber, data } = (await context.client.getTxEffect(TxHash.random()))!;
    expect(data).toBeInstanceOf(TxEffect);
    expect(l2BlockHash).toMatch(/0x[a-fA-F0-9]{64}/);
    expect(l2BlockNumber).toBe(1);
  });

  it('getPublicStorageAt', async () => {
    const result = await context.client.getPublicStorageAt(address, Fr.random());
    expect(result).toBeInstanceOf(Fr);
  });

  it('getNotes', async () => {
    const result = await context.client.getNotes({ contractAddress: address });
    expect(result).toEqual([expect.any(UniqueNote)]);
  });

  it('getL1ToL2MembershipWitness', async () => {
    const result = await context.client.getL1ToL2MembershipWitness(address, Fr.random(), Fr.random());
    expect(result).toEqual([expect.any(BigInt), expect.any(SiblingPath)]);
  });

  it('getL2ToL1MembershipWitness', async () => {
    const result = await context.client.getL2ToL1MembershipWitness(42, Fr.random());
    expect(result).toEqual([expect.any(BigInt), expect.any(SiblingPath)]);
  });

  it('addNote', async () => {
    await context.client.addNote(await ExtendedNote.random(), address);
  });

  it('addNullifiedNote', async () => {
    await context.client.addNullifiedNote(await ExtendedNote.random());
  });

  it('getBlock', async () => {
    const result = await context.client.getBlock(1);
    expect(result).toBeInstanceOf(L2Block);
  });

  it('getCurrentBaseFees', async () => {
    const result = await context.client.getCurrentBaseFees();
    expect(result).toEqual(GasFees.empty());
  });

  it('simulateUnconstrained', async () => {
    const result = await context.client.simulateUnconstrained('function', [], address, address, [address]);
    expect(result).toEqual(10n);
  });

  it('getPublicLogs', async () => {
    const result = await context.client.getPublicLogs({ contractAddress: address });
    expect(result).toEqual({ logs: [expect.any(ExtendedPublicLog)], maxLogsHit: true });
  });

  it('getContractClassLogs', async () => {
    const result = await context.client.getContractClassLogs({ contractAddress: address });
    expect(result).toEqual({ logs: [expect.any(ExtendedUnencryptedL2Log)], maxLogsHit: true });
  });

  it('getBlockNumber', async () => {
    const result = await context.client.getBlockNumber();
    expect(result).toBe(1);
  });

  it('getProvenBlockNumber', async () => {
    const result = await context.client.getProvenBlockNumber();
    expect(result).toBe(1);
  });

  it('getNodeInfo', async () => {
    const result = await context.client.getNodeInfo();
    expect(result).toEqual(await handler.getNodeInfo());
  });

  it('getPXEInfo', async () => {
    const result = await context.client.getPXEInfo();
    expect(result).toEqual(await handler.getPXEInfo());
  });

  it('getContractMetadata', async () => {
    const { contractInstance, isContractInitialized, isContractPubliclyDeployed } =
      await context.client.getContractMetadata(address);
    expect(contractInstance).toEqual(instance);
    expect(isContractInitialized).toEqual(true);
    expect(isContractPubliclyDeployed).toEqual(true);
  });

  it('getContractClassMetadata', async () => {
    const {
      contractClass,
      isContractClassPubliclyRegistered,
      artifact: contractArtifact,
    } = await context.client.getContractClassMetadata(Fr.random(), true);
    const expected = omit(
      await getContractClassFromArtifact(artifact),
      'privateFunctionsRoot',
      'publicBytecodeCommitment',
    );
    expect(contractClass).toEqual(expected);
    expect(isContractClassPubliclyRegistered).toEqual(true);
    deepStrictEqual(contractArtifact, artifact);
  });

  it('getPrivateEvents', async () => {
    const result = await context.client.getPrivateEvents<EpochProofQuote>(
      { abiType: { kind: 'boolean' }, eventSelector: EventSelector.random(), fieldNames: ['name'] },
      1,
      1,
      [await Point.random()],
    );
    expect(result).toEqual([{ value: 1n }]);
  });

  it('getPublicEvents', async () => {
    const result = await context.client.getPublicEvents<EpochProofQuote>(
      { abiType: { kind: 'boolean' }, eventSelector: EventSelector.random(), fieldNames: ['name'] },
      1,
      1,
    );
    expect(result).toEqual([{ value: 1n }]);
  });
});

class MockPXE implements PXE {
  constructor(
    private address: AztecAddress,
    private artifact: ContractArtifact,
    private instance: ContractInstanceWithAddress,
  ) {}

  isL1ToL2MessageSynced(_l1ToL2Message: Fr): Promise<boolean> {
    return Promise.resolve(false);
  }

  addAuthWitness(authWitness: AuthWitness): Promise<void> {
    expect(authWitness).toBeInstanceOf(AuthWitness);
    return Promise.resolve();
  }
  getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
    expect(messageHash).toBeInstanceOf(Fr);
    return Promise.resolve([Fr.random()]);
  }
  storeCapsule(contract: AztecAddress, storageSlot: Fr, capsule: Fr[]): Promise<void> {
    expect(contract).toBeInstanceOf(AztecAddress);
    expect(storageSlot).toBeInstanceOf(Fr);
    expect(capsule.every(c => c instanceof Fr)).toBeTruthy();
    return Promise.resolve();
  }
  registerAccount(secretKey: Fr, partialAddress: Fr): Promise<CompleteAddress> {
    expect(secretKey).toBeInstanceOf(Fr);
    expect(partialAddress).toBeInstanceOf(Fr);
    return Promise.resolve(CompleteAddress.random());
  }
  async getRegisteredAccounts(): Promise<CompleteAddress[]> {
    return [await CompleteAddress.random()];
  }
  getRegisteredAccount(address: AztecAddress): Promise<CompleteAddress | undefined> {
    expect(address).toBeInstanceOf(AztecAddress);
    return Promise.resolve(CompleteAddress.random());
  }
  registerSender(address: AztecAddress): Promise<AztecAddress> {
    expect(address).toBeInstanceOf(AztecAddress);
    return Promise.resolve(this.address);
  }
  getSenders(): Promise<AztecAddress[]> {
    return Promise.resolve([this.address]);
  }
  removeSender(address: AztecAddress): Promise<void> {
    expect(address).toBeInstanceOf(AztecAddress);
    return Promise.resolve();
  }
  registerContractClass(artifact: ContractArtifact): Promise<void> {
    deepStrictEqual(artifact, this.artifact);
    return Promise.resolve();
  }
  registerContract(contract: {
    instance: ContractInstanceWithAddress;
    artifact?: ContractArtifact | undefined;
  }): Promise<void> {
    expect(contract.instance).toEqual(this.instance);
    deepStrictEqual(contract.artifact, this.artifact);
    return Promise.resolve();
  }
  getContracts(): Promise<AztecAddress[]> {
    return Promise.resolve([this.address]);
  }
  proveTx(txRequest: TxExecutionRequest, privateExecutionResult: PrivateExecutionResult): Promise<TxProvingResult> {
    expect(txRequest).toBeInstanceOf(TxExecutionRequest);
    expect(privateExecutionResult).toBeInstanceOf(PrivateExecutionResult);
    return Promise.resolve(
      new TxProvingResult(privateExecutionResult, PrivateKernelTailCircuitPublicInputs.empty(), ClientIvcProof.empty()),
    );
  }
  async simulateTx(
    txRequest: TxExecutionRequest,
    _simulatePublic: boolean,
    msgSender?: AztecAddress | undefined,
    _skipTxValidation?: boolean | undefined,
    _enforceFeePayment?: boolean | undefined,
    _profile?: boolean | undefined,
    scopes?: AztecAddress[] | undefined,
  ): Promise<TxSimulationResult> {
    expect(txRequest).toBeInstanceOf(TxExecutionRequest);
    if (msgSender) {
      expect(msgSender).toBeInstanceOf(AztecAddress);
    }
    if (scopes) {
      expect(scopes).toEqual([]);
    }
    return new TxSimulationResult(await PrivateExecutionResult.random(), PrivateKernelTailCircuitPublicInputs.empty());
  }
  sendTx(tx: Tx): Promise<TxHash> {
    expect(tx).toBeInstanceOf(Tx);
    return Promise.resolve(tx.getTxHash());
  }
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    expect(txHash).toBeInstanceOf(TxHash);
    return Promise.resolve(TxReceipt.empty());
  }
  async getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    expect(txHash).toBeInstanceOf(TxHash);
    return { data: await TxEffect.random(), l2BlockHash: Fr.random().toString(), l2BlockNumber: 1 };
  }
  getPublicStorageAt(contract: AztecAddress, slot: Fr): Promise<Fr> {
    expect(contract).toBeInstanceOf(AztecAddress);
    expect(slot).toBeInstanceOf(Fr);
    return Promise.resolve(Fr.random());
  }
  async getNotes(filter: NotesFilter): Promise<UniqueNote[]> {
    expect(filter.contractAddress).toEqual(this.address);
    const uniqueNote = await UniqueNote.random();
    return [uniqueNote];
  }
  getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
    expect(contractAddress).toBeInstanceOf(AztecAddress);
    expect(messageHash).toBeInstanceOf(Fr);
    expect(secret).toBeInstanceOf(Fr);
    return Promise.resolve([1n, SiblingPath.random(L1_TO_L2_MSG_TREE_HEIGHT)]);
  }
  getL2ToL1MembershipWitness(blockNumber: number, l2Tol1Message: Fr): Promise<[bigint, SiblingPath<number>]> {
    expect(typeof blockNumber).toEqual('number');
    expect(l2Tol1Message).toBeInstanceOf(Fr);
    return Promise.resolve([1n, SiblingPath.random<number>(4)]);
  }
  addNote(note: ExtendedNote, scope?: AztecAddress | undefined): Promise<void> {
    expect(note).toBeInstanceOf(ExtendedNote);
    expect(scope).toEqual(this.address);
    return Promise.resolve();
  }
  addNullifiedNote(note: ExtendedNote): Promise<void> {
    expect(note).toBeInstanceOf(ExtendedNote);
    return Promise.resolve();
  }
  getBlock(number: number): Promise<L2Block | undefined> {
    return Promise.resolve(L2Block.random(number));
  }
  getCurrentBaseFees(): Promise<GasFees> {
    return Promise.resolve(GasFees.empty());
  }
  simulateUnconstrained(
    _functionName: string,
    _args: any[],
    to: AztecAddress,
    from?: AztecAddress | undefined,
    scopes?: AztecAddress[] | undefined,
  ): Promise<AbiDecoded> {
    expect(to).toEqual(this.address);
    expect(from).toEqual(this.address);
    expect(scopes).toEqual([this.address]);
    return Promise.resolve(10n);
  }
  async getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    expect(filter.contractAddress).toEqual(this.address);
    return { logs: [await ExtendedPublicLog.random()], maxLogsHit: true };
  }
  async getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    expect(filter.contractAddress).toEqual(this.address);
    return { logs: [await ExtendedUnencryptedL2Log.random()], maxLogsHit: true };
  }
  getBlockNumber(): Promise<number> {
    return Promise.resolve(1);
  }
  getProvenBlockNumber(): Promise<number> {
    return Promise.resolve(1);
  }
  @memoize
  async getNodeInfo(): Promise<NodeInfo> {
    const protocolContracts = await Promise.all(
      ProtocolContractsNames.map(async name => [name, await AztecAddress.random()]),
    );
    return {
      nodeVersion: '1.0',
      l1ChainId: 1,
      protocolVersion: 1,
      enr: 'enr',
      l1ContractAddresses: Object.fromEntries(
        L1ContractsNames.map(name => [name, EthAddress.random()]),
      ) as L1ContractAddresses,
      protocolContractAddresses: Object.fromEntries(protocolContracts) as ProtocolContractAddresses,
    };
  }
  @memoize
  async getPXEInfo(): Promise<PXEInfo> {
    const protocolContracts = await Promise.all(
      ProtocolContractsNames.map(async name => [name, await AztecAddress.random()]),
    );
    return Promise.resolve({
      protocolContractAddresses: Object.fromEntries(protocolContracts) as ProtocolContractAddresses,
      pxeVersion: '1.0',
    });
  }
  async getContractClassMetadata(id: Fr, includeArtifact: boolean = false): Promise<ContractClassMetadata> {
    expect(id).toBeInstanceOf(Fr);
    const contractClass = await getContractClassFromArtifact(this.artifact);
    return Promise.resolve({
      contractClass,
      isContractClassPubliclyRegistered: true,
      artifact: includeArtifact ? this.artifact : undefined,
    });
  }
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata> {
    expect(address).toEqual(this.address);
    return Promise.resolve({
      contractInstance: this.instance,
      isContractInitialized: true,
      isContractPubliclyDeployed: true,
    });
  }
  getPrivateEvents<T>(
    _eventMetadata: EventMetadataDefinition,
    from: number,
    limit: number,
    vpks: Point[],
  ): Promise<T[]> {
    expect(from).toBe(1);
    expect(limit).toBe(1);
    expect(vpks[0]).toBeInstanceOf(Point);
    return Promise.resolve([{ value: 1n } as T]);
  }
  getPublicEvents<T>(_eventMetadata: EventMetadataDefinition, from: number, limit: number): Promise<T[]> {
    expect(from).toBe(1);
    expect(limit).toBe(1);
    return Promise.resolve([{ value: 1n } as T]);
  }
}
