import {
  AccountWallet,
  AztecAddress,
  DebugLogger,
  EthAddress,
  Fr,
  PXE,
  TxStatus,
  computeAuthWitMessageHash,
  createDebugLogger,
  createPXEClient,
  sleep as delay,
  getSandboxAccountsWallets,
  waitForSandbox,
} from '@aztec/aztec.js';
import { UniswapPortalAbi, UniswapPortalBytecode } from '@aztec/l1-artifacts';
import { UniswapContract } from '@aztec/noir-contracts/types';

import { jest } from '@jest/globals';
import { createPublicClient, createWalletClient, getContract, http, parseEther } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { CrossChainTestHarness, deployL1Contract } from './utils.js';

const { PXE_URL = 'http://localhost:8080', ETHEREUM_HOST = 'http://localhost:8545' } = process.env;

export const MNEMONIC = 'test test test test test test test test test test test junk';
const hdAccount = mnemonicToAccount(MNEMONIC);

const EXPECTED_FORKED_BLOCK = 17514288;

const TIMEOUT = 90_000;
describe('uniswap_trade_on_l1_from_l2', () => {
  jest.setTimeout(TIMEOUT);
  const WETH9_ADDRESS: EthAddress = EthAddress.fromString('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
  const DAI_ADDRESS: EthAddress = EthAddress.fromString('0x6B175474E89094C44Da98b954EedeAC495271d0F');

  let pxe: PXE;
  let logger: DebugLogger;
  let walletClient: any;

  let ownerWallet: AccountWallet;
  let ownerAddress: AztecAddress;
  let ownerEthAddress: EthAddress;
  // does transactions on behalf of owner on Aztec:
  let sponsorWallet: AccountWallet;
  let sponsorAddress: AztecAddress;

  let daiCrossChainHarness: CrossChainTestHarness;
  let wethCrossChainHarness: CrossChainTestHarness;

  let uniswapPortal: any;
  let uniswapPortalAddress: EthAddress;
  let uniswapL2Contract: UniswapContract;

  const wethAmountToBridge = parseEther('1');
  const uniswapFeeTier = 3000n;
  const minimumOutputAmount = 0n;
  const deadlineForDepositingSwappedDai = BigInt(2 ** 32 - 1); // max uint32 - 1

  beforeAll(async () => {
    logger = createDebugLogger('aztec:canary');
    pxe = createPXEClient(PXE_URL);
    await waitForSandbox(pxe);

    walletClient = createWalletClient({
      account: hdAccount,
      chain: foundry,
      transport: http(ETHEREUM_HOST),
    });
    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(ETHEREUM_HOST),
    });

    if (Number(await publicClient.getBlockNumber()) < EXPECTED_FORKED_BLOCK) {
      throw new Error('This test must be run on a fork of mainnet with the expected fork block');
    }

    [ownerWallet, sponsorWallet] = await getSandboxAccountsWallets(pxe);
    ownerAddress = ownerWallet.getAddress();
    sponsorAddress = sponsorWallet.getAddress();
    ownerEthAddress = EthAddress.fromString((await walletClient.getAddresses())[0]);

    logger('Deploying DAI Portal, initializing and deploying l2 contract...');
    daiCrossChainHarness = await CrossChainTestHarness.new(
      pxe,
      publicClient,
      walletClient,
      ownerWallet,
      logger,
      DAI_ADDRESS,
    );

    logger('Deploying WETH Portal, initializing and deploying l2 contract...');
    wethCrossChainHarness = await CrossChainTestHarness.new(
      pxe,
      publicClient,
      walletClient,
      ownerWallet,
      logger,
      WETH9_ADDRESS,
    );

    logger('Deploy Uniswap portal on L1 and L2...');
    uniswapPortalAddress = await deployL1Contract(walletClient, publicClient, UniswapPortalAbi, UniswapPortalBytecode);
    uniswapPortal = getContract({
      address: uniswapPortalAddress.toString(),
      abi: UniswapPortalAbi,
      walletClient,
      publicClient,
    });
    // deploy l2 uniswap contract and attach to portal
    uniswapL2Contract = await UniswapContract.deploy(ownerWallet)
      .send({ portalContract: uniswapPortalAddress })
      .deployed();

    const registryAddress = (await pxe.getNodeInfo()).l1ContractAddresses.registryAddress;
    await uniswapPortal.write.initialize([registryAddress.toString(), uniswapL2Contract.address.toString()], {} as any);
  });

  beforeEach(async () => {
    // Give me some WETH so I can deposit to L2 and do the swap...
    logger('Getting some weth');
    await walletClient.sendTransaction({ to: WETH9_ADDRESS.toString(), value: parseEther('1') });
  });

  it('should uniswap trade on L1 from L2 funds privately (swaps WETH -> DAI)', async () => {
    const wethL1BeforeBalance = await wethCrossChainHarness.getL1BalanceOf(ownerEthAddress);

    // 1. Approve and deposit weth to the portal and move to L2
    const [secretForMintingWeth, secretHashForMintingWeth] = await wethCrossChainHarness.generateClaimSecret();
    const [secretForRedeemingWeth, secretHashForRedeemingWeth] = await wethCrossChainHarness.generateClaimSecret();

    const messageKey = await wethCrossChainHarness.sendTokensToPortalPrivate(
      wethAmountToBridge,
      secretHashForMintingWeth,
      secretHashForRedeemingWeth,
    );
    // funds transferred from owner to token portal
    expect(await wethCrossChainHarness.getL1BalanceOf(ownerEthAddress)).toBe(wethL1BeforeBalance - wethAmountToBridge);
    expect(await wethCrossChainHarness.getL1BalanceOf(wethCrossChainHarness.tokenPortalAddress)).toBe(
      wethAmountToBridge,
    );

    // Wait for the archiver to process the message
    await delay(5000);

    // Perform an unrelated transaction on L2 to progress the rollup. Here we mint public tokens.
    await wethCrossChainHarness.mintTokensPublicOnL2(0n);

    // 2. Claim WETH on L2
    logger('Minting weth on L2');
    await wethCrossChainHarness.consumeMessageOnAztecAndMintSecretly(
      wethAmountToBridge,
      secretHashForRedeemingWeth,
      messageKey,
      secretForMintingWeth,
    );
    await wethCrossChainHarness.redeemShieldPrivatelyOnL2(wethAmountToBridge, secretForRedeemingWeth);
    await wethCrossChainHarness.expectPrivateBalanceOnL2(ownerAddress, wethAmountToBridge);

    // Store balances
    const wethL2BalanceBeforeSwap = await wethCrossChainHarness.getL2PrivateBalanceOf(ownerAddress);
    const daiL2BalanceBeforeSwap = await daiCrossChainHarness.getL2PrivateBalanceOf(ownerAddress);

    // before swap - check nonce_for_burn_approval stored on uniswap
    // (which is used by uniswap to approve the bridge to burn funds on its behalf to exit to L1)
    const nonceForBurnApprovalBeforeSwap = await uniswapL2Contract.methods.nonce_for_burn_approval().view();

    // 3. Owner gives uniswap approval to unshield funds to self on its behalf
    logger('Approving uniswap to unshield funds to self on my behalf');
    const nonceForWETHUnshieldApproval = new Fr(1n);
    const unshieldToUniswapMessageHash = await computeAuthWitMessageHash(
      uniswapL2Contract.address,
      wethCrossChainHarness.l2Token.methods
        .unshield(ownerAddress, uniswapL2Contract.address, wethAmountToBridge, nonceForWETHUnshieldApproval)
        .request(),
    );
    await ownerWallet.createAuthWitness(Fr.fromBuffer(unshieldToUniswapMessageHash));

    // 4. Swap on L1 - sends L2 to L1 message to withdraw WETH to L1 and another message to swap assets.
    logger('Withdrawing weth to L1 and sending message to swap to dai');
    const [secretForDepositingSwappedDai, secretHashForDepositingSwappedDai] =
      await daiCrossChainHarness.generateClaimSecret();
    const [secretForRedeemingDai, secretHashForRedeemingDai] = await daiCrossChainHarness.generateClaimSecret();

    const withdrawReceipt = await uniswapL2Contract.methods
      .swap_private(
        wethCrossChainHarness.l2Token.address,
        wethCrossChainHarness.l2Bridge.address,
        wethAmountToBridge,
        daiCrossChainHarness.l2Bridge.address,
        nonceForWETHUnshieldApproval,
        uniswapFeeTier,
        minimumOutputAmount,
        secretHashForRedeemingDai,
        secretHashForDepositingSwappedDai,
        deadlineForDepositingSwappedDai,
        ownerEthAddress,
        ownerEthAddress,
      )
      .send()
      .wait();
    expect(withdrawReceipt.status).toBe(TxStatus.MINED);
    // ensure that user's funds were burnt
    await wethCrossChainHarness.expectPrivateBalanceOnL2(ownerAddress, wethL2BalanceBeforeSwap - wethAmountToBridge);
    // ensure that uniswap contract didn't eat the funds.
    await wethCrossChainHarness.expectPublicBalanceOnL2(uniswapL2Contract.address, 0n);
    // check burn approval nonce incremented:
    const nonceForBurnApprovalAfterSwap = await uniswapL2Contract.methods.nonce_for_burn_approval().view();
    expect(nonceForBurnApprovalAfterSwap).toBe(nonceForBurnApprovalBeforeSwap + 1n);

    // 5. Consume L2 to L1 message by calling uniswapPortal.swap_private()
    logger('Execute withdraw and swap on the uniswapPortal!');
    const daiL1BalanceOfPortalBeforeSwap = await daiCrossChainHarness.getL1BalanceOf(
      daiCrossChainHarness.tokenPortalAddress,
    );
    const swapArgs = [
      wethCrossChainHarness.tokenPortalAddress.toString(),
      wethAmountToBridge,
      uniswapFeeTier,
      daiCrossChainHarness.tokenPortalAddress.toString(),
      minimumOutputAmount,
      secretHashForRedeemingDai.toString(true),
      secretHashForDepositingSwappedDai.toString(true),
      deadlineForDepositingSwappedDai,
      ownerEthAddress.toString(),
      true,
    ] as const;
    const { result: depositDaiMessageKeyHex } = await uniswapPortal.simulate.swapPrivate(swapArgs, {
      account: ownerEthAddress.toString(),
    } as any);

    // this should also insert a message into the inbox.
    await uniswapPortal.write.swapPrivate(swapArgs, {} as any);
    const depositDaiMessageKey = Fr.fromString(depositDaiMessageKeyHex);

    // weth was swapped to dai and send to portal
    const daiL1BalanceOfPortalAfter = await daiCrossChainHarness.getL1BalanceOf(
      daiCrossChainHarness.tokenPortalAddress,
    );
    expect(daiL1BalanceOfPortalAfter).toBeGreaterThan(daiL1BalanceOfPortalBeforeSwap);
    const daiAmountToBridge = BigInt(daiL1BalanceOfPortalAfter - daiL1BalanceOfPortalBeforeSwap);

    // Wait for the archiver to process the message
    await delay(5000);
    // send a transfer tx to force through rollup with the message included
    await wethCrossChainHarness.mintTokensPublicOnL2(0n);

    // 6. claim dai on L2
    logger('Consuming messages to mint dai on L2');
    await daiCrossChainHarness.consumeMessageOnAztecAndMintSecretly(
      daiAmountToBridge,
      secretHashForRedeemingDai,
      depositDaiMessageKey,
      secretForDepositingSwappedDai,
    );
    await daiCrossChainHarness.redeemShieldPrivatelyOnL2(daiAmountToBridge, secretForRedeemingDai);
    await daiCrossChainHarness.expectPrivateBalanceOnL2(ownerAddress, daiL2BalanceBeforeSwap + daiAmountToBridge);

    const wethL2BalanceAfterSwap = await wethCrossChainHarness.getL2PrivateBalanceOf(ownerAddress);
    const daiL2BalanceAfterSwap = await daiCrossChainHarness.getL2PrivateBalanceOf(ownerAddress);

    logger('WETH balance before swap: ' + wethL2BalanceBeforeSwap.toString());
    logger('DAI balance before swap  : ' + daiL2BalanceBeforeSwap.toString());
    logger('***** 🧚‍♀️ SWAP L2 assets on L1 Uniswap 🧚‍♀️ *****');
    logger('WETH balance after swap : ', wethL2BalanceAfterSwap.toString());
    logger('DAI balance after swap  : ', daiL2BalanceAfterSwap.toString());
  });

  it('should uniswap trade on L1 from L2 funds publicly (swaps WETH -> DAI)', async () => {
    const wethL1BeforeBalance = await wethCrossChainHarness.getL1BalanceOf(ownerEthAddress);

    // 1. Approve and deposit weth to the portal and move to L2
    const [secretForMintingWeth, secretHashForMintingWeth] = await wethCrossChainHarness.generateClaimSecret();

    const messageKey = await wethCrossChainHarness.sendTokensToPortalPublic(
      wethAmountToBridge,
      secretHashForMintingWeth,
    );
    // funds transferred from owner to token portal
    expect(await wethCrossChainHarness.getL1BalanceOf(ownerEthAddress)).toBe(wethL1BeforeBalance - wethAmountToBridge);
    expect(await wethCrossChainHarness.getL1BalanceOf(wethCrossChainHarness.tokenPortalAddress)).toBe(
      wethAmountToBridge,
    );

    // Wait for the archiver to process the message
    await delay(5000);

    // Perform an unrelated transaction on L2 to progress the rollup. Here we transfer 0 tokens
    await wethCrossChainHarness.mintTokensPublicOnL2(0n);

    // 2. Claim WETH on L2
    logger('Minting weth on L2');
    await wethCrossChainHarness.consumeMessageOnAztecAndMintPublicly(
      wethAmountToBridge,
      messageKey,
      secretForMintingWeth,
    );
    await wethCrossChainHarness.expectPublicBalanceOnL2(ownerAddress, wethAmountToBridge);

    // Store balances
    const wethL2BalanceBeforeSwap = await wethCrossChainHarness.getL2PublicBalanceOf(ownerAddress);
    const daiL2BalanceBeforeSwap = await daiCrossChainHarness.getL2PublicBalanceOf(ownerAddress);

    // 3. Owner gives uniswap approval to transfer funds on its behalf
    const nonceForWETHTransferApproval = new Fr(1n);
    const transferMessageHash = await computeAuthWitMessageHash(
      uniswapL2Contract.address,
      wethCrossChainHarness.l2Token.methods
        .transfer_public(ownerAddress, uniswapL2Contract.address, wethAmountToBridge, nonceForWETHTransferApproval)
        .request(),
    );
    await ownerWallet.setPublicAuth(transferMessageHash, true).send().wait();

    // before swap - check nonce_for_burn_approval stored on uniswap
    // (which is used by uniswap to approve the bridge to burn funds on its behalf to exit to L1)
    const nonceForBurnApprovalBeforeSwap = await uniswapL2Contract.methods.nonce_for_burn_approval().view();

    // 4. Swap on L1 - sends L2 to L1 message to withdraw WETH to L1 and another message to swap assets.
    const [secretForDepositingSwappedDai, secretHashForDepositingSwappedDai] =
      await daiCrossChainHarness.generateClaimSecret();

    // 4.1 Owner approves user to swap on their behalf:
    const nonceForSwap = new Fr(3n);
    const action = uniswapL2Contract
      .withWallet(sponsorWallet)
      .methods.swap_public(
        ownerAddress,
        wethCrossChainHarness.l2Bridge.address,
        wethAmountToBridge,
        daiCrossChainHarness.l2Bridge.address,
        nonceForWETHTransferApproval,
        uniswapFeeTier,
        minimumOutputAmount,
        ownerAddress,
        secretHashForDepositingSwappedDai,
        deadlineForDepositingSwappedDai,
        ownerEthAddress,
        ownerEthAddress,
        nonceForSwap,
      );
    const swapMessageHash = await computeAuthWitMessageHash(sponsorAddress, action.request());
    await ownerWallet.setPublicAuth(swapMessageHash, true).send().wait();

    // 4.2 Call swap_public from user2 on behalf of owner
    const withdrawReceipt = await action.send().wait();
    expect(withdrawReceipt.status).toBe(TxStatus.MINED);

    // check weth balance of owner on L2 (we first bridged `wethAmountToBridge` into L2 and now withdrew it!)
    await wethCrossChainHarness.expectPublicBalanceOnL2(ownerAddress, wethL2BalanceBeforeSwap - wethAmountToBridge);

    // check burn approval nonce incremented:
    const nonceForBurnApprovalAfterSwap = await uniswapL2Contract.methods.nonce_for_burn_approval().view();
    expect(nonceForBurnApprovalAfterSwap).toBe(nonceForBurnApprovalBeforeSwap + 1n);

    // 5. Perform the swap on L1 with the `uniswapPortal.swap_private()` (consuming L2 to L1 messages)
    logger('Execute withdraw and swap on the uniswapPortal!');
    const daiL1BalanceOfPortalBeforeSwap = await daiCrossChainHarness.getL1BalanceOf(
      daiCrossChainHarness.tokenPortalAddress,
    );
    const swapArgs = [
      wethCrossChainHarness.tokenPortalAddress.toString(),
      wethAmountToBridge,
      uniswapFeeTier,
      daiCrossChainHarness.tokenPortalAddress.toString(),
      minimumOutputAmount,
      ownerAddress.toString(),
      secretHashForDepositingSwappedDai.toString(true),
      deadlineForDepositingSwappedDai,
      ownerEthAddress.toString(),
      true,
    ] as const;
    const { result: depositDaiMessageKeyHex } = await uniswapPortal.simulate.swapPublic(swapArgs, {
      account: ownerEthAddress.toString(),
    } as any);

    // this should also insert a message into the inbox.
    await uniswapPortal.write.swapPublic(swapArgs, {} as any);
    const depositDaiMessageKey = Fr.fromString(depositDaiMessageKeyHex);
    // weth was swapped to dai and send to portal
    const daiL1BalanceOfPortalAfter = await daiCrossChainHarness.getL1BalanceOf(
      daiCrossChainHarness.tokenPortalAddress,
    );
    expect(daiL1BalanceOfPortalAfter).toBeGreaterThan(daiL1BalanceOfPortalBeforeSwap);
    const daiAmountToBridge = BigInt(daiL1BalanceOfPortalAfter - daiL1BalanceOfPortalBeforeSwap);

    // Wait for the archiver to process the message
    await delay(5000);
    // send a transfer tx to force through rollup with the message included
    await wethCrossChainHarness.mintTokensPublicOnL2(0n);

    // 6. claim dai on L2
    logger('Consuming messages to mint dai on L2');
    await daiCrossChainHarness.consumeMessageOnAztecAndMintPublicly(
      daiAmountToBridge,
      depositDaiMessageKey,
      secretForDepositingSwappedDai,
    );
    await daiCrossChainHarness.expectPublicBalanceOnL2(ownerAddress, daiL2BalanceBeforeSwap + daiAmountToBridge);

    const wethL2BalanceAfterSwap = await wethCrossChainHarness.getL2PublicBalanceOf(ownerAddress);
    const daiL2BalanceAfterSwap = await daiCrossChainHarness.getL2PublicBalanceOf(ownerAddress);

    logger('WETH balance before swap: ', wethL2BalanceBeforeSwap.toString());
    logger('DAI balance before swap  : ', daiL2BalanceBeforeSwap.toString());
    logger('***** 🧚‍♀️ SWAP L2 assets on L1 Uniswap 🧚‍♀️ *****');
    logger('WETH balance after swap : ', wethL2BalanceAfterSwap.toString());
    logger('DAI balance after swap  : ', daiL2BalanceAfterSwap.toString());
  });
});
