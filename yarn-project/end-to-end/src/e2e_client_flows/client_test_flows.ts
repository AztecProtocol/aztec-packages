import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import {
  type AccountWallet,
  type AztecAddress,
  type AztecNode,
  type Logger,
  type PXE,
  createLogger,
  sleep,
} from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import { type DeployL1ContractsArgs, RollupContract } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { EthAddress } from '@aztec/foundation/eth-address';
import { CounterContract } from '@aztec/noir-contracts.js/Counter';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { GasSettings } from '@aztec/stdlib/gas';

import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
} from '../fixtures/snapshot_manager.js';
import { mintTokensToPrivate } from '../fixtures/token_utils.js';
import { type SetupOptions, setupCanonicalFeeJuice, setupSponsoredFPC } from '../fixtures/utils.js';
import { FeeJuicePortalTestingHarnessFactory, type GasBridgingTestHarness } from '../shared/gas_portal_test_harness.js';

const { E2E_DATA_PATH: dataPath } = process.env;

export class FeesTest {
  private snapshotManager: ISnapshotManager;

  public logger: Logger;
  public pxe!: PXE;
  public aztecNode!: AztecNode;
  public cheatCodes!: CheatCodes;

  public adminWallet!: AccountWallet;
  public adminAddress!: AztecAddress;

  public sequencerAddress!: AztecAddress;

  public coinbase!: EthAddress;

  public gasSettings!: GasSettings;

  public feeJuiceContract!: FeeJuiceContract;
  public bananaCoin!: BananaCoin;
  public bananaFPC!: FPCContract;
  public sponsoredFPC!: SponsoredFPCContract;
  public counterContract!: CounterContract;
  public feeJuiceBridgeTestHarness!: GasBridgingTestHarness;

  public context!: SubsystemsContext;
  public chainMonitor!: ChainMonitor;

  constructor(testName: string, setupOptions: Partial<SetupOptions & DeployL1ContractsArgs> = {}) {
    this.logger = createLogger(`e2e:e2e_client_flows:${testName}`);
    this.snapshotManager = createSnapshotManager(
      `e2e_client_flows/${testName}`,
      dataPath,
      { startProverNode: true, ...setupOptions },
      { ...setupOptions },
    );
  }

  async setup() {
    const context = await this.snapshotManager.setup();
    await context.aztecNode.setConfig({ feeRecipient: this.sequencerAddress, coinbase: this.coinbase });

    const rollupContract = RollupContract.getFromConfig(context.aztecNodeConfig);
    this.chainMonitor = new ChainMonitor(rollupContract, this.logger, 200).start();

    return this;
  }

  async teardown() {
    this.chainMonitor.stop();
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

  async mintAndBridgeFeeJuice(address: AztecAddress, amount: bigint) {
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(amount, address);
    const { claimSecret: secret, messageLeafIndex: index } = claim;
    await this.feeJuiceContract.methods.claim(address, amount, secret, index).send().wait();
  }

  /** Alice mints bananaCoin tokens privately to the target address and redeems them. */
  async mintPrivateBananas(amount: bigint, address: AztecAddress) {
    const balanceBefore = await this.bananaCoin.methods.balance_of_private(address).simulate();

    await mintTokensToPrivate(this.bananaCoin, this.adminWallet, address, amount);

    const balanceAfter = await this.bananaCoin.methods.balance_of_private(address).simulate();
    expect(balanceAfter).toEqual(balanceBefore + amount);
  }

  public async applyBaseSnapshots() {
    await this.applyInitialAccountsSnapshot();
    await this.applySetupFeeJuiceSnapshot();
    await this.applyDeployBananaTokenSnapshot();
  }

  async applyInitialAccountsSnapshot() {
    await this.snapshotManager.snapshot(
      'initial_accounts',
      deployAccounts(0, this.logger),
      async ({}, { pxe, aztecNode, aztecNodeConfig, deployL1ContractsValues }) => {
        this.pxe = pxe;

        this.aztecNode = aztecNode;
        this.gasSettings = GasSettings.default({ maxFeesPerGas: (await this.aztecNode.getCurrentBaseFees()).mul(2) });
        this.cheatCodes = await CheatCodes.create(aztecNodeConfig.l1RpcUrls, pxe);

        const fundedWallets = await getDeployedTestAccountsWallets(pxe);
        this.adminWallet = fundedWallets[0];
        this.adminAddress = this.adminWallet.getAddress();
        this.sequencerAddress = fundedWallets[1].getAddress();

        const canonicalFeeJuice = await getCanonicalFeeJuice();
        this.feeJuiceContract = await FeeJuiceContract.at(canonicalFeeJuice.address, this.adminWallet);
        this.coinbase = EthAddress.random();

        this.feeJuiceBridgeTestHarness = await FeeJuicePortalTestingHarnessFactory.create({
          aztecNode,
          aztecNodeAdmin: aztecNode,
          pxeService: pxe,
          publicClient: deployL1ContractsValues.publicClient,
          walletClient: deployL1ContractsValues.walletClient,
          wallet: this.adminWallet,
          logger: this.logger,
        });
      },
    );
  }

  async applySetupFeeJuiceSnapshot() {
    await this.snapshotManager.snapshot(
      'setup_fee_juice',
      async context => {
        await setupCanonicalFeeJuice(context.pxe);
      },
      async (_data, context) => {
        this.context = context;

        this.feeJuiceContract = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, this.adminWallet);

        this.feeJuiceBridgeTestHarness = await FeeJuicePortalTestingHarnessFactory.create({
          aztecNode: context.aztecNode,
          aztecNodeAdmin: context.aztecNode,
          pxeService: context.pxe,
          publicClient: context.deployL1ContractsValues.publicClient,
          walletClient: context.deployL1ContractsValues.walletClient,
          wallet: this.adminWallet,
          logger: this.logger,
        });
      },
    );
  }

  async applyDeployBananaTokenSnapshot() {
    await this.snapshotManager.snapshot(
      'deploy_banana_token',
      async () => {
        const bananaCoin = await BananaCoin.deploy(this.adminWallet, this.adminAddress, 'BC', 'BC', 18n)
          .send()
          .deployed();
        this.logger.info(`BananaCoin deployed at ${bananaCoin.address}`);
        return { bananaCoinAddress: bananaCoin.address };
      },
      async ({ bananaCoinAddress }) => {
        this.bananaCoin = await BananaCoin.at(bananaCoinAddress, this.adminWallet);
      },
    );
  }

  public async applyFPCSetupSnapshot() {
    await this.snapshotManager.snapshot(
      'fpc_setup',
      async context => {
        const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
        expect((await context.pxe.getContractMetadata(feeJuiceContract.address)).isContractPubliclyDeployed).toBe(true);

        const bananaCoin = this.bananaCoin;
        const bananaFPC = await FPCContract.deploy(this.adminWallet, bananaCoin.address, this.adminAddress)
          .send()
          .deployed();

        this.logger.info(`BananaPay deployed at ${bananaFPC.address}`);

        await this.feeJuiceBridgeTestHarness.bridgeFromL1ToL2(FEE_FUNDING_FOR_TESTER_ACCOUNT, bananaFPC.address);

        return {
          bananaFPCAddress: bananaFPC.address,
          feeJuiceAddress: feeJuiceContract.address,
          l1FeeJuiceAddress: this.feeJuiceBridgeTestHarness.l1FeeJuiceAddress,
          rollupAddress: context.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
        };
      },
      async (data, context) => {
        const bananaFPC = await FPCContract.at(data.bananaFPCAddress, this.adminWallet);
        this.bananaFPC = bananaFPC;
      },
    );
  }

  public async applySponsoredFPCSetupSnapshot() {
    await this.snapshotManager.snapshot(
      'sponsored_fpc_setup',
      async context => {
        const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
        expect((await context.pxe.getContractMetadata(feeJuiceContract.address)).isContractPubliclyDeployed).toBe(true);

        this.sponsoredFPC = await setupSponsoredFPC(context.pxe);
        this.logger.info(`SponsoredFPC deployed at ${this.sponsoredFPC.address}`);

        return {
          sponsoredFPCAddress: this.sponsoredFPC.address,
        };
      },
      async data => {
        const sponsoredFPC = await SponsoredFPCContract.at(data.sponsoredFPCAddress, this.adminWallet);
        this.sponsoredFPC = sponsoredFPC;
      },
    );
  }
}
