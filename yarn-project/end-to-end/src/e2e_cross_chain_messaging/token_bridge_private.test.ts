import { Fr } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
import { RollupContract } from '@aztec/ethereum';
import { computeL2ToL1MembershipWitness } from '@aztec/stdlib/messaging';

import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

describe('e2e_cross_chain_messaging token_bridge_private', () => {
  const t = new CrossChainMessagingTest('token_bridge_private');

  let {
    crossChainTestHarness,
    ethAccount,
    aztecNode,
    logger,
    ownerAddress,
    l2Bridge,
    l2Token,
    user1Wallet,
    user2Wallet,
  } = t;
  let rollup: RollupContract;
  let cheatCodes: CheatCodes;

  beforeEach(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ crossChainTestHarness, user1Wallet, user2Wallet } = t);

    ethAccount = crossChainTestHarness.ethAccount;
    aztecNode = crossChainTestHarness.aztecNode;
    logger = crossChainTestHarness.logger;
    ownerAddress = crossChainTestHarness.ownerAddress;
    l2Bridge = crossChainTestHarness.l2Bridge;
    l2Token = crossChainTestHarness.l2Token;
    rollup = new RollupContract(
      crossChainTestHarness!.l1Client,
      crossChainTestHarness!.l1ContractAddresses.rollupAddress,
    );

    cheatCodes = await CheatCodes.create(t.aztecNodeConfig.l1RpcUrls, t.pxe);
  }, 300_000);

  afterEach(async () => {
    await t.teardown();
  });

  // docs:start:e2e_private_cross_chain
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

    // docs:start:authwit_to_another_sc
    // 4. Give approval to bridge to burn owner's funds:
    const withdrawAmount = 9n;
    const authwitNonce = Fr.random();
    const burnAuthwit = await user1Wallet.createAuthWit({
      caller: l2Bridge.address,
      action: l2Token.methods.burn_private(ownerAddress, withdrawAmount, authwitNonce),
    });
    // docs:end:authwit_to_another_sc

    // 5. Withdraw owner's funds from L2 to L1
    const l2ToL1Message = await crossChainTestHarness.getL2ToL1MessageLeaf(withdrawAmount);
    const l2TxReceipt = await crossChainTestHarness.withdrawPrivateFromAztecToL1(
      withdrawAmount,
      authwitNonce,
      burnAuthwit,
    );
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, bridgeAmount - withdrawAmount);

    const l2ToL1MessageResult = await computeL2ToL1MembershipWitness(
      aztecNode,
      l2TxReceipt.blockNumber!,
      l2ToL1Message,
    );

    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven
    await cheatCodes.rollup.markAsProven(await rollup.getBlockNumber());

    // Check balance before and after exit.
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);
    await crossChainTestHarness.withdrawFundsFromBridgeOnL1(
      withdrawAmount,
      l2TxReceipt.blockNumber!,
      l2ToL1MessageResult!.l2MessageIndex,
      l2ToL1MessageResult!.siblingPath,
    );
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount + withdrawAmount);
  });
  // docs:end:e2e_private_cross_chain

  // This test checks that it's enough to have the claim secret to claim the funds to whoever we want.
  it('Claim secret is enough to consume the message', async () => {
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;

    await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);
    const claim = await crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);

    // Wait for the message to be available for consumption
    await crossChainTestHarness.makeMessageConsumable(claim.messageHash);

    // send the right one -
    await l2Bridge
      .withWallet(user2Wallet)
      .methods.claim_private(ownerAddress, bridgeAmount, claim.claimSecret, claim.messageLeafIndex)
      .send()
      .wait();

    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, bridgeAmount);
  }),
    90_000;
});
