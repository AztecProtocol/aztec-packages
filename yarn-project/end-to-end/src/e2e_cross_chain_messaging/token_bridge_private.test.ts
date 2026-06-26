import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { retryUntil } from '@aztec/foundation/retry';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';

import { jest } from '@jest/globals';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import type { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

// Private L1→L2 token deposit and L2→L1 withdrawal via the TokenBridge. Uses CrossChainMessagingTest
// with startProverNode=true (prod sequencer, pipelining preset: ethSlot=4s, aztecSlot=12s), fake
// in-proc prover node, and CrossChainTestHarness for full L1↔L2 portal/bridge lifecycle.
// Epoch proving via advanceToEpochProven is required before L1 Outbox consumption.
describe('e2e_cross_chain_messaging token_bridge_private', () => {
  // Pipelining slows wall-clock chain progress (12s slots); waitForProven via advanceToEpochProven
  // needs more than the default 300s per-test budget.
  jest.setTimeout(15 * 60 * 1000);

  const t = new CrossChainMessagingTest(
    'token_bridge_private',
    { startProverNode: true },
    {},
    {},
    L1_DIRECT_WRITE_ACCOUNT_INDEX,
  );

  let crossChainTestHarness: CrossChainTestHarness;
  let ethAccount: EthAddress;
  let aztecNode: AztecNode;
  let logger: Logger;
  let ownerAddress: AztecAddress;
  let l2Bridge: TokenBridgeContract;
  let l2Token: TokenContract;
  let wallet: TestWallet;
  let user2Address: AztecAddress;

  beforeAll(async () => {
    await t.setup({ ...PIPELINING_SETUP_OPTS });
    // Have to destructure again to ensure we have latest refs.
    ({ crossChainTestHarness, ethAccount, aztecNode, logger, ownerAddress, l2Bridge, l2Token, wallet, user2Address } =
      t);
  }, 300_000);

  afterAll(async () => {
    await t.teardown();
  });

  // Full round-trip: mint tokens on L1, deposit privately via TokenPortal, wait for the message to be
  // consumable, claim on L2 (minting private tokens), withdraw back to L1 with an authwit, advance the
  // epoch until proven, then consume the Outbox message on L1 and verify the L1 balance is restored.
  it('Privately deposit funds from L1 -> L2 and withdraw back to L1', async () => {
    // Generate a claim secret using pedersen
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;

    // 1. Mint tokens on L1
    await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);

    // 2. Deposit tokens to the TokenPortal
    const claim = await crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);

    await crossChainTestHarness.makeMessageConsumable(claim.messageHash);

    // 3. Consume L1 -> L2 message and mint private tokens on L2
    await crossChainTestHarness.consumeMessageOnAztecAndMintPrivately(claim);
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, bridgeAmount);

    // time to withdraw the funds again!
    logger.info('Withdrawing funds from L2');

    // 4. Give approval to bridge to burn owner's funds:
    const withdrawAmount = 9n;
    const authwitNonce = Fr.random();
    const burnAuthwit = await wallet.createAuthWit(ownerAddress, {
      caller: l2Bridge.address,
      action: l2Token.methods.burn_private(ownerAddress, withdrawAmount, authwitNonce),
    });

    // 5. Withdraw owner's funds from L2 to L1
    const l2ToL1Message = await crossChainTestHarness.getL2ToL1MessageLeaf(withdrawAmount);
    const l2TxReceipt = await crossChainTestHarness.withdrawPrivateFromAztecToL1(
      withdrawAmount,
      authwitNonce,
      burnAuthwit,
    );
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, bridgeAmount - withdrawAmount);

    // Advance the epoch until the tx is proven since the messages are inserted to the outbox when the epoch is proven.
    await t.advanceToEpochProven(l2TxReceipt);

    // REFACTOR: hand-rolled retryUntil polling for L2→L1 membership witness; replace with a
    // waitForL2ToL1MessageWitness(node, txHash, leaf) helper shared across bridge tests.
    const l2ToL1MessageResult = await retryUntil(
      () => aztecNode.getL2ToL1MembershipWitness(l2TxReceipt.txHash, l2ToL1Message),
      'l2 to l1 membership witness',
      60,
      1,
    );

    // Check balance before and after exit.
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);
    await crossChainTestHarness.withdrawFundsFromBridgeOnL1(
      withdrawAmount,
      l2ToL1MessageResult.epochNumber,
      l2ToL1MessageResult.numCheckpointsInEpoch,
      l2ToL1MessageResult.leafIndex,
      l2ToL1MessageResult.siblingPath,
    );
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount + withdrawAmount);
  });

  // This test checks that it's enough to have the claim secret to claim the funds to whoever we want.
  // User2 (not the original depositor) uses the claim secret to call claim_private on behalf of owner.
  // Asserts the funds land at ownerAddress (not user2), proving the secret-based authorization works.
  it('Claim secret is enough to consume the message', async () => {
    const initialPublicBalance = await crossChainTestHarness.getL1BalanceOf(ethAccount);
    const initialPrivateBalance = await crossChainTestHarness.getL2PrivateBalanceOf(ownerAddress);

    const bridgeAmount = 100n;
    const claim = await crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(initialPublicBalance - bridgeAmount);

    // Wait for the message to be available for consumption
    await crossChainTestHarness.makeMessageConsumable(claim.messageHash);

    // send the right one -
    await l2Bridge.methods
      .claim_private(ownerAddress, bridgeAmount, claim.claimSecret, claim.messageLeafIndex)
      .send({ from: user2Address });

    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, initialPrivateBalance + bridgeAmount);
  }, 90_000);
});
