import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { L1Actor, L1ToL2Message, L2Actor } from '@aztec/aztec.js/messaging';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';

import { toFunctionSelector } from 'viem';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, NO_L1_TO_L2_MSG_ERROR, PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

// Token bridge failure scenarios: missing authwit, wrong secret hash, and wrong deposit direction.
// Uses CrossChainMessagingTest (prod sequencer, pipelining preset: ethSlot=4s, aztecSlot=12s,
// inboxLag=2, minTxsPerBlock=0), EpochTestSettler for auto-proving, and CrossChainTestHarness for
// L1↔L2 token portal bridging.
describe('e2e_cross_chain_messaging token_bridge_failure_cases', () => {
  const t = new CrossChainMessagingTest('token_bridge_failure_cases', {}, {}, {}, L1_DIRECT_WRITE_ACCOUNT_INDEX);
  let version: number = 1;

  let { crossChainTestHarness, ethAccount, l2Bridge, ownerAddress, user1Address, user2Address, rollup } = t;

  beforeAll(async () => {
    await t.setup({ ...PIPELINING_SETUP_OPTS });
    // Have to destructure again to ensure we have latest refs.
    ({ crossChainTestHarness, user1Address, user2Address, ownerAddress, rollup } = t);
    ethAccount = crossChainTestHarness.ethAccount;
    l2Bridge = crossChainTestHarness.l2Bridge;
    ownerAddress = crossChainTestHarness.ownerAddress;
    version = Number(await rollup.getVersion());
  }, 300_000);

  afterAll(async () => {
    await t.teardown();
  });

  // Attempts to call exit_to_l1_public without granting an authwit to the bridge contract.
  // Asserts the simulation reverts with "unauthorized".
  it("Bridge can't withdraw my funds if I don't give approval", async () => {
    const mintAmountToOwner = 100n;
    await crossChainTestHarness.mintTokensPublicOnL2(mintAmountToOwner);

    const withdrawAmount = 9n;
    const authwitNonce = Fr.random();
    // Should fail as owner has not given approval to bridge burn their funds.
    await expect(
      l2Bridge.methods
        .exit_to_l1_public(ethAccount, withdrawAmount, EthAddress.ZERO, authwitNonce)
        .simulate({ from: user1Address }),
    ).rejects.toThrow(/unauthorized/);
  }, 180_000);

  // Sends a public deposit to the portal, then tries to claim with a wrong bridge amount, producing
  // a mismatched message hash. Asserts "No L1 to L2 message found" for the wrong hash.
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
      new L1Actor(crossChainTestHarness.tokenPortalAddress, crossChainTestHarness.l1Client.chain.id),
      new L2Actor(l2Bridge.address, version),
      wrongMessageContent,
      claim.claimSecretHash,
      new Fr(claim.messageLeafIndex),
    );

    // Sending wrong secret hashes should fail:
    await expect(
      l2Bridge.methods
        .claim_private(ownerAddress, wrongBridgeAmount, claim.claimSecret, claim.messageLeafIndex)
        .simulate({ from: user2Address }),
    ).rejects.toThrow(`No L1 to L2 message found for message hash ${wrongMessage.hash().toString()}`);
  }, 180_000);

  // Sends a private deposit to the portal, then tries to claim it publicly using claim_public.
  // The message hash does not match the public-mint selector, so consumption fails with NO_L1_TO_L2_MSG_ERROR.
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
      l2Bridge.methods
        .claim_public(ownerAddress, bridgeAmount, Fr.random(), claim.messageLeafIndex)
        .simulate({ from: ownerAddress }),
    ).rejects.toThrow(NO_L1_TO_L2_MSG_ERROR);
  });
});
