import { getEcdsaRAccount } from '@aztec/accounts/ecdsa';
import { getSchnorrAccount, getSchnorrWallet } from '@aztec/accounts/schnorr';
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import {
  type AccountWallet,
  AztecAddress,
  type AztecNode,
  type Logger,
  type PXE,
  createLogger,
  sleep,
} from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import { type DeployL1ContractsArgs, RollupContract, createL1Clients, deployL1Contract } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TestERC20Bytecode } from '@aztec/l1-artifacts/TestERC20Bytecode';
import { CounterContract } from '@aztec/noir-contracts.js/Counter';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract as BananaCoin, TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { type PXEServiceConfig, createPXEService, getPXEServiceConfig } from '@aztec/pxe/server';
import { GasSettings } from '@aztec/stdlib/gas';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { MNEMONIC } from '../fixtures/fixtures.js';
import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
} from '../fixtures/snapshot_manager.js';
import { mintTokensToPrivate } from '../fixtures/token_utils.js';
import { type SetupOptions, setupCanonicalFeeJuice, setupSponsoredFPC } from '../fixtures/utils.js';
import { type CrossChainContext, CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';
import { FeeJuicePortalTestingHarnessFactory, type GasBridgingTestHarness } from '../shared/gas_portal_test_harness.js';

const { E2E_DATA_PATH: dataPath } = process.env;

export type AccountType = 'ecdsar1' | 'schnorr';

export class ClientFlowsTest {
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
  public crossChainTestHarness!: CrossChainTestHarness;

  public userPXE!: PXE;

  constructor(testName?: string, setupOptions: Partial<SetupOptions & DeployL1ContractsArgs> = {}) {
    this.logger = createLogger(`e2e:e2e_client_flows${testName ? `:${testName}` : ''}`);
    this.snapshotManager = createSnapshotManager(
      `e2e_client_flows${testName ? `/${testName}` : ''}`,
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

  async mintAndBridgeFeeJuice(address: AztecAddress, amount: bigint) {
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(amount, address);
    const { claimSecret: secret, messageLeafIndex: index } = claim;
    await this.feeJuiceContract.methods.claim(address, amount, secret, index).send().wait();
  }

  /** Admin mints bananaCoin tokens privately to the target address and redeems them. */
  async mintPrivateBananas(amount: bigint, address: AztecAddress) {
    const balanceBefore = await this.bananaCoin.methods.balance_of_private(address).simulate();

    await mintTokensToPrivate(this.bananaCoin, this.adminWallet, address, amount);

    const balanceAfter = await this.bananaCoin.methods.balance_of_private(address).simulate();
    expect(balanceAfter).toEqual(balanceBefore + amount);
  }

  async createBenchmarkingAccountManager(type: 'ecdsar1' | 'schnorr') {
    const benchysSecretKey = Fr.random();

    let benchysPrivateSigningKey;
    let benchysAccountManager;
    if (type === 'schnorr') {
      benchysPrivateSigningKey = deriveSigningKey(benchysSecretKey);
      benchysAccountManager = await getSchnorrAccount(this.userPXE, benchysSecretKey, benchysPrivateSigningKey);
    } else if (type === 'ecdsar1') {
      benchysPrivateSigningKey = randomBytes(32);
      benchysAccountManager = await getEcdsaRAccount(this.userPXE, benchysSecretKey, benchysPrivateSigningKey);
    } else {
      throw new Error(`Unknown account type: ${type}`);
    }
    await benchysAccountManager.register();
    return benchysAccountManager;
  }

  public async applyBaseSnapshots() {
    await this.applyInitialAccountsSnapshot();
    await this.applySetupFeeJuiceSnapshot();
  }

  async applyInitialAccountsSnapshot() {
    await this.snapshotManager.snapshot(
      'initial_accounts',
      deployAccounts(2, this.logger),
      async ({ deployedAccounts }, { pxe, aztecNode, aztecNodeConfig }) => {
        this.pxe = pxe;

        this.aztecNode = aztecNode;
        this.gasSettings = GasSettings.default({ maxFeesPerGas: (await this.aztecNode.getCurrentBaseFees()).mul(2) });
        this.cheatCodes = await CheatCodes.create(aztecNodeConfig.l1RpcUrls, pxe);

        const deployedWallets = await Promise.all(
          deployedAccounts.map(a => getSchnorrWallet(pxe, a.address, a.signingKey)),
        );
        [this.adminWallet] = deployedWallets;
        this.adminAddress = this.adminWallet.getAddress();
        this.sequencerAddress = deployedWallets[1].getAddress();

        const canonicalFeeJuice = await getCanonicalFeeJuice();
        this.feeJuiceContract = await FeeJuiceContract.at(canonicalFeeJuice.address, this.adminWallet);
        this.coinbase = EthAddress.random();

        const userPXEConfig = getPXEServiceConfig();
        const l1Contracts = await aztecNode.getL1ContractAddresses();
        const userPXEConfigWithContracts = {
          ...userPXEConfig,
          proverEnabled: ['true', '1'].includes(process.env.REAL_PROOFS ?? ''),
          l1Contracts,
        } as PXEServiceConfig;

        this.userPXE = await createPXEService(this.aztecNode, userPXEConfigWithContracts, 'pxe-user');
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
        this.bananaFPC = await FPCContract.deploy(this.adminWallet, bananaCoin.address, this.adminAddress)
          .send()
          .deployed();

        this.logger.info(`BananaPay deployed at ${this.bananaFPC.address}`);

        await this.feeJuiceBridgeTestHarness.bridgeFromL1ToL2(FEE_FUNDING_FOR_TESTER_ACCOUNT, this.bananaFPC.address);

        return { bananaFPCAddress: this.bananaFPC.address };
      },
      async data => {
        const bananaFPC = await FPCContract.at(data.bananaFPCAddress, this.adminWallet);
        this.bananaFPC = bananaFPC;
      },
    );
  }

  public async applyCrossChainHarnessSnapshot(owner: AccountWallet) {
    await this.snapshotManager.snapshot(
      'cross_chain_harness',
      async context => {
        const { publicClient, walletClient } = createL1Clients(context.aztecNodeConfig.l1RpcUrls, MNEMONIC);

        const underlyingERC20Address = await deployL1Contract(
          walletClient,
          publicClient,
          TestERC20Abi,
          TestERC20Bytecode,
          ['Underlying', 'UND', walletClient.account.address],
        ).then(({ address }) => address);

        this.logger.verbose(`Setting up cross chain harness...`);
        this.crossChainTestHarness = await CrossChainTestHarness.new(
          this.aztecNode,
          this.pxe,
          publicClient,
          walletClient,
          owner,
          this.logger,
          underlyingERC20Address,
        );

        this.logger.verbose(`L2 token deployed to: ${this.crossChainTestHarness.l2Token.address}`);

        return this.crossChainTestHarness.toCrossChainContext();
      },
      async (data: CrossChainContext, context) => {
        const l2Token = await TokenContract.at(data.l2Token, owner);
        const l2Bridge = await TokenBridgeContract.at(data.l2Bridge, owner);

        // There is an issue with the reviver so we are getting strings sometimes. Working around it here.
        const ethAccount = EthAddress.fromString(data.ethAccount.toString());
        const tokenPortalAddress = EthAddress.fromString(data.tokenPortal.toString());

        const { publicClient, walletClient } = createL1Clients(this.context.aztecNodeConfig.l1RpcUrls, MNEMONIC);

        this.crossChainTestHarness = new CrossChainTestHarness(
          this.aztecNode,
          this.pxe,
          this.logger,
          l2Token,
          l2Bridge,
          ethAccount,
          tokenPortalAddress,
          data.underlying,
          publicClient,
          walletClient,
          context.aztecNodeConfig.l1Contracts,
          owner,
        );
      },
    );
  }
}
