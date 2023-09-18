import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AccountWallet, AztecAddress } from '@aztec/aztec.js';
import { Fr, FunctionSelector } from '@aztec/circuits.js';
import { EthAddress } from '@aztec/foundation/eth-address';
import { DebugLogger } from '@aztec/foundation/log';
import { TokenBridgeContract, TokenContract } from '@aztec/noir-contracts/types';
import { AztecRPC } from '@aztec/types';

import { CrossChainTestHarness } from './fixtures/cross_chain_test_harness.js';
import { delay, hashPayload, setup } from './fixtures/utils.js';

describe('e2e_cross_chain_messaging', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPC;
  let logger: DebugLogger;

  let wallet: AccountWallet;
  let ethAccount: EthAddress;
  let ownerAddress: AztecAddress;

  let crossChainTestHarness: CrossChainTestHarness;
  let l2Token: TokenContract;
  let l2Bridge: TokenBridgeContract;
  let outbox: any;

  beforeEach(async () => {
    const {
      aztecNode,
      aztecRpcServer: aztecRpcServer_,
      deployL1ContractsValues,
      accounts,
      wallet: wallet_,
      logger: logger_,
      cheatCodes,
    } = await setup(2);
    crossChainTestHarness = await CrossChainTestHarness.new(
      aztecNode,
      aztecRpcServer_,
      deployL1ContractsValues,
      accounts,
      wallet_,
      logger_,
      cheatCodes,
    );

    l2Token = crossChainTestHarness.l2Token;
    l2Bridge = crossChainTestHarness.l2Bridge;
    ethAccount = crossChainTestHarness.ethAccount;
    ownerAddress = crossChainTestHarness.ownerAddress;
    outbox = crossChainTestHarness.outbox;
    aztecRpcServer = crossChainTestHarness.aztecRpcServer;
    wallet = wallet_;
    logger = logger_;
    logger('Successfully deployed contracts and initialized portal');
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
    await crossChainTestHarness?.stop();
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
      messageKey,
      secretForL2MessageConsumption,
      secretHashForRedeemingMintedNotes,
    );
    // tokens were minted privately in a TransparentNote which the owner (person who knows the secret) must redeem:
    await crossChainTestHarness.redeemShieldPrivatelyOnL2(bridgeAmount, secretForRedeemingMintedNotes);
    await crossChainTestHarness.expectPrivateBalanceOnL2(ownerAddress, bridgeAmount);

    // time to withdraw the funds again!
    logger('Withdrawing funds from L2');

    // 4. Give approval to bridge to burn owner's funds:
    const withdrawAmount = 9n;
    const nonce = Fr.random();
    const burnMessageHash = await hashPayload([
      l2Bridge.address.toField(),
      l2Token.address.toField(),
      FunctionSelector.fromSignature('burn((Field),Field,Field)').toField(),
      ownerAddress.toField(),
      new Fr(withdrawAmount),
      nonce,
    ]);
    await wallet.createAuthWitness(burnMessageHash);

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

  // TODO: Failure cases!
});
