import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/fields';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';
import type { ContractArtifact, EventMetadataDefinition } from '@aztec/stdlib/abi';
import { EventSelector, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassMetadata, ContractInstanceWithAddress, ContractMetadata } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import {
  ExecutionPayload,
  TxHash,
  TxProfileResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';

import type {
  Aliased,
  BatchResults,
  BatchableMethods,
  BatchedMethod,
  ProfileOptions,
  SendOptions,
  SimulateOptions,
  Wallet,
} from './wallet.js';
import { WalletSchema } from './wallet.js';

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

  it('getContractClassMetadata', async () => {
    const result = await context.client.getContractClassMetadata(Fr.random(), true);
    expect(result.contractClass).toBeDefined();
    expect(result.contractClass?.id).toBeInstanceOf(Fr);
    expect(result.isContractClassPubliclyRegistered).toBe(true);
    expect(result.artifact).toBeDefined();
  });

  it('getContractMetadata', async () => {
    const result = await context.client.getContractMetadata(await AztecAddress.random());
    expect(result).toEqual({
      contractInstance: {
        address: expect.any(AztecAddress),
        currentContractClassId: expect.any(Fr),
        deployer: expect.any(AztecAddress),
        initializationHash: expect.any(Fr),
        originalContractClassId: expect.any(Fr),
        publicKeys: expect.any(PublicKeys),
        salt: expect.any(Fr),
        version: 1,
      },
      isContractInitialized: true,
      isContractPublished: true,
    });
  });

  it('getTxReceipt', async () => {
    const result = await context.client.getTxReceipt(TxHash.random());
    expect(result).toBeInstanceOf(TxReceipt);
  });

  it('getPrivateEvents', async () => {
    const eventMetadata: EventMetadataDefinition = {
      eventSelector: EventSelector.fromField(new Fr(1)),
      abiType: { kind: 'field' },
      fieldNames: ['field1'],
    };
    const result = await context.client.getPrivateEvents(await AztecAddress.random(), eventMetadata, 0, 10, [
      await AztecAddress.random(),
    ]);
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

  it('registerContract', async () => {
    const mockArtifact: ContractArtifact = {
      name: 'TestContract',
      functions: [],
      nonDispatchPublicFunctions: [],
      outputs: { structs: {}, globals: {} },
      fileMap: {},
      storageLayout: {},
    };
    const result = await context.client.registerContract(await AztecAddress.random(), mockArtifact, Fr.random());
    expect(result).toEqual({
      address: expect.any(AztecAddress),
      currentContractClassId: expect.any(Fr),
      deployer: expect.any(AztecAddress),
      initializationHash: expect.any(Fr),
      originalContractClassId: expect.any(Fr),
      publicKeys: expect.any(PublicKeys),
      salt: expect.any(Fr),
      version: 1,
    });
  });

  it('simulateTx', async () => {
    const exec: ExecutionPayload = {
      calls: [],
      authWitnesses: [],
      capsules: [],
      extraHashedArgs: [],
    };
    const opts: SimulateOptions = {
      from: await AztecAddress.random(),
    };
    const result = await context.client.simulateTx(exec, opts);
    expect(result).toBeInstanceOf(TxSimulationResult);
  });

  it('simulateUtility', async () => {
    const call = {
      name: 'testFunction',
      to: await AztecAddress.random(),
      selector: FunctionSelector.fromField(new Fr(1)),
      type: FunctionType.UTILITY,
      isStatic: false,
      hideMsgSender: false,
      args: [Fr.random()],
      returnTypes: [],
    };
    const result = await context.client.simulateUtility(call, [AuthWitness.random()]);
    expect(result).toBeInstanceOf(UtilitySimulationResult);
  });

  it('profileTx', async () => {
    const exec: ExecutionPayload = {
      calls: [],
      authWitnesses: [],
      capsules: [],
      extraHashedArgs: [],
    };
    const opts: ProfileOptions = {
      from: await AztecAddress.random(),
      profileMode: 'gates',
    };
    const result = await context.client.profileTx(exec, opts);
    expect(result).toBeInstanceOf(TxProfileResult);
  });

  it('sendTx', async () => {
    const exec: ExecutionPayload = {
      calls: [],
      authWitnesses: [],
      capsules: [],
      extraHashedArgs: [],
    };
    const opts: SendOptions = {
      from: await AztecAddress.random(),
    };
    const result = await context.client.sendTx(exec, opts);
    expect(result).toBeInstanceOf(TxHash);
  });

  it('createAuthWit', async () => {
    const result = await context.client.createAuthWit(await AztecAddress.random(), Fr.random());
    expect(result).toBeInstanceOf(AuthWitness);
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
    };
    const opts: SendOptions = {
      from: await AztecAddress.random(),
    };
    const simulateOpts: SimulateOptions = {
      from: await AztecAddress.random(),
    };

    const call = {
      name: 'testFunction',
      to: address3,
      selector: FunctionSelector.fromField(new Fr(1)),
      type: FunctionType.UTILITY,
      isStatic: false,
      hideMsgSender: false,
      args: [Fr.random()],
      returnTypes: [],
    };

    const methods: BatchedMethod<keyof BatchableMethods>[] = [
      { name: 'registerSender', args: [address1, 'alias1'] },
      { name: 'registerContract', args: [address2, undefined, undefined] },
      { name: 'sendTx', args: [exec, opts] },
      { name: 'simulateUtility', args: [call, [AuthWitness.random()], undefined] },
      { name: 'simulateTx', args: [exec, simulateOpts] },
    ];

    const results = await context.client.batch(methods);
    expect(results).toHaveLength(5);
    expect(results[0]).toEqual({ name: 'registerSender', result: expect.any(AztecAddress) });
    expect(results[1]).toEqual({
      name: 'registerContract',
      result: expect.objectContaining({ address: expect.any(AztecAddress) }),
    });
    expect(results[2]).toEqual({ name: 'sendTx', result: expect.any(TxHash) });
    expect(results[3]).toEqual({ name: 'simulateUtility', result: expect.any(UtilitySimulationResult) });
    expect(results[4]).toEqual({ name: 'simulateTx', result: expect.any(TxSimulationResult) });
  });
});

// eslint-disable-next-line jsdoc/require-jsdoc
class MockWallet implements Wallet {
  getChainInfo(): Promise<ChainInfo> {
    return Promise.resolve({
      chainId: Fr.random(),
      version: Fr.random(),
    });
  }

  getContractClassMetadata(_id: Fr, _includeArtifact?: boolean): Promise<ContractClassMetadata> {
    return Promise.resolve({
      contractClass: {
        version: 1,
        id: Fr.random(),
        artifactHash: Fr.random(),
        privateFunctions: [],
        publicBytecodeCommitment: Fr.random(),
        unconstrainedFunctionsArtifactTreeRoot: Fr.random(),
        packedBytecode: Buffer.from('1234', 'hex'),
      },
      isContractClassPubliclyRegistered: true,
      artifact: {
        name: 'MockContract',
        functions: [],
        nonDispatchPublicFunctions: [],
        outputs: { structs: {}, globals: {} },
        fileMap: {},
        storageLayout: {},
      },
    });
  }

  async getContractMetadata(_address: AztecAddress): Promise<ContractMetadata> {
    return {
      contractInstance: {
        version: 1,
        address: await AztecAddress.random(),
        currentContractClassId: Fr.random(),
        deployer: await AztecAddress.random(),
        initializationHash: Fr.random(),
        originalContractClassId: Fr.random(),
        publicKeys: await PublicKeys.random(),
        salt: Fr.random(),
      },
      isContractInitialized: true,
      isContractPublished: true,
    };
  }

  getPrivateEvents<T>(
    _contractAddress: AztecAddress,
    _eventMetadata: EventMetadataDefinition,
    _from: number,
    _numBlocks: number,
    _recipients: AztecAddress[],
  ): Promise<T[]> {
    return Promise.resolve([{ field1: Fr.random() }] as T[]);
  }

  getTxReceipt(_txHash: TxHash): Promise<TxReceipt> {
    return Promise.resolve(TxReceipt.empty());
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
      version: 1,
      address: await AztecAddress.random(),
      currentContractClassId: Fr.random(),
      deployer: await AztecAddress.random(),
      initializationHash: Fr.random(),
      originalContractClassId: Fr.random(),
      publicKeys: await PublicKeys.random(),
      salt: Fr.random(),
    };
  }

  simulateTx(_exec: ExecutionPayload, _opts: SimulateOptions): Promise<TxSimulationResult> {
    return Promise.resolve(TxSimulationResult.random());
  }

  simulateUtility(_call: any, _authwits?: AuthWitness[], _scopes?: AztecAddress[]): Promise<UtilitySimulationResult> {
    return Promise.resolve(UtilitySimulationResult.random());
  }

  profileTx(_exec: ExecutionPayload, _opts: ProfileOptions): Promise<TxProfileResult> {
    return Promise.resolve(TxProfileResult.random());
  }

  sendTx(_exec: ExecutionPayload, _opts: SendOptions): Promise<TxHash> {
    return Promise.resolve(TxHash.random());
  }

  createAuthWit(_from: AztecAddress, _messageHashOrIntent: any): Promise<AuthWitness> {
    return Promise.resolve(AuthWitness.random());
  }

  async batch<const T extends readonly BatchedMethod<keyof BatchableMethods>[]>(methods: T): Promise<BatchResults<T>> {
    const results: any[] = [];
    for (const method of methods) {
      const { name, args } = method;
      // Type safety is guaranteed by the BatchedMethod type, which ensures that:
      // 1. `name` is a valid batchable method name
      // 2. `args` matches the parameter types of that specific method
      // 3. The return type is correctly mapped in BatchResults<T>
      // We use dynamic dispatch here for simplicity, but the types are enforced at the call site.
      const fn = this[name] as (...args: any[]) => Promise<any>;
      const result = await fn.apply(this, args);
      // Wrap result with method name for discriminated union deserialization
      results.push({ name, result });
    }
    return results as BatchResults<T>;
  }
}
