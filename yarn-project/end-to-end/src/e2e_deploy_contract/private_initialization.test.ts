import { type AztecNode, BatchCall, Fr, type Logger, type Wallet } from '@aztec/aztec.js';
import { NoConstructorContract } from '@aztec/noir-test-contracts.js/NoConstructor';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { siloNullifier } from '@aztec/stdlib/hash';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import { DeployTest, type StatefulContractCtorArgs } from './deploy_test.js';

describe('e2e_deploy_contract private initialization', () => {
  const t = new DeployTest('private initialization');

  let logger: Logger;
  let wallet: Wallet;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    ({ logger, wallet, aztecNode } = await t.setup());
  });

  afterAll(() => t.teardown());

  // Tests calling a private function in an uninitialized and undeployed contract.
  // Requires registering the contract artifact and instance locally in the pxe.
  // The function has a noinitcheck flag so it can be called without initialization.
  it('executes a noinitcheck function in an uninitialized contract', async () => {
    const contract = await t.registerContract(wallet, TestContract);
    const receipt = await contract.methods.emit_nullifier(10).send().wait();
    const txEffects = await aztecNode.getTxEffect(receipt.txHash);

    const expected = await siloNullifier(contract.address, new Fr(10));
    expect(txEffects!.data.nullifiers).toContainEqual(expected);
  });

  // Tests calling a private function in an uninitialized and undeployed contract.
  // Requires registering the contract artifact and instance locally in the pxe.
  // This contract does not have a constructor, so the fn does not need the noinitcheck flag.
  it('executes a function in a contract without initializer', async () => {
    const contract = await t.registerContract(wallet, NoConstructorContract);
    await expect(contract.methods.is_private_mutable_initialized().simulate()).resolves.toEqual(false);
    await contract.methods.initialize_private_mutable(42).send().wait();
    await expect(contract.methods.is_private_mutable_initialized().simulate()).resolves.toEqual(true);
  });

  // Tests privately initializing an undeployed contract. Also requires pxe registration in advance.
  it('privately initializes an undeployed contract from an account contract', async () => {
    const owner = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs });
    logger.info(`Calling the constructor for ${contract.address}`);
    await contract.methods
      .constructor(...initArgs)
      .send()
      .wait();
    logger.info(`Checking if the constructor was run for ${contract.address}`);
    expect(await contract.methods.summed_values(owner).simulate()).toEqual(42n);
    logger.info(`Calling a private function that requires initialization on ${contract.address}`);
    await contract.methods.create_note(owner, 10).send().wait();
    expect(await contract.methods.summed_values(owner).simulate()).toEqual(52n);
  });

  // Tests privately initializing multiple undeployed contracts on the same tx through an account contract.
  it('initializes multiple undeployed contracts in a single tx', async () => {
    const owner = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs[] = [42, 52].map(value => [owner, value]);
    const contracts = await Promise.all(
      initArgs.map(initArgs => t.registerContract(wallet, StatefulTestContract, { initArgs })),
    );
    const calls = contracts.map((c, i) => c.methods.constructor(...initArgs[i]));
    await new BatchCall(wallet, calls).send().wait();
    expect(await contracts[0].methods.summed_values(owner).simulate()).toEqual(42n);
    expect(await contracts[1].methods.summed_values(owner).simulate()).toEqual(52n);
  });

  it('initializes and calls a private function in a single tx', async () => {
    const owner = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs });
    const batch = new BatchCall(wallet, [
      contract.methods.constructor(...initArgs),
      contract.methods.create_note(owner, 10),
    ]);
    logger.info(`Executing constructor and private function in batch at ${contract.address}`);
    await batch.send().wait();
    expect(await contract.methods.summed_values(owner).simulate()).toEqual(52n);
  });

  it('refuses to initialize a contract twice', async () => {
    const owner = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs });
    await contract.methods
      .constructor(...initArgs)
      .send()
      .wait();
    await expect(
      contract.methods
        .constructor(...initArgs)
        .send()
        .wait(),
    ).rejects.toThrow(TX_ERROR_EXISTING_NULLIFIER);
  });

  it('refuses to call a private function that requires initialization', async () => {
    const owner = await t.registerRandomAccount();
    const initArgs: StatefulContractCtorArgs = [owner, 42];
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs });
    // TODO(@spalladino): It'd be nicer to be able to fail the assert with a more descriptive message.
    await expect(contract.methods.create_note(owner, 10).send().wait()).rejects.toThrow(
      /Cannot find the leaf for nullifier/i,
    );
  });

  it('refuses to initialize a contract with incorrect args', async () => {
    const owner = await t.registerRandomAccount();
    const contract = await t.registerContract(wallet, StatefulTestContract, { initArgs: [owner, 42] });
    await expect(contract.methods.constructor(owner, 43).simulate()).rejects.toThrow(
      /Initialization hash does not match/,
    );
  });

  it('refuses to initialize an instance from a different deployer', async () => {
    const owner = await t.registerRandomAccount();
    const contract = await t.registerContract(wallet, StatefulTestContract, {
      initArgs: [owner, 42],
      deployer: owner,
    });
    await expect(contract.methods.constructor(owner, 42).simulate()).rejects.toThrow(
      /Initializer address is not the contract deployer/i,
    );
  });
});
