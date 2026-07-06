import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { CheatCodes, getTokenAllowedSetupFunctions } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import type { RollupContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsArgs } from '@aztec/ethereum/deploy-aztec-l1-contracts';
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
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { getContract } from 'viem';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, MNEMONIC, getPaddedMaxFeesPerGas } from '../../fixtures/fixtures.js';
import { type SetupOptions, ensureAuthRegistryPublished, setup } from '../../fixtures/setup.js';
import { testSpan } from '../../fixtures/timing.js';
import { mintTokensToPrivate } from '../../fixtures/token_utils.js';
import { type BalancesFn, getBalancesFn, setupSponsoredFPC } from '../../fixtures/utils.js';
import {
  FeeJuicePortalTestingHarnessFactory,
  type GasBridgingTestHarness,
} from '../../shared/gas_portal_test_harness.js';
import { TestWallet } from '../../test-wallet/test_wallet.js';
import { SingleNodeTestContext, type SingleNodeTestOpts } from '../single_node_test_context.js';

// Fixed deploy salts so BananaCoin and its BananaFPC land at deterministic addresses given the FPC
// admin. This lets the BananaFPC's fee-juice balance be seeded at genesis (see `FeesTest.setup`)
// instead of bridged from L1 during setup — the address must be known before genesis is computed.
const BANANA_COIN_SALT = new Fr(0xba4a4a);
const BANANA_FPC_SALT = new Fr(0xfacade);

const BANANA_COIN_CONSTRUCTOR_ARGS = ['BC', 'BC', 18n] as const;

/**
 * Computes the deterministic BananaCoin and BananaFPC instances for the given admin/deployer, matching
 * what {@link FeesTest.applyDeployBananaToken} and {@link FeesTest.applyFPCSetup} deploy with the fixed
 * salts above. Used both to seed the BananaFPC's fee juice at genesis and to assert the deployed
 * addresses match the seeded one.
 */
async function computeBananaContractAddresses(admin: AztecAddress) {
  const bananaCoin = await getContractInstanceFromInstantiationParams(BananaCoin.artifact, {
    salt: BANANA_COIN_SALT,
    constructorArgs: [admin, ...BANANA_COIN_CONSTRUCTOR_ARGS],
    deployer: admin,
  });
  const bananaFPC = await getContractInstanceFromInstantiationParams(FPCContract.artifact, {
    salt: BANANA_FPC_SALT,
    constructorArgs: [bananaCoin.address, admin],
    deployer: admin,
  });
  return { bananaCoinAddress: bananaCoin.address, bananaFPCAddress: bananaFPC.address };
}

/**
 * Test fixture for testing fees. Provides the following setup steps:
 * InitialAccounts: Initializes 3 Schnorr account contracts.
 * PublicDeployAccounts: Deploys the accounts publicly.
 * DeployFeeJuice: Deploys the Fee Juice contract.
 * FPCSetup: Deploys BananaCoin and FPC contracts; the FPC's fee juice is seeded at genesis.
 * SponsoredFPCSetup: Registers the Sponsored FPC contract, whose fee juice is seeded at genesis.
 * FundAlice: Mints private and public bananas to Alice.
 * SetupSubscription: Deploys a counter contract and a subscription contract, and mints Fee Juice to the subscription contract.
 *
 * The fee-domain harness over the single-node topology: extends {@link SingleNodeTestContext} so it
 * reuses the base node tracking / chain monitor / teardown machinery, but builds its environment with
 * the bespoke fee opts below (prover node, sponsored-FPC funding, token allowlist) rather than the
 * base's default node config, and layers the fee-domain setup (FPC, fee juice, banana token) on top.
 */
export class FeesTest extends SingleNodeTestContext {
  private accounts: AztecAddress[] = [];

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

  /** The base's {@link SingleNodeTestContext.rollup}, exposed under the fee suite's historical name. */
  public rollupContract!: RollupContract;

  public feeJuiceContract!: FeeJuiceContract;
  public bananaCoin!: BananaCoin;
  public bananaFPC!: FPCContract;
  public sponsoredFPC!: SponsoredFPCContract;
  public counterContract!: CounterContract;
  public subscriptionContract!: AppSubscriptionContract;
  public feeJuiceBridgeTestHarness!: GasBridgingTestHarness;

  public getCoinbaseBalance!: () => Promise<bigint>;
  public getCoinbaseSequencerRewards!: () => Promise<bigint>;
  public getGasBalanceFn!: BalancesFn;
  public getBananaPublicBalanceFn!: BalancesFn;
  public getBananaPrivateBalanceFn!: BalancesFn;
  public getProverFee!: (blockNumber: BlockNumber) => Promise<bigint>;
  public getCommittedProverFee!: (blockNumber: BlockNumber) => Promise<bigint>;
  public getCommittedBurn!: (blockNumber: BlockNumber) => Promise<bigint>;

  public readonly ALICE_INITIAL_BANANAS = BigInt(1e22);
  public readonly SUBSCRIPTION_AMOUNT = BigInt(1e19);
  public readonly APP_SPONSORED_TX_GAS_LIMIT = BigInt(10e9);

  private testName: string;

  constructor(
    testName: string,
    private numberOfAccounts = 3,
    private setupOptions: Partial<SetupOptions & DeployAztecL1ContractsArgs> = {},
  ) {
    super();
    if (!numberOfAccounts) {
      throw new Error('There must be at least 1 initial account.');
    }
    setupOptions.coinbase ??= EthAddress.random();
    this.coinbase = setupOptions.coinbase!;
    this.testName = testName;
    this.logger = createLogger(`e2e:e2e_fees:${testName}`);
  }

  override async setup(opts: SingleNodeTestOpts = {}) {
    this.logger.verbose('Setting up fresh context...');
    // Token allowlist entries are test-only: FPC-based fee payment with custom tokens won't work on mainnet alpha.
    const tokenAllowList = await getTokenAllowedSetupFunctions();
    const context = await setup(this.numberOfAccounts, {
      startProverNode: true,
      ...this.setupOptions,
      ...opts,
      fundSponsoredFPC: true,
      // Seed the BananaFPC's fee juice at genesis instead of bridging it from L1 in applyFPCSetup. The
      // FPC admin is the first account, so its address is deterministic once the accounts are generated.
      computeExtraGenesisFundedAddresses: async defaultAccounts => [
        (await computeBananaContractAddresses(defaultAccounts[0].address)).bananaFPCAddress,
      ],
      l1ContractsArgs: { ...this.setupOptions },
      txPublicSetupAllowListExtend: [...(this.setupOptions.txPublicSetupAllowListExtend ?? []), ...tokenAllowList],
    });

    // Reuse the base context machinery (rollup, epoch cache, chain monitor, node tracking, teardown)
    // over the environment built above. Restore the FeesTest-named logger afterwards, since
    // hydrateFromContext repoints `this.logger` at the context logger.
    await this.hydrateFromContext(context);
    this.logger = createLogger(`e2e:e2e_fees:${this.testName}`);
    this.rollupContract = this.rollup;

    await this.applyBaseSetup();
  }

  async catchUpProvenChain() {
    const bn = await this.aztecNode.getBlockNumber();
    while ((await this.aztecNode.getBlockNumber('proven')) < bn) {
      await sleep(1000);
    }
  }

  /** Advances to the next epoch and waits for the proven chain to catch up, so all prior fees are paid out. */
  async waitForEpochProven() {
    await this.cheatCodes.rollup.advanceToNextEpoch();
    await this.catchUpProvenChain();
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
    await testSpan('setup:bridge', () =>
      this.feeJuiceContract.methods.claim(recipient, claim.claimAmount, secret, index).send({ from: minter }),
    );
  }

  /** Alice mints bananaCoin tokens privately to the target address and redeems them. */
  async mintPrivateBananas(amount: bigint, address: AztecAddress) {
    const { result: balanceBefore } = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: address });

    await testSpan('tx:mint', () => mintTokensToPrivate(this.bananaCoin, this.aliceAddress, address, amount));

    const { result: balanceAfter } = await this.bananaCoin.methods
      .balance_of_private(address)
      .simulate({ from: address });
    expect(balanceAfter).toEqual(balanceBefore + amount);
  }

  public async applyBaseSetup() {
    await this.applyInitialAccounts();
    await this.applyEnsureAuthRegistryPublished();
    await this.applySetupFeeJuice();
    await this.applyDeployBananaToken();
  }

  async applyEnsureAuthRegistryPublished() {
    this.logger.info('Ensuring AuthRegistry published');
    await ensureAuthRegistryPublished(this.wallet, this.aliceAddress);
  }

  async applyInitialAccounts() {
    this.logger.info('Applying initial accounts setup');

    this.wallet = this.context.wallet;
    this.aztecNode = this.context.aztecNodeService;
    this.aztecNodeAdmin = this.context.aztecNodeService;
    this.gasSettings = GasSettings.fallback({
      gasLimits: Gas.from((await this.aztecNode.getNodeInfo()).txsLimits.gas),
      maxFeesPerGas: await getPaddedMaxFeesPerGas(this.aztecNode),
    });
    this.cheatCodes = this.context.cheatCodes;
    this.accounts = this.context.accounts;
    this.accounts.forEach((a, i) => this.logger.verbose(`Account ${i} address: ${a}`));
    [this.aliceAddress, this.bobAddress, this.sequencerAddress] = this.accounts.slice(0, 3);

    // We set Alice as the FPC admin to avoid the need for deployment of another account.
    this.fpcAdmin = this.aliceAddress;

    const canonicalFeeJuice = await getCanonicalFeeJuice();
    this.feeJuiceContract = FeeJuiceContract.at(canonicalFeeJuice.address, this.wallet);
  }

  async applySetupFeeJuice() {
    this.logger.info('Applying fee juice setup');

    this.feeJuiceContract = FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, this.wallet);

    this.getGasBalanceFn = getBalancesFn('⛽', this.feeJuiceContract.methods.balance_of_public, this.logger);

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
      wallet: this.wallet,
      logger: this.logger,
    });
  }

  async applyDeployBananaToken() {
    this.logger.info('Applying deploy banana token setup');

    const { contract: bananaCoin } = await testSpan('deploy:token', () =>
      BananaCoin.deploy(this.wallet, this.aliceAddress, ...BANANA_COIN_CONSTRUCTOR_ARGS, {
        salt: BANANA_COIN_SALT,
        deployer: this.aliceAddress,
      }).send({
        from: this.aliceAddress,
      }),
    );
    this.logger.info(`BananaCoin deployed at ${bananaCoin.address}`);

    this.bananaCoin = bananaCoin;
    this.getBananaPublicBalanceFn = getBalancesFn('🍌.public', this.bananaCoin.methods.balance_of_public, this.logger);
    this.getBananaPrivateBalanceFn = getBalancesFn(
      '🍌.private',
      this.bananaCoin.methods.balance_of_private,
      this.logger,
    );
  }

  public async applyFPCSetup() {
    this.logger.info('Applying FPC setup');

    const feeJuiceContract = this.feeJuiceBridgeTestHarness.feeJuice;
    expect((await this.wallet.getContractMetadata(feeJuiceContract.address)).isContractPublished).toBe(true);

    const bananaCoin = this.bananaCoin;
    const { contract: bananaFPC } = await testSpan('deploy:fpc', () =>
      FPCContract.deploy(this.wallet, bananaCoin.address, this.fpcAdmin, {
        salt: BANANA_FPC_SALT,
        deployer: this.aliceAddress,
      }).send({
        from: this.aliceAddress,
      }),
    );

    this.logger.info(`BananaPay deployed at ${bananaFPC.address}`);

    // The BananaFPC's fee juice is seeded at genesis (see FeesTest.setup) rather than bridged here.
    // Assert the deploy landed at the seeded address so a params drift surfaces as a clear error rather
    // than a downstream "insufficient fee payer balance".
    const { bananaFPCAddress } = await computeBananaContractAddresses(this.aliceAddress);
    if (!bananaFPC.address.equals(bananaFPCAddress)) {
      throw new Error(
        `Deployed BananaFPC address ${bananaFPC.address} does not match the genesis-funded address ` +
          `${bananaFPCAddress}; the deterministic deploy params drifted from the genesis funding computation.`,
      );
    }

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
      const L1_GAS_PER_EPOCH_VERIFIED = 3600000n;

      // We round up
      const mulDiv = (a: bigint, b: bigint, c: bigint) => (a * b) / c + ((a * b) % c > 0n ? 1n : 0n);

      const { baseFee } = await this.rollupContract.getL1FeesAt(block!.header.globalVariables.timestamp);
      const proverCost =
        mulDiv(
          mulDiv(L1_GAS_PER_EPOCH_VERIFIED, baseFee, BigInt(await this.rollupContract.getEpochDuration())),
          1n,
          await this.rollupContract.getManaTarget(),
        ) + (await this.rollupContract.getProvingCostPerMana());

      const price = await this.rollupContract.getEthPerFeeAsset();

      const mana = block!.header.totalManaUsed.toBigInt();
      return mulDiv(mana * proverCost, 10n ** 12n, price);
    };

    /**
     * Reads the prover fee that the rollup actually committed for the block's checkpoint, which is what
     * RewardLib uses to pay prover rewards. Unlike `getProverFee`, this does not re-derive the value
     * from current L1 fees or current eth-per-fee-asset price, so it is robust to pipelined fee-asset-price
     * drift between propose-time and reward-payout-time.
     */
    this.getCommittedProverFee = async (blockNumber: BlockNumber) => {
      const block = await this.aztecNode.getBlock(blockNumber);
      const feeHeader = await this.rollupContract.getFeeHeader(BigInt(block!.checkpointNumber));
      return feeHeader.manaUsed * feeHeader.proverCost;
    };

    // RewardLib computes sequencerFee = checkpointFee - burn - proverFee where burn = manaUsed * congestionCost.
    // The fixture's typical case keeps congestionCost at zero, but reading it explicitly avoids latent bugs
    // when test load changes excess mana.
    this.getCommittedBurn = async (blockNumber: BlockNumber) => {
      const block = await this.aztecNode.getBlock(blockNumber);
      const feeHeader = await this.rollupContract.getFeeHeader(BigInt(block!.checkpointNumber));
      return feeHeader.manaUsed * feeHeader.congestionCost;
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
    await testSpan('tx:mint', () =>
      this.bananaCoin.methods.mint_to_public(this.aliceAddress, this.ALICE_INITIAL_BANANAS).send({
        from: this.aliceAddress,
      }),
    );
  }

  public async applyFundAliceWithPrivateBananas() {
    this.logger.info('Applying fund Alice with private bananas setup');

    await this.mintPrivateBananas(this.ALICE_INITIAL_BANANAS, this.aliceAddress);
  }
}
