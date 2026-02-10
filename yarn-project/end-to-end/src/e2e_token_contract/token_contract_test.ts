import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { InvalidAccountContract } from '@aztec/noir-test-contracts.js/InvalidAccount';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import { type EndToEndContext, deployAccounts, publicDeployAccounts, setup, teardown } from '../fixtures/setup.js';
import { mintTokensToPrivate } from '../fixtures/token_utils.js';
import { TokenSimulator } from '../simulators/token_simulator.js';

const { METRICS_PORT: metricsPort } = process.env;

export class TokenContractTest {
  static TOKEN_NAME = 'USDC';
  static TOKEN_SYMBOL = 'USD';
  static TOKEN_DECIMALS = 18n;
  context!: EndToEndContext;
  logger: Logger;
  metricsPort?: number;
  asset!: TokenContract;
  tokenSim!: TokenSimulator;
  node!: AztecNode;

  badAccount!: InvalidAccountContract;
  wallet!: TestWallet;
  adminAddress!: AztecAddress;
  account1Address!: AztecAddress;
  account2Address!: AztecAddress;

  private shouldApplyBaseSetup = false;
  private shouldApplyMint = false;

  constructor(testName: string) {
    this.logger = createLogger(`e2e:e2e_token_contract:${testName}`);
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
   * Registers that mint should be applied during setup().
   * Call this before setup() to mint tokens to the admin account.
   */
  applyMintSnapshot() {
    this.shouldApplyMint = true;
  }

  /**
   * Applies base setup: deploys 3 accounts, publicly deploys accounts, token contract and a "bad account".
   */
  private async applyBaseSetup() {
    // Adding a timeout of 2 minutes in here such that it is propagated to the underlying tests
    jest.setTimeout(120_000);

    this.logger.info('Applying base setup - deploying 3 accounts');
    const { deployedAccounts } = await deployAccounts(
      3,
      this.logger,
    )({
      wallet: this.context.wallet,
      initialFundedAccounts: this.context.initialFundedAccounts,
    });

    this.node = this.context.aztecNodeService;
    this.wallet = this.context.wallet;
    [this.adminAddress, this.account1Address, this.account2Address] = deployedAccounts.map(acc => acc.address);

    this.logger.info('Applying base setup - deploying token contract');
    this.logger.verbose(`Public deploy accounts...`);
    await publicDeployAccounts(this.wallet, [this.adminAddress, this.account1Address]);

    this.logger.verbose(`Deploying TokenContract...`);
    this.asset = await TokenContract.deploy(
      this.wallet,
      this.adminAddress,
      TokenContractTest.TOKEN_NAME,
      TokenContractTest.TOKEN_SYMBOL,
      TokenContractTest.TOKEN_DECIMALS,
    ).send({ from: this.adminAddress });
    this.logger.verbose(`Token deployed to ${this.asset.address}`);

    this.logger.verbose(`Deploying bad account...`);
    this.badAccount = await InvalidAccountContract.deploy(this.wallet).send({ from: this.adminAddress });
    this.logger.verbose(`Deployed to ${this.badAccount.address}.`);

    this.tokenSim = new TokenSimulator(this.asset, this.wallet, this.adminAddress, this.logger, [
      this.adminAddress,
      this.account1Address,
    ]);

    expect(await this.asset.methods.get_admin().simulate({ from: this.adminAddress })).toBe(
      this.adminAddress.toBigInt(),
    );
  }

  async setup() {
    this.context = await setup(0, {
      metricsPort: this.metricsPort,
      fundSponsoredFPC: true,
      skipAccountDeployment: true,
    });

    if (this.shouldApplyBaseSetup) {
      await this.applyBaseSetup();
    }

    if (this.shouldApplyMint) {
      await this.applyMint();
    }
  }

  async teardown() {
    await teardown(this.context);
  }

  private async applyMint() {
    this.logger.info('Applying mint setup');
    const { asset, adminAddress, tokenSim } = this;
    const amount = 10000n;

    this.logger.verbose(`Minting ${amount} publicly...`);
    await asset.methods.mint_to_public(adminAddress, amount).send({ from: adminAddress });
    tokenSim.mintPublic(adminAddress, amount);

    const publicBalance = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    this.logger.verbose(`Public balance of wallet 0: ${publicBalance}`);
    expect(publicBalance).toEqual(this.tokenSim.balanceOfPublic(adminAddress));

    this.logger.verbose(`Minting ${amount} privately...`);
    await mintTokensToPrivate(asset, adminAddress, adminAddress, amount);
    tokenSim.mintPrivate(adminAddress, amount);

    const privateBalance = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    this.logger.verbose(`Private balance of wallet 0: ${privateBalance}`);
    expect(privateBalance).toEqual(tokenSim.balanceOfPrivate(adminAddress));

    const totalSupply = await asset.methods.total_supply().simulate({ from: adminAddress });
    this.logger.verbose(`Total supply: ${totalSupply}`);
    expect(totalSupply).toEqual(tokenSim.totalSupply);

    this.logger.verbose(`Minting complete.`);
  }
}
