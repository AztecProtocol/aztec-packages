import {
  type AccountWallet,
  type AztecAddress,
  FeeJuicePaymentMethod,
  FeeJuicePaymentMethodWithClaim,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT, type GasSettings } from '@aztec/circuits.js';
import { type FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { type TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';

import { FeesTest } from './fees_test.js';

describe('e2e_fees Fee Juice payments', () => {
  let aliceAddress: AztecAddress;
  let aliceWallet: AccountWallet;
  let bobAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let gasSettings: GasSettings;
  let feeJuiceContract: FeeJuiceContract;
  let paymentMethod: FeeJuicePaymentMethod;

  const t = new FeesTest('fee_juice');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFundAliceWithBananas();
    ({ feeJuiceContract, aliceAddress, aliceWallet, bobAddress, bananaCoin, gasSettings } = await t.setup());

    paymentMethod = new FeeJuicePaymentMethod(aliceAddress);

    // We let Alice see Bob's notes because the expect uses Alice's wallet to interact with the contracts to "get" state.
    aliceWallet.setScopes([aliceAddress, bobAddress]);
  });

  afterAll(async () => {
    await t.teardown();
  });

  describe('without initial funds', () => {
    beforeAll(async () => {
      expect(await feeJuiceContract.methods.balance_of_public(aliceAddress).simulate()).toEqual(0n);
    });

    it('fails to send a tx', async () => {
      await expect(
        bananaCoin.methods
          .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
          .send({ fee: { gasSettings, paymentMethod } })
          .wait(),
      ).rejects.toThrow(/Not enough balance for fee payer to pay for transaction/i);
    });

    it('claims bridged funds and pays with them on the same tx', async () => {
      const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(FEE_FUNDING_FOR_TESTER_ACCOUNT, aliceAddress);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(aliceAddress, claim);
      const receipt = await bananaCoin.methods
        .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
        .send({ fee: { gasSettings, paymentMethod } })
        .wait();
      const endBalance = await feeJuiceContract.methods.balance_of_public(aliceAddress).simulate();

      expect(endBalance).toBeGreaterThan(0n);
      expect(endBalance).toBeLessThan(FEE_FUNDING_FOR_TESTER_ACCOUNT);
      expect(endBalance).toEqual(FEE_FUNDING_FOR_TESTER_ACCOUNT - receipt.transactionFee!);
    });
  });

  describe('with initial funds', () => {
    beforeAll(async () => {
      await t.applyFundAliceWithFeeJuice();
    });

    it('sends tx with payment in Fee Juice with public calls', async () => {
      const initialBalance = await feeJuiceContract.methods.balance_of_public(aliceAddress).simulate();
      const { transactionFee } = await bananaCoin.methods
        .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
        .send({ fee: { gasSettings, paymentMethod } })
        .wait();
      expect(transactionFee).toBeGreaterThan(0n);
      const endBalance = await feeJuiceContract.methods.balance_of_public(aliceAddress).simulate();
      expect(endBalance).toBeLessThan(initialBalance);
    });

    it('sends tx fee payment in Fee Juice with no public calls', async () => {
      const initialBalance = await feeJuiceContract.methods.balance_of_public(aliceAddress).simulate();
      const { transactionFee } = await bananaCoin.methods
        .transfer(bobAddress, 1n)
        .send({ fee: { gasSettings, paymentMethod } })
        .wait();
      expect(transactionFee).toBeGreaterThan(0n);
      const endBalance = await feeJuiceContract.methods.balance_of_public(aliceAddress).simulate();
      expect(endBalance).toBeLessThan(initialBalance);
    });
  });
});
