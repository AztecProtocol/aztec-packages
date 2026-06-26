import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type DeployOptions, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { ContractDeployer } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import type { TestWallet } from '../../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../../automine_test_context.js';

// Tests legacy ContractDeployer API: basic deploy, consecutive rollups, duplicate-salt rejection,
// and failed public constructor handling. Runs on a single account.
describe('automine/contracts/deploy/legacy', () => {
  const t = new AutomineTestContext();

  let logger: Logger;
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;

  beforeAll(async () => {
    await t.setup();
    ({ logger, wallet, defaultAccountAddress } = t);
  });

  afterAll(() => t.teardown());

  /**
   * Milestone 1.1.
   * https://hackmd.io/ouVCnacHQRq2o1oRc5ksNA#Interfaces-and-Responsibilities
   */
  it('should deploy a test contract', async () => {
    const salt = Fr.random();
    const deploymentData = await getContractInstanceFromInstantiationParams(TestContractArtifact, {
      salt,
      deployer: defaultAccountAddress,
    });
    const contractDeployer = new ContractDeployer(TestContractArtifact, wallet);
    const { contract } = await contractDeployer
      .deploy([], { salt, deployer: defaultAccountAddress })
      .send({ from: defaultAccountAddress });
    expect(contract.address).toEqual(deploymentData.address);
    const { instance, isContractPublished } = await wallet.getContractMetadata(deploymentData.address);
    expect(instance).toBeDefined();
    expect(isContractPublished).toBe(true);
  });

  /**
   * Verify that we can produce multiple rollups.
   */
  it('should deploy one contract after another in consecutive rollups', async () => {
    const contractDeployer = new ContractDeployer(TestContractArtifact, wallet);

    for (let index = 0; index < 2; index++) {
      logger.info(`Deploying contract ${index + 1}...`);
      await contractDeployer.deploy([], { salt: Fr.random() }).send({ from: defaultAccountAddress });
    }
  });

  /**
   * Verify that we can deploy multiple contracts and interact with all of them.
   */
  it('should deploy multiple contracts and interact with them', async () => {
    const contractDeployer = new ContractDeployer(TestContractArtifact, wallet);

    for (let index = 0; index < 2; index++) {
      logger.info(`Deploying contract ${index + 1}...`);
      const { contract: deployed } = await contractDeployer
        .deploy([], { salt: Fr.random() })
        .send({ from: defaultAccountAddress });
      logger.info(`Sending TX to contract ${index + 1}...`);
      await deployed.methods
        .get_master_incoming_viewing_public_key(defaultAccountAddress)
        .send({ from: defaultAccountAddress });
    }
  });

  /**
   * Milestone 1.2.
   * https://hackmd.io/-a5DjEfHTLaMBR49qy6QkA
   */
  it('should not deploy a contract with the same salt twice', async () => {
    const salt = Fr.random();
    const contractDeployer = new ContractDeployer(TestContractArtifact, wallet);

    await contractDeployer.deploy([], { salt }).send({ from: defaultAccountAddress });
    await expect(contractDeployer.deploy([], { salt }).send({ from: defaultAccountAddress })).rejects.toThrow(
      TX_ERROR_EXISTING_NULLIFIER,
    );
  });

  it('should not deploy a contract which failed the public part of the execution', async () => {
    // This test requires at least another good transaction to go through in the same block as the bad one.
    const artifact = TokenContractArtifact;
    const initArgs = ['TokenName', 'TKN', 18];
    const goodDeploy = StatefulTestContract.deploy(wallet, defaultAccountAddress, 42);
    // The Token constructor is (admin, name, symbol, decimals); using AztecAddress.ZERO as the admin
    // is a deliberately broken setup that fails in the public part of execution.
    const badDeploy = new ContractDeployer(artifact, wallet).deploy([AztecAddress.ZERO, ...initArgs]);

    const firstOpts: DeployOptions = {
      from: defaultAccountAddress,
    };
    const secondOpts: DeployOptions = {
      from: defaultAccountAddress,
    };

    const [goodTxPromiseResult, badTxReceiptResult] = await Promise.allSettled([
      goodDeploy.send({ ...firstOpts }),
      badDeploy.send({ ...secondOpts, wait: { dontThrowOnRevert: true } }),
    ]);

    expect(goodTxPromiseResult.status).toBe('fulfilled');
    expect(badTxReceiptResult.status).toBe('fulfilled'); // but reverted

    const goodTxReceipt = goodTxPromiseResult.status === 'fulfilled' ? goodTxPromiseResult.value.receipt : null;
    const badTxReceipt = badTxReceiptResult.status === 'fulfilled' ? badTxReceiptResult.value.receipt : null;

    // Both the good and bad transactions are included
    expect(goodTxReceipt).toBeDefined();
    expect(badTxReceipt).toBeDefined();
    expect(goodTxReceipt!.blockNumber).toEqual(expect.any(Number));
    expect(badTxReceipt!.blockNumber).toEqual(expect.any(Number));

    expect(badTxReceipt!.executionResult).toEqual(TxExecutionResult.REVERTED);

    const badInstance = await badDeploy.getInstance();
    // But the bad tx did not deploy the class
    const badMetadata = await wallet.getContractClassMetadata(badInstance.currentContractClassId);
    expect(badMetadata.isContractClassPubliclyRegistered).toBeFalse();
  });
});
