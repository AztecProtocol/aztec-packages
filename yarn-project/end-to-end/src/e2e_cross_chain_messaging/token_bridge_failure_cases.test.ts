import { EthAddress, Fr, L1Actor, L1ToL2Message, L2Actor } from '@aztec/aztec.js';
import { sha256ToField } from '@aztec/foundation/crypto';

import { toFunctionSelector } from 'viem';

import { NO_L1_TO_L2_MSG_ERROR } from '../fixtures/fixtures.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

describe('e2e_cross_chain_messaging token_bridge_failure_cases', () => {
  const t = new CrossChainMessagingTest('token_bridge_failure_cases');

  let { crossChainTestHarness, ethAccount, l2Bridge, user1Wallet, user2Wallet, ownerAddress } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ crossChainTestHarness, user1Wallet, user2Wallet } = t);
    ethAccount = crossChainTestHarness.ethAccount;
    l2Bridge = crossChainTestHarness.l2Bridge;
    ownerAddress = crossChainTestHarness.ownerAddress;
  }, 300_000);

  afterAll(async () => {
    await t.teardown();
  });

  it("Bridge can't withdraw my funds if I don't give approval", async () => {
    const mintAmountToOwner = 100n;
    await crossChainTestHarness.mintTokensPublicOnL2(mintAmountToOwner);

    const withdrawAmount = 9n;
    const nonce = Fr.random();
    // Should fail as owner has not given approval to bridge burn their funds.
    await expect(
      l2Bridge
        .withWallet(user1Wallet)
        .methods.exit_to_l1_public(ethAccount, withdrawAmount, EthAddress.ZERO, nonce)
        .prove(),
    ).rejects.toThrow(/unauthorized/);
  }, 60_000);

  it("Can't claim funds privately which were intended for public deposit from the token portal", async () => {
    const bridgeAmount = 100n;

    await crossChainTestHarness.mintTokensOnL1(bridgeAmount);
    const claim = await crossChainTestHarness.sendTokensToPortalPublic(bridgeAmount);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(0n);

    await crossChainTestHarness.makeMessageConsumable(claim.messageHash);

    // Wrong message hash
    const wrongBridgeAmount = bridgeAmount + 1n;
    const wrongMessageContent = sha256ToField([
      Buffer.from(toFunctionSelector('mint_to_private(uint256)').substring(2), 'hex'),
      new Fr(wrongBridgeAmount),
    ]);

    const wrongMessage = new L1ToL2Message(
      new L1Actor(crossChainTestHarness.tokenPortalAddress, crossChainTestHarness.publicClient.chain.id),
      new L2Actor(l2Bridge.address, 1),
      wrongMessageContent,
      claim.claimSecretHash,
      new Fr(claim.messageLeafIndex),
    );

    // Sending wrong secret hashes should fail:
    await expect(
      l2Bridge
        .withWallet(user2Wallet)
        .methods.claim_private(ownerAddress, wrongBridgeAmount, claim.claimSecret, claim.messageLeafIndex)
        .prove(),
    ).rejects.toThrow(`No L1 to L2 message found for message hash ${wrongMessage.hash().toString()}`);
  }, 60_000);

  it("Can't claim funds publicly which were intended for private deposit from the token portal", async () => {
    // 1. Mint tokens on L1
    const bridgeAmount = 100n;
    await crossChainTestHarness.mintTokensOnL1(bridgeAmount);

    // 2. Deposit tokens to the TokenPortal privately
    const claim = await crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(0n);

    // Wait for the message to be available for consumption
    await crossChainTestHarness.makeMessageConsumable(claim.messageHash);

    // 3. Consume L1 -> L2 message and try to mint publicly on L2  - should fail
    await expect(
      l2Bridge
        .withWallet(user2Wallet)
        .methods.claim_public(ownerAddress, bridgeAmount, Fr.random(), claim.messageLeafIndex)
        .prove(),
    ).rejects.toThrow(NO_L1_TO_L2_MSG_ERROR);
  });
});
