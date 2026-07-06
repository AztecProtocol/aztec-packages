import { AztecAddress } from '@aztec/aztec.js/addresses';
import { createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { GenericProxyContract } from '@aztec/noir-test-contracts.js/GenericProxy';
import { InvalidAccountContract } from '@aztec/noir-test-contracts.js/InvalidAccount';

import { jest } from '@jest/globals';

import { ensureAuthRegistryPublished } from '../../fixtures/setup.js';
import { mintTokensToPrivate } from '../../fixtures/token_utils.js';
import { TokenSimulator } from '../../simulators/token_simulator.js';
import { AutomineTestContext, type AutomineTestOpts } from '../automine_test_context.js';

const { METRICS_PORT: metricsPort } = process.env;

/**
 * Token-domain harness over the automine topology: extends {@link AutomineTestContext} with a
 * {@link TokenSimulator}, the USDC Token deploy plus a bad-account and authwit proxy, and an optional
 * mint. Base setup is opt-in via {@link applyBaseSnapshots} (run during `setup()`); {@link applyMint}
 * is called explicitly after `setup()`.
 */
export class TokenContractTest extends AutomineTestContext {
  static TOKEN_NAME = 'USDC';
  static TOKEN_SYMBOL = 'USD';
  static TOKEN_DECIMALS = 18n;
  metricsPort?: number;
  asset!: TokenContract;
  tokenSim!: TokenSimulator;
  node!: AztecNode;

  badAccount!: InvalidAccountContract;
  authwitProxy!: GenericProxyContract;
  adminAddress!: AztecAddress;
  otherAddress!: AztecAddress;
  account2Address!: AztecAddress;

  private shouldApplyBaseSetup = false;
  private testName: string;

  constructor(testName: string) {
    super();
    this.testName = testName;
    this.metricsPort = metricsPort ? parseInt(metricsPort) : undefined;
  }

  /**
   * Registers that base setup should be applied during setup().
   * Call this before setup() to deploy 3 accounts, publicly deploy accounts, token contract and a "bad account".
   */
  applyBaseSnapshots() {
    this.shouldApplyBaseSetup = true;
  }

  /**
   * Applies base setup: deploys 3 accounts, publicly deploys accounts, token contract and a "bad account".
   */
  private async applyBaseSetup() {
    // Adding a timeout of 2 minutes in here such that it is propagated to the underlying tests
    jest.setTimeout(120_000);

    this.node = this.context.aztecNodeService;
    this.wallet = this.context.wallet;
    [this.adminAddress, this.otherAddress, this.account2Address] = this.context.accounts;

    this.logger.info('Applying base setup - deploying token contract');
    await ensureAuthRegistryPublished(this.wallet, this.adminAddress);

    this.logger.verbose(`Deploying TokenContract...`);
    ({ contract: this.asset } = await TokenContract.deploy(
      this.wallet,
      this.adminAddress,
      TokenContractTest.TOKEN_NAME,
      TokenContractTest.TOKEN_SYMBOL,
      TokenContractTest.TOKEN_DECIMALS,
    ).send({ from: this.adminAddress }));
    this.logger.verbose(`Token deployed to ${this.asset.address}`);

    this.logger.verbose(`Deploying bad account...`);
    ({ contract: this.badAccount } = await InvalidAccountContract.deploy(this.wallet).send({
      from: this.adminAddress,
    }));
    this.logger.verbose(`Deployed to ${this.badAccount.address}.`);

    // Deploy a proxy contract for "on behalf of other" tests. The note owner must be the tx sender
    // (so their notes are in scope), but msg_sender in the target must differ from the note owner
    // to trigger authwit validation. The proxy forwards calls so that msg_sender != tx sender.
    this.logger.verbose(`Deploying generic proxy...`);
    ({ contract: this.authwitProxy } = await GenericProxyContract.deploy(this.wallet).send({
      from: this.adminAddress,
    }));
    this.logger.verbose(`Deployed to ${this.authwitProxy.address}.`);

    this.tokenSim = new TokenSimulator(this.asset, this.wallet, this.adminAddress, this.logger, [
      this.adminAddress,
      this.otherAddress,
    ]);

    expect((await this.asset.methods.get_admin().simulate({ from: this.adminAddress })).result).toBe(
      this.adminAddress.toBigInt(),
    );
  }

  override async setup(opts: AutomineTestOpts = {}) {
    await super.setup({ numberOfAccounts: 3, metricsPort: this.metricsPort, ...opts });
    // hydrateFromContext repoints `this.logger` at the context logger; restore the harness-named one.
    this.logger = createLogger(`e2e:automine:token:${this.testName}`);

    if (this.shouldApplyBaseSetup) {
      await this.applyBaseSetup();
    }
  }

  /** Mints an initial public and private balance to the admin account. Call after {@link setup}. */
  async applyMint() {
    this.logger.info('Applying mint setup');
    const { asset, adminAddress, tokenSim } = this;
    const amount = 10000n;

    this.logger.verbose(`Minting ${amount} publicly...`);
    await asset.methods.mint_to_public(adminAddress, amount).send({ from: adminAddress });
    tokenSim.mintPublic(adminAddress, amount);

    const { result: publicBalance } = await asset.methods
      .balance_of_public(adminAddress)
      .simulate({ from: adminAddress });
    this.logger.verbose(`Public balance of wallet 0: ${publicBalance}`);
    expect(publicBalance).toEqual(this.tokenSim.balanceOfPublic(adminAddress));

    this.logger.verbose(`Minting ${amount} privately...`);
    await mintTokensToPrivate(asset, adminAddress, adminAddress, amount);
    tokenSim.mintPrivate(adminAddress, amount);

    const { result: privateBalance } = await asset.methods
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress });
    this.logger.verbose(`Private balance of wallet 0: ${privateBalance}`);
    expect(privateBalance).toEqual(tokenSim.balanceOfPrivate(adminAddress));

    const { result: totalSupply } = await asset.methods.total_supply().simulate({ from: adminAddress });
    this.logger.verbose(`Total supply: ${totalSupply}`);
    expect(totalSupply).toEqual(tokenSim.totalSupply);

    this.logger.verbose(`Minting complete.`);
  }
}
