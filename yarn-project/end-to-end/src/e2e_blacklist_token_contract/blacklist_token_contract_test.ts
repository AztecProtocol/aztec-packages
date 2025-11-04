import { AztecAddress } from '@aztec/aztec.js/addresses';
import { computeSecretHash } from '@aztec/aztec.js/crypto';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import type { TxHash } from '@aztec/aztec.js/tx';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBlacklistContract } from '@aztec/noir-contracts.js/TokenBlacklist';
import { InvalidAccountContract } from '@aztec/noir-test-contracts.js/InvalidAccount';

import { jest } from '@jest/globals';

import { BaseEndToEndTest } from '../fixtures/base_end_to_end_test.js';
import { ensureAccountContractsPublished } from '../fixtures/utils.js';
import { TokenSimulator } from '../simulators/token_simulator.js';

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

export class BlacklistTokenContractTest extends BaseEndToEndTest {
  // This value MUST match the same value that we have in the contract
  static CHANGE_ROLES_DELAY = 86400;

  asset!: TokenBlacklistContract;
  tokenSim!: TokenSimulator;
  badAccount!: InvalidAccountContract;

  adminAddress!: AztecAddress;
  otherAddress!: AztecAddress;
  blacklistedAddress!: AztecAddress;

  constructor(testName: string) {
    super(testName, createLogger(`e2e:e2e_blacklist_token_contract:${testName}`));
  }

  async crossTimestampOfChange() {
    await this.cheatCodes.warpL2TimeAtLeastBy(
      this.sequencer!,
      this.aztecNode,
      BlacklistTokenContractTest.CHANGE_ROLES_DELAY,
    );
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
    this.adminAddress = this.accounts[0];
    this.otherAddress = this.accounts[1];
    this.blacklistedAddress = this.accounts[2];

    // Public deploy accounts
    this.logger.verbose(`Public deploy accounts...`);
    await ensureAccountContractsPublished(this.wallet, [this.adminAddress, this.otherAddress, this.blacklistedAddress]);

    // Deploy token contract
    this.logger.verbose(`Deploying TokenContract...`);
    this.asset = await TokenBlacklistContract.deploy(this.wallet, this.adminAddress)
      .send({ from: this.adminAddress })
      .deployed();
    this.logger.verbose(`Token deployed to ${this.asset.address}`);

    // Deploy bad account
    this.logger.verbose(`Deploying bad account...`);
    this.badAccount = await InvalidAccountContract.deploy(this.wallet).send({ from: this.adminAddress }).deployed();
    this.logger.verbose(`Deployed to ${this.badAccount.address}.`);

    await this.crossTimestampOfChange();

    // Setup references
    this.logger.verbose(`Token contract address: ${this.asset.address}`);

    this.tokenSim = new TokenSimulator(
      this.asset as unknown as TokenContract,
      this.wallet,
      this.adminAddress,
      this.logger,
      [this.adminAddress, this.otherAddress, this.blacklistedAddress],
    );

    this.logger.verbose(`Bad account address: ${this.badAccount.address}`);

    expect(await this.asset.methods.get_roles(this.adminAddress).simulate({ from: this.adminAddress })).toEqual(
      new Role().withAdmin().toNoirStruct(),
    );
  }

  override async setup(): Promise<this> {
    await super.setup(3);
    await this.deployContracts();
    return this;
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

  async mintTokensAndSetupRoles() {
    const { asset, tokenSim } = this;
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
    const txClaim = asset.methods.redeem_shield(this.adminAddress, amount, secret).send({ from: this.adminAddress });
    await txClaim.wait();
    this.logger.verbose(`Minting complete.`);

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
  }
}
