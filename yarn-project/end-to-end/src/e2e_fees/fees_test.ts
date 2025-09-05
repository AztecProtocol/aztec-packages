import { getSchnorrWallet } from '@aztec/accounts/schnorr';
import {
  type AccountWallet,
  type AztecAddress,
  type AztecNode,
  type Logger,
  type PXE,
  createLogger,
  sleep,
} from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import { type DeployL1ContractsArgs, RollupContract, createExtendedL1Client } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { EthAddress } from '@aztec/foundation/eth-address';
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

import { getContract } from 'viem';

import { MNEMONIC } from '../fixtures/fixtures.js';
import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
} from '../fixtures/snapshot_manager.js';
import { mintTokensToPrivate } from '../fixtures/token_utils.js';
import {
  type BalancesFn,
  type SetupOptions,
  ensureAccountContractsPublished,
  getBalancesFn,
  setupSponsoredFPC,
} from '../fixtures/utils.js';
import { FeeJuicePortalTestingHarnessFactory, type GasBridgingTestHarness } from '../shared/gas_portal_test_harness.js';

const { E2E_DATA_PATH: dataPath } = process.env;

/**
 * Test fixture for testing fees. Provides the following snapshots:
 * InitialAccounts: Initializes 3 Schnorr account contracts.
 * PublicDeployAccounts: Deploys the accounts publicly.
 * DeployFeeJuice: Deploys the Fee Juice contract.
 * FPCSetup: Deploys BananaCoin and FPC contracts, and bridges gas from L1.
 * SponsoredFPCSetup: Deploys Sponsored FPC contract, and bridges gas from L1.
 * FundAlice: Mints private and public bananas to Alice.
 * SetupSubscription: Deploys a counter contract and a subscription contract, and mints Fee Juice to the subscription contract.
 */
export class FeesTest {
  private snapshotManager: ISnapshotManager;
  private wallets: AccountWallet[] = [];
  private accounts: AztecAddress[] = [];

  public logger: Logger;
  public pxe!: PXE;
  public aztecNode!: AztecNode;
  public cheatCodes!: CheatCodes;

  public aliceWallet!: AccountWallet;
  public aliceAddress!: AztecAddress;
  public bobWallet!: AccountWallet;
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

  public context!: SubsystemsContext;
  public chainMonitor!: ChainMonitor;

  public getCoinbaseBalance!: () => Promise<bigint>;
  public getCoinbaseSequencerRewards!: () => Promise<bigint>;
  public getGasBalanceFn!: BalancesFn;
  public getBananaPublicBalanceFn!: BalancesFn;
  public getBananaPrivateBalanceFn!: BalancesFn;
  public getProverFee!: (blockNumber: number) => Promise<bigint>;

  public readonly ALICE_INITIAL_BANANAS = BigInt(1e22);
  public readonly SUBSCRIPTION_AMOUNT = BigInt(1e19);
  public readonly APP_SPONSORED_TX_GAS_LIMIT = BigInt(10e9);

  constructor(
    testName: string,
    private numberOfAccounts = 3,
    setupOptions: Partial<SetupOptions & DeployL1ContractsArgs> = {},
  ) {
    if (!numberOfAccounts) {
      throw new Error('There must be at least 1 initial account.');
    }
    setupOptions.coinbase ??= EthAddress.random();
    this.coinbase = setupOptions.coinbase!;
    this.logger = createLogger(`e2e:e2e_fees:${testName}`);
    this.snapshotManager = createSnapshotManager(
      `e2e_fees/${testName}-${numberOfAccounts}`,
      dataPath,
      { startProverNode: true, ...setupOptions },
      { ...setupOptions },
    );
  }

  async setup() {
    const context = await this.snapshotManager.setup();

    this.rollupContract = RollupContract.getFromConfig(context.aztecNodeConfig);
    this.chainMonitor = new ChainMonitor(this.rollupContract, context.dateProvider, this.logger, 200).start();

    return this;
  }

  async teardown() {
    await this.chainMonitor.stop();
    await this.snapshotManager.teardown();
  }

  setIsMarkingAsProven(b: boolean) {
    this.context.watcher.setIsMarkingAsProven(b);
  }

  async catchUpProvenChain() {
    const bn = await this.aztecNode.getBlockNumber();
    while ((await this.aztecNode.getProvenBlockNumber()) < bn) {
      await sleep(1000);
    }
  }

  async getBlockRewards() {
    const blockReward = await this.rollupContract.getBlockReward();

    const balance = await this.feeJuiceBridgeTestHarness.getL1FeeJuiceBalance(
      this.context.deployL1ContractsValues.l1ContractAddresses.rewardDistributorAddress,
    );

    const toDistribute = balance > blockReward ? blockReward : balance;
    const sequencerBlockRewards = toDistribute / 2n;
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

    await mintTokensToPrivate(this.bananaCoin, this.aliceAddress, this.aliceWallet, address, amount);

    const balanceAfter = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: this.aliceAddress });
    expect(balanceAfter).toEqual(balanceBefore + amount);
  }

  public async applyBaseSnapshots() {
    await this.applyInitialAccountsSnapshot();
    await this.applyPublicDeployAccountsSnapshot();
    await this.applySetupFeeJuiceSnapshot();
    await this.applyDeployBananaTokenSnapshot();
  }

  async applyInitialAccountsSnapshot() {
    await this.snapshotManager.snapshot(
      'initial_accounts',
      deployAccounts(this.numberOfAccounts, this.logger),
      async ({ deployedAccounts }, { pxe, aztecNode, aztecNodeConfig }) => {
        this.pxe = pxe;

        this.aztecNode = aztecNode;
        this.gasSettings = GasSettings.default({ maxFeesPerGas: (await this.aztecNode.getCurrentBaseFees()).mul(2) });
        this.cheatCodes = await CheatCodes.create(aztecNodeConfig.l1RpcUrls, pxe);
        this.wallets = await Promise.all(deployedAccounts.map(a => getSchnorrWallet(pxe, a.address, a.signingKey)));
        this.wallets.forEach((w, i) => this.logger.verbose(`Wallet ${i} address: ${w.getAddress()}`));
        this.accounts = this.wallets.map(w => w.getAddress());
        [this.aliceWallet, this.bobWallet] = this.wallets.slice(0, 2);
        [this.aliceAddress, this.bobAddress, this.sequencerAddress] = this.accounts;

        // We set Alice as the FPC admin to avoid the need for deployment of another account.
        this.fpcAdmin = this.aliceAddress;

        const canonicalFeeJuice = await getCanonicalFeeJuice();
        this.feeJuiceContract = await FeeJuiceContract.at(canonicalFeeJuice.address, this.aliceWallet);
      },
    );
  }

  async applyPublicDeployAccountsSnapshot() {
    await this.snapshotManager.snapshot('public_deploy_accounts', () =>
      ensureAccountContractsPublished(this.aliceWallet, this.wallets),
    );
  }

  async applySetupFeeJuiceSnapshot() {
    await this.snapshotManager.snapshot(
      'setup_fee_juice',
      async () => {},
      async (_data, context) => {
        this.context = context;

        this.feeJuiceContract = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, this.aliceWallet);

        this.getGasBalanceFn = getBalancesFn(
          '⛽',
          this.feeJuiceContract.methods.balance_of_public,
          this.aliceAddress,
          this.logger,
        );

        this.feeJuiceBridgeTestHarness = await FeeJuicePortalTestingHarnessFactory.create({
          aztecNode: context.aztecNode,
          aztecNodeAdmin: context.aztecNode,
          pxeService: context.pxe,
          l1Client: context.deployL1ContractsValues.l1Client,
          wallet: this.aliceWallet,
          logger: this.logger,
        });
      },
    );
  }

  async applyDeployBananaTokenSnapshot() {
    await this.snapshotManager.snapshot(
      'deploy_banana_token',
      async () => {
        const bananaCoin = await BananaCoin.deploy(this.aliceWallet, this.aliceAddress, 'BC', 'BC', 18n)
          .send({ from: this.aliceAddress })
          .deployed();
        this.logger.info(`BananaCoin deployed at ${bananaCoin.address}`);
        return { bananaCoinAddress: bananaCoin.address };
      },
      async ({ bananaCoinAddress }) => {
        this.bananaCoin = await BananaCoin.at(bananaCoinAddress, this.aliceWallet);
        const logger = this.logger;
        this.getBananaPublicBalanceFn = getBalancesFn(
          '🍌.public',
          this.bananaCoin.methods.balance_of_public,
          this.aliceAddress,
          logger,
        );
        this.getBananaPrivateBalanceFn = getBalancesFn(
          '🍌.private',
          this.bananaCoin.methods.balance_of_private,
          this.aliceAddress,
          logger,
        );
      },
    );
  }

  public async applyFPCSetupSnapshot() {
    await this.snapshotManager.snapshot(
      'fpc_setup',
      async context => {
        const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
        expect((await context.pxe.getContractMetadata(feeJuiceContract.address)).isContractPublished).toBe(true);

        const bananaCoin = this.bananaCoin;
        const bananaFPC = await FPCContract.deploy(this.aliceWallet, bananaCoin.address, this.fpcAdmin)
          .send({ from: this.aliceAddress })
          .deployed();

        this.logger.info(`BananaPay deployed at ${bananaFPC.address}`);

        await this.feeJuiceBridgeTestHarness.bridgeFromL1ToL2(bananaFPC.address, this.aliceAddress);

        return {
          bananaFPCAddress: bananaFPC.address,
          feeJuiceAddress: feeJuiceContract.address,
          l1FeeJuiceAddress: this.feeJuiceBridgeTestHarness.l1FeeJuiceAddress,
          rollupAddress: context.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
        };
      },
      async (data, context) => {
        const bananaFPC = await FPCContract.at(data.bananaFPCAddress, this.aliceWallet);
        this.bananaFPC = bananaFPC;

        this.getCoinbaseBalance = async () => {
          const l1Client = createExtendedL1Client(context.aztecNodeConfig.l1RpcUrls, MNEMONIC);
          const gasL1 = getContract({
            address: data.l1FeeJuiceAddress.toString(),
            abi: TestERC20Abi,
            client: l1Client,
          });
          return await gasL1.read.balanceOf([this.coinbase.toString()]);
        };

        this.getCoinbaseSequencerRewards = async () => {
          return await this.rollupContract.getSequencerRewards(this.coinbase);
        };

        this.getProverFee = async (blockNumber: number) => {
          const block = await this.pxe.getBlock(blockNumber);

          // @todo @lherskind As we deal with #13601
          // Right now the value is from `FeeLib.sol`
          const L1_GAS_PER_EPOCH_VERIFIED = 1000000n;

          // We round up
          const mulDiv = (a: bigint, b: bigint, c: bigint) => (a * b) / c + ((a * b) % c > 0n ? 1n : 0n);

          const { baseFee } = await this.rollupContract.getL1FeesAt(block!.header.globalVariables.timestamp);
          const proverCost =
            mulDiv(
              mulDiv(L1_GAS_PER_EPOCH_VERIFIED, baseFee, await this.rollupContract.getEpochDuration()),
              1n,
              await this.rollupContract.getManaTarget(),
            ) + (await this.rollupContract.getProvingCostPerMana());

          const price = await this.rollupContract.getFeeAssetPerEth();

          const mana = block!.header.totalManaUsed.toBigInt();
          return mulDiv(mana * proverCost, price, 10n ** 9n);
        };
      },
    );
  }

  public async applySponsoredFPCSetupSnapshot() {
    await this.snapshotManager.snapshot(
      'sponsored_fpc_setup',
      async context => {
        const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
        expect((await context.pxe.getContractMetadata(feeJuiceContract.address)).isContractPublished).toBe(true);

        const sponsoredFPC = await setupSponsoredFPC(context.pxe);
        this.logger.info(`SponsoredFPC at ${sponsoredFPC.address}`);

        return {
          sponsoredFPCAddress: sponsoredFPC.address,
        };
      },
      async data => {
        this.sponsoredFPC = await SponsoredFPCContract.at(data.sponsoredFPCAddress, this.aliceWallet);
      },
    );
  }

  public async applyFundAliceWithBananas() {
    await this.snapshotManager.snapshot(
      'fund_alice',
      async () => {
        await this.mintPrivateBananas(this.ALICE_INITIAL_BANANAS, this.aliceAddress);
        await this.bananaCoin.methods
          .mint_to_public(this.aliceAddress, this.ALICE_INITIAL_BANANAS)
          .send({ from: this.aliceAddress })
          .wait();
      },
      () => Promise.resolve(),
    );
  }

  public async applyFundAliceWithPrivateBananas() {
    await this.snapshotManager.snapshot(
      'fund_alice_with_private_bananas',
      async () => {
        await this.mintPrivateBananas(this.ALICE_INITIAL_BANANAS, this.aliceAddress);
      },
      () => Promise.resolve(),
    );
  }
}
