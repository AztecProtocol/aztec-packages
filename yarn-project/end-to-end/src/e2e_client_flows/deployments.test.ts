import { EcdsaRAccountContractArtifact, getEcdsaRAccount } from '@aztec/accounts/ecdsa';
import {
  AccountWallet,
  AccountWalletWithSecretKey,
  Contract,
  type DeployOptions,
  FeeJuicePaymentMethodWithClaim,
  Fr,
  type PXE,
  PrivateFeePaymentMethod,
  type Wallet,
  registerContractClass,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto';

import { jest } from '@jest/globals';
import type { Account } from 'viem';

import { capturePrivateExecutionStepsIfEnvSet } from '../shared/capture_private_execution_steps.js';
import { ClientFlowsTest } from './client_test_flows.js';

jest.setTimeout(300_000);

describe('Client flows benchmarking', () => {
  const t = new ClientFlowsTest();
  let adminWallet: AccountWallet;
  let adminPXE: PXE;
  let bananaFPC: Contract;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    ({ adminWallet, bananaFPC, pxe: adminPXE } = await t.setup());
    // Schnorr should already be registered by setup
    const registerContractClassInteraction = await registerContractClass(adminWallet, EcdsaRAccountContractArtifact);
    await registerContractClassInteraction.send().wait();
  });

  afterAll(async () => {
    await t.teardown();
  });

  describe('Deployments', () => {
    it('Deploy ECDSA R1 account contract, pay using bridged fee juice', async () => {
      const benchysAccountManager = await t.createBenchmarkingAccountManager('ecdsar1');
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

      const tx = await deploymentInteraction.send(options).wait();
      expect(tx.transactionFee!).toBeGreaterThan(0n);
    });
  });
});
