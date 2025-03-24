import { getEcdsaKAccount } from '@aztec/accounts/ecdsa';
import { FeeJuicePaymentMethodWithClaim, Fr, type PXE } from '@aztec/aztec.js';
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
    ({ pxe } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  let pxe: PXE;

  it('pays natively in the Fee Juice by bridging funds themselves', async () => {
    const benchysSecretKey = Fr.random();
    const benchysPrivateSigningKey = randomBytes(32);
    const benchysAccountManager = await getEcdsaKAccount(pxe, benchysSecretKey, benchysPrivateSigningKey);
    const benchysCompleteAddress = await benchysAccountManager.getCompleteAddress();
    const benchysAddress = benchysCompleteAddress.address;
    const benchysWallet = await benchysAccountManager.getWallet();

    await benchysAccountManager.register();
    const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(FEE_FUNDING_FOR_TESTER_ACCOUNT, benchysAddress);
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(benchysWallet, claim);

    const deploymentInteraction = await benchysAccountManager.getDeployMethod();
    const wrappedPaymentMethod = await benchysAccountManager.getSelfPaymentMethod(paymentMethod);
    const fee = { paymentMethod: wrappedPaymentMethod };

    await capturePrivateExecutionStepsIfEnvSet('amm-add-liquidity', deploymentInteraction, {
      fee,
    });

    const tx = await deploymentInteraction.send({ fee }).wait();
    expect(tx.transactionFee!).toBeGreaterThan(0n);
  });
});
