import { EcdsaRAccountContractArtifact } from '@aztec/accounts/ecdsa';
import {
  AccountWallet,
  type DeployOptions,
  FeeJuicePaymentMethodWithClaim,
  Fr,
  type PXE,
  registerContractClass,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';

import { jest } from '@jest/globals';

import { capturePrivateExecutionStepsIfEnvSet } from '../../shared/capture_private_execution_steps.js';
import { ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(300_000);

describe('Client flows benchmarking', () => {
  const t = new ClientFlowsBenchmark('deployments');
  // The admin that aids in the setup of the test
  let adminWallet: AccountWallet;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    ({ adminWallet } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  describe('Deployments', () => {
    it('Deploy ECDSA R1 account contract, pay using bridged fee juice', async () => {
      // Ensure the contract is already registered, to avoid benchmarking an extra call to the ContractClassRegisterer
      // The typical interaction would be for a user to deploy an account contract that is already registered in the
      // network.
      const registerContractClassInteraction = await registerContractClass(adminWallet, EcdsaRAccountContractArtifact);
      await registerContractClassInteraction.send().wait();

      const benchysAccountManager = await t.createBenchmarkingAccountManager('schnorr');
      const benchysWallet = await benchysAccountManager.getWallet();
      const benchysAddress = benchysWallet.getAddress();

      const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(FEE_FUNDING_FOR_TESTER_ACCOUNT, benchysAddress);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(benchysWallet, claim);

      const deploymentInteraction = await benchysAccountManager.getDeployMethod();
      const wrappedPaymentMethod = await benchysAccountManager.getSelfPaymentMethod(paymentMethod);
      const fee = { paymentMethod: wrappedPaymentMethod };
      // Publicly deploy the contract, but skip the class registration as that is the
      // "typical" use case
      const options: DeployOptions = {
        fee,
        universalDeploy: true,
        skipClassRegistration: true,
        skipPublicDeployment: false,
        skipInitialization: false,
        contractAddressSalt: new Fr(benchysAccountManager.salt),
      };

      await capturePrivateExecutionStepsIfEnvSet(
        'deploy_r1+claim_fee_juice+pay_fee_juice',
        deploymentInteraction,
        options,
      );

      // Ensure we paid a fee
      const tx = await deploymentInteraction.send(options).wait();
      expect(tx.transactionFee!).toBeGreaterThan(0n);
    });

    it('Deploy Schnorr Account contract, pay using bridged fee juice', async () => {
      const benchysAccountManager = await t.createBenchmarkingAccountManager('schnorr');
      const benchysWallet = await benchysAccountManager.getWallet();
      const benchysAddress = benchysWallet.getAddress();

      const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(FEE_FUNDING_FOR_TESTER_ACCOUNT, benchysAddress);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(benchysWallet, claim);

      const deploymentInteraction = await benchysAccountManager.getDeployMethod();
      const wrappedPaymentMethod = await benchysAccountManager.getSelfPaymentMethod(paymentMethod);
      const fee = { paymentMethod: wrappedPaymentMethod };
      // Publicly deploy the contract, but skip the class registration as that is the
      // "typical" use case
      const options: DeployOptions = {
        fee,
        universalDeploy: true,
        skipClassRegistration: true,
        skipPublicDeployment: false,
        skipInitialization: false,
        contractAddressSalt: new Fr(benchysAccountManager.salt),
      };

      await capturePrivateExecutionStepsIfEnvSet(
        'deploy_schnorr+claim_fee_juice+pay_fee_juice',
        deploymentInteraction,
        options,
      );

      // Ensure we paid a fee
      const tx = await deploymentInteraction.send(options).wait();
      expect(tx.transactionFee!).toBeGreaterThan(0n);
    });
  });
});
