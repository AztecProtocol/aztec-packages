import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { CheatCodes } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsArgs } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { ChainMonitor } from '@aztec/ethereum/test';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { TestERC20Abi } from '@aztec/l1-artifacts';
import { AppSubscriptionContract } from '@aztec/noir-contracts.js/AppSubscription';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { CounterContract } from '@aztec/noir-test-contracts.js/Counter';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { GasSettings } from '@aztec/stdlib/gas';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { TestWallet } from '@aztec/test-wallet/server';

import { getContract } from 'viem';

import { MNEMONIC } from '../fixtures/fixtures.js';
import {
  type EndToEndContext,
  type SetupOptions,
  deployAccounts,
  publicDeployAccounts,
  setup,
  teardown,
} from '../fixtures/setup.js';
import { mintTokensToPrivate } from '../fixtures/token_utils.js';
import { type BalancesFn, getBalancesFn, setupSponsoredFPC } from '../fixtures/utils.js';
import { FeeJuicePortalTestingHarnessFactory, type GasBridgingTestHarness } from '../shared/gas_portal_test_harness.js';

/**
 * Test fixture for testing fees. Provides the following setup steps:
 * InitialAccounts: Initializes 3 Schnorr account contracts.
 * PublicDeployAccounts: Deploys the accounts publicly.
 * DeployFeeJuice: Deploys the Fee Juice contract.
 * FPCSetup: Deploys BananaCoin and FPC contracts, and bridges gas from L1.
 * SponsoredFPCSetup: Deploys Sponsored FPC contract, and bridges gas from L1.
 * FundAlice: Mints private and public bananas to Alice.
 * SetupSubscription: Deploys a counter contract and a subscription contract, and mints Fee Juice to the subscription contract.
 */
export class FeesTest {
  private accounts: AztecAddress[] = [];
  public context!: EndToEndContext;

  public logger: Logger;
  public aztecNode!: AztecNode;
  public aztecNodeAdmin!: AztecNodeAdmin;
  public cheatCodes!: CheatCodes;

  public wallet!: TestWallet;
  public aliceAddress!: AztecAddress;
  public bobAddress!: AztecAddress;
  public sequencerAddress!: AztecAddress;
  public coinbase!: EthAddress;

  public fpcAdmin!: AztecAddress;

  public gasSettings!: GasSettings;

  public rollupContract!: RollupContract;

  public feeJuiceContract!: FeeJuiceContract;
  public bananaCoin!: BananaCoin;
  public bananaFPC!: FPCContract;
  public sponsoredFPC!: SponsoredFPCContract;
  public counterContract!: CounterContract;
  public subscriptionContract!: AppSubscriptionContract;
  public feeJuiceBridgeTestHarness!: GasBridgingTestHarness;

  public chainMonitor!: ChainMonitor;

  public getCoinbaseBalance!: () => Promise<bigint>;
  public getCoinbaseSequencerRewards!: () => Promise<bigint>;
  public getGasBalanceFn!: BalancesFn;
  public getBananaPublicBalanceFn!: BalancesFn;
  public getBananaPrivateBalanceFn!: BalancesFn;
  public getProverFee!: (blockNumber: BlockNumber) => Promise<bigint>;

  public readonly ALICE_INITIAL_BANANAS = BigInt(1e22);
  public readonly SUBSCRIPTION_AMOUNT = BigInt(1e19);
  public readonly APP_SPONSORED_TX_GAS_LIMIT = BigInt(10e9);

  constructor(
    testName: string,
    private numberOfAccounts = 3,
    private setupOptions: Partial<SetupOptions & DeployAztecL1ContractsArgs> = {},
  ) {
    if (!numberOfAccounts) {
      throw new Error('There must be at least 1 initial account.');
    }
    setupOptions.coinbase ??= EthAddress.random();
    this.coinbase = setupOptions.coinbase!;
    this.logger = createLogger(`e2e:e2e_fees:${testName}`);
  }

  async setup() {
    this.logger.verbose('Setting up fresh context...');
    this.context = await setup(0, {
      startProverNode: true,
      ...this.setupOptions,
      fundSponsoredFPC: true,
      skipAccountDeployment: true,
      l1ContractsArgs: { ...this.setupOptions },
    });

    this.rollupContract = RollupContract.getFromConfig(this.context.config);
    this.chainMonitor = new ChainMonitor(this.rollupContract, this.context.dateProvider!, this.logger, 200).start();

    await this.applyBaseSetup();

    return this;
  }

  async teardown() {
    await this.chainMonitor.stop();
    await teardown(this.context);
  }

  setIsMarkingAsProven(b: boolean) {
    this.context.watcher!.setIsMarkingAsProven(b);
  }

  async catchUpProvenChain() {
    const bn = await this.aztecNode.getBlockNumber();
    while ((await this.aztecNode.getProvenBlockNumber()) < bn) {
      await sleep(1000);
    }
  }

  async getBlockRewards() {
    const blockReward = await this.rollupContract.getCheckpointReward();
    const rewardConfig = await this.rollupContract.getRewardConfig();

    const balance = await this.feeJuiceBridgeTestHarness.getL1FeeJuiceBalance(rewardConfig.rewardDistributor);

    const toDistribute = balance > blockReward ? blockReward : balance;
    const sequencerBlockRewards = (toDistribute * BigInt(rewardConfig.sequencerBps)) / 10000n;
    const proverBlockRewards = toDistribute - sequencerBlockRewards;

    return { sequencerBlockRewards, proverBlockRewards };
  }

  async mintAndBridgeFeeJuice(minter: AztecAddress, recipient: AztecAddress) {
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(recipient);
    const { claimSecret: secret, messageLeafIndex: index } = claim;
    await this.feeJuiceContract.methods
      .claim(recipient, claim.claimAmount, secret, index)
      .send({ from: minter })
      .wait();
  }

  /** Alice mints bananaCoin tokens privately to the target address and redeems them. */
  async mintPrivateBananas(amount: bigint, address: AztecAddress) {
    const balanceBefore = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: this.aliceAddress });

    await mintTokensToPrivate(this.bananaCoin, this.aliceAddress, address, amount);

    const balanceAfter = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: this.aliceAddress });
    expect(balanceAfter).toEqual(balanceBefore + amount);
  }

  public async applyBaseSetup() {
    await this.applyInitialAccounts();
    await this.applyPublicDeployAccounts();
    await this.applySetupFeeJuice();
    await this.applyDeployBananaToken();
  }

  async applyInitialAccounts() {
    this.logger.info('Applying initial accounts setup');

    const { deployedAccounts } = await deployAccounts(
      this.numberOfAccounts,
      this.logger,
    )({
      wallet: this.context.wallet,
      initialFundedAccounts: this.context.initialFundedAccounts,
    });

    this.wallet = this.context.wallet;
    this.aztecNode = this.context.aztecNodeService!;
    this.aztecNodeAdmin = this.context.aztecNodeService!;
    this.gasSettings = GasSettings.default({ maxFeesPerGas: (await this.aztecNode.getCurrentMinFees()).mul(2) });
    this.cheatCodes = this.context.cheatCodes;
    this.accounts = deployedAccounts.map(a => a.address);
    this.accounts.forEach((a, i) => this.logger.verbose(`Account ${i} address: ${a}`));
    [this.aliceAddress, this.bobAddress, this.sequencerAddress] = this.accounts.slice(0, 3);

    // We set Alice as the FPC admin to avoid the need for deployment of another account.
    this.fpcAdmin = this.aliceAddress;

    const canonicalFeeJuice = await getCanonicalFeeJuice();
    this.feeJuiceContract = FeeJuiceContract.at(canonicalFeeJuice.address, this.wallet);
  }

  async applyPublicDeployAccounts() {
    this.logger.info('Applying public deploy accounts setup');
    await publicDeployAccounts(this.wallet, this.accounts);
  }

  async applySetupFeeJuice() {
    this.logger.info('Applying fee juice setup');

    this.feeJuiceContract = FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, this.wallet);

    this.getGasBalanceFn = getBalancesFn(
      '⛽',
      this.feeJuiceContract.methods.balance_of_public,
      this.aliceAddress,
      this.logger,
    );

    this.feeJuiceBridgeTestHarness = await FeeJuicePortalTestingHarnessFactory.create({
      aztecNode: this.context.aztecNodeService!,
      aztecNodeAdmin: this.context.aztecNodeService!,
      l1Client: this.context.deployL1ContractsValues.l1Client,
      wallet: this.wallet,
      logger: this.logger,
    });
  }

  async applyDeployBananaToken() {
    this.logger.info('Applying deploy banana token setup');

    const bananaCoin = await BananaCoin.deploy(this.wallet, this.aliceAddress, 'BC', 'BC', 18n)
      .send({ from: this.aliceAddress })
      .deployed();
    this.logger.info(`BananaCoin deployed at ${bananaCoin.address}`);

    this.bananaCoin = bananaCoin;
    this.getBananaPublicBalanceFn = getBalancesFn(
      '🍌.public',
      this.bananaCoin.methods.balance_of_public,
      this.aliceAddress,
      this.logger,
    );
    this.getBananaPrivateBalanceFn = getBalancesFn(
      '🍌.private',
      this.bananaCoin.methods.balance_of_private,
      this.aliceAddress,
      this.logger,
    );
  }

  public async applyFPCSetup() {
    this.logger.info('Applying FPC setup');

    const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
    expect((await this.wallet.getContractMetadata(feeJuiceContract.address)).isContractPublished).toBe(true);

    const bananaCoin = this.bananaCoin;
    const bananaFPC = await FPCContract.deploy(this.wallet, bananaCoin.address, this.fpcAdmin)
      .send({ from: this.aliceAddress })
      .deployed();

    this.logger.info(`BananaPay deployed at ${bananaFPC.address}`);

    await this.feeJuiceBridgeTestHarness.bridgeFromL1ToL2(bananaFPC.address, this.aliceAddress);

    this.bananaFPC = bananaFPC;

    const l1FeeJuiceAddress = this.feeJuiceBridgeTestHarness.l1FeeJuiceAddress;

    this.getCoinbaseBalance = async () => {
      const l1Client = createExtendedL1Client(this.context.config.l1RpcUrls, MNEMONIC);
      const gasL1 = getContract({
        address: l1FeeJuiceAddress.toString(),
        abi: TestERC20Abi,
        client: l1Client,
      });
      return await gasL1.read.balanceOf([this.coinbase.toString()]);
    };

    this.getCoinbaseSequencerRewards = async () => {
      return await this.rollupContract.getSequencerRewards(this.coinbase);
    };

    this.getProverFee = async (blockNumber: BlockNumber) => {
      const block = await this.aztecNode.getBlock(blockNumber);

      // @todo @lherskind As we deal with #13601
      // Right now the value is from `FeeLib.sol`
      const L1_GAS_PER_EPOCH_VERIFIED = 1000000n;

      // We round up
      const mulDiv = (a: bigint, b: bigint, c: bigint) => (a * b) / c + ((a * b) % c > 0n ? 1n : 0n);

      const { baseFee } = await this.rollupContract.getL1FeesAt(block!.header.globalVariables.timestamp);
      const proverCost =
        mulDiv(
          mulDiv(L1_GAS_PER_EPOCH_VERIFIED, baseFee, BigInt(await this.rollupContract.getEpochDuration())),
          1n,
          await this.rollupContract.getManaTarget(),
        ) + (await this.rollupContract.getProvingCostPerMana());

      const price = await this.rollupContract.getFeeAssetPerEth();

      const mana = block!.header.totalManaUsed.toBigInt();
      return mulDiv(mana * proverCost, price, 10n ** 9n);
    };
  }

  public async applySponsoredFPCSetup() {
    this.logger.info('Applying sponsored FPC setup');

    const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
    expect((await this.wallet.getContractMetadata(feeJuiceContract.address)).isContractPublished).toBe(true);

    const sponsoredFPCInstance = await setupSponsoredFPC(this.wallet);
    this.logger.info(`SponsoredFPC at ${sponsoredFPCInstance.address}`);

    this.sponsoredFPC = SponsoredFPCContract.at(sponsoredFPCInstance.address, this.wallet);
  }

  public async applyFundAliceWithBananas() {
    this.logger.info('Applying fund Alice with bananas setup');

    await this.mintPrivateBananas(this.ALICE_INITIAL_BANANAS, this.aliceAddress);
    await this.bananaCoin.methods
      .mint_to_public(this.aliceAddress, this.ALICE_INITIAL_BANANAS)
      .send({ from: this.aliceAddress })
      .wait();
  }

  public async applyFundAliceWithPrivateBananas() {
    this.logger.info('Applying fund Alice with private bananas setup');

    await this.mintPrivateBananas(this.ALICE_INITIAL_BANANAS, this.aliceAddress);
  }
}
