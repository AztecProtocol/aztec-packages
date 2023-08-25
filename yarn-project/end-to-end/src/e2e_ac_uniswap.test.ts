import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AztecAddress, CheatCodes, Fr, Wallet, computeMessageSecretHash } from '@aztec/aztec.js';
import { DeployL1Contracts, deployL1Contract } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { DebugLogger } from '@aztec/foundation/log';
import { UniswapPortalAbi, UniswapPortalBytecode } from '@aztec/l1-artifacts';
import { AcUniswapContract } from '@aztec/noir-contracts/types';
import { AztecRPC, CompleteAddress, TxStatus } from '@aztec/types';

import { getContract, parseEther } from 'viem';

import { CrossChainTestHarness } from './fixtures/cross_chain_test_harness.js';
import { delay, deployAndInitializeNonNativeL2TokenContracts, setup } from './fixtures/utils.js';

// PSA: This tests works on forked mainnet. There is a dump of the data in `dumpedState` such that we
// don't need to burn through RPC requests.
// To generate a new dump, use the `dumpChainState` cheatcode.
// To start an actual fork, use the command:
// anvil --fork-url https://mainnet.infura.io/v3/9928b52099854248b3a096be07a6b23c --fork-block-number 17514288 --chain-id 31337
// For CI, this is configured in `run_tests.sh` and `docker-compose.yml`

const dumpedState = 'src/fixtures/dumps/uniswap_state';
// When taking a dump use the block number of the fork to improve speed.
const EXPECTED_FORKED_BLOCK = 0; //17514288;
// We tell the archiver to only sync from this block.
process.env.SEARCH_START_BLOCK = EXPECTED_FORKED_BLOCK.toString();

// Should mint WETH on L2, swap to DAI using L1 Uniswap and mint this DAI back on L2
describe('uniswap_trade_on_l1_from_l2', () => {
  const WETH9_ADDRESS: EthAddress = EthAddress.fromString('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
  const DAI_ADDRESS: EthAddress = EthAddress.fromString('0x6B175474E89094C44Da98b954EedeAC495271d0F');

  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: Wallet;
  let accounts: CompleteAddress[];
  let logger: DebugLogger;
  let cheatCodes: CheatCodes;

  let ethAccount: EthAddress;
  let user1: AztecAddress;
  let user2: AztecAddress;
  const initialBalance = parseEther('1');
  const wethAmountToBridge = parseEther('1');
  const transferValue = wethAmountToBridge / 2n;
  const depositAmount = transferValue / 2n;

  let daiCrossChainHarness: CrossChainTestHarness;
  let wethCrossChainHarness: CrossChainTestHarness;

  let uniswapPortal: any;
  let uniswapPortalAddress: EthAddress;
  let uniswapL2Contract: AcUniswapContract;

  let walletClient: any;

  const secrets = {
    user1: new Fr(6),
    user2: new Fr(7),
  };
  let swapOutputAmount = 0n;

  beforeAll(async () => {
    let deployL1ContractsValues: DeployL1Contracts;
    ({ aztecNode, aztecRpcServer, deployL1ContractsValues, accounts, logger, wallet, cheatCodes } = await setup(
      2,
      dumpedState,
    ));

    walletClient = deployL1ContractsValues.walletClient;
    const publicClient = deployL1ContractsValues.publicClient;

    if (Number(await publicClient.getBlockNumber()) < EXPECTED_FORKED_BLOCK) {
      throw new Error('This test must be run on a fork of mainnet with the expected fork block');
    }

    ethAccount = EthAddress.fromString((await walletClient.getAddresses())[0]);
    user1 = accounts[0].address;
    const ownerPublicKey = accounts[0].publicKey;
    user2 = accounts[1].address;

    logger('Deploying DAI Portal, initializing and deploying l2 contract...');
    const daiContracts = await deployAndInitializeNonNativeL2TokenContracts(
      wallet,
      walletClient,
      publicClient,
      deployL1ContractsValues!.registryAddress,
      0n,
      user1,
      DAI_ADDRESS,
    );
    daiCrossChainHarness = new CrossChainTestHarness(
      aztecNode,
      aztecRpcServer,
      cheatCodes,
      accounts,
      logger,
      daiContracts.l2Contract,
      ethAccount,
      daiContracts.tokenPortalAddress,
      daiContracts.tokenPortal,
      daiContracts.underlyingERC20,
      null,
      publicClient,
      walletClient,
      user1,
      user2,
      ownerPublicKey,
    );

    logger('Deploying WETH Portal, initializing and deploying l2 contract...');
    const wethContracts = await deployAndInitializeNonNativeL2TokenContracts(
      wallet,
      walletClient,
      publicClient,
      deployL1ContractsValues!.registryAddress,
      initialBalance,
      user1,
      WETH9_ADDRESS,
    );
    wethCrossChainHarness = new CrossChainTestHarness(
      aztecNode,
      aztecRpcServer,
      cheatCodes,
      accounts,
      logger,
      wethContracts.l2Contract,
      ethAccount,
      wethContracts.tokenPortalAddress,
      wethContracts.tokenPortal,
      wethContracts.underlyingERC20,
      null,
      publicClient,
      walletClient,
      user1,
      user2,
      ownerPublicKey,
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
    const tx = AcUniswapContract.deploy(wallet).send({ portalContract: uniswapPortalAddress });
    const receipt = await tx.wait();
    expect(receipt.status).toEqual(TxStatus.MINED);
    uniswapL2Contract = await AcUniswapContract.at(receipt.contractAddress!, wallet);
    await uniswapL2Contract.attach(uniswapPortalAddress);

    await uniswapPortal.write.initialize(
      [deployL1ContractsValues!.registryAddress.toString(), uniswapL2Contract.address.toString()],
      {} as any,
    );
  }, 100_000);

  afterAll(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
    await wethCrossChainHarness.stop();
    await daiCrossChainHarness.stop();
  });

  it('Fund accounts on L2', async () => {
    // Give me some WETH so I can deposit to L2 and do the swap...
    logger('Getting some weth');
    await walletClient.sendTransaction({
      to: WETH9_ADDRESS.toString(),
      value: wethAmountToBridge * 10n,
      from: ethAccount.toString(),
    });

    const meBeforeBalance = await wethCrossChainHarness.getL1BalanceOf(ethAccount);

    // 1. Approve and deposit weth to the portal and move to L2
    const [secret, secretHash] = await wethCrossChainHarness.generateClaimSecret();
    const messageKey = await wethCrossChainHarness.sendTokensToPortal(wethAmountToBridge, secretHash);
    expect(await wethCrossChainHarness.getL1BalanceOf(ethAccount)).toBe(meBeforeBalance - wethAmountToBridge);

    // Wait for the archiver to process the message
    await delay(5000);

    // send a transfer tx to force through rollup with the message included
    await wethCrossChainHarness.performL2Transfer(0n);

    // 2. Claim WETH on L2
    logger('Minting weth on L2');
    await wethCrossChainHarness.consumeMessageOnAztecAndMintSecretly(wethAmountToBridge, messageKey, secret);
    await wethCrossChainHarness.expectBalanceOnL2(user1, wethAmountToBridge + initialBalance);

    // 3. Fund account 2
    await wethCrossChainHarness.performL2Transfer(transferValue);
    await wethCrossChainHarness.expectBalanceOnL2(user1, wethAmountToBridge + initialBalance - transferValue);
    await wethCrossChainHarness.expectBalanceOnL2(user2, transferValue);
  }, 100_000);

  it('user 1 deposit into aggregate swap', async () => {
    const userBalanceBefore = await wethCrossChainHarness.getL2BalanceOf(user1);
    const contractBalanceBefore = await wethCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(userBalanceBefore).toEqual(wethAmountToBridge + initialBalance - transferValue);
    expect(contractBalanceBefore).toEqual(0n);

    const depositTx = uniswapL2Contract.methods
      .participate_in_swap(
        wethCrossChainHarness.l2Contract.address,
        depositAmount,
        daiCrossChainHarness.l2Contract.address,
        secrets['user1'],
      )
      .send({ origin: user1 });
    const receipt = await depositTx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);

    const userBalanceAfter = await wethCrossChainHarness.getL2BalanceOf(user1);
    const contractBalanceAfter = await wethCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(userBalanceAfter).toEqual(wethAmountToBridge + initialBalance - transferValue - depositAmount);
    expect(contractBalanceAfter).toEqual(depositAmount);
    const swap = await uniswapL2Contract.methods
      .get_swap(wethCrossChainHarness.l2Contract.address, daiCrossChainHarness.l2Contract.address, 1)
      .view();
    expect(swap['input_amount']).toEqual(depositAmount);
    expect(swap['output_amount']).toEqual(0n);
    expect(swap['is_pending']).toEqual(true);
    const noteExists = await uniswapL2Contract.methods
      .note_exists(
        wethCrossChainHarness.l2Contract.address,
        depositAmount,
        daiCrossChainHarness.l2Contract.address,
        1,
        await computeMessageSecretHash(secrets['user1']),
      )
      .view();
    expect(noteExists).toEqual(true);
  }, 100_000);

  it('user 2 deposit into aggregate swap', async () => {
    const userBalanceBefore = await wethCrossChainHarness.getL2BalanceOf(user2);
    const contractBalanceBefore = await wethCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(userBalanceBefore).toEqual(transferValue);
    expect(contractBalanceBefore).toEqual(depositAmount);

    const depositTx = uniswapL2Contract.methods
      .participate_in_swap(
        wethCrossChainHarness.l2Contract.address.toField(),
        depositAmount,
        daiCrossChainHarness.l2Contract.address.toField(),
        secrets['user2'],
      )
      .send({ origin: user2 });
    const receipt = await depositTx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);

    const userBalanceAfter = await wethCrossChainHarness.getL2BalanceOf(user2);
    const contractBalanceAfter = await wethCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(userBalanceAfter).toEqual(transferValue - depositAmount);
    expect(contractBalanceAfter).toEqual(depositAmount * 2n);
    const swap = await uniswapL2Contract.methods
      .get_swap(wethCrossChainHarness.l2Contract.address, daiCrossChainHarness.l2Contract.address, 1)
      .view();
    expect(swap['input_amount']).toEqual(depositAmount * 2n);
    expect(swap['output_amount']).toEqual(0n);
    expect(swap['is_pending']).toEqual(true);
    const noteExists = await uniswapL2Contract.methods
      .note_exists(
        wethCrossChainHarness.l2Contract.address,
        depositAmount,
        daiCrossChainHarness.l2Contract.address,
        1,
        await computeMessageSecretHash(secrets['user2']),
      )
      .view();
    expect(noteExists).toEqual(true);
  }, 100_000);

  let timestamp: bigint = 0n;

  it('initiate the swap from L2', async () => {
    const wethContractBalanceBefore = await wethCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);
    const daiContractBalanceBefore = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(wethContractBalanceBefore).toEqual(depositAmount * 2n);
    expect(daiContractBalanceBefore).toEqual(0n);

    const swapTx = uniswapL2Contract.methods
      .swap(wethCrossChainHarness.l2Contract.address.toField(), daiCrossChainHarness.l2Contract.address.toField(), 1)
      .send({ origin: user1 });
    const receipt = await swapTx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);

    const block = await aztecNode?.getBlock(receipt.blockNumber!);
    if (!block) throw new Error('Block not found');
    timestamp = block?.globalVariables.timestamp.value;

    const wethContractBalanceAfter = await wethCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);
    const daiContractBalanceAfter = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(wethContractBalanceAfter).toEqual(0n);
    expect(daiContractBalanceAfter).toEqual(0n);
    const swap = await uniswapL2Contract.methods
      .get_swap(wethCrossChainHarness.l2Contract.address, daiCrossChainHarness.l2Contract.address, 1)
      .view();
    expect(swap['input_amount']).toEqual(depositAmount * 2n);
    expect(swap['output_amount']).toEqual(0n);
    expect(swap['is_pending']).toEqual(false);
  }, 100_000);

  it('perform the swap on L1 and finalise', async () => {
    const wethContractBalanceBefore = await wethCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);
    const daiContractBalanceBefore = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(wethContractBalanceBefore).toEqual(0n);
    expect(daiContractBalanceBefore).toEqual(0n);

    const secretHash = await computeMessageSecretHash(new Fr(1));
    const deadline = timestamp + 86400n;
    const aztecRecipient = uniswapL2Contract.address.toString();
    const canceller = uniswapPortalAddress.toString();
    const amount = depositAmount * 2n;

    const daiBalanceOfPortalBefore = await daiCrossChainHarness.getL1BalanceOf(daiCrossChainHarness.tokenPortalAddress);
    const swapArgs = [
      wethCrossChainHarness.tokenPortalAddress.toString(),
      amount,
      3000,
      daiCrossChainHarness.tokenPortalAddress.toString(),
      0n,
      aztecRecipient,
      secretHash.toString(true),
      deadline,
      canceller,
      false,
    ] as const;
    const { result: depositDaiMessageKeyHex } = await uniswapPortal.simulate.swap(swapArgs, {
      account: ethAccount.toString(),
    } as any);
    await uniswapPortal.write.swap(swapArgs, {} as any);

    const daiBalanceOfPortalAfter = await daiCrossChainHarness.getL1BalanceOf(daiCrossChainHarness.tokenPortalAddress);

    const depositDaiMessageKey = Fr.fromString(depositDaiMessageKeyHex);
    swapOutputAmount = daiBalanceOfPortalAfter - daiBalanceOfPortalBefore;

    {
      // Wait for the archiver to process the message
      await delay(5000);
      // send a transfer tx to force through rollup with the message included
      await wethCrossChainHarness.performL2Transfer(0n);
      logger('Sending a tx to progress the state');
    }

    const finaliseTx = uniswapL2Contract.methods
      .finalise_swap(
        wethCrossChainHarness.l2Contract.address,
        daiCrossChainHarness.l2Contract.address,
        1,
        swapOutputAmount,
        depositDaiMessageKey,
      )
      .send({ origin: user1 });
    const receipt = await finaliseTx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);

    const wethContractBalanceAfter = await wethCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);
    const daiContractBalanceAfter = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(wethContractBalanceAfter).toEqual(0n);
    expect(daiContractBalanceAfter).toEqual(swapOutputAmount);

    const swap = await uniswapL2Contract.methods
      .get_swap(wethCrossChainHarness.l2Contract.address, daiCrossChainHarness.l2Contract.address, 1)
      .view();
    expect(swap['input_amount']).toEqual(depositAmount * 2n);
    expect(swap['output_amount']).toEqual(swapOutputAmount);
    expect(swap['is_pending']).toEqual(false);
  }, 100_000);

  it('user 1 claims their share of the dai', async () => {
    const userBalanceBefore = await daiCrossChainHarness.getL2BalanceOf(user1);
    const contractBalanceBefore = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(userBalanceBefore).toEqual(0n);
    expect(contractBalanceBefore).toEqual(swapOutputAmount);

    const claimTx = uniswapL2Contract.methods
      .claim(
        wethCrossChainHarness.l2Contract.address,
        depositAmount,
        daiCrossChainHarness.l2Contract.address,
        1,
        await computeMessageSecretHash(secrets['user1']),
      )
      .send({ origin: user1 });
    const receipt = await claimTx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);

    const userBalanceMid = await daiCrossChainHarness.getL2BalanceOf(user1);
    const contractBalanceMid = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    const depositReducedPrecision = depositAmount / 10n ** 9n;
    const expectedFullPrecisionSwapAmount = (depositAmount * swapOutputAmount) / (depositAmount * 2n);
    const expectedSwapAmount = (depositReducedPrecision * swapOutputAmount) / (depositReducedPrecision * 2n);

    if (expectedSwapAmount !== expectedFullPrecisionSwapAmount) {
      logger(
        `WARNING: The uniswap noir implementation have precision loss compared. Full: ${expectedFullPrecisionSwapAmount} != Reduced: ${expectedSwapAmount}`,
      );
    }

    expect(userBalanceMid).toEqual(0n);
    expect(contractBalanceMid).toEqual(swapOutputAmount - expectedSwapAmount);

    const noteExists = await uniswapL2Contract.methods
      .note_exists(
        wethCrossChainHarness.l2Contract.address,
        depositAmount,
        daiCrossChainHarness.l2Contract.address,
        1,
        await computeMessageSecretHash(secrets['user1']),
      )
      .view();
    expect(noteExists).toEqual(false);

    const redeemTx = daiCrossChainHarness.l2Contract.methods
      .redeemShield(expectedSwapAmount, secrets['user1'], user1)
      .send({ origin: user1 });
    const redeemReceipt = await redeemTx.wait();
    expect(redeemReceipt.status).toBe(TxStatus.MINED);

    const userBalanceAfter = await daiCrossChainHarness.getL2BalanceOf(user1);
    const contractBalanceAfter = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(userBalanceAfter).toEqual(expectedSwapAmount);
    expect(contractBalanceAfter).toEqual(swapOutputAmount - expectedSwapAmount);
  });

  it('user 2 claims their share of the dai', async () => {
    const userBalanceBefore = await daiCrossChainHarness.getL2BalanceOf(user2);
    const contractBalanceBefore = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    const depositReducedPrecision = depositAmount / 10n ** 9n;
    const expectedFullPrecisionSwapAmount = (depositAmount * swapOutputAmount) / (depositAmount * 2n);
    const expectedSwapAmount = (depositReducedPrecision * swapOutputAmount) / (depositReducedPrecision * 2n);

    expect(userBalanceBefore).toEqual(0n);
    expect(contractBalanceBefore).toEqual(swapOutputAmount - expectedSwapAmount);

    const claimTx = uniswapL2Contract.methods
      .claim(
        wethCrossChainHarness.l2Contract.address,
        depositAmount,
        daiCrossChainHarness.l2Contract.address,
        1,
        await computeMessageSecretHash(secrets['user2']),
      )
      .send({ origin: user2 });
    const receipt = await claimTx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);

    const userBalanceMid = await daiCrossChainHarness.getL2BalanceOf(user2);
    const contractBalanceMid = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    if (expectedSwapAmount !== expectedFullPrecisionSwapAmount) {
      logger(
        `WARNING: The uniswap noir implementation have precision loss compared. Full: ${expectedFullPrecisionSwapAmount} != Reduced: ${expectedSwapAmount}`,
      );
    }

    expect(userBalanceMid).toEqual(0n);
    expect(contractBalanceMid).toEqual(swapOutputAmount - expectedSwapAmount * 2n);

    const noteExists = await uniswapL2Contract.methods
      .note_exists(
        wethCrossChainHarness.l2Contract.address,
        depositAmount,
        daiCrossChainHarness.l2Contract.address,
        1,
        await computeMessageSecretHash(secrets['user2']),
      )
      .view();
    expect(noteExists).toEqual(false);

    const redeemTx = daiCrossChainHarness.l2Contract.methods
      .redeemShield(expectedSwapAmount, secrets['user2'], user2)
      .send({ origin: user2 });
    const redeemReceipt = await redeemTx.wait();
    expect(redeemReceipt.status).toBe(TxStatus.MINED);

    const userBalanceAfter = await daiCrossChainHarness.getL2BalanceOf(user2);
    const contractBalanceAfter = await daiCrossChainHarness.getL2PublicBalanceOf(uniswapL2Contract.address);

    expect(userBalanceAfter).toEqual(expectedSwapAmount);
    expect(contractBalanceAfter).toEqual(swapOutputAmount - expectedSwapAmount * 2n);
  });
});
