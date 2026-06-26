import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { ContractInitializationStatus, type Wallet } from '@aztec/aztec.js/wallet';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { CounterContract } from '@aztec/noir-test-contracts.js/Counter';
import { InitTestContract } from '@aztec/noir-test-contracts.js/InitTest';
import { NoConstructorContract } from '@aztec/noir-test-contracts.js/NoConstructor';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { GasFees } from '@aztec/stdlib/gas';

import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { DeployTest } from './deploy_test.js';

// Tests the high-level DeployMethod API: deploying contracts publicly, privately, with
// batching, and verifying deployment metadata. DeployTest wraps setup(0, { ...AUTOMINE_E2E_OPTS,
// fundSponsoredFPC, skipAccountDeployment }) with 1 account. Includes a minTxsPerBlock=2 sub-test
// that verifies two txs land in the same block.
describe('e2e_deploy_contract deploy method', () => {
  const t = new DeployTest('deploy method');

  let logger: Logger;
  let wallet: Wallet;
  let aztecNode: AztecNode;
  let defaultAccountAddress: AztecAddress;

  beforeAll(async () => {
    ({ logger, wallet, aztecNode, defaultAccountAddress } = await t.setup({ ...AUTOMINE_E2E_OPTS }));
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
    const { contract } = await StatefulTestContract.deploy(wallet, owner, 42).send({ from: defaultAccountAddress });
    // docs:end:deploy_basic
    expect((await contract.methods.summed_values(owner).simulate({ from: defaultAccountAddress })).result).toEqual(42n);
    logger.debug(`Calling public method on stateful test contract at ${contract.address.toString()}`);
    await contract.methods.increment_public_value(owner, 84).send({ from: defaultAccountAddress });
    expect((await contract.methods.get_public_value(owner).simulate({ from: defaultAccountAddress })).result).toEqual(
      84n,
    );
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
    const { contract } = await StatefulTestContract.deploy(wallet, owner, 42).send(opts);
    // docs:end:deploy_universal
    expect((await contract.methods.summed_values(owner).simulate({ from: defaultAccountAddress })).result).toEqual(42n);
    await contract.methods.increment_public_value(owner, 84).send({ from: defaultAccountAddress });
    expect((await contract.methods.get_public_value(owner).simulate({ from: defaultAccountAddress })).result).toEqual(
      84n,
    );
  });

  it('publicly deploys and calls a public function from the constructor', async () => {
    const owner = defaultAccountAddress;
    // docs:start:deploy_token
    const { contract: token } = await TokenContract.deploy(wallet, owner, 'TOKEN', 'TKN', 18).send({
      from: defaultAccountAddress,
    });
    // docs:end:deploy_token
    expect((await token.methods.is_minter(owner).simulate({ from: defaultAccountAddress })).result).toEqual(true);
  });

  it('publicly deploys and initializes via a public function', async () => {
    const owner = defaultAccountAddress;
    logger.debug(`Deploying contract via a public constructor`);
    // docs:start:deploy_with_opts
    const { contract } = await StatefulTestContract.deployWithOpts(
      { wallet, method: 'public_constructor' },
      owner,
      42,
    ).send({
      from: defaultAccountAddress,
    });
    // docs:end:deploy_with_opts
    expect((await contract.methods.get_public_value(owner).simulate({ from: defaultAccountAddress })).result).toEqual(
      42n,
    );
    logger.debug(`Calling a private function to ensure the contract was properly initialized`);
    await contract.methods.create_note(owner, 30).send({ from: defaultAccountAddress });
    expect((await contract.methods.summed_values(owner).simulate({ from: defaultAccountAddress })).result).toEqual(30n);
  });

  // The public init nullifier is emitted at the end of the initializer. If it were emitted at the beginning,
  // the contract would appear initialized while the initializer body is still running, allowing external callers
  // to interact with a half-initialized contract. As a consequence, any public calls the initializer enqueues
  // run before the nullifier exists and cannot pass init checks.
  it('refuses to self-call an init-checked function during public initialization', async () => {
    const owner = defaultAccountAddress;
    await expect(
      InitTestContract.deployWithOpts(
        { wallet, method: 'public_initializer_self_calling_init_checked' },
        owner,
        42,
      ).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow(/Not initialized/);
  });

  // Private functions execute before public functions, so the init check in create_note fails
  // because the public initializer hasn't emitted the private initialization nullifier yet.
  it('refuses to call a private init-checked function in same tx as public initialization', async () => {
    const owner = defaultAccountAddress;
    const deployMethod = StatefulTestContract.deployWithOpts(
      { wallet, method: 'public_constructor', instantiation: { deployer: defaultAccountAddress } },
      owner,
      42,
    );
    const contract = await deployMethod.register();
    const batch = new BatchCall(wallet, [deployMethod, contract.methods.create_note(owner, 10)]);
    await expect(batch.send({ from: defaultAccountAddress })).rejects.toThrow(/Cannot find the leaf for nullifier/);
  });

  it('deploys a contract with a default initializer not named constructor', async () => {
    logger.debug(`Deploying contract with a default initializer named initialize`);
    const opts = { skipClassPublication: true, skipInstancePublication: true, from: defaultAccountAddress };
    const { contract } = await CounterContract.deploy(wallet, 10, defaultAccountAddress).send(opts);
    logger.debug(`Calling a function to ensure the contract was properly initialized`);
    await contract.methods.increment_twice(defaultAccountAddress).send({ from: defaultAccountAddress });
    expect(
      (await contract.methods.get_counter(defaultAccountAddress).simulate({ from: defaultAccountAddress })).result,
    ).toEqual(12n);
  });

  it('publicly deploys a contract with no constructor', async () => {
    logger.debug(`Deploying contract with no constructor`);
    const { contract } = await NoConstructorContract.deploy(wallet).send({ from: defaultAccountAddress });
    const arbitraryTag = 99;
    const arbitraryValue = 42;
    logger.debug(`Call a public function to check that it was publicly deployed`);
    const { receipt } = await contract.methods
      .emit_public(arbitraryTag, arbitraryValue)
      .send({ from: defaultAccountAddress });
    const txEffect = await aztecNode.getTxEffect(receipt.txHash);
    expect(txEffect?.data.publicLogs[0].getEmittedFields()).toEqual([new Fr(arbitraryTag), new Fr(arbitraryValue)]);
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
    const deployMethod = StatefulTestContract.deploy(wallet, owner, 42, { deployer: defaultAccountAddress });
    const contract = await deployMethod.register();

    // Batch deployment and a public call into the same transaction
    const publicCall = contract.methods.increment_public_value(owner, 84);
    await new BatchCall(wallet, [deployMethod, publicCall]).send({ from: defaultAccountAddress });
    // docs:end:deploy_batch
  }, 300_000);

  it('publicly deploys a contract in one tx and calls a public function on it later in the same block', async () => {
    await t.aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });
    try {
      const owner = defaultAccountAddress;
      logger.debug('Initializing deploy method');
      const deployMethod = StatefulTestContract.deploy(wallet, owner, 42, { deployer: defaultAccountAddress });
      logger.debug('Creating request/calls to register and deploy contract');
      const deployTx = new BatchCall(wallet, [deployMethod]);
      logger.debug('Registering the not-yet-deployed contract to batch calls to');
      const contract = await deployMethod.register();

      logger.debug('Creating public call to run in same block as deployment');
      const publicCall = contract.methods.increment_public_value(owner, 84);

      // First send the deploy transaction
      // Pay priority fee to ensure the deployment transaction gets processed first.
      // Use L2 gas priority (not DA) because DA gas fees can be zero, and priority fees
      // are capped by maxFeesPerGas, so a DA priority of 1 gets capped to min(0, 1) = 0.
      const maxPriorityFeesPerGas = new GasFees(0n, 1n);
      const deployTxPromise = deployTx.send({
        from: defaultAccountAddress,
        fee: { gasSettings: { maxPriorityFeesPerGas } },
        wait: { timeout: 600 },
      });

      // Then send the public call transaction
      const publicCallTxPromise = publicCall.send({ from: defaultAccountAddress, wait: { timeout: 600 } });

      logger.debug('Deploying a contract and calling a public function in the same block');
      const [{ receipt: deployTxReceipt }, { receipt: publicCallTxReceipt }] = await Promise.all([
        deployTxPromise,
        publicCallTxPromise,
      ]);
      expect(deployTxReceipt.blockNumber).toEqual(publicCallTxReceipt.blockNumber);
    } finally {
      // Restore minTxsPerBlock so subsequent tests aren't blocked waiting for a second tx.
      await t.aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    }
  }, 300_000);

  it('reports YES for initialization status via public nullifier when instance is not registered', async () => {
    const owner = defaultAccountAddress;
    const { contract } = await StatefulTestContract.deploy(wallet, owner, 42).send({ from: defaultAccountAddress });

    // StatefulTestContract has public functions with initialization checks, so during deployment and initialization
    // it emits a public initialization nullifier. A wallet without the instance registered falls back to checking
    // this nullifier.
    const secondWallet = await TestWallet.create(aztecNode);
    const metadata = await secondWallet.getContractMetadata(contract.address);
    expect(metadata.instance).toBeUndefined();
    expect(metadata.initializationStatus).toEqual(ContractInitializationStatus.INITIALIZED);
  });

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
