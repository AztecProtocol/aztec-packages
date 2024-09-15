import { EthAddress, Fr, L1Actor, L1ToL2Message, L2Actor } from '@aztec/aztec.js';
import { sha256ToField } from '@aztec/foundation/crypto';

import { toFunctionSelector } from 'viem';

import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';
import { NO_L1_TO_L2_MSG_ERROR } from '../fixtures/fixtures.js';

describe('e2e_cross_chain_messaging token_bridge_failure_cases', () => {
  const t = new CrossChainMessagingTest('token_bridge_failure_cases');

  let { crossChainTestHarness, ethAccount, l2Bridge, user1Wallet, user2Wallet, aztecNode, ownerAddress } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ crossChainTestHarness, user1Wallet, user2Wallet } = t);
    ethAccount = crossChainTestHarness.ethAccount;
    l2Bridge = crossChainTestHarness.l2Bridge;
    aztecNode = crossChainTestHarness.aztecNode;
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
    const [secret, secretHash] = crossChainTestHarness.generateClaimSecret();

    await crossChainTestHarness.mintTokensOnL1(bridgeAmount);
    const msgHash = await crossChainTestHarness.sendTokensToPortalPublic(bridgeAmount, secretHash);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(0n);

    await crossChainTestHarness.makeMessageConsumable(msgHash);

    // Wrong message hash
    const content = sha256ToField([
      Buffer.from(toFunctionSelector('mint_private(bytes32,uint256)').substring(2), 'hex'),
      secretHash,
      new Fr(bridgeAmount),
    ]);
    const wrongMessage = new L1ToL2Message(
      new L1Actor(crossChainTestHarness.tokenPortalAddress, crossChainTestHarness.publicClient.chain.id),
      new L2Actor(l2Bridge.address, 1),
      content,
      secretHash,
    );

    await expect(
      l2Bridge.withWallet(user2Wallet).methods.claim_private(secretHash, bridgeAmount, secret).prove(),
    ).rejects.toThrow(`No non-nullified L1 to L2 message found for message hash ${wrongMessage.hash().toString()}`);
  }, 60_000);

  it("Can't claim funds publicly which were intended for private deposit from the token portal", async () => {
    // 1. Mint tokens on L1
    const bridgeAmount = 100n;
    await crossChainTestHarness.mintTokensOnL1(bridgeAmount);

    // 2. Deposit tokens to the TokenPortal privately
    const [secretForL2MessageConsumption, secretHashForL2MessageConsumption] =
      crossChainTestHarness.generateClaimSecret();

    const msgHash = await crossChainTestHarness.sendTokensToPortalPrivate(
      Fr.random(),
      bridgeAmount,
      secretHashForL2MessageConsumption,
    );
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(0n);

    // Wait for the message to be available for consumption
    await crossChainTestHarness.makeMessageConsumable(msgHash);

    // get message leaf index, needed for claiming in public
    const maybeIndexAndPath = await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash, 0n);
    expect(maybeIndexAndPath).toBeDefined();
    const messageLeafIndex = maybeIndexAndPath![0];

    // 3. Consume L1 -> L2 message and try to mint publicly on L2  - should fail
    await expect(
      l2Bridge
        .withWallet(user2Wallet)
        .methods.claim_public(ownerAddress, bridgeAmount, secretForL2MessageConsumption, messageLeafIndex)
        .prove(),
    ).rejects.toThrow(NO_L1_TO_L2_MSG_ERROR);
  });
});
