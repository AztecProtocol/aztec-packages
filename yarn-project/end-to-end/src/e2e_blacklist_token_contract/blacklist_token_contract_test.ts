import {
  AztecAddress,
  type AztecNode,
  Fr,
  type Logger,
  type TxHash,
  computeSecretHash,
  createLogger,
} from '@aztec/aztec.js';
import type { CheatCodes } from '@aztec/aztec/testing';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBlacklistContract } from '@aztec/noir-contracts.js/TokenBlacklist';
import { InvalidAccountContract } from '@aztec/noir-test-contracts.js/InvalidAccount';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import {
  type ISnapshotManager,
  type SubsystemsContext,
  createSnapshotManager,
  deployAccounts,
  publicDeployAccounts,
} from '../fixtures/snapshot_manager.js';
import { TokenSimulator } from '../simulators/token_simulator.js';

const { E2E_DATA_PATH: dataPath } = process.env;

export class Role {
  private isAdmin = false;
  private isMinter = false;
  private isBlacklisted = false;

  withAdmin() {
    this.isAdmin = true;
    return this;
  }

  withMinter() {
    this.isMinter = true;
    return this;
  }

  withBlacklisted() {
    this.isBlacklisted = true;
    return this;
  }

  toNoirStruct() {
    // We need to use lowercase identifiers as those are what the noir interface expects
    // eslint-disable-next-line camelcase
    return { is_admin: this.isAdmin, is_minter: this.isMinter, is_blacklisted: this.isBlacklisted };
  }
}

export class BlacklistTokenContractTest {
  // This value MUST match the same value that we have in the contract
  static CHANGE_ROLES_DELAY = 86400;

  private snapshotManager: ISnapshotManager;
  logger: Logger;
  wallet!: TestWallet;
  asset!: TokenBlacklistContract;
  tokenSim!: TokenSimulator;
  badAccount!: InvalidAccountContract;
  cheatCodes!: CheatCodes;
  sequencer!: SequencerClient;
  aztecNode!: AztecNode;

  adminAddress!: AztecAddress;
  otherAddress!: AztecAddress;
  blacklistedAddress!: AztecAddress;

  constructor(testName: string) {
    this.logger = createLogger(`e2e:e2e_blacklist_token_contract:${testName}`);
    this.snapshotManager = createSnapshotManager(`e2e_blacklist_token_contract/${testName}`, dataPath);
  }

  async crossTimestampOfChange() {
    await this.cheatCodes.warpL2TimeAtLeastBy(
      this.sequencer,
      this.aztecNode,
      BlacklistTokenContractTest.CHANGE_ROLES_DELAY,
    );
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
      ({ deployedAccounts }, { cheatCodes, aztecNode, sequencer, wallet }) => {
        this.cheatCodes = cheatCodes;
        this.aztecNode = aztecNode;
        this.sequencer = sequencer;
        this.wallet = wallet;
        this.adminAddress = deployedAccounts[0].address;
        this.otherAddress = deployedAccounts[1].address;
        this.blacklistedAddress = deployedAccounts[2].address;
        return Promise.resolve();
      },
    );

    await this.snapshotManager.snapshot(
      'e2e_blacklist_token_contract',
      async () => {
        // Create the token contract state.
        // Move this account thing to addAccounts above?
        this.logger.verbose(`Public deploy accounts...`);
        await publicDeployAccounts(this.wallet, [this.adminAddress, this.otherAddress, this.blacklistedAddress]);

        this.logger.verbose(`Deploying TokenContract...`);
        this.asset = await TokenBlacklistContract.deploy(this.wallet, this.adminAddress)
          .send({ from: this.adminAddress })
          .deployed();
        this.logger.verbose(`Token deployed to ${this.asset.address}`);

        this.logger.verbose(`Deploying bad account...`);
        this.badAccount = await InvalidAccountContract.deploy(this.wallet).send({ from: this.adminAddress }).deployed();
        this.logger.verbose(`Deployed to ${this.badAccount.address}.`);

        await this.crossTimestampOfChange();

        return { tokenContractAddress: this.asset.address, badAccountAddress: this.badAccount.address };
      },
      async ({ tokenContractAddress, badAccountAddress }) => {
        // Restore the token contract state.
        this.asset = await TokenBlacklistContract.at(tokenContractAddress, this.wallet);
        this.logger.verbose(`Token contract address: ${this.asset.address}`);

        this.tokenSim = new TokenSimulator(
          this.asset as unknown as TokenContract,
          this.wallet,
          this.adminAddress,
          this.logger,
          [this.adminAddress, this.otherAddress, this.blacklistedAddress],
        );

        this.badAccount = await InvalidAccountContract.at(badAccountAddress, this.wallet);
        this.logger.verbose(`Bad account address: ${this.badAccount.address}`);

        expect(await this.asset.methods.get_roles(this.adminAddress).simulate({ from: this.adminAddress })).toEqual(
          new Role().withAdmin().toNoirStruct(),
        );
      },
    );
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

  async addPendingShieldNoteToPXE(
    contract: TokenBlacklistContract,
    recipient: AztecAddress,
    amount: bigint,
    secretHash: Fr,
    txHash: TxHash,
  ) {
    const txEffects = await this.aztecNode.getTxEffect(txHash);
    await contract.methods
      .deliver_transparent_note(
        contract.address,
        amount,
        secretHash,
        txHash.hash,
        txEffects!.data.noteHashes,
        txEffects!.data.nullifiers[0],
        recipient,
      )
      .simulate({ from: recipient });
  }

  async applyMintSnapshot() {
    await this.snapshotManager.snapshot(
      'mint',
      async () => {
        const { asset } = this;
        const amount = 10000n;

        const adminMinterRole = new Role().withAdmin().withMinter();
        await this.asset.methods
          .update_roles(this.adminAddress, adminMinterRole.toNoirStruct())
          .send({ from: this.adminAddress })
          .wait();

        const blacklistRole = new Role().withBlacklisted();
        await this.asset.methods
          .update_roles(this.blacklistedAddress, blacklistRole.toNoirStruct())
          .send({ from: this.adminAddress })
          .wait();

        await this.crossTimestampOfChange();

        expect(await this.asset.methods.get_roles(this.adminAddress).simulate({ from: this.adminAddress })).toEqual(
          adminMinterRole.toNoirStruct(),
        );

        this.logger.verbose(`Minting ${amount} publicly...`);
        await asset.methods.mint_public(this.adminAddress, amount).send({ from: this.adminAddress }).wait();

        this.logger.verbose(`Minting ${amount} privately...`);
        const secret = Fr.random();
        const secretHash = await computeSecretHash(secret);
        const receipt = await asset.methods.mint_private(amount, secretHash).send({ from: this.adminAddress }).wait();

        await this.addPendingShieldNoteToPXE(asset, this.adminAddress, amount, secretHash, receipt.txHash);
        const txClaim = asset.methods
          .redeem_shield(this.adminAddress, amount, secret)
          .send({ from: this.adminAddress });
        await txClaim.wait();
        this.logger.verbose(`Minting complete.`);

        return { amount };
      },
      async ({ amount }) => {
        const { asset, tokenSim } = this;
        tokenSim.mintPublic(this.adminAddress, amount);

        const publicBalance = await asset.methods
          .balance_of_public(this.adminAddress)
          .simulate({ from: this.adminAddress });
        this.logger.verbose(`Public balance of wallet 0: ${publicBalance}`);
        expect(publicBalance).toEqual(this.tokenSim.balanceOfPublic(this.adminAddress));

        tokenSim.mintPrivate(this.adminAddress, amount);
        const privateBalance = await asset.methods
          .balance_of_private(this.adminAddress)
          .simulate({ from: this.adminAddress });
        this.logger.verbose(`Private balance of wallet 0: ${privateBalance}`);
        expect(privateBalance).toEqual(tokenSim.balanceOfPrivate(this.adminAddress));

        const totalSupply = await asset.methods.total_supply().simulate({ from: this.adminAddress });
        this.logger.verbose(`Total supply: ${totalSupply}`);
        expect(totalSupply).toEqual(tokenSim.totalSupply);

        return Promise.resolve();
      },
    );
  }
}
