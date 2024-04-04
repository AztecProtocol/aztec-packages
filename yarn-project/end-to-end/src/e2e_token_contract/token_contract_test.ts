import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountWallet,
  type CompleteAddress,
  type DebugLogger,
  ExtendedNote,
  Fr,
  Note,
  type TxHash,
  computeMessageSecretHash,
  createDebugLogger,
} from '@aztec/aztec.js';
import { DocsExampleContract, TokenContract } from '@aztec/noir-contracts.js';

import { SnapshotManager, addAccounts, publicDeployAccounts } from '../fixtures/snapshot_manager.js';
import { TokenSimulator } from '../simulators/token_simulator.js';

const { E2E_DATA_PATH: dataPath = './data' } = process.env;

export class TokenContractTest {
  static TOKEN_NAME = 'Aztec Token';
  static TOKEN_SYMBOL = 'AZT';
  static TOKEN_DECIMALS = 18n;
  logger: DebugLogger;
  snapshotManager: SnapshotManager;
  wallets: AccountWallet[] = [];
  accounts: CompleteAddress[] = [];
  asset!: TokenContract;
  tokenSim!: TokenSimulator;
  badAccount!: DocsExampleContract;

  constructor(testName: string) {
    this.logger = createDebugLogger(`aztec:e2e_token_contract:${testName}`);
    this.snapshotManager = new SnapshotManager(`e2e_token_contract/${testName}`, dataPath, this.logger);
  }

  /**
   * Adds two state shifts to snapshot manager.
   * 1. Add 3 accounts.
   * 2. Publicly deploy accounts, deploy token contract and a "bad account".
   */
  async pushBaseSnapshots() {
    await this.snapshotManager.snapshot('3_accounts', addAccounts(3), async ({ accountKeys }, { pxe }) => {
      const accountManagers = accountKeys.map(ak => getSchnorrAccount(pxe, ak[0], ak[1], 1));
      this.wallets = await Promise.all(accountManagers.map(a => a.getWallet()));
      this.accounts = await pxe.getRegisteredAccounts();
      this.logger(`Restored ${this.accounts.length} accounts.`);
      this.logger(`Wallet 0 address: ${this.wallets[0].getAddress()}`);
    });

    await this.snapshotManager.snapshot(
      'e2e_token_contract',
      async () => {
        // Create the token contract state.
        // Move this account thing to addAccounts above?
        this.logger(`Public deploy accounts...`);
        await publicDeployAccounts(this.wallets[0], this.accounts.slice(0, 2));

        this.logger(`Deploying TokenContract...`);
        const asset = await TokenContract.deploy(
          this.wallets[0],
          this.accounts[0],
          TokenContractTest.TOKEN_NAME,
          TokenContractTest.TOKEN_SYMBOL,
          TokenContractTest.TOKEN_DECIMALS,
        )
          .send()
          .deployed();
        this.logger(`Token deployed to ${asset.address}`);

        this.logger(`Deploying "bad account"...`);
        this.badAccount = await DocsExampleContract.deploy(this.wallets[0]).send().deployed();
        this.logger(`Deployed to ${this.badAccount.address}.`);

        return { tokenContractAddress: asset.address, badAccountAddress: this.badAccount.address };
      },
      async ({ tokenContractAddress, badAccountAddress }) => {
        // Restore the token contract state.
        this.asset = await TokenContract.at(tokenContractAddress, this.wallets[0]);
        this.logger(`Token contract restored to ${this.asset.address}.`);

        this.tokenSim = new TokenSimulator(
          this.asset,
          this.logger,
          this.accounts.map(a => a.address),
        );

        this.badAccount = await DocsExampleContract.at(badAccountAddress, this.wallets[0]);
        this.logger(`Bad account restored to ${this.badAccount.address}.`);

        expect(await this.asset.methods.admin().simulate()).toBe(this.accounts[0].address.toBigInt());
      },
    );

    // TokenContract.artifact.functions.forEach(fn => {
    //   const sig = decodeFunctionSignature(fn.name, fn.parameters);
    //   logger(`Function ${sig} and the selector: ${FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)}`);
    // });
  }

  async popBaseSnapshots() {
    await this.snapshotManager.pop(); // e2e_token_contract
    await this.snapshotManager.pop(); // 3_accounts
  }

  async addPendingShieldNoteToPXE(accountIndex: number, amount: bigint, secretHash: Fr, txHash: TxHash) {
    const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
    const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote

    const note = new Note([new Fr(amount), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      this.accounts[accountIndex].address,
      this.asset.address,
      storageSlot,
      noteTypeId,
      txHash,
    );
    await this.wallets[accountIndex].addNote(extendedNote);
  }

  async pushMintSnapshot() {
    await this.snapshotManager.snapshot(
      'mint',
      async () => {
        const { asset, accounts } = this;
        const amount = 10000n;
        await asset.methods.mint_public(accounts[0].address, amount).send().wait();

        const secret = Fr.random();
        const secretHash = computeMessageSecretHash(secret);
        const receipt = await asset.methods.mint_private(amount, secretHash).send().wait();

        await this.addPendingShieldNoteToPXE(0, amount, secretHash, receipt.txHash);
        const txClaim = asset.methods.redeem_shield(accounts[0].address, amount, secret).send();
        await txClaim.wait({ debug: true });

        return { amount };
      },
      async ({ amount }) => {
        const { asset, accounts, tokenSim } = this;
        tokenSim.mintPublic(accounts[0].address, amount);
        expect(await asset.methods.balance_of_public(accounts[0].address).simulate()).toEqual(
          tokenSim.balanceOfPublic(accounts[0].address),
        );
        tokenSim.mintPrivate(amount);
        tokenSim.redeemShield(accounts[0].address, amount);
        expect(await asset.methods.total_supply().simulate()).toEqual(tokenSim.totalSupply);
        return Promise.resolve();
      },
    );
  }
}
