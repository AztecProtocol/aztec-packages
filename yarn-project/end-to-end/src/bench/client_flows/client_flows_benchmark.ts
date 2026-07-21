import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { FeeJuicePaymentMethodWithClaim } from '@aztec/aztec.js/fee';
import { type FeePaymentMethod, PrivateFeePaymentMethod, SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { CheatCodes, getTokenAllowedSetupFunctions } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsArgs } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { ChainMonitor } from '@aztec/ethereum/test';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TestERC20Bytecode } from '@aztec/l1-artifacts/TestERC20Bytecode';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TestTokenContract as BananaCoin, TestTokenContract } from '@aztec/noir-test-contracts.js/TestToken';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/server';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
<<<<<<< HEAD
import { deriveSigningKey } from '@aztec/stdlib/keys';
=======
>>>>>>> origin/v5-next
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import {
  AUTOMINE_E2E_OPTS,
  L1_DIRECT_WRITE_ACCOUNT_INDEX,
  MNEMONIC,
  getPaddedMaxFeesPerGas,
} from '../../fixtures/fixtures.js';
import { type EndToEndContext, type SetupOptions, setup, teardown } from '../../fixtures/setup.js';
import { mintTokensToPrivate } from '../../fixtures/token_utils.js';
import { setupSponsoredFPC } from '../../fixtures/utils.js';
import { CrossChainTestHarness } from '../../shared/cross_chain_test_harness.js';
import {
  FeeJuicePortalTestingHarnessFactory,
  type GasBridgingTestHarness,
} from '../../shared/gas_portal_test_harness.js';
import { TestWallet } from '../../test-wallet/test_wallet.js';
import { ProxyLogger } from './benchmark.js';
import { type ClientFlowsConfig, FULL_FLOWS_CONFIG, KEY_FLOWS_CONFIG } from './config.js';

const { BENCHMARK_CONFIG } = process.env;

export type AccountType = 'ecdsar1' | 'schnorr';
export type FeePaymentMethodGetter = (wallet: Wallet, sender: AztecAddress) => Promise<FeePaymentMethod | undefined>;
export type BenchmarkingFeePaymentMethod = 'bridged_fee_juice' | 'private_fpc' | 'sponsored_fpc' | 'fee_juice';

export class ClientFlowsBenchmark {
  public logger: Logger;
  public aztecNode!: AztecNode;
  public cheatCodes!: CheatCodes;
  public context!: EndToEndContext;
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
  public candyBarCoin!: TestTokenContract;
  public candyBarCoinInstance!: ContractInstanceWithAddress;
  // AMM contract
  public amm!: AMMContract;
  public ammInstance!: ContractInstanceWithAddress;
  // Liquidity token for AMM
  public liquidityToken!: TestTokenContract;
  public liquidityTokenInstance!: ContractInstanceWithAddress;
  // Sponsored FPC contract
  public sponsoredFPC!: SponsoredFPCContract;
  public sponsoredFPCInstance!: ContractInstanceWithAddress;

  // PXE and Wallet used by the benchmarking user. It can be set up with client-side proving enabled
  public userWallet!: TestWallet;

  public realProofs = ['true', '1'].includes(process.env.REAL_PROOFS ?? '');

  // `apps` is the number of private function calls contributed by this payment method.
  // Each app produces one execution step at proving time; the orchestrator additionally produces
  // one kernel step per batch of N apps (see `expectedExecutionSteps` in `benchmark.ts`).
  public paymentMethods: Record<BenchmarkingFeePaymentMethod, { forWallet: FeePaymentMethodGetter; apps: number }> = {
    // eslint-disable-next-line camelcase
    bridged_fee_juice: {
      forWallet: this.getBridgedFeeJuicePaymentMethodForWallet.bind(this),
      apps: 1, // FeeJuice claim
    },
    // eslint-disable-next-line camelcase
    private_fpc: {
      forWallet: this.getPrivateFPCPaymentMethodForWallet.bind(this),
      apps:
        1 + // FPC entrypoint
        1 + // BananaCoin transfer_to_public
        1 + // Account verify_private_authwit
        1, // BananaCoin prepare_private_balance_increase
    },
    // eslint-disable-next-line camelcase
    sponsored_fpc: {
      forWallet: this.getSponsoredFPCPaymentMethodForWallet.bind(this),
      apps: 1, // Sponsored FPC sponsor_unconditionally
    },
    // eslint-disable-next-line camelcase
    fee_juice: {
      forWallet: () => Promise.resolve(undefined),
      apps: 0,
    },
  };

  public config: ClientFlowsConfig;

  private proxyLogger: ProxyLogger;
  private setupOptions: Partial<SetupOptions & DeployAztecL1ContractsArgs>;

  constructor(testName?: string, setupOptions: Partial<SetupOptions & DeployAztecL1ContractsArgs> = {}) {
    this.logger = createLogger(`bench:client_flows${testName ? `:${testName}` : ''}`);
    this.setupOptions = { ...AUTOMINE_E2E_OPTS, startProverNode: true, ...setupOptions };
    this.config = BENCHMARK_CONFIG === 'key_flows' ? KEY_FLOWS_CONFIG : FULL_FLOWS_CONFIG;
    ProxyLogger.create();
    this.proxyLogger = ProxyLogger.getInstance();
  }

  async setup() {
    this.logger.info('Setting up subsystems from fresh');
    // Token allowlist entries are test-only: FPC-based fee payment with custom tokens won't work on mainnet alpha.
    // BananaCoin is the codegen'd TestToken here, so the allowlist must key on its class, not canonical Token's.
    const tokenAllowList = await getTokenAllowedSetupFunctions(BananaCoin.artifact);
    this.context = await setup(2, {
      ...this.setupOptions,
      fundSponsoredFPC: true,
      l1ContractsArgs: this.setupOptions,
      txPublicSetupAllowListExtend: [...(this.setupOptions.txPublicSetupAllowListExtend ?? []), ...tokenAllowList],
    });
    await this.applyBaseSetup();

    await this.context.aztecNodeService.setConfig({ feeRecipient: this.sequencerAddress, coinbase: this.coinbase });

    const rollupContract = RollupContract.getFromConfig(this.context.config);
    this.chainMonitor = new ChainMonitor(rollupContract, this.context.dateProvider, this.logger, 200).start();

    return this;
  }

  async teardown() {
    await this.chainMonitor.stop();
    await this.userWallet?.stop();
    await teardown(this.context);
  }

  async mintAndBridgeFeeJuice(address: AztecAddress) {
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(address);
    const { claimSecret: secret, messageLeafIndex: index } = claim;
    await this.feeJuiceContract.methods
      .claim(address, claim.claimAmount, secret, index)
      .send({ from: this.adminAddress });
  }

  /** Admin mints bananaCoin tokens privately to the target address and redeems them. */
  async mintPrivateBananas(amount: bigint, address: AztecAddress) {
    const { result: balanceBefore } = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: address });

    await mintTokensToPrivate(this.bananaCoin, this.adminAddress, address, amount);

    const { result: balanceAfter } = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: address });
    expect(balanceAfter).toEqual(balanceBefore + amount);
  }

  createBenchmarkingAccountManager(wallet: TestWallet, type: 'ecdsar1' | 'schnorr') {
    const benchysSecret = Fr.random();
    const salt = Fr.random();

    let benchysPrivateSigningKey;
    if (type === 'schnorr') {
      benchysPrivateSigningKey = GrumpkinScalar.random();
      return wallet.createSchnorrAccount(benchysSecret, salt, benchysPrivateSigningKey);
    } else if (type === 'ecdsar1') {
      benchysPrivateSigningKey = randomBytes(32);
      return wallet.createECDSARAccount(benchysSecret, salt, benchysPrivateSigningKey);
    } else {
      throw new Error(`Unknown account type: ${type}`);
    }
  }

  public async applyBaseSetup() {
    await this.applyInitialAccounts();
    await this.applySetupFeeJuice();
  }

  async applyInitialAccounts() {
    this.logger.info('Applying initial accounts setup');
    const [adminAddress, sequencerAddress] = this.context.accounts;

    this.adminWallet = this.context.wallet;
    this.aztecNode = this.context.aztecNodeService;
    this.cheatCodes = this.context.cheatCodes;

    this.adminAddress = adminAddress;
    this.sequencerAddress = sequencerAddress;

    const canonicalFeeJuice = await getCanonicalFeeJuice();
    this.feeJuiceContract = FeeJuiceContract.at(canonicalFeeJuice.address, this.adminWallet);
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
      // The benchmark measures steady-state app cost, not first-send discovery cost. Reproduce the pre-handshake-default
      // behavior of unconstrained delivery: derive the tagging secret from the (sender, recipient) key pair via ECDH
      // instead of taking the current default (a non-interactive handshake, which injects two extra private app
      // executions and a nullifier per cold chain). Constrained delivery is unaffected: the Noir circuit rejects
      // address-derived for constrained, so the hook falls through to a handshake there.
      hooks: {
        resolveTaggingSecretStrategy: ({ deliveryMode }) =>
          Promise.resolve(
            deliveryMode === AppTaggingSecretKind.UNCONSTRAINED
              ? { type: 'address-derived' }
              : { type: 'non-interactive-handshake' },
          ),
      },
    });
  }

  async applySetupFeeJuice() {
    this.logger.info('Applying fee juice setup');
    this.feeJuiceContract = FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, this.adminWallet);

    this.feeJuiceBridgeTestHarness = await FeeJuicePortalTestingHarnessFactory.create({
      aztecNode: this.context.aztecNodeService,
      aztecNodeAdmin: this.context.aztecNodeService,
      // Bridge from a dedicated L1 account so its direct writes don't race the sequencer publisher's
      // txs on the deployer account (see L1_DIRECT_WRITE_ACCOUNT_INDEX).
      l1Client: createExtendedL1Client(
        this.context.config.l1RpcUrls,
        MNEMONIC,
        undefined,
        undefined,
        L1_DIRECT_WRITE_ACCOUNT_INDEX,
      ),
      wallet: this.adminWallet,
      logger: this.logger,
    });
  }

  async applyDeployBananaToken() {
    this.logger.info('Applying banana token deployment');
    const { contract: bananaCoin, instance: bananaCoinInstance } = await BananaCoin.deploy(
      this.adminWallet,
      this.adminAddress,
      'BC',
      'BC',
      18n,
    ).send({
      from: this.adminAddress,
    });
    this.logger.info(`BananaCoin deployed at ${bananaCoin.address}`);
    this.bananaCoin = bananaCoin;
    this.bananaCoinInstance = bananaCoinInstance;
  }

  async applyDeployCandyBarToken() {
    this.logger.info('Applying candy bar token deployment');
    const { contract: candyBarCoin, instance: candyBarCoinInstance } = await TestTokenContract.deploy(
      this.adminWallet,
      this.adminAddress,
      'CBC',
      'CBC',
      18n,
    ).send({
      from: this.adminAddress,
    });
    this.logger.info(`CandyBarCoin deployed at ${candyBarCoin.address}`);
    this.candyBarCoin = candyBarCoin;
    this.candyBarCoinInstance = candyBarCoinInstance;
  }

  public async applyFPCSetup() {
    this.logger.info('Applying FPC setup');
    const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
    expect((await this.context.wallet.getContractMetadata(feeJuiceContract.address)).isContractPublished).toBe(true);

    const bananaCoin = this.bananaCoin;
    const { contract: bananaFPC, instance: bananaFPCInstance } = await FPCContract.deploy(
      this.adminWallet,
      bananaCoin.address,
      this.adminAddress,
    ).send({
      from: this.adminAddress,
    });

    this.logger.info(`BananaPay deployed at ${bananaFPC.address}`);

    await this.feeJuiceBridgeTestHarness.bridgeFromL1ToL2(bananaFPC.address, this.adminAddress);

    this.bananaFPC = bananaFPC;
    this.bananaFPCInstance = bananaFPCInstance;
  }

  async applyDeploySponsoredFPC() {
    this.logger.info('Applying sponsored FPC deployment');
    const sponsoredFPCInstance = await setupSponsoredFPC(this.adminWallet);
    this.logger.info(`SponsoredFPC at ${sponsoredFPCInstance.address}`);
    this.sponsoredFPC = SponsoredFPCContract.at(sponsoredFPCInstance.address, this.adminWallet);
    this.sponsoredFPCInstance = sponsoredFPCInstance;
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
    const benchysAddress = benchysAccountManager.address;
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(benchysAddress);
    const behchysDeployMethod = await benchysAccountManager.getDeployMethod();
    await behchysDeployMethod.send({
      from: NO_FROM,
      fee: { paymentMethod: new FeeJuicePaymentMethodWithClaim(benchysAddress, claim) },
    });
    // Register benchy on the user's Wallet, where we're going to be interacting from
    const accountManager = await this.userWallet.createAccount({
      secret: benchysAccountManager.getSecretKey(),
      salt: new Fr(benchysAccountManager.getInstance().salt),
      contract: benchysAccountManager.getAccountContract(),
    });
    return accountManager.address;
  }

  public async applyDeployAmm() {
    this.logger.info('Applying AMM deployment');
    const { contract: liquidityToken, instance: liquidityTokenInstance } = await TestTokenContract.deploy(
      this.adminWallet,
      this.adminAddress,
      'LPT',
      'LPT',
      18n,
    ).send({
      from: this.adminAddress,
    });
    const { contract: amm, instance: ammInstance } = await AMMContract.deploy(
      this.adminWallet,
      this.bananaCoin.address,
      this.candyBarCoin.address,
      liquidityToken.address,
    ).send({ from: this.adminAddress });
    this.logger.info(`AMM deployed at ${amm.address}`);
    await liquidityToken.methods.set_minter(amm.address, true).send({ from: this.adminAddress });
    this.liquidityToken = liquidityToken;
    this.liquidityTokenInstance = liquidityTokenInstance;
    this.amm = amm;
    this.ammInstance = ammInstance;
  }

  public async getBridgedFeeJuicePaymentMethodForWallet(_wallet: Wallet, sender: AztecAddress) {
    const claim = await this.feeJuiceBridgeTestHarness.prepareTokensOnL1(sender);
    return new FeeJuicePaymentMethodWithClaim(sender, claim);
  }

  public async getPrivateFPCPaymentMethodForWallet(wallet: Wallet, sender: AztecAddress) {
    // The private fee paying method assembled on the app side requires knowledge of the maximum
    // fee the user is willing to pay
    const maxFeesPerGas = await getPaddedMaxFeesPerGas(this.aztecNode);
    const gasLimits = Gas.from((await this.aztecNode.getNodeInfo()).txsLimits.gas);
    const gasSettings = GasSettings.fallback({ gasLimits, maxFeesPerGas });
    return new PrivateFeePaymentMethod(this.bananaFPC.address, sender, wallet, gasSettings);
  }

  public getSponsoredFPCPaymentMethodForWallet(_wallet: Wallet, _sender: AztecAddress) {
    return Promise.resolve(new SponsoredFeePaymentMethod(this.sponsoredFPC.address));
  }
}
