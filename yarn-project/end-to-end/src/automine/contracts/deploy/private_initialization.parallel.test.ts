import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { ContractInitializationStatus } from '@aztec/aztec.js/wallet';
import { InitTestContract } from '@aztec/noir-test-contracts.js/InitTest';
import { NoConstructorContract } from '@aztec/noir-test-contracts.js/NoConstructor';
import { PrivateInitTestContract } from '@aztec/noir-test-contracts.js/PrivateInitTest';
import { siloNullifier } from '@aztec/stdlib/hash';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import type { TestWallet } from '../../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../../automine_test_context.js';

type InitTestCtorArgs = Parameters<InitTestContract['methods']['constructor']>;

// Tests private contract initialization flows: noinitcheck functions, contracts without constructors,
// single/batch initialization, ordering constraints between private init and public calls, and
// ContractInitializationStatus reporting. Runs on a single account.
describe('automine/contracts/deploy/private_initialization', () => {
  const t = new AutomineTestContext();

  let logger: Logger;
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    await t.setup();
    ({ logger, wallet, aztecNode, defaultAccountAddress } = t);
    await publishContractClass(wallet, InitTestContract.artifact).then(c => c.send({ from: defaultAccountAddress }));
  });

  afterAll(() => t.teardown());

  // Tests calling a private function in an uninitialized and undeployed contract.
  // Requires registering the contract artifact and instance locally in the pxe.
  // The function has a noinitcheck flag so it can be called without initialization.
  it('executes a noinitcheck function in an uninitialized contract', async () => {
    const contract = await t.registerContract(wallet, PrivateInitTestContract, {
      initArgs: [0],
      constructorName: 'initialize',
    });
    const { receipt } = await contract.methods
      .private_no_init_check_emit_nullifier(10)
      .send({ from: defaultAccountAddress });
    const txEffects = await aztecNode.getTxEffect(receipt.txHash);

    const expected = await siloNullifier(contract.address, new Fr(10));
    expect(txEffects!.data.nullifiers).toContainEqual(expected);
  });

  // Tests calling a private function in an uninitialized and undeployed contract.
  // Requires registering the contract artifact and instance locally in the pxe.
  // This contract does not have a constructor, so the fn does not need the noinitcheck flag.
  it('executes a function in a contract without initializer', async () => {
    const contract = await t.registerContract(wallet, NoConstructorContract);
    await expect(
      contract.methods.is_private_mutable_initialized(defaultAccountAddress).simulate({ from: defaultAccountAddress }),
    ).resolves.toEqual(expect.objectContaining({ result: false }));
    await contract.methods.initialize_private_mutable(42).send({ from: defaultAccountAddress });
    await expect(
      contract.methods.is_private_mutable_initialized(defaultAccountAddress).simulate({ from: defaultAccountAddress }),
    ).resolves.toEqual(expect.objectContaining({ result: true }));
  });

  // Tests privately initializing an undeployed contract, then calling init-checked functions.
  it('privately initializes an undeployed contract from an account contract', async () => {
    const contract = await t.registerContract(wallet, PrivateInitTestContract, {
      initArgs: [42],
      constructorName: 'initialize',
    });
    logger.info(`Calling the constructor for ${contract.address}`);
    await contract.methods.initialize(42).send({ from: defaultAccountAddress });
    logger.info(`Checking if the constructor was run for ${contract.address}`);
    expect(
      (await contract.methods.utility_read_value(defaultAccountAddress).simulate({ from: defaultAccountAddress }))
        .result,
    ).toEqual(42n);
    logger.info(`Calling a private function that requires initialization on ${contract.address}`);
    await contract.methods.private_init_check_write_value(43).send({ from: defaultAccountAddress });
    expect(
      (await contract.methods.utility_read_value(defaultAccountAddress).simulate({ from: defaultAccountAddress }))
        .result,
    ).toEqual(43n);
  });

  // Tests privately initializing multiple undeployed contracts on the same tx through an account contract.
  it('initializes multiple undeployed contracts in a single tx', async () => {
    const contracts = await Promise.all(
      [42, 52].map(value =>
        t.registerContract(wallet, PrivateInitTestContract, { initArgs: [value], constructorName: 'initialize' }),
      ),
    );
    const calls = [42, 52].map((value, i) => contracts[i].methods.initialize(value));
    await new BatchCall(wallet, calls).send({ from: defaultAccountAddress });
    expect(
      (await contracts[0].methods.utility_read_value(defaultAccountAddress).simulate({ from: defaultAccountAddress }))
        .result,
    ).toEqual(42n);
    expect(
      (await contracts[1].methods.utility_read_value(defaultAccountAddress).simulate({ from: defaultAccountAddress }))
        .result,
    ).toEqual(52n);
  });

  it('initializes and calls a private function in a single tx', async () => {
    const contract = await t.registerContract(wallet, PrivateInitTestContract, {
      initArgs: [42],
      constructorName: 'initialize',
    });
    const batch = new BatchCall(wallet, [
      contract.methods.initialize(42),
      contract.methods.private_init_check_write_value(43),
    ]);
    logger.info(`Executing constructor and private function in batch at ${contract.address}`);
    await batch.send({ from: defaultAccountAddress });
    expect(
      (await contract.methods.utility_read_value(defaultAccountAddress).simulate({ from: defaultAccountAddress }))
        .result,
    ).toEqual(43n);
  });

  it('refuses to initialize a contract twice', async () => {
    const contract = await t.registerContract(wallet, PrivateInitTestContract, {
      initArgs: [42],
      constructorName: 'initialize',
    });
    await contract.methods.initialize(42).send({ from: defaultAccountAddress });
    await expect(contract.methods.initialize(42).send({ from: defaultAccountAddress })).rejects.toThrow(
      TX_ERROR_EXISTING_NULLIFIER,
    );
  });

  it('refuses to call a private function that requires initialization', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: InitTestCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, InitTestContract, { initArgs });
    // TODO(#14894): It'd be nicer to be able to fail the assert with a more descriptive message.
    await expect(contract.methods.priv_init_check(owner, 10).send({ from: defaultAccountAddress })).rejects.toThrow(
      /Cannot find the leaf for nullifier/i,
    );
  });

  it('refuses to simulate a utility function that requires initialization', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: InitTestCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, InitTestContract, { initArgs });
    await expect(contract.methods.utility_init_check(owner).simulate({ from: defaultAccountAddress })).rejects.toThrow(
      /Not initialized/,
    );
  });

  it('allows calling a utility function after initialization', async () => {
    const { contract, initArgs } = await deployUninitialized();
    const owner = defaultAccountAddress;
    await contract.methods.constructor(...initArgs).send({ from: defaultAccountAddress });
    const result = await contract.methods.utility_init_check(owner).simulate({ from: defaultAccountAddress });
    expect(result.result).toEqual(2n);
  });

  // A public call enqueued before the private constructor should fail the init check, even though the
  // private constructor emits the init nullifier in the same tx.
  it('refuses to call a public function enqueued before private initialization in same tx', async () => {
    const { contract, initArgs } = await deployUninitialized();
    const owner = defaultAccountAddress;
    const batch = new BatchCall(wallet, [
      contract.methods.pub_init_check(owner, 84),
      contract.methods.constructor(...initArgs),
    ]);
    await expect(batch.simulate({ from: defaultAccountAddress })).rejects.toThrow(/Not initialized/);
  });

  it('allows calling a public function enqueued after private initialization in same tx', async () => {
    const { contract, initArgs } = await deployUninitialized();
    const owner = defaultAccountAddress;
    const batch = new BatchCall(wallet, [
      contract.methods.constructor(...initArgs),
      contract.methods.pub_init_check(owner, 84),
    ]);
    await batch.send({ from: defaultAccountAddress });
    expect((await contract.methods.pub_no_init_check(owner).simulate({ from: defaultAccountAddress })).result).toEqual(
      1n,
    );
  });

  it('allows self-calling a noinitcheck function from a private initializer', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: InitTestCtorArgs = [owner, 42];
    const contract = await registerAndPublishContract(initArgs, {
      constructorName: 'initializer_self_calling_private_not_init_checked',
    });
    await contract.methods
      .initializer_self_calling_private_not_init_checked(...initArgs)
      .send({ from: defaultAccountAddress });
  });

  it('allows calling an only_self function from a private initializer', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: InitTestCtorArgs = [owner, 42];
    const contract = await registerAndPublishContract(initArgs, {
      constructorName: 'initializer_calling_only_self',
    });
    await contract.methods.initializer_calling_only_self(...initArgs).send({ from: defaultAccountAddress });
  });

  it('refuses to self-call an init-checked function during private initialization', async () => {
    const owner = defaultAccountAddress;
    const initArgs: InitTestCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, InitTestContract, {
      initArgs,
      constructorName: 'initializer_self_calling_private_init_checked',
    });
    await expect(
      contract.methods.initializer_self_calling_private_init_checked(...initArgs).send({ from: defaultAccountAddress }),
    ).rejects.toThrow(/Cannot find the leaf for nullifier/);
  });

  it('refuses to run an enqueued public init-checked self-call from private initialization', async () => {
    const { contract, initArgs } = await deployUninitialized({
      constructorName: 'initializer_enqueuing_public_init_checked',
    });
    await expect(
      contract.methods.initializer_enqueuing_public_init_checked(...initArgs).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow(/Not initialized/);
  });

  it('refuses to initialize a contract with incorrect args', async () => {
    const owner = (await wallet.createAccount()).address;
    const contract = await t.registerContract(wallet, InitTestContract, { initArgs: [owner, 42] });
    await expect(contract.methods.constructor(owner, 43).simulate({ from: defaultAccountAddress })).rejects.toThrow(
      /Initialization hash does not match/,
    );
  });

  it('refuses to initialize an instance from a different deployer', async () => {
    const owner = (await wallet.createAccount()).address;
    const contract = await t.registerContract(wallet, InitTestContract, {
      initArgs: [owner, 42],
      deployer: owner,
    });
    await expect(contract.methods.constructor(owner, 42).simulate({ from: defaultAccountAddress })).rejects.toThrow(
      /Initializer address is not the contract deployer/i,
    );
  });

  describe('initialization status', () => {
    it('reports INITIALIZED when contract is registered and initialized', async () => {
      const contract = await t.registerContract(wallet, PrivateInitTestContract, {
        initArgs: [42],
        constructorName: 'initialize',
      });
      await contract.methods.initialize(42).send({ from: defaultAccountAddress });
      const metadata = await wallet.getContractMetadata(contract.address);
      expect(metadata.initializationStatus).toEqual(ContractInitializationStatus.INITIALIZED);
    });

    it('reports UNINITIALIZED when contract is registered but not initialized', async () => {
      const contract = await t.registerContract(wallet, PrivateInitTestContract, {
        initArgs: [42],
        constructorName: 'initialize',
      });
      const metadata = await wallet.getContractMetadata(contract.address);
      expect(metadata.initializationStatus).toEqual(ContractInitializationStatus.UNINITIALIZED);
    });

    it('reports UNKNOWN when contract instance is not registered', async () => {
      const metadata = await wallet.getContractMetadata(await AztecAddress.random());
      expect(metadata.initializationStatus).toEqual(ContractInitializationStatus.UNKNOWN);
    });
  });

  /** Registers a contract instance locally and publishes it on-chain (so sequencers can find public function's bytecode). */
  async function registerAndPublishContract(
    initArgs: InitTestCtorArgs,
    opts: { constructorName?: string; deployer?: AztecAddress } = {},
  ) {
    const salt = Fr.random();
    const instance = await getContractInstanceFromInstantiationParams(InitTestContract.artifact, {
      constructorArgs: initArgs,
      salt,
      constructorArtifact: opts.constructorName,
      deployer: opts.deployer,
    });
    await publishInstance(wallet, instance).send({ from: defaultAccountAddress });
    return t.registerContract(wallet, InitTestContract, {
      initArgs,
      salt,
      constructorName: opts.constructorName,
      deployer: opts.deployer,
    });
  }

  /** Publishes a contract instance on-chain without initializing it. */
  async function deployUninitialized(opts: { constructorName?: string } = {}) {
    const owner = defaultAccountAddress;
    const initArgs: InitTestCtorArgs = [owner, 42];
    const constructorName = opts.constructorName;
    const contract = await registerAndPublishContract(initArgs, { constructorName });
    return { contract, initArgs };
  }
});
