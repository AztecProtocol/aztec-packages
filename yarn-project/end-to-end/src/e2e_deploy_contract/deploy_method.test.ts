import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { CounterContract } from '@aztec/noir-test-contracts.js/Counter';
import { NoConstructorContract } from '@aztec/noir-test-contracts.js/NoConstructor';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { GasFees } from '@aztec/stdlib/gas';

import { TestWallet } from '../test-wallet/test_wallet.js';
import { DeployTest } from './deploy_test.js';

describe('e2e_deploy_contract deploy method', () => {
  const t = new DeployTest('deploy method');

  let logger: Logger;
  let wallet: Wallet;
  let aztecNode: AztecNode;
  let defaultAccountAddress: AztecAddress;

  beforeAll(async () => {
    ({ logger, wallet, aztecNode, defaultAccountAddress } = await t.setup());
  });

  afterAll(() => t.teardown());

  it('refused to initialize a contract instance whose contract class is not yet published', async () => {
    const owner = defaultAccountAddress;
    const opts = { skipClassPublication: true, from: defaultAccountAddress };
    logger.debug(`Trying to initialize a contract instance without publishing its contract class`);
    await expect(StatefulTestContract.deploy(wallet, owner, 42).send(opts)).rejects.toThrow(
      /Cannot find the leaf for nullifier/,
    );
  });

  it('publicly deploys and initializes a contract', async () => {
    const owner = defaultAccountAddress;
    logger.debug(`Deploying stateful test contract`);
    // docs:start:deploy_basic
    const contract = await StatefulTestContract.deploy(wallet, owner, 42).send({ from: defaultAccountAddress });
    // docs:end:deploy_basic
    expect(await contract.methods.summed_values(owner).simulate({ from: defaultAccountAddress })).toEqual(42n);
    logger.debug(`Calling public method on stateful test contract at ${contract.address.toString()}`);
    await contract.methods.increment_public_value(owner, 84).send({ from: defaultAccountAddress });
    expect(await contract.methods.get_public_value(owner).simulate({ from: defaultAccountAddress })).toEqual(84n);
    // docs:start:verify_deployment
    const metadata = await wallet.getContractMetadata(contract.address);
    const classMetadata = await wallet.getContractClassMetadata(metadata.instance!.currentContractClassId);
    const isPublished = classMetadata.isContractClassPubliclyRegistered;
    // docs:end:verify_deployment
    expect(isPublished).toBeTrue();
  });

  it('publicly universally deploys and initializes a contract', async () => {
    const owner = defaultAccountAddress;
    // docs:start:deploy_universal
    const opts = { universalDeploy: true, from: defaultAccountAddress };
    const contract = await StatefulTestContract.deploy(wallet, owner, 42).send(opts);
    // docs:end:deploy_universal
    expect(await contract.methods.summed_values(owner).simulate({ from: defaultAccountAddress })).toEqual(42n);
    await contract.methods.increment_public_value(owner, 84).send({ from: defaultAccountAddress });
    expect(await contract.methods.get_public_value(owner).simulate({ from: defaultAccountAddress })).toEqual(84n);
  });

  it('publicly deploys and calls a public function from the constructor', async () => {
    const owner = defaultAccountAddress;
    // docs:start:deploy_token
    const token = await TokenContract.deploy(wallet, owner, 'TOKEN', 'TKN', 18).send({
      from: defaultAccountAddress,
    });
    // docs:end:deploy_token
    expect(await token.methods.is_minter(owner).simulate({ from: defaultAccountAddress })).toEqual(true);
  });

  it('publicly deploys and initializes via a public function', async () => {
    const owner = defaultAccountAddress;
    logger.debug(`Deploying contract via a public constructor`);
    // docs:start:deploy_with_opts
    const contract = await StatefulTestContract.deployWithOpts(
      { wallet, method: 'public_constructor' },
      owner,
      42,
    ).send({
      from: defaultAccountAddress,
    });
    // docs:end:deploy_with_opts
    expect(await contract.methods.get_public_value(owner).simulate({ from: defaultAccountAddress })).toEqual(42n);
    logger.debug(`Calling a private function to ensure the contract was properly initialized`);
    await contract.methods.create_note(owner, 30).send({ from: defaultAccountAddress });
    expect(await contract.methods.summed_values(owner).simulate({ from: defaultAccountAddress })).toEqual(30n);
  });

  it('deploys a contract with a default initializer not named constructor', async () => {
    logger.debug(`Deploying contract with a default initializer named initialize`);
    const opts = { skipClassPublication: true, skipInstancePublication: true, from: defaultAccountAddress };
    const contract = await CounterContract.deploy(wallet, 10, defaultAccountAddress).send(opts);
    logger.debug(`Calling a function to ensure the contract was properly initialized`);
    await contract.methods.increment_twice(defaultAccountAddress).send({ from: defaultAccountAddress });
    expect(await contract.methods.get_counter(defaultAccountAddress).simulate({ from: defaultAccountAddress })).toEqual(
      12n,
    );
  });

  it('publicly deploys a contract with no constructor', async () => {
    logger.debug(`Deploying contract with no constructor`);
    const contract = await NoConstructorContract.deploy(wallet).send({ from: defaultAccountAddress });
    const arbitraryValue = 42;
    logger.debug(`Call a public function to check that it was publicly deployed`);
    const receipt = await contract.methods.emit_public(arbitraryValue).send({ from: defaultAccountAddress });
    const logs = await aztecNode.getPublicLogs({ txHash: receipt.txHash });
    expect(logs.logs[0].log.getEmittedFields()).toEqual([new Fr(arbitraryValue)]);
  });

  it('refuses to deploy a contract with no constructor and no public deployment', async () => {
    logger.debug(`Deploying contract with no constructor and skipping public deploy`);
    const opts = { skipInstancePublication: true, skipClassPublication: true, from: defaultAccountAddress };
    await expect(NoConstructorContract.deploy(wallet).send(opts)).rejects.toThrow(
      'No transactions are needed to publish or initialize contract NoConstructor',
    );
  });

  it('publicly deploys and calls a public contract in the same batched call', async () => {
    const owner = defaultAccountAddress;
    // docs:start:deploy_batch
    // Create a contract instance and make the PXE aware of it
    const deployMethod = StatefulTestContract.deploy(wallet, owner, 42);
    const contract = await deployMethod.register();

    // Batch deployment and a public call into the same transaction
    const publicCall = contract.methods.increment_public_value(owner, 84);
    await new BatchCall(wallet, [deployMethod, publicCall]).send({ from: defaultAccountAddress });
    // docs:end:deploy_batch
  }, 300_000);

  it('publicly deploys a contract in one tx and calls a public function on it later in the same block', async () => {
    await t.aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });

    const owner = defaultAccountAddress;
    logger.debug('Initializing deploy method');
    const deployMethod = StatefulTestContract.deploy(wallet, owner, 42);
    logger.debug('Creating request/calls to register and deploy contract');
    const deployTx = new BatchCall(wallet, [deployMethod]);
    logger.debug('Registering the not-yet-deployed contract to batch calls to');
    const contract = await deployMethod.register();

    logger.debug('Creating public call to run in same block as deployment');
    const publicCall = contract.methods.increment_public_value(owner, 84);

    // First send the deploy transaction
    // Pay priority fee to ensure the deployment transaction gets processed first.
    const maxPriorityFeesPerGas = new GasFees(1n, 0n);
    const deployTxPromise = deployTx.send({
      from: defaultAccountAddress,
      fee: { gasSettings: { maxPriorityFeesPerGas } },
      wait: { timeout: 600 },
    });

    // Then send the public call transaction
    const publicCallTxPromise = publicCall.send({ from: defaultAccountAddress, wait: { timeout: 600 } });

    logger.debug('Deploying a contract and calling a public function in the same block');
    const [deployTxReceipt, publicCallTxReceipt] = await Promise.all([deployTxPromise, publicCallTxPromise]);
    expect(deployTxReceipt.blockNumber).toEqual(publicCallTxReceipt.blockNumber);
  }, 300_000);

  describe('regressions', () => {
    it('fails properly when trying to deploy a contract with a failing constructor with a pxe client with retries', async () => {
      const { AZTEC_NODE_URL } = process.env;
      if (!AZTEC_NODE_URL) {
        return;
      }
      const aztecNode = createAztecNodeClient(AZTEC_NODE_URL);
      const retryingWallet = await TestWallet.create(aztecNode);
      await expect(
        StatefulTestContract.deployWithOpts({ wallet: retryingWallet, method: 'wrong_constructor' }).send({
          from: defaultAccountAddress,
        }),
      ).rejects.toThrow(/Unknown function/);
    });
  });
});
