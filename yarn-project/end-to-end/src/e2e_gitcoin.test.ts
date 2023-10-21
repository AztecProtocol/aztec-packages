import {
  AccountWallet,
  AztecAddress,
  DebugLogger,
  EthAddress,
  Fr,
  computeAuthWitMessageHash,
  deployL1Contract,
} from '@aztec/aztec.js';
import {
  GitPortalAbi,
  GitPortalBytecode,
  GitcoinDeployHelperAbi,
  GitcoinDeployHelperBytecode,
} from '@aztec/l1-artifacts';
import { GitcoinContract } from '@aztec/noir-contracts/types';

import { getContract } from 'viem';

import { delay, setup } from './fixtures/utils.js';
import { CrossChainTestHarness } from './shared/cross_chain_test_harness.js';

describe('e2e_gitcoin', () => {
  let logger: DebugLogger;
  let teardown: () => Promise<void>;

  let user1Wallet: AccountWallet;
  let ownerAddress: AztecAddress;

  let tokenHarness: CrossChainTestHarness;

  let gitcoinPortal: any;
  let gitcoinL2Contract: GitcoinContract;

  const DONATION_RECIPIENT = EthAddress.fromString('0xA15BB66138824a1c7167f5E85b957d04Dd34E468');
  let DONATEE: EthAddress;
  let underlyingERC20Address: EthAddress;
  let STRATEGY: EthAddress;
  let ALLO: EthAddress;
  let poolId: bigint;

  beforeEach(async () => {
    const { pxe, deployL1ContractsValues, wallets, logger: logger_, teardown: teardown_ } = await setup(2);

    {
      logger_('Deploying Gitcoin contracts and setup');
      // Gitcoin deploy helper.
      const gitcoinHelper = await deployL1Contract(
        deployL1ContractsValues.walletClient,
        deployL1ContractsValues.publicClient,
        GitcoinDeployHelperAbi,
        GitcoinDeployHelperBytecode,
        [DONATION_RECIPIENT.toString()],
      );
      const helper = getContract({
        address: gitcoinHelper.toString(),
        abi: GitcoinDeployHelperAbi,
        walletClient: deployL1ContractsValues.walletClient,
        publicClient: deployL1ContractsValues.publicClient,
      });

      DONATEE = EthAddress.fromString(helper.address);

      const info = await helper.read.info();
      underlyingERC20Address = EthAddress.fromString(info[0]);
      STRATEGY = EthAddress.fromString(info[1]);
      ALLO = EthAddress.fromString(info[2]);
      poolId = info[3];
    }

    tokenHarness = await CrossChainTestHarness.new(
      pxe,
      deployL1ContractsValues.publicClient,
      deployL1ContractsValues.walletClient,
      wallets[0],
      logger_,
      underlyingERC20Address,
    );

    ownerAddress = tokenHarness.ownerAddress;
    user1Wallet = wallets[0];
    logger = logger_;
    teardown = teardown_;
    logger('Successfully deployed token contracts');

    // Deploy the github donation portal and stuff.
    {
      const gitcoinPortalAddress = await deployL1Contract(
        deployL1ContractsValues.walletClient,
        deployL1ContractsValues.publicClient,
        GitPortalAbi,
        GitPortalBytecode,
      );
      gitcoinPortal = getContract({
        address: gitcoinPortalAddress.toString(),
        abi: GitPortalAbi,
        walletClient: deployL1ContractsValues.walletClient,
        publicClient: deployL1ContractsValues.publicClient,
      });

      logger(`Deployed Gitcoin Portal at ${gitcoinPortalAddress}`);

      gitcoinL2Contract = await GitcoinContract.deploy(user1Wallet)
        .send({ portalContract: gitcoinPortalAddress })
        .deployed();
      const args = [
        tokenHarness.tokenPortal.address.toString(),
        deployL1ContractsValues.l1ContractAddresses.registryAddress.toString(),
        ALLO.toString(),
        gitcoinL2Contract.address.toString(),
      ];
      await gitcoinPortal.write.initialize(args, {} as any);
    }
  }, 100_000);

  afterEach(async () => {
    await teardown();
  });

  it('Donate funds on Allo from inside Aztec', async () => {
    // Get funds into rollup
    {
      // Mint funds and deposit into the rollup
      const bridgeAmount = 10n * 10n ** 18n;
      await tokenHarness.mintTokensOnL1(bridgeAmount);

      const [secretForL2MessageConsumption, secretHashForL2MessageConsumption] =
        await tokenHarness.generateClaimSecret();
      const [secretForRedeemingMintedNotes, secretHashForRedeemingMintedNotes] =
        await tokenHarness.generateClaimSecret();

      const messageKey = await tokenHarness.sendTokensToPortalPrivate(
        secretHashForRedeemingMintedNotes,
        bridgeAmount,
        secretHashForL2MessageConsumption,
      );

      await delay(5000); /// waiting 5 seconds.

      // Perform an unrelated transaction on L2 to progress the rollup. Here we mint public tokens.
      const unrelatedMintAmount = 99n;
      await tokenHarness.mintTokensPublicOnL2(unrelatedMintAmount);
      await tokenHarness.expectPublicBalanceOnL2(ownerAddress, unrelatedMintAmount);

      // Consume L1-> L2 message and mint private tokens on L2
      await tokenHarness.consumeMessageOnAztecAndMintSecretly(
        secretHashForRedeemingMintedNotes,
        bridgeAmount,
        messageKey,
        secretForL2MessageConsumption,
      );

      await tokenHarness.redeemShieldPrivatelyOnL2(bridgeAmount, secretForRedeemingMintedNotes);
    }

    // We need to setup an approval to burn the assets to exit.
    const nonce = Fr.random();
    const amount = 10n ** 18n;
    const burnMessageHash = await computeAuthWitMessageHash(
      gitcoinL2Contract.address,
      tokenHarness.l2Token.methods.unshield(ownerAddress, gitcoinL2Contract.address, amount, nonce).request(),
    );
    await user1Wallet.createAuthWitness(Fr.fromBuffer(burnMessageHash));

    // Then donate
    await gitcoinL2Contract.methods
      .donate(poolId, DONATEE, amount, tokenHarness.l2Token.address, tokenHarness.l2Bridge.address, nonce)
      .send()
      .wait();

    const claimBefore = await gitcoinPortal.read.getClaim([
      STRATEGY.toString(),
      underlyingERC20Address.toString(),
      DONATEE.toString(),
    ]);

    logger(`Pending claim ${claimBefore}`);

    await gitcoinPortal.write.donate([poolId, DONATEE.toString(), amount, false], {} as any);

    const claimAfter = await gitcoinPortal.read.getClaim([
      STRATEGY.toString(),
      underlyingERC20Address.toString(),
      DONATEE.toString(),
    ]);

    logger(`Pending claim ${claimAfter}`);
    expect(claimAfter).toEqual(claimBefore + amount);
  }, 60_000);
});
