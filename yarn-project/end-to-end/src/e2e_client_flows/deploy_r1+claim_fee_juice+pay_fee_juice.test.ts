import { EcdsaKAccountContractArtifact, getEcdsaKAccount } from '@aztec/accounts/ecdsa';
import {
  AccountWallet,
  type DeployOptions,
  FeeJuicePaymentMethodWithClaim,
  Fr,
  type PXE,
  registerContractClass,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto';

import { jest } from '@jest/globals';

import { capturePrivateExecutionStepsIfEnvSet } from '../shared/capture_private_execution_steps.js';
import { ClientFlowsTest } from './client_test_flows.js';

jest.setTimeout(300_000);

describe('Deploy ECDSA R1 contract, pay using bridged fee juice', () => {
  const t = new ClientFlowsTest('deploy_r1+claim_fee_juice+pay_fee_juice');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    ({ adminWallet, userPXE } = await t.setup());
    const registerContractClassInteraction = await registerContractClass(adminWallet, EcdsaKAccountContractArtifact);
    await registerContractClassInteraction.send().wait();
  });

  afterAll(async () => {
    await t.teardown();
  });

  let adminWallet: AccountWallet;
  let userPXE: PXE;

  it('pays natively in Fee Juice by bridging funds themselves', async () => {
    const benchysSecretKey = Fr.random();
    const benchysPrivateSigningKey = randomBytes(32);
    const benchysAccountManager = await getEcdsaKAccount(userPXE, benchysSecretKey, benchysPrivateSigningKey);
    const benchysCompleteAddress = await benchysAccountManager.getCompleteAddress();
    const benchysAddress = benchysCompleteAddress.address;
    const benchysWallet = await benchysAccountManager.register();

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
});
