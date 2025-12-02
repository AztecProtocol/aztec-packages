import { AztecAddress } from '@aztec/aztec.js/addresses';
import { createLogger } from '@aztec/aztec.js/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { InvalidAccountContract } from '@aztec/noir-test-contracts.js/InvalidAccount';

import { jest } from '@jest/globals';

import { BaseEndToEndTest } from '../fixtures/base_end_to_end_test.js';
import { mintTokensToPrivate } from '../fixtures/token_utils.js';
import { ensureAccountContractsPublished } from '../fixtures/utils.js';
import { TokenSimulator } from '../simulators/token_simulator.js';

const { METRICS_PORT: metricsPort } = process.env;

export class TokenContractTest extends BaseEndToEndTest {
  static TOKEN_NAME = 'USDC';
  static TOKEN_SYMBOL = 'USD';
  static TOKEN_DECIMALS = 18n;
  asset!: TokenContract;
  tokenSim!: TokenSimulator;

  // Alias for compatibility
  get node() {
    return this.aztecNode;
  }

  badAccount!: InvalidAccountContract;
  adminAddress!: AztecAddress;
  account1Address!: AztecAddress;
  account2Address!: AztecAddress;

  constructor(testName: string) {
    super(testName, createLogger(`e2e:e2e_token_contract:${testName}`));
  }

  override async setup(): Promise<this> {
    await super.setup(3, {
      metricsPort: metricsPort ? parseInt(metricsPort) : undefined,
    });
    await this.deployContracts();
    return this;
  }

  /**
   * Sets up base state:
   * 1. Add 3 accounts.
   * 2. Publicly deploy accounts, deploy token contract and a "bad account".
   */
  async deployContracts() {
    // Adding a timeout of 2 minutes in here such that it is propagated to the underlying tests
    jest.setTimeout(120_000);

    // Accounts are already deployed by setup()
    [this.adminAddress, this.account1Address, this.account2Address] = this.accounts.slice(0, 3);

    // Public deploy accounts
    this.logger.verbose(`Public deploy accounts...`);
    await ensureAccountContractsPublished(this.wallet, [this.adminAddress, this.account1Address]);

    // Deploy token contract
    this.logger.verbose(`Deploying TokenContract...`);
    const asset = await TokenContract.deploy(
      this.wallet,
      this.adminAddress,
      TokenContractTest.TOKEN_NAME,
      TokenContractTest.TOKEN_SYMBOL,
      TokenContractTest.TOKEN_DECIMALS,
    )
      .send({ from: this.adminAddress })
      .deployed();
    this.logger.verbose(`Token deployed to ${asset.address}`);

    // Deploy bad account
    this.logger.verbose(`Deploying bad account...`);
    this.badAccount = await InvalidAccountContract.deploy(this.wallet).send({ from: this.adminAddress }).deployed();
    this.logger.verbose(`Deployed to ${this.badAccount.address}.`);

    // Setup asset reference
    this.asset = TokenContract.at(asset.address, this.wallet);
    this.logger.verbose(`Token contract address: ${this.asset.address}`);

    this.tokenSim = new TokenSimulator(this.asset, this.wallet, this.adminAddress, this.logger, [
      this.adminAddress,
      this.account1Address,
    ]);

    this.logger.verbose(`Bad account address: ${this.badAccount.address}`);

    expect(await this.asset.methods.get_admin().simulate({ from: this.adminAddress })).toBe(
      this.adminAddress.toBigInt(),
    );
  }

  async mintTokens() {
    const { asset, adminAddress, tokenSim } = this;
    const amount = 10000n;

    this.logger.verbose(`Minting ${amount} publicly...`);
    await asset.methods.mint_to_public(adminAddress, amount).send({ from: adminAddress }).wait();

    this.logger.verbose(`Minting ${amount} privately...`);
    await mintTokensToPrivate(asset, adminAddress, adminAddress, amount);
    this.logger.verbose(`Minting complete.`);

    tokenSim.mintPublic(adminAddress, amount);

    const publicBalance = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    this.logger.verbose(`Public balance of wallet 0: ${publicBalance}`);
    expect(publicBalance).toEqual(this.tokenSim.balanceOfPublic(adminAddress));

    tokenSim.mintPrivate(adminAddress, amount);
    const privateBalance = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    this.logger.verbose(`Private balance of wallet 0: ${privateBalance}`);
    expect(privateBalance).toEqual(tokenSim.balanceOfPrivate(adminAddress));

    const totalSupply = await asset.methods.total_supply().simulate({ from: adminAddress });
    this.logger.verbose(`Total supply: ${totalSupply}`);
    expect(totalSupply).toEqual(tokenSim.totalSupply);
  }
}
