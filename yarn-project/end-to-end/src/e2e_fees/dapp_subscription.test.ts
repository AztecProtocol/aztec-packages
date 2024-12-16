import { DefaultDappInterface } from '@aztec/accounts/dapp';
import {
  AccountWallet,
  type AztecAddress,
  type FeePaymentMethod,
  Fr,
  type PXE,
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT, type GasSettings } from '@aztec/circuits.js';
import { type AppSubscriptionContract } from '@aztec/noir-contracts.js/AppSubscription';
import { type CounterContract } from '@aztec/noir-contracts.js/Counter';
import { type FPCContract } from '@aztec/noir-contracts.js/FPC';
import { type TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';

import { expectMapping, expectMappingDelta } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

type Balances = [bigint, bigint, bigint];

describe('e2e_fees dapp_subscription', () => {
  let pxe: PXE;

  let aliceWallet: AccountWallet;
  let aliceAddress: AztecAddress; // Dapp subscriber.
  let bobAddress: AztecAddress; // Dapp owner.
  let sequencerAddress: AztecAddress;
  let feeRecipient: AztecAddress; // Account that receives the fees from the fee refund flow.

  let bananaCoin: BananaCoin;
  let counterContract: CounterContract;
  let subscriptionContract: AppSubscriptionContract;
  let bananaFPC: FPCContract;

  let initialSubscriptionContractGasBalance: bigint;
  let initialSequencerGasBalance: bigint;
  let initialFPCGasBalance: bigint;
  let initialBananasPublicBalances: Balances; // alice, bob, fpc
  let initialBananasPrivateBalances: Balances; // alice, bob, fpc
  let gasSettings: GasSettings;

  const t = new FeesTest('dapp_subscription');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFPCSetupSnapshot();
    await t.applyFundAliceWithBananas();
    await t.applySetupSubscription();

    ({
      aliceWallet,
      aliceAddress,
      bobAddress,
      sequencerAddress,
      bananaCoin,
      bananaFPC,
      subscriptionContract,
      counterContract,
      pxe,
    } = await t.setup());

    // We like sequencer so we send him the fees.
    feeRecipient = sequencerAddress;
  });

  afterAll(async () => {
    await t.teardown();
  });

  beforeAll(async () => {
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, sequencerAddress, subscriptionContract.address, bananaFPC.address],
      [0n, 0n, FEE_FUNDING_FOR_TESTER_ACCOUNT, FEE_FUNDING_FOR_TESTER_ACCOUNT],
    );

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bobAddress, bananaFPC.address],
      [t.ALICE_INITIAL_BANANAS, 0n, 0n],
    );

    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bobAddress, bananaFPC.address],
      [t.ALICE_INITIAL_BANANAS, 0n, 0n],
    );
  });

  beforeEach(async () => {
    [initialSubscriptionContractGasBalance, initialSequencerGasBalance, initialFPCGasBalance] =
      (await t.getGasBalanceFn(subscriptionContract, sequencerAddress, bananaFPC)) as Balances;
    initialBananasPublicBalances = (await t.getBananaPublicBalanceFn(aliceAddress, bobAddress, bananaFPC)) as Balances;
    initialBananasPrivateBalances = (await t.getBananaPrivateBalanceFn(
      aliceAddress,
      bobAddress,
      bananaFPC,
    )) as Balances;
  });

  it('should allow Alice to subscribe by paying privately with bananas', async () => {
    /**
    PRIVATE SETUP
    we first deduct `MAX_FEE` BC from alice's private balance
    we setup partial notes for the fee going to the fee recipient and the refund going to alice

    PUBLIC APP LOGIC
    we then privately transfer `SUBSCRIPTION_AMOUNT` BC from alice to bob's subscription contract

    PUBLIC TEARDOWN
    the FPC finalizes the partial notes for the fee and the refund
    */

    const { transactionFee } = await subscribe(
      new PrivateFeePaymentMethod(bananaFPC.address, aliceWallet, feeRecipient),
    );

    // We let Alice see Bob's notes because the expect uses Alice's wallet to interact with the contracts to "get" state.
    aliceWallet.setScopes([aliceAddress, bobAddress]);

    await expectMapping(
      t.getGasBalanceFn,
      [sequencerAddress, bananaFPC.address],
      [initialSequencerGasBalance, initialFPCGasBalance - transactionFee!],
    );

    // alice, bob, fpc
    await expectBananasPrivateDelta(-t.SUBSCRIPTION_AMOUNT - transactionFee!, t.SUBSCRIPTION_AMOUNT, 0n);
    await expectBananasPublicDelta(0n, 0n, transactionFee!);

    // REFUND_AMOUNT is a transparent note note
  });

  it('should allow Alice to subscribe by paying with bananas in public', async () => {
    /**
    PRIVATE SETUP
    we first deduct `MAX_FEE` BC from alice's private balance
    we setup partial notes for the fee going to the fee recipient and the refund going to alice

    PUBLIC APP LOGIC
    we then privately transfer `SUBSCRIPTION_AMOUNT` BC from alice to bob's subscription contract

    PUBLIC TEARDOWN
    the FPC finalizes the partial notes for the fee and the refund
    */
    const { transactionFee } = await subscribe(new PublicFeePaymentMethod(bananaFPC.address, aliceWallet));

    await expectMapping(
      t.getGasBalanceFn,
      [sequencerAddress, bananaFPC.address],
      [initialSequencerGasBalance, initialFPCGasBalance - transactionFee!],
    );

    // alice, bob, fpc
    // we pay the fee publicly, but the subscription payment is still private.
    await expectBananasPrivateDelta(-t.SUBSCRIPTION_AMOUNT, t.SUBSCRIPTION_AMOUNT, 0n);
    // we have the refund from the previous test,
    // but since we paid publicly this time, the refund should have been "squashed"
    await expectBananasPublicDelta(-transactionFee!, 0n, transactionFee!);
  });

  it('should call dapp subscription entrypoint', async () => {
    // Subscribe again, so this test does not depend on the previous ones being run.

    await subscribe(new PrivateFeePaymentMethod(bananaFPC.address, aliceWallet, feeRecipient));

    expect(await subscriptionContract.methods.is_initialized(aliceAddress).simulate()).toBe(true);

    const dappInterface = DefaultDappInterface.createFromUserWallet(aliceWallet, subscriptionContract.address);
    const counterContractViaDappEntrypoint = counterContract.withWallet(new AccountWallet(pxe, dappInterface));

    const { transactionFee } = await counterContractViaDappEntrypoint.methods
      .increment(bobAddress, aliceAddress)
      .send()
      .wait();
    expect(await counterContract.methods.get_counter(bobAddress).simulate()).toBe(1n);

    await expectMapping(
      t.getGasBalanceFn,
      [sequencerAddress, subscriptionContract.address],
      [initialSequencerGasBalance, initialSubscriptionContractGasBalance - transactionFee!],
    );
  });

  it('should reject after the sub runs out', async () => {
    // Subscribe again. This will overwrite the previous subscription.
    await subscribe(new PrivateFeePaymentMethod(bananaFPC.address, aliceWallet, feeRecipient), 0);
    // TODO(#6651): Change back to /(context.block_number()) as u64 < expiry_block_number as u64/ when fixed
    await expect(dappIncrement()).rejects.toThrow(/Note encrypted logs hash mismatch/);
  });

  it('should reject after the txs run out', async () => {
    // Subscribe again. This will overwrite the previous subscription.
    await subscribe(new PrivateFeePaymentMethod(bananaFPC.address, aliceWallet, feeRecipient), 5, 1);
    await expect(dappIncrement()).resolves.toBeDefined();
    await expect(dappIncrement()).rejects.toThrow(/note.remaining_txs as u64 > 0/);
  });

  async function subscribe(paymentMethod: FeePaymentMethod, blockDelta: number = 5, txCount: number = 4) {
    const nonce = Fr.random();
    // This authwit is made because the subscription recipient is Bob, so we are approving the contract to send funds
    // to him, on our behalf, as part of the subscription process.
    const action = bananaCoin.methods.transfer_in_private(aliceAddress, bobAddress, t.SUBSCRIPTION_AMOUNT, nonce);
    await aliceWallet.createAuthWit({ caller: subscriptionContract.address, action });

    return subscriptionContract
      .withWallet(aliceWallet)
      .methods.subscribe(aliceAddress, nonce, (await pxe.getBlockNumber()) + blockDelta, txCount)
      .send({ fee: { gasSettings, paymentMethod } })
      .wait();
  }

  function dappIncrement() {
    const dappInterface = DefaultDappInterface.createFromUserWallet(aliceWallet, subscriptionContract.address);
    const counterContractViaDappEntrypoint = counterContract.withWallet(new AccountWallet(pxe, dappInterface));
    return counterContractViaDappEntrypoint.methods.increment(bobAddress, aliceAddress).send().wait();
  }

  const expectBananasPrivateDelta = (aliceAmount: bigint, bobAmount: bigint, fpcAmount: bigint) =>
    expectMappingDelta(
      initialBananasPrivateBalances,
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bobAddress, bananaFPC.address],
      [aliceAmount, bobAmount, fpcAmount],
    );

  const expectBananasPublicDelta = (aliceAmount: bigint, bobAmount: bigint, fpcAmount: bigint) =>
    expectMappingDelta(
      initialBananasPublicBalances,
      t.getBananaPublicBalanceFn,
      [aliceAddress, bobAddress, bananaFPC.address],
      [aliceAmount, bobAmount, fpcAmount],
    );
});
