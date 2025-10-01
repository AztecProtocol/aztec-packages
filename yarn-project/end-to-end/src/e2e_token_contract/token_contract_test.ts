import { AztecAddress, type AztecNode, type Logger, createLogger } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { InvalidAccountContract } from '@aztec/noir-test-contracts.js/InvalidAccount';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
  publicDeployAccounts,
} from '../fixtures/snapshot_manager.js';
import { mintTokensToPrivate } from '../fixtures/token_utils.js';
import { TokenSimulator } from '../simulators/token_simulator.js';

const { E2E_DATA_PATH: dataPath, METRICS_PORT: metricsPort } = process.env;

export class TokenContractTest {
  static TOKEN_NAME = 'USDC';
  static TOKEN_SYMBOL = 'USD';
  static TOKEN_DECIMALS = 18n;
  private snapshotManager: ISnapshotManager;
  logger: Logger;
  asset!: TokenContract;
  tokenSim!: TokenSimulator;
  node!: AztecNode;

  badAccount!: InvalidAccountContract;
  wallet!: TestWallet;
  adminAddress!: AztecAddress;
  account1Address!: AztecAddress;
  account2Address!: AztecAddress;

  constructor(testName: string) {
    this.logger = createLogger(`e2e:e2e_token_contract:${testName}`);
    this.snapshotManager = createSnapshotManager(`e2e_token_contract/${testName}`, dataPath, {
      metricsPort: metricsPort ? parseInt(metricsPort) : undefined,
    });
  }

  /**
   * Adds two state shifts to snapshot manager.
   * 1. Add 3 accounts.
   * 2. Publicly deploy accounts, deploy token contract and a "bad account".
   */
  async applyBaseSnapshots() {
    // Adding a timeout of 2 minutes in here such that it is propagated to the underlying tests
    jest.setTimeout(120_000);

    await this.snapshotManager.snapshot(
      '3_accounts',
      deployAccounts(3, this.logger),
      ({ deployedAccounts }, { wallet, aztecNode }) => {
        this.node = aztecNode;
        this.wallet = wallet;
        [this.adminAddress, this.account1Address, this.account2Address] = deployedAccounts.map(acc => acc.address);
        return Promise.resolve();
      },
    );

    await this.snapshotManager.snapshot(
      'e2e_token_contract',
      async () => {
        // Create the token contract state.
        // Move this account thing to addAccounts above?
        this.logger.verbose(`Public deploy accounts...`);
        await publicDeployAccounts(this.wallet, [this.adminAddress, this.account1Address]);

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

        this.logger.verbose(`Deploying bad account...`);
        this.badAccount = await InvalidAccountContract.deploy(this.wallet).send({ from: this.adminAddress }).deployed();
        this.logger.verbose(`Deployed to ${this.badAccount.address}.`);

        return { tokenContractAddress: asset.address, badAccountAddress: this.badAccount.address };
      },
      async ({ tokenContractAddress, badAccountAddress }) => {
        // Restore the token contract state.
        this.asset = await TokenContract.at(tokenContractAddress, this.wallet);
        this.logger.verbose(`Token contract address: ${this.asset.address}`);

        this.tokenSim = new TokenSimulator(this.asset, this.wallet, this.adminAddress, this.logger, [
          this.adminAddress,
          this.account1Address,
        ]);

        this.badAccount = await InvalidAccountContract.at(badAccountAddress, this.wallet);
        this.logger.verbose(`Bad account address: ${this.badAccount.address}`);

        expect(await this.asset.methods.get_admin().simulate({ from: this.adminAddress })).toBe(
          this.adminAddress.toBigInt(),
        );
      },
    );

    // TokenContract.artifact.functions.forEach(fn => {
    //   const sig = decodeFunctionSignature(fn.name, fn.parameters);
    //   logger.verbose(`Function ${sig} and the selector: ${FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)}`);
    // });
  }

  async setup() {
    await this.snapshotManager.setup();
  }

  snapshot = <T>(
    name: string,
    apply: (context: SubsystemsContext) => Promise<T>,
    restore: (snapshotData: T, context: SubsystemsContext) => Promise<void> = () => Promise.resolve(),
  ): Promise<void> => this.snapshotManager.snapshot(name, apply, restore);

  async teardown() {
    await this.snapshotManager.teardown();
  }

  async applyMintSnapshot() {
    await this.snapshotManager.snapshot(
      'mint',
      async () => {
        const { asset, adminAddress } = this;
        const amount = 10000n;

        this.logger.verbose(`Minting ${amount} publicly...`);
        await asset.methods.mint_to_public(adminAddress, amount).send({ from: adminAddress }).wait();

        this.logger.verbose(`Minting ${amount} privately...`);
        await mintTokensToPrivate(asset, adminAddress, adminAddress, amount);
        this.logger.verbose(`Minting complete.`);

        return { amount };
      },
      async ({ amount }) => {
        const { asset, adminAddress, tokenSim } = this;
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

        return Promise.resolve();
      },
    );
  }
}
