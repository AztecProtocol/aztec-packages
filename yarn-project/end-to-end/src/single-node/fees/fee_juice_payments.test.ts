import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { FeeJuicePaymentMethodWithClaim } from '@aztec/aztec.js/fee';
import type { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import type { GasSettings } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { FeesTest } from './fees_test.js';

// Direct Fee Juice payment flows. Uses FeesTest (prod sequencer, pipelining preset: ethSlot=4s,
// aztecSlot=12s, inboxLag=2, minTxsPerBlock=0), 1 account (Alice), fake in-proc prover node, and
// GasBridgingTestHarness for L1↔L2 fee-juice bridging. Bob's account is pre-deployed by Alice.
describe('single-node/fees/fee_juice_payments', () => {
  // FeesTest.setup + applyFundAliceWithBananas chains many dependent txs which run at the
  // ~24s/tx pipelined cadence, exceeding the default 5 min hook window.
  jest.setTimeout(15 * 60 * 1000);

  let aliceAddress: AztecAddress;
  let wallet: TestWallet;
  let bobAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let gasSettings: GasSettings;
  let feeJuiceContract: FeeJuiceContract;

  const t = new FeesTest('fee_juice', 1);

  beforeAll(async () => {
    await t.setup({ ...PIPELINING_SETUP_OPTS });
    await t.applyFundAliceWithBananas();
    ({ feeJuiceContract, aliceAddress, wallet, bananaCoin, gasSettings } = t);

    const [bob] = await generateSchnorrAccounts(1);
    const bobsAccountManager = await wallet.createAccount({
      secret: bob.secret,
      salt: bob.salt,
      contract: new SchnorrAccountContract(bob.signingKey),
    });

    // Alice pays for Bob's account contract deployment.
    const bobsDeployMethod = await bobsAccountManager.getDeployMethod();
    bobAddress = bobsAccountManager.address;
    await bobsDeployMethod.send({ from: aliceAddress });
  });

  afterAll(async () => {
    await t.teardown();
  });

  // Bob has no fee juice; these tests verify failure cases before bridging.
  describe('without initial funds', () => {
    beforeAll(async () => {
      expect(
        (await feeJuiceContract.methods.balance_of_public(bobAddress).simulate({ from: bobAddress })).result,
      ).toEqual(0n);
    });

    // Confirms that simulate() throws "Not enough balance" when the sender has zero fee juice.
    it('fails to simulate a tx', async () => {
      await expect(
        feeJuiceContract.methods
          .check_balance(0n)
          .simulate({ from: bobAddress, fee: { gasSettings }, skipFeeEnforcement: false }),
      ).rejects.toThrow(/Not enough balance for fee payer to pay for transaction/i);
    });

    // Confirms that send() throws "Insufficient fee payer balance" when the sender has zero fee juice.
    it('fails to send a tx', async () => {
      await expect(
        feeJuiceContract.methods.check_balance(0n).send({ from: bobAddress, fee: { gasSettings } }),
      ).rejects.toThrow(/Invalid tx: Insufficient fee payer balance/i);
    });

    // Bob bridges fee juice from L1 and claims it atomically in the same tx via
    // FeeJuicePaymentMethodWithClaim. Asserts the post-tx balance equals claimAmount minus fee.
    it('claims bridged funds and pays with them on the same tx', async () => {
      const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(bobAddress);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(bobAddress, claim);
      const { receipt } = await feeJuiceContract.methods
        .check_balance(0n)
        .send({ from: bobAddress, fee: { gasSettings, paymentMethod } });
      const { result: endBalance } = await feeJuiceContract.methods
        .balance_of_public(bobAddress)
        .simulate({ from: bobAddress });

      expect(endBalance).toBeGreaterThan(0n);
      expect(endBalance).toBeLessThan(claim.claimAmount);
      expect(endBalance).toEqual(claim.claimAmount - receipt.transactionFee!);
    });
  });

  // Alice has pre-funded fee juice; these tests verify normal Fee Juice payment flows.
  describe('with initial funds', () => {
    // Alice sends a public token transfer paying the fee natively in Fee Juice; asserts the balance
    // decreases by the transaction fee.
    it('sends tx with payment in Fee Juice with public calls', async () => {
      const { result: initialBalance } = await feeJuiceContract.methods
        .balance_of_public(aliceAddress)
        .simulate({ from: aliceAddress });
      const {
        receipt: { transactionFee },
      } = await bananaCoin.methods
        .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
        .send({ fee: { gasSettings }, from: aliceAddress });
      expect(transactionFee).toBeGreaterThan(0n);
      const { result: endBalance } = await feeJuiceContract.methods
        .balance_of_public(aliceAddress)
        .simulate({ from: aliceAddress });
      expect(endBalance).toBeLessThan(initialBalance);
    });

    // Same as above but the tx is a private-only transfer (no public calls), ensuring the fee
    // is deducted from Alice's fee-juice balance even in the no-public-call path.
    it('sends tx fee payment in Fee Juice with no public calls', async () => {
      const { result: initialBalance } = await feeJuiceContract.methods
        .balance_of_public(aliceAddress)
        .simulate({ from: aliceAddress });
      const {
        receipt: { transactionFee },
      } = await bananaCoin.methods.transfer(bobAddress, 1n).send({ fee: { gasSettings }, from: aliceAddress });
      expect(transactionFee).toBeGreaterThan(0n);
      const { result: endBalance } = await feeJuiceContract.methods
        .balance_of_public(aliceAddress)
        .simulate({ from: aliceAddress });
      expect(endBalance).toBeLessThan(initialBalance);
    });
  });
});
