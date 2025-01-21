import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import {
  AztecAddress,
  BatchCall,
  Fr,
  type Logger,
  type PXE,
  type Wallet,
  createPXEClient,
  getContractClassFromArtifact,
  makeFetch,
} from '@aztec/aztec.js';
import { CounterContract } from '@aztec/noir-contracts.js/Counter';
import { StatefulTestContract } from '@aztec/noir-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-contracts.js/Test';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

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
    expect(await pxe.isContractClassPubliclyRegistered(contract.instance.contractClassId)).toBeTrue();
  });

  // TODO(#10007): Remove this test. Common contracts (ie token contracts) are only distinguished
  // because we're manually adding them to the archiver to support provernet.
  it('registers a contract class for a common contract', async () => {
    const { id: tokenContractClass } = getContractClassFromArtifact(TokenContract.artifact);
    expect(await pxe.isContractClassPubliclyRegistered(tokenContractClass)).toBeFalse();
    await TokenContract.deploy(wallet, wallet.getAddress(), 'TOKEN', 'TKN', 18n).send().deployed();
    expect(await pxe.isContractClassPubliclyRegistered(tokenContractClass)).toBeTrue();
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
    await contract.methods.increment(wallet.getAddress(), wallet.getAddress()).send().wait();
    expect(await contract.methods.get_counter(wallet.getAddress()).simulate()).toEqual(11n);
  });

  it('publicly deploys a contract with no constructor', async () => {
    logger.debug(`Deploying contract with no constructor`);
    const contract = await TestContract.deploy(wallet).send().deployed();
    logger.debug(`Call a public function to check that it was publicly deployed`);
    const receipt = await contract.methods.emit_unencrypted(42).send().wait();
    const logs = await pxe.getPublicLogs({ txHash: receipt.txHash });
    expect(logs.logs[0].log.log[0]).toEqual(new Fr(42));
  });

  it('refuses to deploy a contract with no constructor and no public deployment', async () => {
    logger.debug(`Deploying contract with no constructor and skipping public deploy`);
    const opts = { skipPublicDeployment: true, skipClassRegistration: true };
    await expect(TestContract.deploy(wallet).prove(opts)).rejects.toThrow(/no function calls needed/i);
  });

  it('publicly deploys and calls a public contract in the same batched call', async () => {
    const owner = wallet.getAddress();
    // Create a contract instance and make the PXE aware of it
    logger.debug(`Initializing deploy method`);
    const deployMethod = StatefulTestContract.deploy(wallet, owner, owner, 42);
    logger.debug(`Creating request/calls to register and deploy contract`);
    const deploy = await deployMethod.request();
    logger.debug(`Getting an instance of the not-yet-deployed contract to batch calls to`);
    const contract = await StatefulTestContract.at(deployMethod.getInstance().address, wallet);

    // Batch registration, deployment, and public call into same TX
    logger.debug(`Creating public calls to run in same batch as deployment`);
    const init = contract.methods.increment_public_value(owner, 84).request();
    logger.debug(`Deploying a contract and calling a public function in the same batched call`);
    await new BatchCall(wallet, [...deploy.calls, init]).send().wait();
  }, 300_000);

  it.skip('publicly deploys and calls a public function in a tx in the same block', async () => {
    // TODO(@spalladino): Requires being able to read a nullifier on the same block it was emitted.
  });

  describe('regressions', () => {
    it('fails properly when trying to deploy a contract with a failing constructor with a pxe client with retries', async () => {
      const { PXE_URL } = process.env;
      if (!PXE_URL) {
        return;
      }
      const pxeClient = createPXEClient(PXE_URL, makeFetch([1, 2, 3], false));
      const [wallet] = await getDeployedTestAccountsWallets(pxeClient);
      await expect(
        StatefulTestContract.deployWithOpts({ wallet, method: 'wrong_constructor' }).send().deployed(),
      ).rejects.toThrow(/Unknown function/);
    });
  });
});
