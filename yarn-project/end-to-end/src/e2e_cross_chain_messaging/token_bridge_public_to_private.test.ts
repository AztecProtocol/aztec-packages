import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

describe('e2e_cross_chain_messaging token_bridge_public_to_private', () => {
  const t = new CrossChainMessagingTest('token_bridge_public_to_private');

  let { crossChainTestHarness, ethAccount, aztecNode, ownerAddress } = t;
  let underlyingERC20: any;

  beforeEach(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ crossChainTestHarness } = t);

    ethAccount = crossChainTestHarness.ethAccount;
    aztecNode = crossChainTestHarness.aztecNode;
    ownerAddress = crossChainTestHarness.ownerAddress;
    underlyingERC20 = crossChainTestHarness.underlyingERC20;
  }, 300_000);

  afterEach(async () => {
    await t.teardown();
  });

  // Moved from e2e_public_to_private_messaging.test.ts
  it('Milestone 5.4: Should be able to create a commitment in a public function and spend in a private function', async () => {
    // Generate a claim secret using pedersen
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;
    const shieldAmount = 50n;

    const [secret, secretHash] = crossChainTestHarness.generateClaimSecret();

    await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);
    const msgHash = await crossChainTestHarness.sendTokensToPortalPublic(bridgeAmount, secretHash);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(l1TokenBalance - bridgeAmount);

    await crossChainTestHarness.makeMessageConsumable(msgHash);

    // get message leaf index, needed for claiming in public
    const maybeIndexAndPath = await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash, 0n);
    expect(maybeIndexAndPath).toBeDefined();
    const messageLeafIndex = maybeIndexAndPath![0];

    await crossChainTestHarness.consumeMessageOnAztecAndMintPublicly(bridgeAmount, secret, messageLeafIndex);
    await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, bridgeAmount);

    // Create the commitment to be spent in the private domain
    await crossChainTestHarness.shieldFundsOnL2(shieldAmount, secretHash);

    // Create the transaction spending the commitment
    await crossChainTestHarness.redeemShieldPrivatelyOnL2(shieldAmount, secret);
    await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, bridgeAmount - shieldAmount);
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, shieldAmount);

    // Unshield the tokens again, sending them to the same account, however this can be any account.
    await crossChainTestHarness.unshieldTokensOnL2(shieldAmount);
    await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, bridgeAmount);
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, 0n);
  });
});
