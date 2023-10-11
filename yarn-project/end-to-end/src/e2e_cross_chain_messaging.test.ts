import { AccountWallet, AztecAddress, computeAuthWitMessageHash } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { DebugLogger } from '@aztec/foundation/log';
import { TokenBridgeContract, TokenContract } from '@aztec/noir-contracts/types';
import { TxStatus } from '@aztec/types';

import { CrossChainTestHarness } from './fixtures/cross_chain_test_harness.js';
import { delay, setup } from './fixtures/utils.js';

describe('e2e_cross_chain_messaging', () => {
  let logger: DebugLogger;
  let teardown: () => Promise<void>;

  let user1Wallet: AccountWallet;
  let user2Wallet: AccountWallet;
  let ethAccount: EthAddress;
  let ownerAddress: AztecAddress;

  let crossChainTestHarness: CrossChainTestHarness;
  let l2Token: TokenContract;
  let l2Bridge: TokenBridgeContract;
  let outbox: any;

  beforeEach(async () => {
    const { pxe, deployL1ContractsValues, wallets, logger: logger_, teardown: teardown_ } = await setup(2);

    crossChainTestHarness = await CrossChainTestHarness.new(
      pxe,
      deployL1ContractsValues.publicClient,
      deployL1ContractsValues.walletClient,
      wallets[0],
      logger_,
    );

    l2Token = crossChainTestHarness.l2Token;
    l2Bridge = crossChainTestHarness.l2Bridge;
    ethAccount = crossChainTestHarness.ethAccount;
    ownerAddress = crossChainTestHarness.ownerAddress;
    outbox = crossChainTestHarness.outbox;
    user1Wallet = wallets[0];
    user2Wallet = wallets[1];
    logger = logger_;
    teardown = teardown_;
    logger('Successfully deployed contracts and initialized portal');
  }, 100_000);

  afterEach(async () => {
    await teardown();
  });

  it('Milestone 2: Deposit funds from L1 -> L2 and withdraw back to L1', async () => {
    // Generate a claim secret using pedersen
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;

    const [secretForL2MessageConsumption, secretHashForL2MessageConsumption] =
      await crossChainTestHarness.generateClaimSecret();
    const [secretForRedeemingMintedNotes, secretHashForRedeemingMintedNotes] =
      await crossChainTestHarness.generateClaimSecret();

    // 1. Mint tokens on L1
    await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);

    // 2. Deposit tokens to the TokenPortal
    const messageKey = await crossChainTestHarness.sendTokensToPortalPrivate(
      bridgeAmount,
      secretHashForL2MessageConsumption,
      secretHashForRedeemingMintedNotes,
    );
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);

    // Wait for the archiver to process the message
    await delay(5000); /// waiting 5 seconds.

    // Perform an unrelated transaction on L2 to progress the rollup. Here we mint public tokens.
    const unrelatedMintAmount = 99n;
    await crossChainTestHarness.mintTokensPublicOnL2(unrelatedMintAmount);
    await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, unrelatedMintAmount);

    // 3. Consume L1-> L2 message and mint private tokens on L2
    await crossChainTestHarness.consumeMessageOnAztecAndMintSecretly(
      bridgeAmount,
      secretHashForRedeemingMintedNotes,
      messageKey,
      secretForL2MessageConsumption,
    );
    // tokens were minted privately in a TransparentNote which the owner (person who knows the secret) must redeem:
    await crossChainTestHarness.redeemShieldPrivatelyOnL2(bridgeAmount, secretForRedeemingMintedNotes);
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, bridgeAmount);

    // time to withdraw the funds again!
    logger('Withdrawing funds from L2');

    // 4. Give approval to bridge to burn owner's funds:
    const withdrawAmount = 9n;
    const nonce = Fr.random();
    const burnMessageHash = await computeAuthWitMessageHash(
      l2Bridge.address,
      l2Token.methods.burn(ownerAddress, withdrawAmount, nonce).request(),
    );
    await user1Wallet.createAuthWitness(burnMessageHash);

    // 5. Withdraw owner's funds from L2 to L1
    const entryKey = await crossChainTestHarness.checkEntryIsNotInOutbox(withdrawAmount);
    await crossChainTestHarness.withdrawPrivateFromAztecToL1(withdrawAmount, nonce);
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, bridgeAmount - withdrawAmount);

    // Check balance before and after exit.
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);
    await crossChainTestHarness.withdrawFundsFromBridgeOnL1(withdrawAmount, entryKey);
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount + withdrawAmount);

    expect(await outbox.read.contains([entryKey.toString(true)])).toBeFalsy();
  }, 120_000);

  // Unit tests for TokenBridge's private methods.
  it('Someone else can mint funds to me on my behalf (privately)', async () => {
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;
    const [secretForL2MessageConsumption, secretHashForL2MessageConsumption] =
      await crossChainTestHarness.generateClaimSecret();
    const [secretForRedeemingMintedNotes, secretHashForRedeemingMintedNotes] =
      await crossChainTestHarness.generateClaimSecret();

    await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);
    const messageKey = await crossChainTestHarness.sendTokensToPortalPrivate(
      bridgeAmount,
      secretHashForL2MessageConsumption,
      secretHashForRedeemingMintedNotes,
    );
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(l1TokenBalance - bridgeAmount);

    // Wait for the archiver to process the message
    await delay(5000); /// waiting 5 seconds.

    // Perform an unrelated transaction on L2 to progress the rollup. Here we mint public tokens.
    const unrelatedMintAmount = 99n;
    await crossChainTestHarness.mintTokensPublicOnL2(unrelatedMintAmount);
    await crossChainTestHarness.expectPublicBalanceOnL2(ownerAddress, unrelatedMintAmount);

    // 3. Consume L1-> L2 message and mint private tokens on L2

    // Sending wrong secret hashes should fail:
    await expect(
      l2Bridge
        .withWallet(user2Wallet)
        .methods.claim_private(
          bridgeAmount,
          secretHashForL2MessageConsumption,
          ethAccount,
          messageKey,
          secretForL2MessageConsumption,
        )
        .simulate(),
    ).rejects.toThrowError("Cannot satisfy constraint 'l1_to_l2_message_data.message.content == content");

    // send the right one -
    const consumptionTx = l2Bridge
      .withWallet(user2Wallet)
      .methods.claim_private(
        bridgeAmount,
        secretHashForRedeemingMintedNotes,
        ethAccount,
        messageKey,
        secretForL2MessageConsumption,
      )
      .send();
    const consumptionReceipt = await consumptionTx.wait();
    expect(consumptionReceipt.status).toBe(TxStatus.MINED);

    // Now user1 can claim the notes that user2 minted on their behalf.
    await crossChainTestHarness.addPendingShieldNoteToPXE(
      bridgeAmount,
      secretHashForRedeemingMintedNotes,
      consumptionReceipt.txHash,
    );
    await crossChainTestHarness.redeemShieldPrivatelyOnL2(bridgeAmount, secretForRedeemingMintedNotes);
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, bridgeAmount);
  }, 50_000);

  it("Bridge can't withdraw my funds if I don't give approval", async () => {
    const mintAmountToUser1 = 100n;
    await crossChainTestHarness.mintTokensPublicOnL2(mintAmountToUser1);

    const withdrawAmount = 9n;
    const nonce = Fr.random();
    const expectedBurnMessageHash = await computeAuthWitMessageHash(
      l2Bridge.address,
      l2Token.methods.burn(user1Wallet.getAddress(), withdrawAmount, nonce).request(),
    );
    // Should fail as owner has not given approval to bridge burn their funds.
    await expect(
      l2Bridge
        .withWallet(user1Wallet)
        .methods.exit_to_l1_private(ethAccount, l2Token.address, withdrawAmount, EthAddress.ZERO, nonce)
        .simulate(),
    ).rejects.toThrowError(`Unknown auth witness for message hash 0x${expectedBurnMessageHash.toString('hex')}`);
  });

  it("Can't claim funds publicly if they were deposited privately", async () => {
    // 1. Mint tokens on L1
    const bridgeAmount = 100n;
    await crossChainTestHarness.mintTokensOnL1(bridgeAmount);

    // 2. Deposit tokens to the TokenPortal privately
    const [secretForL2MessageConsumption, secretHashForL2MessageConsumption] =
      await crossChainTestHarness.generateClaimSecret();

    const messageKey = await crossChainTestHarness.sendTokensToPortalPrivate(
      bridgeAmount,
      secretHashForL2MessageConsumption,
      Fr.random(),
    );
    expect(await crossChainTestHarness.getL1BalanceOf(ethAccount)).toBe(0n);

    // Wait for the archiver to process the message
    await delay(5000); /// waiting 5 seconds.

    // Perform an unrelated transaction on L2 to progress the rollup. Here we mint public tokens.
    await crossChainTestHarness.mintTokensPublicOnL2(0n);

    // 3. Consume L1-> L2 message and try to mint publicly on L2  - should fail
    await expect(
      l2Bridge
        .withWallet(user2Wallet)
        .methods.claim_public(ownerAddress, bridgeAmount, ethAccount, messageKey, secretForL2MessageConsumption)
        .simulate(),
    ).rejects.toThrowError(
      "Failed to solve brillig function, reason: explicit trap hit in brillig 'l1_to_l2_message_data.message.content == content'",
    );
  });
});
