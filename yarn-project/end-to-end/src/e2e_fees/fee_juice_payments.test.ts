import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import {
  type AccountManager,
  type AccountWallet,
  type AztecAddress,
  FeeJuicePaymentMethod,
  FeeJuicePaymentMethodWithClaim,
  type PXE,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT, type GasSettings } from '@aztec/circuits.js';
import { type FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { type TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';

import { FeesTest } from './fees_test.js';

describe('e2e_fees Fee Juice payments', () => {
  let aliceAddress: AztecAddress;
  let aliceWallet: AccountWallet;
  let bobAccount: AccountManager;
  let bobAddress: AztecAddress;
  let bobWallet: AccountWallet;
  let bananaCoin: BananaCoin;
  let gasSettings: GasSettings;
  let pxe: PXE;
  let feeJuiceContract: FeeJuiceContract;

  const t = new FeesTest('fee_juice', 1);

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFundAliceWithBananas();
    ({ feeJuiceContract, aliceAddress, aliceWallet, bananaCoin, gasSettings, pxe } = await t.setup());

    const [bob] = generateSchnorrAccounts(1);
    bobAccount = getSchnorrAccount(pxe, bob.secret, bob.signingKey, bob.salt);
    bobAddress = bob.address;
    bobWallet = await bobAccount.getWallet();

    // Alice pays for Bob's account contract deployment.
    await bobAccount.deploy({ deployWallet: aliceWallet }).wait();

    // We let Alice see Bob's notes because the expect uses Alice's wallet to interact with the contracts to "get" state.
    aliceWallet.setScopes([aliceAddress, bobAddress]);
  });

  afterAll(async () => {
    await t.teardown();
  });

  describe('without initial funds', () => {
    beforeAll(async () => {
      expect(await feeJuiceContract.methods.balance_of_public(bobAddress).simulate()).toEqual(0n);
    });

    it('fails to send a tx', async () => {
      const paymentMethod = new FeeJuicePaymentMethod(bobAddress);
      await expect(
        feeJuiceContract
          .withWallet(bobWallet)
          .methods.check_balance(0n)
          .send({ fee: { gasSettings, paymentMethod } })
          .wait(),
      ).rejects.toThrow(/Not enough balance for fee payer to pay for transaction/i);
    });

    it('claims bridged funds and pays with them on the same tx', async () => {
      const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(FEE_FUNDING_FOR_TESTER_ACCOUNT, bobAddress);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(bobAddress, claim);
      const receipt = await feeJuiceContract
        .withWallet(bobWallet)
        .methods.check_balance(0n)
        .send({ fee: { gasSettings, paymentMethod } })
        .wait();
      const endBalance = await feeJuiceContract.methods.balance_of_public(bobAddress).simulate();

      expect(endBalance).toBeGreaterThan(0n);
      expect(endBalance).toBeLessThan(FEE_FUNDING_FOR_TESTER_ACCOUNT);
      expect(endBalance).toEqual(FEE_FUNDING_FOR_TESTER_ACCOUNT - receipt.transactionFee!);
    });
  });

  describe('with initial funds', () => {
    it('sends tx with payment in Fee Juice with public calls', async () => {
      const initialBalance = await feeJuiceContract.methods.balance_of_public(aliceAddress).simulate();
      const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
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
      const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
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
