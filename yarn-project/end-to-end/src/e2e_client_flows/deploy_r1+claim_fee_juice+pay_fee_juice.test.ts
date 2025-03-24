import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountManager,
  type AccountWallet,
  FeeJuicePaymentMethod,
  FeeJuicePaymentMethodWithClaim,
  Fr,
  type Logger,
  type PXE,
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
  Schnorr,
  type Wallet,
  deriveKeys,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import { Fq } from '@aztec/foundation/fields';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { SchnorrAccountContract } from '@aztec/noir-contracts.js/SchnorrAccount';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import { ClientFlowsTest } from './client_test_flows.js';

jest.setTimeout(300_000);

describe('Deploy ECDSA R1 contract, pay using bridged fee juice', () => {
  const t = new ClientFlowsTest('deploy_r1+claim_fee_juice+pay_fee_juice');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    ({ pxe, logger } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let logger: Logger;
  let pxe: PXE;

  // Admin pays for deployments when we need someone else to intervene
  let adminWallet: Wallet;
  let adminAddress: AztecAddress;

  // Benchy is the account being created (a fresh account is generated for each test)
  let benchysSecretKey: Fr;
  let benchysPrivateSigningKey: Fq;
  let benchysAccountManager: AccountManager;
  let benchysCompleteAddress: CompleteAddress;
  let benchysAddress: AztecAddress;
  let benchysWallet: AccountWallet;

  beforeEach(async () => {
    benchysSecretKey = Fr.random();
    benchysPrivateSigningKey = Fq.random();
    benchysAccountManager = await getSchnorrAccount(pxe, benchysSecretKey, benchysPrivateSigningKey, Fr.random());
    benchysCompleteAddress = await benchysAccountManager.getCompleteAddress();
    benchysAddress = benchysCompleteAddress.address;
    benchysWallet = await benchysAccountManager.getWallet();

    await benchysAccountManager.register();
  });

  it('pays natively in the Fee Juice by bridging funds themselves', async () => {
    const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(FEE_FUNDING_FOR_TESTER_ACCOUNT, benchysAddress);
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(benchysWallet, claim);
    const tx = await benchysAccountManager.deploy({ fee: { paymentMethod } }).wait();
    expect(tx.transactionFee!).toBeGreaterThan(0n);
    await expect(t.getGasBalanceFn(benchysAddress)).resolves.toEqual([
      FEE_FUNDING_FOR_TESTER_ACCOUNT - tx.transactionFee!,
    ]);
  });
});
