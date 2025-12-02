import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  FeeJuicePaymentMethodWithClaim,
  type FeePaymentMethod,
  PrivateFeePaymentMethod,
  SponsoredFeePaymentMethod,
} from '@aztec/aztec.js/fee';
import { createLogger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { RollupContract, createExtendedL1Client, deployL1Contract } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TestERC20Bytecode } from '@aztec/l1-artifacts/TestERC20Bytecode';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract as BananaCoin, TokenContract } from '@aztec/noir-contracts.js/Token';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/server';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { GasSettings } from '@aztec/stdlib/gas';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { TestWallet } from '@aztec/test-wallet/server';

import { BaseEndToEndTest } from '../../fixtures/base_end_to_end_test.js';
import { MNEMONIC } from '../../fixtures/fixtures.js';
import { mintTokensToPrivate } from '../../fixtures/token_utils.js';
import { type SetupOptions, setupSponsoredFPC } from '../../fixtures/utils.js';
import { CrossChainTestHarness } from '../../shared/cross_chain_test_harness.js';
import {
  FeeJuicePortalTestingHarnessFactory,
  type GasBridgingTestHarness,
} from '../../shared/gas_portal_test_harness.js';
import { ProxyLogger } from './benchmark.js';
import { type ClientFlowsConfig, FULL_FLOWS_CONFIG, KEY_FLOWS_CONFIG } from './config.js';

const { BENCHMARK_CONFIG } = process.env;

export type AccountType = 'ecdsar1' | 'schnorr';
export type FeePaymentMethodGetter = (wallet: Wallet, sender: AztecAddress) => Promise<FeePaymentMethod | undefined>;
export type BenchmarkingFeePaymentMethod = 'bridged_fee_juice' | 'private_fpc' | 'sponsored_fpc' | 'fee_juice';

export class ClientFlowsBenchmark extends BaseEndToEndTest {
  // Properties inherited from BaseEndToEndTest:
  // - aztecNode, wallet, accounts, cheatCodes, deployL1ContractsValues, logger, context

  public chainMonitor!: ChainMonitor;
  public feeJuiceBridgeTestHarness!: GasBridgingTestHarness;
  public adminWallet!: TestWallet;

  // The admin that aids in the setup of the test
  public adminAddress!: AztecAddress;

  // Aztec Node config
  public sequencerAddress!: AztecAddress;
  public coinbase!: EthAddress;

  // Contracts
  public feeJuiceContract!: FeeJuiceContract;
  // Asset in which fees are paid via FPC
  public bananaCoin!: BananaCoin;
  public bananaCoinInstance!: ContractInstanceWithAddress;
  public bananaFPC!: FPCContract;
  public bananaFPCInstance!: ContractInstanceWithAddress;
  // Random asset we want to trade
  public candyBarCoin!: TokenContract;
  public candyBarCoinInstance!: ContractInstanceWithAddress;
  // AMM contract
  public amm!: AMMContract;
  public ammInstance!: ContractInstanceWithAddress;
  // Liquidity token for AMM
  public liquidityToken!: TokenContract;
  public liquidityTokenInstance!: ContractInstanceWithAddress;
  // Sponsored FPC contract
  public sponsoredFPC!: SponsoredFPCContract;
  public sponsoredFPCInstance!: ContractInstanceWithAddress;

  // PXE and Wallet used by the benchmarking user. It can be set up with client-side proving enabled
  public userWallet!: TestWallet;

  public realProofs = ['true', '1'].includes(process.env.REAL_PROOFS ?? '');

  public paymentMethods: Record<BenchmarkingFeePaymentMethod, { forWallet: FeePaymentMethodGetter; circuits: number }> =
    {
      // eslint-disable-next-line camelcase
      bridged_fee_juice: {
        forWallet: this.getBridgedFeeJuicePaymentMethodForWallet.bind(this),
        circuits: 2, // FeeJuice claim + kernel inner
      },
      // eslint-disable-next-line camelcase
      private_fpc: {
        forWallet: this.getPrivateFPCPaymentMethodForWallet.bind(this),
        circuits:
          2 + // FPC entrypoint + kernel inner
          2 + // BananaCoin transfer_to_public + kernel inner
          2 + // Account verify_private_authwit + kernel inner
          2, // BananaCoin prepare_private_balance_increase + kernel inner
      },
      // eslint-disable-next-line camelcase
      sponsored_fpc: {
        forWallet: this.getSponsoredFPCPaymentMethodForWallet.bind(this),
        circuits: 2, // Sponsored FPC sponsor_unconditionally + kernel inner
      },
      // eslint-disable-next-line camelcase
      fee_juice: {
        forWallet: () => Promise.resolve(undefined),
        circuits: 0,
      },
    };

  public config: ClientFlowsConfig;

  private proxyLogger: ProxyLogger;
  private setupOptions: Partial<SetupOptions>;

  constructor(testName?: string, setupOptions: Partial<SetupOptions> = {}) {
    super(testName ?? 'client_flows', createLogger(`bench:client_flows${testName ? `:${testName}` : ''}`));
    this.setupOptions = setupOptions;
    this.config = BENCHMARK_CONFIG === 'key_flows' ? KEY_FLOWS_CONFIG : FULL_FLOWS_CONFIG;
    ProxyLogger.create();
    this.proxyLogger = ProxyLogger.getInstance();
  }

  override async setup(): Promise<this> {
    await super.setup(2, { startProverNode: true, ...this.setupOptions });
    await this.aztecNode.setConfig({ feeRecipient: this.sequencerAddress, coinbase: this.coinbase });

    const rollupContract = RollupContract.getFromConfig(this.context.config);
    this.chainMonitor = new ChainMonitor(rollupContract, this.dateProvider!, this.logger, 200).start();

    return this;
  }

  override async teardown() {
    await this.chainMonitor.stop();
    await super.teardown();
  }

  async mintAndBridgeFeeJuice(address: AztecAddress) {
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(address);
    const { claimSecret: secret, messageLeafIndex: index } = claim;
    await this.feeJuiceContract.methods
      .claim(address, claim.claimAmount, secret, index)
      .send({ from: this.adminAddress })
      .wait();
  }

  /** Admin mints bananaCoin tokens privately to the target address and redeems them. */
  async mintPrivateBananas(amount: bigint, address: AztecAddress) {
    const balanceBefore = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: this.adminAddress });

    await mintTokensToPrivate(this.bananaCoin, this.adminAddress, address, amount);

    const balanceAfter = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: this.adminAddress });
    expect(balanceAfter).toEqual(balanceBefore + amount);
  }

  createBenchmarkingAccountManager(wallet: TestWallet, type: 'ecdsar1' | 'schnorr') {
    const benchysSecret = Fr.random();
    const salt = Fr.random();

    let benchysPrivateSigningKey;
    if (type === 'schnorr') {
      benchysPrivateSigningKey = deriveSigningKey(benchysSecret);
      return wallet.createSchnorrAccount(benchysSecret, salt, benchysPrivateSigningKey);
    } else if (type === 'ecdsar1') {
      benchysPrivateSigningKey = randomBytes(32);
      return wallet.createECDSARAccount(benchysSecret, salt, benchysPrivateSigningKey);
    } else {
      throw new Error(`Unknown account type: ${type}`);
    }
  }

  public async setupBasicContracts() {
    await this.initializeAccounts();
    await this.setupFeeJuice();
  }

  async initializeAccounts() {
    // Accounts are already deployed by setup() - just assign them
    this.adminWallet = this.wallet;
    this.adminAddress = this.accounts[0];
    this.sequencerAddress = this.accounts[1];

    const canonicalFeeJuice = await getCanonicalFeeJuice();
    this.feeJuiceContract = await FeeJuiceContract.at(canonicalFeeJuice.address, this.adminWallet);
    this.coinbase = EthAddress.random();

    const userPXEConfig = getPXEConfig();
    const userPXEConfigWithContracts = {
      ...userPXEConfig,
      proverEnabled: this.realProofs,
    } as PXEConfig;

    this.userWallet = await TestWallet.create(this.aztecNode, userPXEConfigWithContracts, {
      loggers: {
        prover: this.proxyLogger.createLogger('pxe:bb:wasm:bundle:proxied'),
      },
    });
  }

  async setupFeeJuice() {
    this.feeJuiceContract = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, this.adminWallet);

    this.feeJuiceBridgeTestHarness = await FeeJuicePortalTestingHarnessFactory.create({
      aztecNode: this.aztecNode,
      aztecNodeAdmin: this.aztecNode,
      l1Client: this.deployL1ContractsValues.l1Client,
      wallet: this.adminWallet,
      logger: this.logger,
    });
  }

  async deployBananaToken() {
    const { contract: bananaCoin, instance } = await BananaCoin.deploy(
      this.adminWallet,
      this.adminAddress,
      'BC',
      'BC',
      18n,
    )
      .send({ from: this.adminAddress })
      .wait();
    this.logger.info(`BananaCoin deployed at ${bananaCoin.address}`);
    this.bananaCoin = await BananaCoin.at(bananaCoin.address, this.adminWallet);
    this.bananaCoinInstance = instance;
  }

  async deployCandyBarToken() {
    const { contract: candyBarCoin, instance } = await TokenContract.deploy(
      this.adminWallet,
      this.adminAddress,
      'CBC',
      'CBC',
      18n,
    )
      .send({ from: this.adminAddress })
      .wait();
    this.logger.info(`CandyBarCoin deployed at ${candyBarCoin.address}`);
    this.candyBarCoin = await TokenContract.at(candyBarCoin.address, this.adminWallet);
    this.candyBarCoinInstance = instance;
  }

  public async setupFPC() {
    const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
    expect((await this.wallet.getContractMetadata(feeJuiceContract.address)).isContractPublished).toBe(true);

    const bananaCoin = this.bananaCoin;
    const { contract: bananaFPC, instance } = await FPCContract.deploy(
      this.adminWallet,
      bananaCoin.address,
      this.adminAddress,
    )
      .send({ from: this.adminAddress })
      .wait();

    this.logger.info(`BananaPay deployed at ${bananaFPC.address}`);

    await this.feeJuiceBridgeTestHarness.bridgeFromL1ToL2(bananaFPC.address, this.adminAddress);

    this.bananaFPC = await FPCContract.at(bananaFPC.address, this.adminWallet);
    this.bananaFPCInstance = instance;
  }

  async deploySponsoredFPC() {
    const instance = await setupSponsoredFPC(this.adminWallet);
    this.logger.info(`SponsoredFPC at ${instance.address}`);
    this.sponsoredFPC = await SponsoredFPCContract.at(instance.address, this.adminWallet);
    this.sponsoredFPCInstance = instance;
  }

  public async createCrossChainTestHarness(owner: AztecAddress) {
    const l1Client = createExtendedL1Client(this.context.config.l1RpcUrls, MNEMONIC);

    const underlyingERC20Address = await deployL1Contract(l1Client, TestERC20Abi, TestERC20Bytecode, [
      'Underlying',
      'UND',
      l1Client.account.address,
    ]).then(({ address }) => address);

    this.logger.verbose(`Setting up cross chain harness...`);
    const crossChainTestHarness = await CrossChainTestHarness.new(
      this.aztecNode,
      l1Client,
      this.adminWallet,
      owner,
      this.logger,
      underlyingERC20Address,
    );

    this.logger.verbose(`L2 token deployed to: ${crossChainTestHarness.l2Token.address}`);

    return crossChainTestHarness;
  }

  public async createAndFundBenchmarkingAccountOnUserWallet(accountType: AccountType) {
    const benchysAccountManager = await this.createBenchmarkingAccountManager(this.adminWallet, accountType);
    const benchysAccount = await benchysAccountManager.getAccount();
    const benchysAddress = benchysAccountManager.address;
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(benchysAddress);
    const behchysDeployMethod = await benchysAccountManager.getDeployMethod();
    await behchysDeployMethod
      .send({
        from: AztecAddress.ZERO,
        fee: { paymentMethod: new FeeJuicePaymentMethodWithClaim(benchysAddress, claim) },
      })
      .wait();
    // Register benchy on the user's Wallet, where we're going to be interacting from
    const accountManager = await this.userWallet.createAccount({
      secret: benchysAccount.getSecretKey(),
      salt: new Fr(benchysAccount.salt),
      contract: benchysAccountManager.getAccountContract(),
    });
    return accountManager.address;
  }

  public async deployAMM() {
    const { contract: liquidityToken, instance: liquidityTokenInstance } = await TokenContract.deploy(
      this.adminWallet,
      this.adminAddress,
      'LPT',
      'LPT',
      18n,
    )
      .send({ from: this.adminAddress })
      .wait();
    const { contract: amm, instance: ammInstance } = await AMMContract.deploy(
      this.adminWallet,
      this.bananaCoin.address,
      this.candyBarCoin.address,
      liquidityToken.address,
    )
      .send({ from: this.adminAddress })
      .wait();
    this.logger.info(`AMM deployed at ${amm.address}`);
    await liquidityToken.methods.set_minter(amm.address, true).send({ from: this.adminAddress }).wait();

    this.liquidityToken = await TokenContract.at(liquidityToken.address, this.adminWallet);
    this.liquidityTokenInstance = liquidityTokenInstance;
    this.amm = await AMMContract.at(amm.address, this.adminWallet);
    this.ammInstance = ammInstance;
  }

  public async getBridgedFeeJuicePaymentMethodForWallet(_wallet: Wallet, sender: AztecAddress) {
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(sender);
    return new FeeJuicePaymentMethodWithClaim(sender, claim);
  }

  public async getPrivateFPCPaymentMethodForWallet(wallet: Wallet, sender: AztecAddress) {
    // The private fee paying method assembled on the app side requires knowledge of the maximum
    // fee the user is willing to pay
    const maxFeesPerGas = (await this.aztecNode.getCurrentBaseFees()).mul(1.5);
    const gasSettings = GasSettings.default({ maxFeesPerGas });
    return new PrivateFeePaymentMethod(this.bananaFPC.address, sender, wallet, gasSettings);
  }

  public getSponsoredFPCPaymentMethodForWallet(_wallet: Wallet, _sender: AztecAddress) {
    return Promise.resolve(new SponsoredFeePaymentMethod(this.sponsoredFPC.address));
  }
}
