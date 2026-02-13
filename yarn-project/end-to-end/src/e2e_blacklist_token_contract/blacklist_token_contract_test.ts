import { AztecAddress } from '@aztec/aztec.js/addresses';
import { computeSecretHash } from '@aztec/aztec.js/crypto';
import { Fr } from '@aztec/aztec.js/fields';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { TxHash } from '@aztec/aztec.js/tx';
import type { CheatCodes } from '@aztec/aztec/testing';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBlacklistContract } from '@aztec/noir-contracts.js/TokenBlacklist';
import { GenericProxyContract } from '@aztec/noir-test-contracts.js/GenericProxy';
import { InvalidAccountContract } from '@aztec/noir-test-contracts.js/InvalidAccount';
import type { SequencerClient } from '@aztec/sequencer-client';

import { jest } from '@jest/globals';

import { type EndToEndContext, deployAccounts, publicDeployAccounts, setup, teardown } from '../fixtures/setup.js';
import { TokenSimulator } from '../simulators/token_simulator.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';

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

  context!: EndToEndContext;
  logger: Logger;
  wallet!: TestWallet;
  asset!: TokenBlacklistContract;
  tokenSim!: TokenSimulator;
  badAccount!: InvalidAccountContract;
  proxy!: GenericProxyContract;
  cheatCodes!: CheatCodes;
  sequencer!: SequencerClient;
  aztecNode!: AztecNode;

  adminAddress!: AztecAddress;
  otherAddress!: AztecAddress;
  blacklistedAddress!: AztecAddress;

  constructor(testName: string) {
    this.logger = createLogger(`e2e:e2e_blacklist_token_contract:${testName}`);
  }

  async crossTimestampOfChange() {
    await this.cheatCodes.warpL2TimeAtLeastBy(
      this.sequencer,
      this.aztecNode,
      BlacklistTokenContractTest.CHANGE_ROLES_DELAY,
    );
  }

  /**
   * Applies base setup:
   * 1. Add 3 accounts.
   * 2. Publicly deploy accounts, deploy token contract and a "bad account".
   */
  async applyBaseSetup() {
    // Adding a timeout of 2 minutes in here such that it is propagated to the underlying tests
    jest.setTimeout(120_000);

    this.logger.info('Deploying 3 accounts');
    const { deployedAccounts } = await deployAccounts(
      3,
      this.logger,
    )({
      wallet: this.context.wallet,
      initialFundedAccounts: this.context.initialFundedAccounts,
    });

    this.cheatCodes = this.context.cheatCodes;
    this.aztecNode = this.context.aztecNodeService;
    this.sequencer = this.context.sequencer!;
    this.wallet = this.context.wallet;
    this.adminAddress = deployedAccounts[0].address;
    this.otherAddress = deployedAccounts[1].address;
    this.blacklistedAddress = deployedAccounts[2].address;

    this.logger.info('Setting up blacklist token contract');
    // Create the token contract state.
    this.logger.verbose(`Public deploy accounts...`);
    await publicDeployAccounts(this.wallet, [this.adminAddress, this.otherAddress, this.blacklistedAddress]);

    this.logger.verbose(`Deploying TokenContract...`);
    this.asset = await TokenBlacklistContract.deploy(this.wallet, this.adminAddress).send({
      from: this.adminAddress,
    });
    this.logger.verbose(`Token deployed to ${this.asset.address}`);

    this.logger.verbose(`Deploying bad account...`);
    this.badAccount = await InvalidAccountContract.deploy(this.wallet).send({ from: this.adminAddress });
    this.logger.verbose(`Deployed to ${this.badAccount.address}.`);

    // Deploy a proxy contract for "on behalf of other" tests. The note owner must be the tx sender
    // (so their notes are in scope), but msg_sender in the target must differ from the note owner
    // to trigger authwit validation. The proxy forwards calls so that msg_sender != tx sender.
    this.logger.verbose(`Deploying generic proxy...`);
    this.proxy = await GenericProxyContract.deploy(this.wallet).send({ from: this.adminAddress });
    this.logger.verbose(`Deployed to ${this.proxy.address}.`);

    await this.crossTimestampOfChange();

    this.tokenSim = new TokenSimulator(
      this.asset as unknown as TokenContract,
      this.wallet,
      this.adminAddress,
      this.logger,
      [this.adminAddress, this.otherAddress, this.blacklistedAddress],
    );

    expect(await this.asset.methods.get_roles(this.adminAddress).simulate({ from: this.adminAddress })).toEqual(
      new Role().withAdmin().toNoirStruct(),
    );
  }

  async setup() {
    this.logger.info('Setting up fresh context');
    this.context = await setup(0, {
      fundSponsoredFPC: true,
      skipAccountDeployment: true,
    });
    await this.applyBaseSetup();
  }

  async teardown() {
    await teardown(this.context);
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
      .process_transparent_note(
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

  async applyMint() {
    this.logger.info('Applying mint setup');
    const { asset, tokenSim } = this;
    const amount = 10000n;

    const adminMinterRole = new Role().withAdmin().withMinter();
    await this.asset.methods
      .update_roles(this.adminAddress, adminMinterRole.toNoirStruct())
      .send({ from: this.adminAddress });

    const blacklistRole = new Role().withBlacklisted();
    await this.asset.methods
      .update_roles(this.blacklistedAddress, blacklistRole.toNoirStruct())
      .send({ from: this.adminAddress });

    await this.crossTimestampOfChange();

    expect(await this.asset.methods.get_roles(this.adminAddress).simulate({ from: this.adminAddress })).toEqual(
      adminMinterRole.toNoirStruct(),
    );

    this.logger.verbose(`Minting ${amount} publicly...`);
    await asset.methods.mint_public(this.adminAddress, amount).send({ from: this.adminAddress });

    this.logger.verbose(`Minting ${amount} privately...`);
    const secret = Fr.random();
    const secretHash = await computeSecretHash(secret);
    const receipt = await asset.methods.mint_private(amount, secretHash).send({ from: this.adminAddress });

    await this.addPendingShieldNoteToPXE(asset, this.adminAddress, amount, secretHash, receipt.txHash);
    await asset.methods.redeem_shield(this.adminAddress, amount, secret).send({ from: this.adminAddress });
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
