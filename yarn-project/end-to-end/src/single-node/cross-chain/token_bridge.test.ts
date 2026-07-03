import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { L1Actor, L1ToL2Message, L2Actor } from '@aztec/aztec.js/messaging';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';

import { jest } from '@jest/globals';
import { toFunctionSelector } from 'viem';

import {
  L1_DIRECT_WRITE_ACCOUNT_INDEX,
  NO_L1_TO_L2_MSG_ERROR,
  PIPELINING_SETUP_OPTS,
} from '../../fixtures/fixtures.js';
import { waitForL2ToL1Witness } from '../../fixtures/wait_helpers.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

// TokenBridge L1<->L2 round trips (private + public deposits/withdrawals) and their failure cases,
// merged onto a single CrossChainMessagingTest harness with startProverNode=true (prod sequencer,
// pipelining preset: ethSlot=4s, aztecSlot=12s), a fake in-proc prover node, and CrossChainTestHarness
// for the full portal/bridge lifecycle. Epoch proving via advanceToEpochProven is required before L1
// Outbox consumption. All its share one node, so balance assertions are expressed as deltas over the
// balance captured at the start of each it rather than absolute amounts.
describe('single-node/cross-chain/token_bridge', () => {
  // Pipelining slows wall-clock chain progress (12s slots); waitForProven via advanceToEpochProven
  // needs more than the default 300s per-test budget.
  jest.setTimeout(15 * 60 * 1000);

  let t: CrossChainMessagingTest;

  let version = 1;

  beforeAll(async () => {
    t = new CrossChainMessagingTest(
      'token_bridge',
      { startProverNode: true },
      {},
      {},
      { l1HarnessAccountIndex: L1_DIRECT_WRITE_ACCOUNT_INDEX },
    );
    await t.setup({ ...PIPELINING_SETUP_OPTS });
    version = Number(await t.rollup.getVersion());
  }, 300_000);

  afterAll(async () => {
    await t.teardown();
  });

  describe('private', () => {
    // Full round-trip: mint tokens on L1, deposit privately via TokenPortal, wait for the message to be
    // consumable, claim on L2 (minting private tokens), withdraw back to L1 with an authwit, advance the
    // epoch until proven, then consume the Outbox message on L1 and verify the L1 balance is restored.
    it('Privately deposit funds from L1 -> L2 and withdraw back to L1', async () => {
      const { crossChainTestHarness, ethAccount, aztecNode, logger, ownerAddress, l2Bridge, l2Token, wallet } = t;
      const l1TokenBalance = 1000000n;
      const bridgeAmount = 100n;

      const initialL1Balance = await crossChainTestHarness.getL1BalanceOf(ethAccount);
      const initialPrivateBalance = await crossChainTestHarness.getL2PrivateBalanceOf(ownerAddress);

      // 1. Mint tokens on L1
      await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);

      // 2. Deposit tokens to the TokenPortal
      const claim = await crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(
        initialL1Balance + l1TokenBalance - bridgeAmount,
      );

      await crossChainTestHarness.makeMessageConsumable(claim.messageHash);

      // 3. Consume L1 -> L2 message and mint private tokens on L2
      await crossChainTestHarness.consumeMessageOnAztecAndMintPrivately(claim);
      await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, initialPrivateBalance + bridgeAmount);

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
      await crossChainTestHarness.expectPrivateBalanceOnL2(
        ownerAddress,
        initialPrivateBalance + bridgeAmount - withdrawAmount,
      );

      // Advance the epoch until the tx is proven since the messages are inserted to the outbox when the epoch is proven.
      await t.advanceToEpochProven(l2TxReceipt);

      const l2ToL1MessageResult = await waitForL2ToL1Witness(aztecNode, l2TxReceipt.txHash, l2ToL1Message, {
        timeout: 60,
      });

      // Check balance before and after exit.
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(
        initialL1Balance + l1TokenBalance - bridgeAmount,
      );
      await crossChainTestHarness.withdrawFundsFromBridgeOnL1(
        withdrawAmount,
        l2ToL1MessageResult.epochNumber,
        l2ToL1MessageResult.numCheckpointsInEpoch,
        l2ToL1MessageResult.leafIndex,
        l2ToL1MessageResult.siblingPath,
      );
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(
        initialL1Balance + l1TokenBalance - bridgeAmount + withdrawAmount,
      );
    });

    // This test checks that it's enough to have the claim secret to claim the funds to whoever we want.
    // User2 (not the original depositor) uses the claim secret to call claim_private on behalf of owner.
    // Asserts the funds land at ownerAddress (not user2), proving the secret-based authorization works.
    it('Claim secret is enough to consume the message', async () => {
      const { crossChainTestHarness, ethAccount, ownerAddress, l2Bridge, user2Address } = t;
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

  describe('public', () => {
    // Full round-trip: mint on L1, publicly deposit via TokenPortal, wait for message, claim_public on
    // L2, authorize bridge to burn, withdraw to L1, advance to epoch proven, consume Outbox on L1.
    // Asserts L1 balance is restored after the round-trip.
    it('Publicly deposit funds from L1 -> L2 and withdraw back to L1', async () => {
      const { crossChainTestHarness, ethAccount, aztecNode, logger, ownerAddress, l2Bridge, l2Token, wallet } = t;
      const l1TokenBalance = 1000000n;
      const bridgeAmount = 100n;

      const initialL1Balance = await crossChainTestHarness.getL1BalanceOf(ethAccount);
      const initialPublicBalance = await crossChainTestHarness.getL2PublicBalanceOf(ownerAddress);

      // 1. Mint tokens on L1
      logger.verbose(`1. Mint tokens on L1`);
      await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);

      // 2. Deposit tokens to the TokenPortal
      logger.verbose(`2. Deposit tokens to the TokenPortal`);
      const claim = await crossChainTestHarness.sendTokensToPortalPublic(bridgeAmount);
      const msgHash = Fr.fromHexString(claim.messageHash);
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(
        initialL1Balance + l1TokenBalance - bridgeAmount,
      );

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
      await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, initialPublicBalance + bridgeAmount);

      // Time to withdraw the funds again!
      logger.info('Withdrawing funds from L2');

      // 4. Give approval to bridge to burn owner's funds:
      const withdrawAmount = 9n;
      const authwitNonce = Fr.random();
      const validateActionInteraction = await wallet.setPublicAuthWit(
        ownerAddress,
        {
          caller: l2Bridge.address,
          action: l2Token.methods.burn_public(ownerAddress, withdrawAmount, authwitNonce),
        },
        true,
      );
      await validateActionInteraction.send();

      // 5. Withdraw owner's funds from L2 to L1
      logger.verbose('5. Withdraw owner funds from L2 to L1');
      const l2ToL1Message = await crossChainTestHarness.getL2ToL1MessageLeaf(withdrawAmount);
      const l2TxReceipt = await crossChainTestHarness.withdrawPublicFromAztecToL1(withdrawAmount, authwitNonce);
      await crossChainTestHarness.expectPublicBalanceOnL2(
        ownerAddress,
        initialPublicBalance + bridgeAmount - withdrawAmount,
      );

      // Advance the epoch until the tx is proven since the messages are inserted to the outbox when the epoch is proven.
      await t.advanceToEpochProven(l2TxReceipt);

      const l2ToL1MessageResult = await waitForL2ToL1Witness(aztecNode, l2TxReceipt.txHash, l2ToL1Message, {
        timeout: 60,
      });

      // Check balance before and after exit.
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(
        initialL1Balance + l1TokenBalance - bridgeAmount,
      );
      await crossChainTestHarness.withdrawFundsFromBridgeOnL1(
        withdrawAmount,
        l2ToL1MessageResult.epochNumber,
        l2ToL1MessageResult.numCheckpointsInEpoch,
        l2ToL1MessageResult.leafIndex,
        l2ToL1MessageResult.siblingPath,
      );
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(
        initialL1Balance + l1TokenBalance - bridgeAmount + withdrawAmount,
      );
    }, 900_000);

    // User2 tries to claim to their own address (fails), then correctly claims to ownerAddress.
    // Asserts only ownerAddress receives the tokens, user2 gets nothing, and the message is consumed.
    it('Someone else can mint funds to me on my behalf (publicly)', async () => {
      const { crossChainTestHarness, ethAccount, aztecNode, logger, ownerAddress, l2Bridge, user2Address } = t;
      const l1TokenBalance = 1000000n;
      const bridgeAmount = 100n;

      const initialL1Balance = await crossChainTestHarness.getL1BalanceOf(ethAccount);
      const initialOwnerPublicBalance = await crossChainTestHarness.getL2PublicBalanceOf(ownerAddress);

      await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);
      const claim = await crossChainTestHarness.sendTokensToPortalPublic(bridgeAmount);
      const msgHash = Fr.fromHexString(claim.messageHash);
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(
        initialL1Balance + l1TokenBalance - bridgeAmount,
      );

      await crossChainTestHarness.makeMessageConsumable(msgHash);

      // Check message leaf index matches
      const maybeIndexAndPath = await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash);
      expect(maybeIndexAndPath).toBeDefined();
      const messageLeafIndex = maybeIndexAndPath![0];
      expect(messageLeafIndex).toEqual(claim.messageLeafIndex);

      // user2 tries to consume this message and minting to itself -> should fail since the message is intended to be consumed only by owner.
      await expect(
        l2Bridge.methods
          .claim_public(user2Address, bridgeAmount, claim.claimSecret, messageLeafIndex)
          .simulate({ from: user2Address }),
      ).rejects.toThrow(NO_L1_TO_L2_MSG_ERROR);

      // user2 consumes owner's L1-> L2 message on bridge contract and mints public tokens on L2
      logger.info("user2 consumes owner's message on L2 Publicly");
      await l2Bridge.methods
        .claim_public(ownerAddress, bridgeAmount, claim.claimSecret, messageLeafIndex)
        .send({ from: user2Address });

      // ensure funds are gone to owner and not user2.
      await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, initialOwnerPublicBalance + bridgeAmount);
      await crossChainTestHarness.expectPublicBalanceOnL2(user2Address, 0n);
    }, 90_000);
  });

  describe('failure cases', () => {
    // Attempts to call exit_to_l1_public without granting an authwit to the bridge contract.
    // Asserts the simulation reverts with "unauthorized".
    it("Bridge can't withdraw my funds if I don't give approval", async () => {
      const { crossChainTestHarness, ethAccount, l2Bridge, user1Address } = t;
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
      const { crossChainTestHarness, ethAccount, l2Bridge, ownerAddress, user2Address } = t;
      const bridgeAmount = 100n;

      const initialL1Balance = await crossChainTestHarness.getL1BalanceOf(ethAccount);
      await crossChainTestHarness.mintTokensOnL1(bridgeAmount);
      const claim = await crossChainTestHarness.sendTokensToPortalPublic(bridgeAmount);
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(initialL1Balance);

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
      const { crossChainTestHarness, ethAccount, l2Bridge, ownerAddress } = t;
      // 1. Mint tokens on L1
      const bridgeAmount = 100n;
      const initialL1Balance = await crossChainTestHarness.getL1BalanceOf(ethAccount);
      await crossChainTestHarness.mintTokensOnL1(bridgeAmount);

      // 2. Deposit tokens to the TokenPortal privately
      const claim = await crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
      expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(initialL1Balance);

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
});
