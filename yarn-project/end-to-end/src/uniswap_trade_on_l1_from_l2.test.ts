import { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, Fr, TxStatus } from '@aztec/aztec.js';
import { deployL1Contract } from '@aztec/ethereum';

import { EthAddress } from '@aztec/foundation/eth-address';
import { delay, deployAndInitializeNonNativeL2TokenContracts, pointToPublicKey, setup } from './utils.js';
import { CrossChainTestHarness } from './cross_chain/test_harness.js';
import { DebugLogger } from '@aztec/foundation/log';
import { getContract, parseEther } from 'viem';
import { DeployL1Contracts } from '@aztec/ethereum';
import { UniswapPortalAbi, UniswapPortalBytecode } from '@aztec/l1-artifacts';
import { UniswapContractAbi } from '@aztec/noir-contracts/examples';

// PSA: this works on a fork of mainnet but with the default anvil chain id. Start it with the command:
// anvil --fork-url https://mainnet.infura.io/v3/9928b52099854248b3a096be07a6b23c --fork-block-number 17514288 --chain-id 31337
// For CI, this is configured in `run_tests.sh` and `docker-compose.yml`

// Should mint WETH on L2, swap to DAI using L1 Uniswap and mint this DAI back on L2
describe('uniswap_trade_on_l1_from_l2', () => {
  // test runs on a forked version of mainnet at this block.
  const EXPECTED_FORKED_BLOCK = 17514288;
  // We tell the archiver to only sync from this block.
  process.env.SEARCH_START_BLOCK = EXPECTED_FORKED_BLOCK.toString();
  const WETH9_ADDRESS: EthAddress = EthAddress.fromString('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
  const DAI_ADDRESS: EthAddress = EthAddress.fromString('0x6B175474E89094C44Da98b954EedeAC495271d0F');

  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];
  let logger: DebugLogger;

  let ethAccount: EthAddress;
  let ownerAddress: AztecAddress;
  let receiver: AztecAddress;
  let ownerPub: { x: bigint; y: bigint };
  const initialBalance = 10n;
  const wethAmountToBridge = parseEther('1');

  let daiCrossChainHarness: CrossChainTestHarness;
  let wethCrossChainHarness: CrossChainTestHarness;

  let uniswapPortal: any;
  let uniswapPortalAddress: EthAddress;
  let uniswapL2Contract: Contract;

  beforeEach(async () => {
    let deployL1ContractsValues: DeployL1Contracts;
    ({ aztecNode, aztecRpcServer, deployL1ContractsValues, accounts, logger } = await setup(2));

    const walletClient = deployL1ContractsValues.walletClient;
    const publicClient = deployL1ContractsValues.publicClient;

    if (Number(await publicClient.getBlockNumber()) < EXPECTED_FORKED_BLOCK) {
      throw new Error('This test must be run on a fork of mainnet with the expected fork block');
    }

    ethAccount = EthAddress.fromString((await walletClient.getAddresses())[0]);
    [ownerAddress, receiver] = accounts;
    const ownerPubPoint = await aztecRpcServer.getAccountPublicKey(ownerAddress);
    ownerPub = pointToPublicKey(ownerPubPoint);

    logger('Deploying DAI Portal, initializing and deploying l2 contract...');
    const daiContracts = await deployAndInitializeNonNativeL2TokenContracts(
      aztecRpcServer,
      walletClient,
      publicClient,
      deployL1ContractsValues!.registryAddress,
      initialBalance,
      ownerPub,
      DAI_ADDRESS,
    );
    daiCrossChainHarness = new CrossChainTestHarness(
      aztecNode,
      aztecRpcServer,
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
      ownerAddress,
      receiver,
      ownerPubPoint,
    );

    logger('Deploying WETH Portal, initializing and deploying l2 contract...');
    const wethContracts = await deployAndInitializeNonNativeL2TokenContracts(
      aztecRpcServer,
      walletClient,
      publicClient,
      deployL1ContractsValues!.registryAddress,
      initialBalance,
      ownerPub,
      WETH9_ADDRESS,
    );
    wethCrossChainHarness = new CrossChainTestHarness(
      aztecNode,
      aztecRpcServer,
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
      ownerAddress,
      receiver,
      ownerPubPoint,
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
    const deployer = new ContractDeployer(UniswapContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send({ portalContract: uniswapPortalAddress });
    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();
    uniswapL2Contract = new Contract(receipt.contractAddress!, UniswapContractAbi, aztecRpcServer);
    await uniswapL2Contract.attach(uniswapPortalAddress);

    await uniswapPortal.write.initialize(
      [deployL1ContractsValues!.registryAddress.toString(), uniswapL2Contract.address.toString()],
      {} as any,
    );

    // Give me some WETH so I can deposit to L2 and do the swap...
    logger('Getting some weth');
    await walletClient.sendTransaction({ to: WETH9_ADDRESS.toString(), value: parseEther('1') });
  }, 100_000);

  afterEach(async () => {
    await aztecNode.stop();
    await aztecRpcServer.stop();
    await wethCrossChainHarness.stop();
    await daiCrossChainHarness.stop();
  });

  it('should uniswap trade on L1 from L2 funds privately (swaps WETH -> DAI)', async () => {
    const meBeforeBalance = await wethCrossChainHarness.getL1BalanceOf(ethAccount);

    // 1. Approve and deposit weth to the portal and move to L2
    const [secret, secretHash] = await wethCrossChainHarness.generateClaimSecret();
    const messageKey = await wethCrossChainHarness.sendTokensToPortal(wethAmountToBridge, secretHash);
    expect(await wethCrossChainHarness.getL1BalanceOf(ethAccount)).toBe(meBeforeBalance - wethAmountToBridge);

    // Wait for the archiver to process the message
    await delay(5000);

    // send a transfer tx to force through rollup with the message included
    const transferAmount = 1n;
    await wethCrossChainHarness.performL2Transfer(transferAmount);

    // 3. Claim WETH on L2
    logger('Minting weth on L2');
    await wethCrossChainHarness.consumeMessageOnAztecAndMintSecretly(wethAmountToBridge, messageKey, secret);
    await wethCrossChainHarness.expectBalanceOnL2(ownerAddress, wethAmountToBridge + initialBalance - transferAmount);

    // Store balances
    const wethBalanceBeforeSwap = await wethCrossChainHarness.getL2BalanceOf(ownerAddress);
    const daiBalanceBeforeSwap = await daiCrossChainHarness.getL2BalanceOf(ownerAddress);

    // 4. Send L2 to L1 message to withdraw funds and another message to swap assets.
    logger('Send L2 tx to withdraw WETH to uniswap portal and send message to swap assets on L1');
    const selector = Fr.fromBuffer(wethCrossChainHarness.l2Contract.methods.withdraw.selector);
    const minimumOutputAmount = 0;

    const withdrawTx = uniswapL2Contract.methods
      .swap(
        selector,
        wethCrossChainHarness.l2Contract.address.toField(),
        wethCrossChainHarness.tokenPortalAddress.toField(),
        wethAmountToBridge,
        new Fr(3000),
        daiCrossChainHarness.l2Contract.address.toField(),
        daiCrossChainHarness.tokenPortalAddress.toField(),
        new Fr(minimumOutputAmount),
        ownerPub,
        ownerAddress,
        secretHash,
        new Fr(2 ** 32 - 1),
        ethAccount.toField(),
        uniswapPortalAddress,
        ethAccount.toField(),
      )
      .send({ from: ownerAddress });
    await withdrawTx.isMined(0, 0.1);
    const withdrawReceipt = await withdrawTx.getReceipt();
    expect(withdrawReceipt.status).toBe(TxStatus.MINED);

    // check weth balance of owner on L2 (we first briedged `wethAmountToBridge` into L2 and now withdrew it!)
    await wethCrossChainHarness.expectBalanceOnL2(ownerAddress, initialBalance - transferAmount);

    // 5. Consume L2 to L1 message by calling uniswapPortal.swap()
    logger('Execute withdraw and swap on the uniswapPortal!');
    const daiBalanceOfPortalBefore = await daiCrossChainHarness.getL1BalanceOf(daiCrossChainHarness.tokenPortalAddress);
    const deadline = 2 ** 32 - 1; // max uint32 - 1
    const swapArgs = [
      wethCrossChainHarness.tokenPortalAddress.toString(),
      wethAmountToBridge,
      3000,
      daiCrossChainHarness.tokenPortalAddress.toString(),
      minimumOutputAmount,
      ownerAddress.toString(),
      secretHash.toString(true),
      deadline,
      ethAccount.toString(),
      true,
    ] as const;
    const { result: depositDaiMessageKeyHex } = await uniswapPortal.simulate.swap(swapArgs, {
      account: ethAccount.toString(),
    } as any);
    // this should also insert a message into the inbox.
    await uniswapPortal.write.swap(swapArgs, {} as any);
    const depositDaiMessageKey = Fr.fromString(depositDaiMessageKeyHex);
    // weth was swapped to dai and send to portal
    const daiBalanceOfPortalAfter = await daiCrossChainHarness.getL1BalanceOf(daiCrossChainHarness.tokenPortalAddress);
    expect(daiBalanceOfPortalAfter).toBeGreaterThan(daiBalanceOfPortalBefore);
    const daiAmountToBridge = BigInt(daiBalanceOfPortalAfter - daiBalanceOfPortalBefore);

    // Wait for the archiver to process the message
    await delay(5000);
    // send a transfer tx to force through rollup with the message included
    await wethCrossChainHarness.performL2Transfer(transferAmount);

    // 6. claim dai on L2
    logger('Consuming messages to mint dai on L2');
    await daiCrossChainHarness.consumeMessageOnAztecAndMintSecretly(daiAmountToBridge, depositDaiMessageKey, secret);
    await daiCrossChainHarness.expectBalanceOnL2(ownerAddress, initialBalance + daiAmountToBridge);

    const wethBalanceAfterSwap = await wethCrossChainHarness.getL2BalanceOf(ownerAddress);
    const daiBalanceAfterSwap = await daiCrossChainHarness.getL2BalanceOf(ownerAddress);

    logger('WETH balance before swap: ', wethBalanceBeforeSwap.toString());
    logger('DAI balance before swap  : ', daiBalanceBeforeSwap.toString());
    logger('***** 🧚‍♀️ SWAP L2 assets on L1 Uniswap 🧚‍♀️ *****');
    logger('WETH balance after swap : ', wethBalanceAfterSwap.toString());
    logger('DAI balance after swap  : ', daiBalanceAfterSwap.toString());
  }, 240_000);
});
