import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountWallet,
  type AztecAddress,
  type AztecNode,
  type DebugLogger,
  ExtendedNote,
  Fr,
  Note,
  type PXE,
  type TxHash,
  computeSecretHash,
  createDebugLogger,
} from '@aztec/aztec.js';
import { GasSettings } from '@aztec/circuits.js';
import { createL1Clients } from '@aztec/ethereum';
import { TokenContract as BananaCoin, FPCContract, GasTokenContract } from '@aztec/noir-contracts.js';

import { MNEMONIC } from '../fixtures/fixtures.js';
import { SnapshotManager, type SubsystemsContext, addAccounts } from '../fixtures/snapshot_manager.js';
import { type BalancesFn, expectMapping, getBalancesFn, publicDeployAccounts } from '../fixtures/utils.js';
import { GasPortalTestingHarnessFactory, type IGasBridgingTestHarness } from '../shared/gas_portal_test_harness.js';

const { E2E_DATA_PATH: dataPath } = process.env;

export class FeesTest {
  private snapshotManager: SnapshotManager;
  private wallets: AccountWallet[] = [];

  public logger: DebugLogger;
  public pxe!: PXE;
  public aztecNode!: AztecNode;

  public aliceWallet!: AccountWallet;
  public aliceAddress!: AztecAddress;
  public bobAddress!: AztecAddress;
  public sequencerAddress!: AztecAddress;
  public gasSettings = GasSettings.default();

  public gasTokenContract!: GasTokenContract;
  public bananaCoin!: BananaCoin;
  public bananaFPC!: FPCContract;

  public gasBridgeTestHarness!: IGasBridgingTestHarness;

  public gasBalances!: BalancesFn;
  public bananaPublicBalances!: BalancesFn;
  public bananaPrivateBalances!: BalancesFn;

  public BRIDGED_FPC_GAS = BigInt(1e15);
  public ALICE_BANANACOIN_BALANCE = 1e12;

  constructor(testName: string) {
    this.logger = createDebugLogger(`aztec:e2e_deploy_contract:${testName}`);
    this.snapshotManager = new SnapshotManager(`e2e_deploy_contract/${testName}`, dataPath);
  }

  async setup() {
    await this.applyInitialAccountsSnapshot();
    await this.applyPublicDeployAccountsSnapshot();
    await this.applyGasSetupSnapshot();
    const context = await this.snapshotManager.setup();
    await context.aztecNode.setConfig({ feeRecipient: this.sequencerAddress });
    ({ pxe: this.pxe, aztecNode: this.aztecNode } = context);
    return this;
  }

  async setupWithFundAlice() {
    await this.setup();
    await this.applyFundAlice();
    return this;
  }

  async teardown() {
    await this.snapshotManager.teardown();
  }

  /** Alice mints bananaCoin tokens privately to the target address. */
  async mintPrivate(amount: bigint, address: AztecAddress) {
    const secret = Fr.random();
    const secretHash = computeSecretHash(secret);
    this.logger.debug(`Minting ${amount} bananas privately for ${address} with secret ${secretHash.toString()}`);
    const receipt = await this.bananaCoin.methods.mint_private(amount, secretHash).send().wait();

    await this.addPendingShieldNoteToPXE(this.aliceWallet, amount, secretHash, receipt.txHash);
    const txClaim = this.bananaCoin.methods.redeem_shield(address, amount, secret).send();
    const receiptClaim = await txClaim.wait({ debug: true });
    const { visibleNotes } = receiptClaim.debugInfo!;
    expect(visibleNotes[0].note.items[0].toBigInt()).toBe(amount);
  }

  async addPendingShieldNoteToPXE(wallet: AccountWallet, amount: bigint, secretHash: Fr, txHash: TxHash) {
    const note = new Note([new Fr(amount), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      wallet.getAddress(),
      this.bananaCoin.address,
      BananaCoin.storage.pending_shields.slot,
      BananaCoin.notes.TransparentNote.id,
      txHash,
    );
    await wallet.addNote(extendedNote);
  }

  private async applyInitialAccountsSnapshot() {
    await this.snapshotManager.snapshot(
      'initial_accounts',
      addAccounts(3, this.logger),
      async ({ accountKeys }, { pxe }) => {
        const accountManagers = accountKeys.map(ak => getSchnorrAccount(pxe, ak[0], ak[1], 1));
        this.wallets = await Promise.all(accountManagers.map(a => a.getWallet()));
        this.wallets.forEach((w, i) => this.logger.verbose(`Wallet ${i} address: ${w.getAddress()}`));
        this.aliceWallet = this.wallets[0];
        [this.aliceAddress, this.bobAddress, this.sequencerAddress] = this.wallets.map(w => w.getAddress());
      },
    );
  }

  private async applyPublicDeployAccountsSnapshot() {
    await this.snapshotManager.snapshot(
      'public_deploy_accounts',
      () => publicDeployAccounts(this.aliceWallet, this.wallets),
      () => Promise.resolve(),
    );
  }

  private async applyGasSetupSnapshot() {
    await this.snapshotManager.snapshot(
      'gas_setup',
      async context => {
        const harness = await this.createGasBridgeTestHarness(context);
        const gasTokenContract = harness.l2Token;

        const bananaCoin = await BananaCoin.deploy(this.aliceWallet, this.aliceAddress, 'BC', 'BC', 18n)
          .send()
          .deployed();

        this.logger.info(`BananaCoin deployed at ${bananaCoin.address}`);

        const bananaFPC = await FPCContract.deploy(this.aliceWallet, bananaCoin.address, gasTokenContract.address)
          .send()
          .deployed();

        this.logger.info(`BananaPay deployed at ${bananaFPC.address}`);

        await harness.bridgeFromL1ToL2(this.BRIDGED_FPC_GAS, this.BRIDGED_FPC_GAS, bananaFPC.address);

        return {
          bananaCoinAddress: bananaCoin.address,
          bananaFPCAddress: bananaFPC.address,
          gasTokenAddress: gasTokenContract.address,
        };
      },
      async data => {
        const bananaFPC = await FPCContract.at(data.bananaFPCAddress, this.aliceWallet);
        const bananaCoin = await BananaCoin.at(data.bananaCoinAddress, this.aliceWallet);
        const gasTokenContract = await GasTokenContract.at(data.gasTokenAddress, this.aliceWallet);

        this.bananaPublicBalances = getBalancesFn('🍌.public', bananaCoin.methods.balance_of_public, this.logger);
        this.bananaPrivateBalances = getBalancesFn('🍌.private', bananaCoin.methods.balance_of_private, this.logger);
        this.gasBalances = getBalancesFn('⛽', gasTokenContract.methods.balance_of_public, this.logger);

        await expectMapping(
          this.bananaPrivateBalances,
          [this.aliceAddress, bananaFPC.address, this.sequencerAddress],
          [0n, 0n, 0n],
        );
        await expectMapping(
          this.bananaPublicBalances,
          [this.aliceAddress, bananaFPC.address, this.sequencerAddress],
          [0n, 0n, 0n],
        );
        await expectMapping(
          this.gasBalances,
          [this.aliceAddress, bananaFPC.address, this.sequencerAddress],
          [0n, this.BRIDGED_FPC_GAS, 0n],
        );
      },
    );
  }

  private async applyFundAlice() {
    await this.snapshotManager.snapshot(
      'fund_alice',
      async () => {
        await this.mintPrivate(BigInt(this.ALICE_BANANACOIN_BALANCE), this.aliceAddress);
        await this.bananaCoin.methods.mint_public(this.aliceAddress, this.ALICE_BANANACOIN_BALANCE).send().wait();
      },
      () => Promise.resolve(),
    );
  }

  private createGasBridgeTestHarness(context: SubsystemsContext) {
    const { publicClient, walletClient } = createL1Clients(context.aztecNodeConfig.rpcUrl, MNEMONIC);

    return GasPortalTestingHarnessFactory.create({
      aztecNode: context.aztecNode,
      pxeService: context.pxe,
      publicClient: publicClient,
      walletClient: walletClient,
      wallet: this.aliceWallet,
      logger: this.logger,
      mockL1: false,
    });
  }
}
