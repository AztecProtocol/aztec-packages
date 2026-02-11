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

import type { TestWallet } from '../test-wallet/test_wallet.js';
import { DeployTest } from './deploy_test.js';

describe('e2e_deploy_contract legacy', () => {
  const t = new DeployTest('legacy');

  let logger: Logger;
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;

  beforeAll(async () => {
    ({ logger, wallet, defaultAccountAddress } = await t.setup());
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
    const deployer = new ContractDeployer(TestContractArtifact, wallet);
    const receipt = await deployer
      .deploy()
      .send({ from: defaultAccountAddress, contractAddressSalt: salt, wait: { returnReceipt: true } });
    expect(receipt.contract.address).toEqual(deploymentData.address);
    const { instance, isContractPublished } = await wallet.getContractMetadata(deploymentData.address);
    expect(instance).toBeDefined();
    expect(isContractPublished).toBe(true);
  });

  /**
   * Verify that we can produce multiple rollups.
   */
  it('should deploy one contract after another in consecutive rollups', async () => {
    const deployer = new ContractDeployer(TestContractArtifact, wallet);

    for (let index = 0; index < 2; index++) {
      logger.info(`Deploying contract ${index + 1}...`);
      await deployer.deploy().send({ from: defaultAccountAddress, contractAddressSalt: Fr.random() });
    }
  });

  /**
   * Verify that we can deploy multiple contracts and interact with all of them.
   */
  it('should deploy multiple contracts and interact with them', async () => {
    const deployer = new ContractDeployer(TestContractArtifact, wallet);

    for (let index = 0; index < 2; index++) {
      logger.info(`Deploying contract ${index + 1}...`);
      const receipt = await deployer
        .deploy()
        .send({ from: defaultAccountAddress, contractAddressSalt: Fr.random(), wait: { returnReceipt: true } });
      logger.info(`Sending TX to contract ${index + 1}...`);
      await receipt.contract.methods
        .get_master_incoming_viewing_public_key(defaultAccountAddress)
        .send({ from: defaultAccountAddress });
    }
  });

  /**
   * Milestone 1.2.
   * https://hackmd.io/-a5DjEfHTLaMBR49qy6QkA
   */
  it('should not deploy a contract with the same salt twice', async () => {
    const contractAddressSalt = Fr.random();
    const deployer = new ContractDeployer(TestContractArtifact, wallet);

    await deployer.deploy().send({ from: defaultAccountAddress, contractAddressSalt });
    await expect(deployer.deploy().send({ from: defaultAccountAddress, contractAddressSalt })).rejects.toThrow(
      TX_ERROR_EXISTING_NULLIFIER,
    );
  });

  it('should not deploy a contract which failed the public part of the execution', async () => {
    // This test requires at least another good transaction to go through in the same block as the bad one.
    const artifact = TokenContractArtifact;
    const initArgs = ['TokenName', 'TKN', 18] as const;
    const goodDeploy = StatefulTestContract.deploy(wallet, defaultAccountAddress, 42);
    const badDeploy = new ContractDeployer(artifact, wallet).deploy(AztecAddress.ZERO, ...initArgs);

    const firstOpts: DeployOptions = {
      skipClassPublication: true,
      skipInstancePublication: true,
      from: defaultAccountAddress,
    };
    const secondOpts: DeployOptions = {
      from: defaultAccountAddress,
    };

    const [goodTxPromiseResult, badTxReceiptResult] = await Promise.allSettled([
      goodDeploy.send({ ...firstOpts, wait: { returnReceipt: true } }),
      badDeploy.send({ ...secondOpts, wait: { dontThrowOnRevert: true, returnReceipt: true } }),
    ]);

    expect(goodTxPromiseResult.status).toBe('fulfilled');
    expect(badTxReceiptResult.status).toBe('fulfilled'); // but reverted

    const goodTxReceipt = goodTxPromiseResult.status === 'fulfilled' ? goodTxPromiseResult.value : null;
    const badTxReceipt = badTxReceiptResult.status === 'fulfilled' ? badTxReceiptResult.value : null;

    // Both the good and bad transactions are included
    expect(goodTxReceipt).toBeDefined();
    expect(badTxReceipt).toBeDefined();
    expect(goodTxReceipt!.blockNumber).toEqual(expect.any(Number));
    expect(badTxReceipt!.blockNumber).toEqual(expect.any(Number));

    expect(badTxReceipt!.executionResult).toEqual(TxExecutionResult.APP_LOGIC_REVERTED);

    const badInstance = await badDeploy.getInstance();
    // But the bad tx did not deploy the class
    const badMetadata = await wallet.getContractClassMetadata(badInstance.currentContractClassId);
    expect(badMetadata.isContractClassPubliclyRegistered).toBeFalse();
  });
});
