import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import type { ContractArtifact, EventMetadataDefinition } from '@aztec/stdlib/abi';
import { EventSelector, FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import {
  DroppedTxReceipt,
  ExecutionPayload,
  type OffchainEffect,
  TxHash,
  TxProfileResult,
  TxReceiptBase,
  TxSimulationResult,
  UtilityExecutionResult,
} from '@aztec/stdlib/tx';
import { DEV_VERSION } from '@aztec/stdlib/update-checker';

import {
  type InteractionWaitOptions,
  NO_WAIT,
  type OffchainMessage,
  type SendReturn,
} from '../contract/interaction_options.js';
import type { AppCapabilities, WalletCapabilities } from './capabilities.js';
import { TxSimulationResultWithAppOffset } from './tx_simulation_result_with_app_offset.js';
import type {
  Aliased,
  BatchResults,
  BatchedMethod,
  ContractClassMetadata,
  ContractMetadata,
  PrivateEvent,
  PrivateEventFilter,
  ProfileOptions,
  SendOptions,
  SimulateOptions,
  Wallet,
} from './wallet.js';
import { ContractInitializationStatus, WalletSchema } from './wallet.js';

describe('WalletSchema', () => {
  let handler: MockWallet;
  let context: JsonRpcTestContext<Wallet>;

  const tested: Set<string> = new Set();

  beforeEach(async () => {
    handler = new MockWallet();
    context = await createJsonRpcTestSetup<Wallet>(handler, WalletSchema);
  });

  afterEach(() => {
    tested.add(/^WalletSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(WalletSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getChainInfo', async () => {
    const result = await context.client.getChainInfo();
    expect(result).toEqual({
      chainId: expect.any(Fr),
      version: expect.any(Fr),
    });
  });

  it('getPrivateEvents', async () => {
    const eventMetadata: EventMetadataDefinition = {
      eventSelector: EventSelector.fromField(new Fr(1)),
      abiType: { kind: 'field' },
      fieldNames: ['field1'],
    };

    const result = await context.client.getPrivateEvents(eventMetadata, {
      contractAddress: await AztecAddress.random(),
      fromBlock: BlockNumber(1),
      toBlock: BlockNumber(10),
      scopes: [await AztecAddress.random()],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
  });

  it('registerSender', async () => {
    const result = await context.client.registerSender(await AztecAddress.random(), 'test-alias');
    expect(result).toBeInstanceOf(AztecAddress);
  });

  it('getAddressBook', async () => {
    const result = await context.client.getAddressBook();
    expect(result).toEqual([{ alias: 'sender1', item: expect.any(AztecAddress) }]);
  });

  it('getAccounts', async () => {
    const result = await context.client.getAccounts();
    expect(result).toEqual([{ alias: 'account1', item: expect.any(AztecAddress) }]);
  });

  it('getContractMetadata', async () => {
    const result = await context.client.getContractMetadata(await AztecAddress.random());
    expect(result).toEqual({
      instance: undefined,
      initializationStatus: ContractInitializationStatus.UNKNOWN,
      isContractPublished: expect.any(Boolean),
      isContractUpdated: expect.any(Boolean),
      updatedContractClassId: undefined,
    });
  });

  it('getContractClassMetadata', async () => {
    const result = await context.client.getContractClassMetadata(Fr.random());
    expect(result).toEqual({
      isArtifactRegistered: expect.any(Boolean),
      isContractClassPubliclyRegistered: expect.any(Boolean),
    });
  });

  it('registerContract', async () => {
    const mockArtifact: ContractArtifact = {
      name: 'TestContract',
      aztecVersion: DEV_VERSION,
      functions: [],
      nonDispatchPublicFunctions: [],
      outputs: { structs: {}, globals: {} },
      fileMap: {},
      storageLayout: {},
    };
    const mockInstance: ContractInstanceWithAddress = {
      address: await AztecAddress.random(),
      version: 2,
      salt: Fr.random(),
      deployer: await AztecAddress.random(),
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      initializationHash: Fr.random(),
      immutablesHash: Fr.random(),
      publicKeys: PublicKeys.default(),
    };
    const result = await context.client.registerContract(mockInstance, mockArtifact, Fr.random());
    expect(result).toEqual({
      address: expect.any(AztecAddress),
      currentContractClassId: expect.any(Fr),
      deployer: expect.any(AztecAddress),
      initializationHash: expect.any(Fr),
      immutablesHash: expect.any(Fr),
      originalContractClassId: expect.any(Fr),
      publicKeys: expect.any(PublicKeys),
      salt: expect.any(Fr),
      version: 2,
    });
  });

  it('registerContractClass', async () => {
    const mockArtifact: ContractArtifact = {
      name: 'TestContract',
      aztecVersion: DEV_VERSION,
      functions: [],
      nonDispatchPublicFunctions: [],
      outputs: { structs: {}, globals: {} },
      fileMap: {},
      storageLayout: {},
    };
    await context.client.registerContractClass(mockArtifact);
  });

  it('simulateTx', async () => {
    const exec: ExecutionPayload = {
      calls: [],
      authWitnesses: [],
      capsules: [],
      extraHashedArgs: [],
      feePayer: undefined,
    };
    const sendMessagesAs = await AztecAddress.random();
    const opts: SimulateOptions = {
      from: await AztecAddress.random(),
      sendMessagesAs,
    };
    const result = await context.client.simulateTx(exec, opts);
    expect(result).toBeInstanceOf(TxSimulationResultWithAppOffset);
    expect(handler.lastSimulateOpts?.sendMessagesAs).toBeInstanceOf(AztecAddress);
    expect(handler.lastSimulateOpts?.sendMessagesAs?.equals(sendMessagesAs)).toBe(true);
  });

  it('executeUtility', async () => {
    const call = FunctionCall.from({
      name: 'testFunction',
      to: await AztecAddress.random(),
      selector: FunctionSelector.fromField(new Fr(1)),
      type: FunctionType.UTILITY,
      hideMsgSender: false,
      isStatic: false,
      args: [Fr.random()],
      returnTypes: [],
    });
    const result = await context.client.executeUtility(call, {
      scopes: [await AztecAddress.random()],
      authWitnesses: [AuthWitness.random()],
    });
    expect(result).toBeInstanceOf(UtilityExecutionResult);
  });

  it('profileTx', async () => {
    const exec: ExecutionPayload = {
      calls: [],
      authWitnesses: [],
      capsules: [],
      extraHashedArgs: [],
      feePayer: undefined,
    };
    const sendMessagesAs = await AztecAddress.random();
    const opts: ProfileOptions = {
      from: await AztecAddress.random(),
      profileMode: 'gates',
      sendMessagesAs,
    };
    const result = await context.client.profileTx(exec, opts);
    expect(result).toBeInstanceOf(TxProfileResult);
    expect(handler.lastProfileOpts?.sendMessagesAs).toBeInstanceOf(AztecAddress);
    expect(handler.lastProfileOpts?.sendMessagesAs?.equals(sendMessagesAs)).toBe(true);
  });

  it('sendTx', async () => {
    const exec: ExecutionPayload = {
      calls: [],
      authWitnesses: [],
      capsules: [],
      extraHashedArgs: [],
      feePayer: undefined,
    };

    const sendMessagesAs = await AztecAddress.random();
    const resultWithWait = await context.client.sendTx(exec, {
      from: await AztecAddress.random(),
      sendMessagesAs,
    });
    expect(resultWithWait.receipt).toBeInstanceOf(TxReceiptBase);
    expect(resultWithWait.offchainEffects).toEqual([]);
    expect(handler.lastSendOpts?.sendMessagesAs).toBeInstanceOf(AztecAddress);
    expect(handler.lastSendOpts?.sendMessagesAs?.equals(sendMessagesAs)).toBe(true);

    const resultWithoutWait = await context.client.sendTx(exec, {
      from: await AztecAddress.random(),
      wait: NO_WAIT,
    });
    expect(resultWithoutWait.txHash).toBeInstanceOf(TxHash);
    expect(resultWithoutWait.offchainEffects).toEqual([]);
  });

  it('createAuthWit', async () => {
    const result = await context.client.createAuthWit(await AztecAddress.random(), {
      innerHash: Fr.random(),
      consumer: await AztecAddress.random(),
    });
    expect(result).toBeInstanceOf(AuthWitness);
  });

  it('requestCapabilities', async () => {
    const someAddress = await AztecAddress.random();
    const anotherAddress = await AztecAddress.random();
    const manifest: AppCapabilities = {
      version: '1.0',
      metadata: {
        name: 'TestApp',
        version: '1.0.0',
        description: 'Test application',
      },
      capabilities: [
        {
          type: 'accounts',
          canGet: true,
          canCreateAuthWit: true,
        },
        {
          type: 'transaction',
          scope: [
            { contract: someAddress, function: 'withdraw', additionalScopes: [anotherAddress] },
            { contract: someAddress, function: 'transfer' },
            { contract: someAddress, function: 'deposit', additionalScopes: '*' },
          ],
        },
      ],
    };
    const result = await context.client.requestCapabilities(manifest);
    expect(result).toEqual({
      version: '1.0',
      granted: expect.any(Array),
      wallet: {
        name: expect.any(String),
        version: expect.any(String),
      },
      expiresAt: undefined,
    });
  });

  it('batch', async () => {
    const address1 = await AztecAddress.random();
    const address2 = await AztecAddress.random();
    const address3 = await AztecAddress.random();
    const exec: ExecutionPayload = {
      calls: [],
      authWitnesses: [],
      capsules: [],
      extraHashedArgs: [],
      feePayer: undefined,
    };
    const opts: SendOptions = {
      from: await AztecAddress.random(),
    };
    const simulateOpts: SimulateOptions = {
      from: await AztecAddress.random(),
    };
    const profileOpts: ProfileOptions = {
      from: await AztecAddress.random(),
      profileMode: 'gates',
    };

    const call = FunctionCall.from({
      name: 'testFunction',
      to: address3,
      selector: FunctionSelector.fromField(new Fr(1)),
      type: FunctionType.UTILITY,
      hideMsgSender: false,
      isStatic: false,
      args: [Fr.random()],
      returnTypes: [],
    });

    const mockInstance: ContractInstanceWithAddress = {
      address: address2,
      version: 2,
      salt: Fr.random(),
      deployer: await AztecAddress.random(),
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      initializationHash: Fr.random(),
      immutablesHash: Fr.random(),
      publicKeys: PublicKeys.default(),
    };

    const mockArtifact: ContractArtifact = {
      name: 'TestContract',
      aztecVersion: DEV_VERSION,
      functions: [],
      nonDispatchPublicFunctions: [],
      outputs: { structs: {}, globals: {} },
      fileMap: {},
      storageLayout: {},
    };

    const eventMetadata: EventMetadataDefinition = {
      eventSelector: EventSelector.fromField(new Fr(1)),
      abiType: { kind: 'field' },
      fieldNames: ['field1'],
    };

    const methods: BatchedMethod[] = [
      { name: 'getChainInfo', args: [] },
      { name: 'getContractMetadata', args: [address1] },
      { name: 'getContractClassMetadata', args: [Fr.random()] },
      {
        name: 'getPrivateEvents',
        args: [eventMetadata, { contractAddress: address1, scopes: [address2], fromBlock: BlockNumber(1) }],
      },
      { name: 'registerSender', args: [address1, 'alias1'] },
      { name: 'getAddressBook', args: [] },
      { name: 'getAccounts', args: [] },
      { name: 'registerContract', args: [mockInstance, mockArtifact, undefined] },
      { name: 'simulateTx', args: [exec, simulateOpts] },
      { name: 'executeUtility', args: [call, { scopes: [address3], authWitnesses: [AuthWitness.random()] }] },
      { name: 'profileTx', args: [exec, profileOpts] },
      { name: 'sendTx', args: [exec, opts] },
      { name: 'createAuthWit', args: [address1, { consumer: await AztecAddress.random(), innerHash: Fr.random() }] },
    ];

    const results = await context.client.batch(methods);
    expect(results).toHaveLength(13);
    expect(results[0]).toEqual({ name: 'getChainInfo', result: { chainId: expect.any(Fr), version: expect.any(Fr) } });
    expect(results[1]).toEqual({
      name: 'getContractMetadata',
      result: expect.objectContaining({ isContractPublished: expect.any(Boolean) }),
    });
    expect(results[2]).toEqual({
      name: 'getContractClassMetadata',
      result: expect.objectContaining({ isArtifactRegistered: expect.any(Boolean) }),
    });
    expect(results[3]).toEqual({ name: 'getPrivateEvents', result: expect.any(Array) });
    expect(results[4]).toEqual({ name: 'registerSender', result: expect.any(AztecAddress) });
    expect(results[5]).toEqual({ name: 'getAddressBook', result: expect.any(Array) });
    expect(results[6]).toEqual({ name: 'getAccounts', result: expect.any(Array) });
    expect(results[7]).toEqual({
      name: 'registerContract',
      result: expect.objectContaining({ address: expect.any(AztecAddress) }),
    });
    expect(results[8]).toEqual({ name: 'simulateTx', result: expect.any(TxSimulationResultWithAppOffset) });
    expect(results[9]).toEqual({ name: 'executeUtility', result: expect.any(UtilityExecutionResult) });
    expect(results[10]).toEqual({ name: 'profileTx', result: expect.any(TxProfileResult) });
    expect(results[11]).toEqual({
      name: 'sendTx',
      result: { receipt: expect.any(TxReceiptBase), offchainEffects: [], offchainMessages: [] },
    });
    expect(results[12]).toEqual({ name: 'createAuthWit', result: expect.any(AuthWitness) });
  });
});

class MockWallet implements Wallet {
  lastSimulateOpts?: SimulateOptions;
  lastProfileOpts?: ProfileOptions;
  lastSendOpts?: SendOptions;

  getChainInfo(): Promise<ChainInfo> {
    return Promise.resolve({
      chainId: Fr.random(),
      version: Fr.random(),
    });
  }

  getPrivateEvents<T>(
    _eventMetadata: EventMetadataDefinition,
    _filter: PrivateEventFilter,
  ): Promise<PrivateEvent<T>[]> {
    return Promise.resolve([
      {
        event: {
          field1: Fr.random(),
        },
        metadata: {
          l2BlockNumber: BlockNumber(1),
          l2BlockHash: BlockHash.random(),
          txHash: TxHash.random(),
        },
      },
    ] as PrivateEvent<T>[]);
  }

  getContractMetadata(_address: AztecAddress): Promise<ContractMetadata> {
    return Promise.resolve({
      instance: undefined,
      initializationStatus: ContractInitializationStatus.UNKNOWN,
      isContractPublished: false,
      isContractUpdated: false,
      updatedContractClassId: undefined,
    });
  }

  getContractClassMetadata(_id: Fr): Promise<ContractClassMetadata> {
    return Promise.resolve({
      isArtifactRegistered: false,
      isContractClassPubliclyRegistered: false,
    });
  }

  registerSender(address: AztecAddress, _alias?: string): Promise<AztecAddress> {
    return Promise.resolve(address);
  }

  async getAddressBook(): Promise<Aliased<AztecAddress>[]> {
    return [{ alias: 'sender1', item: await AztecAddress.random() }];
  }

  async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    return [{ alias: 'account1', item: await AztecAddress.random() }];
  }

  async registerContract(_instanceData: any, _artifact?: any, _secretKey?: Fr): Promise<ContractInstanceWithAddress> {
    return {
      version: 2,
      address: await AztecAddress.random(),
      currentContractClassId: Fr.random(),
      deployer: await AztecAddress.random(),
      initializationHash: Fr.random(),
      immutablesHash: Fr.random(),
      originalContractClassId: Fr.random(),
      publicKeys: await PublicKeys.random(),
      salt: Fr.random(),
    };
  }

  async registerContractClass(_artifact: any): Promise<void> {}

  async simulateTx(_exec: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResultWithAppOffset> {
    this.lastSimulateOpts = opts;
    return TxSimulationResultWithAppOffset.fromResultAndOffset(await TxSimulationResult.random(), 0);
  }

  executeUtility(
    _call: any,
    _opts: { scopes: AztecAddress[]; authWitnesses?: AuthWitness[] },
  ): Promise<UtilityExecutionResult> {
    return Promise.resolve(UtilityExecutionResult.random());
  }

  profileTx(_exec: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult> {
    this.lastProfileOpts = opts;
    return Promise.resolve(TxProfileResult.random());
  }

  sendTx<W extends InteractionWaitOptions = undefined>(
    _exec: ExecutionPayload,
    opts: SendOptions<W>,
  ): Promise<SendReturn<W>> {
    this.lastSendOpts = opts as SendOptions;
    if (opts.wait === NO_WAIT) {
      return Promise.resolve({
        txHash: TxHash.random(),
        offchainEffects: [] as OffchainEffect[],
        offchainMessages: [] as OffchainMessage[],
      }) as Promise<SendReturn<W>>;
    }
    return Promise.resolve({
      receipt: DroppedTxReceipt.empty(),
      offchainEffects: [] as OffchainEffect[],
      offchainMessages: [] as OffchainMessage[],
    }) as Promise<SendReturn<W>>;
  }

  createAuthWit(_from: AztecAddress, _messageHashOrIntent: any): Promise<AuthWitness> {
    return Promise.resolve(AuthWitness.random());
  }

  requestCapabilities(_manifest: AppCapabilities): Promise<WalletCapabilities> {
    return Promise.resolve({
      version: '1.0' as const,
      granted: [],
      wallet: {
        name: 'MockWallet',
        version: '1.0.0',
      },
      expiresAt: undefined,
    });
  }

  async batch<const T extends readonly BatchedMethod[]>(methods: T): Promise<BatchResults<T>> {
    const results: any[] = [];
    for (const method of methods) {
      const { name, args } = method;
      // Type safety is guaranteed by the BatchedMethod type, which ensures that:
      // 1. `name` is a valid batchable method name
      // 2. `args` matches the parameter types of that specific method
      // 3. The return type is correctly mapped in BatchResults<T>
      // We use dynamic dispatch here for simplicity, but the types are enforced at the call site.
      const fn = (this as any)[name] as (...args: any[]) => Promise<any>;
      const result = await fn.apply(this, args);
      // Wrap result with method name for discriminated union deserialization
      results.push({ name, result });
    }
    return results as BatchResults<T>;
  }
}
