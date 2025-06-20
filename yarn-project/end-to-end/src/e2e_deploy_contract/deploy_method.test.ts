import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import {
  AztecAddress,
  BatchCall,
  Fr,
  type Logger,
  type PXE,
  type Wallet,
  createPXEClient,
  makeFetch,
} from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { CounterContract } from '@aztec/noir-test-contracts.js/Counter';
import { NoConstructorContract } from '@aztec/noir-test-contracts.js/NoConstructor';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { GasFees } from '@aztec/stdlib/gas';

import { DeployTest } from './deploy_test.js';

describe('e2e_deploy_contract deploy method', () => {
  const t = new DeployTest('deploy method');

  let pxe: PXE;
  let logger: Logger;
  let wallet: Wallet;

  let ignoredArg: AztecAddress;

  beforeAll(async () => {
    ignoredArg = await AztecAddress.random();
    ({ pxe, logger, wallet } = await t.setup());
  });

  afterAll(() => t.teardown());

  it('refused to deploy a contract instance whose contract class is not yet registered', async () => {
    const owner = wallet.getAddress();
    const opts = { skipClassRegistration: true };
    logger.debug(`Trying to deploy contract instance without registering its contract class`);
    await expect(StatefulTestContract.deploy(wallet, owner, owner, 42).send(opts).wait()).rejects.toThrow(
      /Cannot find the leaf for nullifier/,
    );
  });

  it('publicly deploys and initializes a contract', async () => {
    const owner = wallet.getAddress();
    logger.debug(`Deploying stateful test contract`);
    const contract = await StatefulTestContract.deploy(wallet, owner, owner, 42).send().deployed();
    expect(await contract.methods.summed_values(owner).simulate()).toEqual(42n);
    logger.debug(`Calling public method on stateful test contract at ${contract.address.toString()}`);
    await contract.methods.increment_public_value(owner, 84).send().wait();
    expect(await contract.methods.get_public_value(owner).simulate()).toEqual(84n);
    expect(
      (await pxe.getContractClassMetadata(contract.instance.currentContractClassId)).isContractClassPubliclyRegistered,
    ).toBeTrue();
  });

  it('publicly universally deploys and initializes a contract', async () => {
    const owner = wallet.getAddress();
    const opts = { universalDeploy: true };
    const contract = await StatefulTestContract.deploy(wallet, owner, owner, 42).send(opts).deployed();
    expect(await contract.methods.summed_values(owner).simulate()).toEqual(42n);
    await contract.methods.increment_public_value(owner, 84).send().wait();
    expect(await contract.methods.get_public_value(owner).simulate()).toEqual(84n);
  });

  it('publicly deploys and calls a public function from the constructor', async () => {
    const owner = wallet.getAddress();
    const token = await TokenContract.deploy(wallet, owner, 'TOKEN', 'TKN', 18).send().deployed();
    expect(await token.methods.is_minter(owner).simulate()).toEqual(true);
  });

  it('publicly deploys and initializes via a public function', async () => {
    const owner = wallet.getAddress();
    logger.debug(`Deploying contract via a public constructor`);
    const contract = await StatefulTestContract.deployWithOpts(
      { wallet, method: 'public_constructor' },
      owner,
      ignoredArg,
      42,
    )
      .send()
      .deployed();
    expect(await contract.methods.get_public_value(owner).simulate()).toEqual(42n);
    logger.debug(`Calling a private function to ensure the contract was properly initialized`);
    const sender = owner;
    await contract.methods.create_note(owner, sender, 30).send().wait();
    expect(await contract.methods.summed_values(owner).simulate()).toEqual(30n);
  });

  it('deploys a contract with a default initializer not named constructor', async () => {
    logger.debug(`Deploying contract with a default initializer named initialize`);
    const opts = { skipClassRegistration: true, skipPublicDeployment: true };
    const contract = await CounterContract.deploy(wallet, 10, wallet.getAddress()).send(opts).deployed();
    logger.debug(`Calling a function to ensure the contract was properly initialized`);
    await contract.methods.increment_twice(wallet.getAddress(), wallet.getAddress()).send().wait();
    expect(await contract.methods.get_counter(wallet.getAddress()).simulate()).toEqual(12n);
  });

  it('publicly deploys a contract with no constructor', async () => {
    logger.debug(`Deploying contract with no constructor`);
    const contract = await NoConstructorContract.deploy(wallet).send().deployed();
    const arbitraryValue = 42;
    logger.debug(`Call a public function to check that it was publicly deployed`);
    const receipt = await contract.methods.emit_public(arbitraryValue).send().wait();
    const logs = await pxe.getPublicLogs({ txHash: receipt.txHash });
    expect(logs.logs[0].log.getEmittedFields()).toEqual([new Fr(arbitraryValue)]);
  });

  it('refuses to deploy a contract with no constructor and no public deployment', async () => {
    logger.debug(`Deploying contract with no constructor and skipping public deploy`);
    const opts = { skipPublicDeployment: true, skipClassRegistration: true };
    await expect(NoConstructorContract.deploy(wallet).prove(opts)).rejects.toThrow(/no function calls needed/i);
  });

  it('publicly deploys and calls a public contract in the same batched call', async () => {
    const owner = wallet.getAddress();
    // Create a contract instance and make the PXE aware of it
    logger.debug(`Initializing deploy method`);
    const deployMethod = StatefulTestContract.deploy(wallet, owner, owner, 42);
    logger.debug(`Registering the not-yet-deployed contract to batch calls to`);
    const contract = await deployMethod.register();

    // Batch registration, deployment, and public call into same TX
    logger.debug(`Creating public calls to run in same batch as deployment`);
    const init = contract.methods.increment_public_value(owner, 84);
    logger.debug(`Deploying a contract and calling a public function in the same batched call`);
    await new BatchCall(wallet, [deployMethod, init]).send().wait();
  }, 300_000);

  it('publicly deploys a contract in one tx and calls a public function on it later in the same block', async () => {
    await t.aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });

    const owner = wallet.getAddress();
    logger.debug('Initializing deploy method');
    const deployMethod = StatefulTestContract.deploy(wallet, owner, owner, 42);
    logger.debug('Creating request/calls to register and deploy contract');
    const deployTx = new BatchCall(wallet, [deployMethod]);
    logger.debug('Registering the not-yet-deployed contract to batch calls to');
    const contract = await deployMethod.register();

    logger.debug('Creating public call to run in same block as deployment');
    const publicCall = contract.methods.increment_public_value(owner, 84);

    // First send the deploy transaction
    // Pay priority fee to ensure the deployment transaction gets processed first.
    const maxPriorityFeesPerGas = new GasFees(1n, 0n);
    const deployTxPromise = deployTx.send({ fee: { gasSettings: { maxPriorityFeesPerGas } } }).wait({ timeout: 600 });

    // Then send the public call transaction
    const publicCallTxPromise = publicCall.send().wait({ timeout: 600 });

    logger.debug('Deploying a contract and calling a public function in the same block');
    const [deployTxReceipt, publicCallTxReceipt] = await Promise.all([deployTxPromise, publicCallTxPromise]);
    expect(deployTxReceipt.blockNumber).toEqual(publicCallTxReceipt.blockNumber);
  }, 300_000);

  describe('regressions', () => {
    it('fails properly when trying to deploy a contract with a failing constructor with a pxe client with retries', async () => {
      const { PXE_URL } = process.env;
      if (!PXE_URL) {
        return;
      }
      const pxeClient = createPXEClient(PXE_URL, {}, makeFetch([1, 2, 3], false));
      const [wallet] = await getDeployedTestAccountsWallets(pxeClient);
      await expect(
        StatefulTestContract.deployWithOpts({ wallet, method: 'wrong_constructor' }).send().deployed(),
      ).rejects.toThrow(/Unknown function/);
    });
  });
});
