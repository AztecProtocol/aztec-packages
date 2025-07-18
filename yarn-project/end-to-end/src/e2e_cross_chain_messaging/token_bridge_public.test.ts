import { Fr } from '@aztec/aztec.js';
import { computeL2ToL1MembershipWitness } from '@aztec/stdlib/messaging';

import { NO_L1_TO_L2_MSG_ERROR } from '../fixtures/fixtures.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

describe('e2e_cross_chain_messaging token_bridge_public', () => {
  const t = new CrossChainMessagingTest('token_bridge_public');

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
  }, 300_000);

  afterEach(async () => {
    await t.teardown();
  });

  // docs:start:e2e_public_cross_chain
  it('Publicly deposit funds from L1 -> L2 and withdraw back to L1', async () => {
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;

    // 1. Mint tokens on L1
    logger.verbose(`1. Mint tokens on L1`);
    await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);

    // 2. Deposit tokens to the TokenPortal
    logger.verbose(`2. Deposit tokens to the TokenPortal`);
    const claim = await crossChainTestHarness.sendTokensToPortalPublic(bridgeAmount);
    const msgHash = Fr.fromHexString(claim.messageHash);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);

    // Wait for the message to be available for consumption
    logger.verbose(`Wait for the message to be available for consumption`);
    await crossChainTestHarness.makeMessageConsumable(msgHash);

    // Check message leaf index matches
    const maybeIndexAndPath = await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash);
    expect(maybeIndexAndPath).toBeDefined();
    const messageLeafIndex = maybeIndexAndPath![0];
    expect(messageLeafIndex).toEqual(claim.messageLeafIndex);

    // 3. Consume L1 -> L2 message and mint public tokens on L2
    logger.verbose('3. Consume L1 -> L2 message and mint public tokens on L2');
    await crossChainTestHarness.consumeMessageOnAztecAndMintPublicly(claim);
    await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, bridgeAmount);
    const afterBalance = bridgeAmount;

    // Time to withdraw the funds again!
    logger.info('Withdrawing funds from L2');

    // 4. Give approval to bridge to burn owner's funds:
    const withdrawAmount = 9n;
    const authwitNonce = Fr.random();
    const validateActionInteraction = await user1Wallet.setPublicAuthWit(
      {
        caller: l2Bridge.address,
        action: l2Token.methods.burn_public(ownerAddress, withdrawAmount, authwitNonce),
      },
      true,
    );
    await validateActionInteraction.send().wait();

    // 5. Withdraw owner's funds from L2 to L1
    logger.verbose('5. Withdraw owner funds from L2 to L1');
    const l2ToL1Message = await crossChainTestHarness.getL2ToL1MessageLeaf(withdrawAmount);
    const l2TxReceipt = await crossChainTestHarness.withdrawPublicFromAztecToL1(withdrawAmount, authwitNonce);
    await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, afterBalance - withdrawAmount);

    // Check balance before and after exit.
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);

    const l2ToL1MessageResult = await computeL2ToL1MembershipWitness(
      aztecNode,
      l2TxReceipt.blockNumber!,
      l2ToL1Message,
    );

    await t.assumeProven();

    await crossChainTestHarness.withdrawFundsFromBridgeOnL1(
      withdrawAmount,
      l2TxReceipt.blockNumber!,
      l2ToL1MessageResult!.l2MessageIndex,
      l2ToL1MessageResult!.siblingPath,
    );
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount + withdrawAmount);
  }, 120_000);
  // docs:end:e2e_public_cross_chain

  it('Someone else can mint funds to me on my behalf (publicly)', async () => {
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;

    await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);
    const claim = await crossChainTestHarness.sendTokensToPortalPublic(bridgeAmount);
    const msgHash = Fr.fromHexString(claim.messageHash);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);

    await crossChainTestHarness.makeMessageConsumable(msgHash);

    // Check message leaf index matches
    const maybeIndexAndPath = await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash);
    expect(maybeIndexAndPath).toBeDefined();
    const messageLeafIndex = maybeIndexAndPath![0];
    expect(messageLeafIndex).toEqual(claim.messageLeafIndex);

    // user2 tries to consume this message and minting to itself -> should fail since the message is intended to be consumed only by owner.
    await expect(
      l2Bridge
        .withWallet(user2Wallet)
        .methods.claim_public(user2Wallet.getAddress(), bridgeAmount, claim.claimSecret, messageLeafIndex)
        .simulate(),
    ).rejects.toThrow(NO_L1_TO_L2_MSG_ERROR);

    // user2 consumes owner's L1-> L2 message on bridge contract and mints public tokens on L2
    logger.info("user2 consumes owner's message on L2 Publicly");
    await l2Bridge
      .withWallet(user2Wallet)
      .methods.claim_public(ownerAddress, bridgeAmount, claim.claimSecret, messageLeafIndex)
      .send()
      .wait();

    // ensure funds are gone to owner and not user2.
    await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, bridgeAmount);
    await crossChainTestHarness.expectPublicBalanceOnL2(user2Wallet.getAddress(), 0n);
  }, 90_000);
});
