import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { CounterContract } from '@aztec/noir-test-contracts.js/Counter';
import { NoConstructorContract } from '@aztec/noir-test-contracts.js/NoConstructor';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { siloNullifier } from '@aztec/stdlib/hash';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import type { TestWallet } from '../test-wallet/test_wallet.js';
import { DeployTest, type StatefulContractCtorArgs } from './deploy_test.js';

type CounterCtorArgs = Parameters<CounterContract['methods']['initialize']>;

describe('e2e_deploy_contract private initialization', () => {
  const t = new DeployTest('private initialization');

  let logger: Logger;
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    ({ logger, wallet, aztecNode, defaultAccountAddress } = await t.setup());
    await publishContractClass(wallet, StatefulTestContract.artifact).then(c =>
      c.send({ from: defaultAccountAddress }),
    );
  });

  afterAll(() => t.teardown());

  // Tests calling a private function in an uninitialized and undeployed contract.
  // Requires registering the contract artifact and instance locally in the pxe.
  // The function has a noinitcheck flag so it can be called without initialization.
  it('executes a noinitcheck function in an uninitialized contract', async () => {
    const contract = await t.registerContract(wallet, TestContract);
    const receipt = await contract.methods.emit_nullifier(10).send({ from: defaultAccountAddress });
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
    ).resolves.toEqual(false);
    await contract.methods.initialize_private_mutable(42).send({ from: defaultAccountAddress });
    await expect(
      contract.methods.is_private_mutable_initialized(defaultAccountAddress).simulate({ from: defaultAccountAddress }),
    ).resolves.toEqual(true);
  });

  // Tests privately initializing an undeployed contract. Also requires pxe registration in advance.
  it('privately initializes an undeployed contract from an account contract', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: CounterCtorArgs = [42, owner];
    const contract = await t.registerContract(wallet, CounterContract, { initArgs, constructorName: 'initialize' });
    logger.info(`Calling the constructor for ${contract.address}`);
    await contract.methods.initialize(...initArgs).send({ from: defaultAccountAddress });
    logger.info(`Checking if the constructor was run for ${contract.address}`);
    expect(await contract.methods.get_counter(owner).simulate({ from: owner })).toEqual(42n);
    logger.info(`Calling a private function that requires initialization on ${contract.address}`);
    await contract.methods.increment(owner).send({ from: defaultAccountAddress });
    expect(await contract.methods.get_counter(owner).simulate({ from: owner })).toEqual(43n);
  });

  // Tests privately initializing multiple undeployed contracts on the same tx through an account contract.
  it('initializes multiple undeployed contracts in a single tx', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgsList: CounterCtorArgs[] = [42, 52].map(value => [value, owner]);
    const contracts = await Promise.all(
      initArgsList.map(args =>
        t.registerContract(wallet, CounterContract, { initArgs: args, constructorName: 'initialize' }),
      ),
    );
    const calls = contracts.map((c, i) => c.methods.initialize(...initArgsList[i]));
    await new BatchCall(wallet, calls).send({ from: defaultAccountAddress });
    expect(await contracts[0].methods.get_counter(owner).simulate({ from: owner })).toEqual(42n);
    expect(await contracts[1].methods.get_counter(owner).simulate({ from: owner })).toEqual(52n);
  });

  it('initializes and calls a private function in a single tx', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: CounterCtorArgs = [42, owner];
    const contract = await t.registerContract(wallet, CounterContract, { initArgs, constructorName: 'initialize' });
    const batch = new BatchCall(wallet, [contract.methods.initialize(...initArgs), contract.methods.increment(owner)]);
    logger.info(`Executing constructor and private function in batch at ${contract.address}`);
    await batch.send({ from: defaultAccountAddress });
    expect(await contract.methods.get_counter(owner).simulate({ from: owner })).toEqual(43n);
  });

  it('refuses to initialize a contract twice', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: CounterCtorArgs = [42, owner];
    const contract = await t.registerContract(wallet, CounterContract, { initArgs, constructorName: 'initialize' });
    await contract.methods.initialize(...initArgs).send({ from: defaultAccountAddress });
    await expect(contract.methods.initialize(...initArgs).send({ from: defaultAccountAddress })).rejects.toThrow(
      TX_ERROR_EXISTING_NULLIFIER,
    );
  });

  it('refuses to call a private function that requires initialization', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: StatefulContractCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs });
    // TODO(@spalladino): It'd be nicer to be able to fail the assert with a more descriptive message.
    await expect(contract.methods.create_note(owner, 10).send({ from: defaultAccountAddress })).rejects.toThrow(
      /Cannot find the leaf for nullifier/i,
    );
  });

  // A public call enqueued before the private constructor should fail the init check, even though the
  // private constructor emits the init nullifier in the same tx. Previously this passed because
  // the private init nullifier was inserted into the tree before public execution began.
  it('refuses to call a public function enqueued before private initialization in same tx', async () => {
    const { contract, initArgs } = await deployUninitialized();
    const owner = defaultAccountAddress;
    const batch = new BatchCall(wallet, [
      contract.methods.increment_public_value(owner, 84),
      contract.methods.constructor(...initArgs),
    ]);
    await expect(batch.send({ from: defaultAccountAddress })).rejects.toThrow(/app_logic_reverted/);
  });

  it('allows calling a public function enqueued after private initialization in same tx', async () => {
    const { contract, initArgs } = await deployUninitialized();
    const owner = defaultAccountAddress;
    const batch = new BatchCall(wallet, [
      contract.methods.constructor(...initArgs),
      contract.methods.increment_public_value(owner, 84),
    ]);
    await batch.send({ from: defaultAccountAddress });
    expect(await contract.methods.get_public_value(owner).simulate({ from: defaultAccountAddress })).toEqual(84n);
  });

  it('allows calling an only_self function from a private initializer', async () => {
    const owner = (await wallet.createAccount()).address;
    const initArgs: StatefulContractCtorArgs = [owner, 42];
    const contract = await registerAndPublishContract(initArgs, {
      constructorName: 'constructor_calling_only_self',
    });
    await contract.methods.constructor_calling_only_self(...initArgs).send({ from: defaultAccountAddress });
    expect(await contract.methods.summed_values(owner).simulate({ from: owner })).toEqual(42n);
  });

  it('refuses to self-call an init-checked function during private initialization', async () => {
    const owner = defaultAccountAddress;
    const initArgs: StatefulContractCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, {
      initArgs,
      constructorName: 'constructor_self_calling_init_checked',
    });
    await expect(
      contract.methods.constructor_self_calling_init_checked(...initArgs).send({ from: defaultAccountAddress }),
    ).rejects.toThrow(/Cannot find the leaf for nullifier/);
  });

  it('refuses to run an enqueued public init-checked self-call from private initialization', async () => {
    const { contract, initArgs } = await deployUninitialized({
      constructorName: 'constructor_enqueuing_public_self_call',
    });
    await expect(
      contract.methods.constructor_enqueuing_public_self_call(...initArgs).send({ from: defaultAccountAddress }),
    ).rejects.toThrow(/app_logic_reverted/);
  });

  it('refuses to initialize a contract with incorrect args', async () => {
    const owner = (await wallet.createAccount()).address;
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs: [owner, 42] });
    await expect(contract.methods.constructor(owner, 43).simulate({ from: defaultAccountAddress })).rejects.toThrow(
      /Initialization hash does not match/,
    );
  });

  it('refuses to initialize an instance from a different deployer', async () => {
    const owner = (await wallet.createAccount()).address;
    const contract = await t.registerContract(wallet, StatefulTestContract, {
      initArgs: [owner, 42],
      deployer: owner,
    });
    await expect(contract.methods.constructor(owner, 42).simulate({ from: defaultAccountAddress })).rejects.toThrow(
      /Initializer address is not the contract deployer/i,
    );
  });

  /** Registers a contract instance locally and publishes it on-chain (so public functions can find bytecode). */
  async function registerAndPublishContract(
    initArgs: StatefulContractCtorArgs,
    opts: { constructorName?: string; deployer?: AztecAddress } = {},
  ) {
    const salt = Fr.random();
    const instance = await getContractInstanceFromInstantiationParams(StatefulTestContract.artifact, {
      constructorArgs: initArgs,
      salt,
      constructorArtifact: opts.constructorName,
      deployer: opts.deployer,
    });
    await publishInstance(wallet, instance).send({ from: defaultAccountAddress });
    return t.registerContract(wallet, StatefulTestContract, {
      initArgs,
      salt,
      constructorName: opts.constructorName,
      deployer: opts.deployer,
    });
  }

  /** Publishes a contract instance on-chain without initializing it. */
  async function deployUninitialized(opts: { constructorName?: string } = {}) {
    const owner = defaultAccountAddress;
    const initArgs: StatefulContractCtorArgs = [owner, 42];
    const contract = await registerAndPublishContract(initArgs, opts);
    return { contract, initArgs };
  }
});
