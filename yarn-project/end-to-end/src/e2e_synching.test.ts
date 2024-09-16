/*
 * @note  The following test have two modes:
 *        - Setup where we are constructing blocks and saving for later usage
 *        - Execution where we will load and execute the blocks, then try a fresh
 *          sync.
 *
 *        The split is made since constructing the number of blocks that we desire
 *        takes an eternity. Especially for complex transactions will building the
 *        block take a significant amount of time.
 *        With the current test configuration setup run for ~30-40 minutes.
 *
 *        To run the Setup run with the `AZTEC_GENERATE_TEST_DATA=1` flag. Without
 *        this flag, we will run in execution.
 *
 *        There is functionality to store the `stats` of a sync, but currently we
 *        will simply be writing it to the log instead.
 *
 *        Notice that we are jumping far into the future such that the setup always
 *        happen at the same time, making it a lot simpler for us to construct
 *        blocks that we can replay.
 *
 * @dev   Since the test is currently not having any limits on time, we don't gain
 *        much from running it in CI, and it is therefore skipped.
 *
 *
 * Previous results. The `blockCount` is the number of blocks we will construct with `txCount`
 * transactions of the `complexity` provided.
 * The `numberOfBlocks` is the total number of blocks, including deployments of canonical contracts
 * and setup before we start the "actual" test. Similar, `numberOfTransactions` is the total number
 * of transactions across these blocks.
 * blockCount: 10, txCount: 36, complexity: Deployment:      {"numberOfBlocks":16, "syncTime":17.490706521987914, "numberOfTransactions":366}
 * blockCount: 10, txCount: 36, complexity: PrivateTransfer: {"numberOfBlocks":19, "syncTime":20.846745924949644, "numberOfTransactions":474}
 * blockCount: 10, txCount: 36, complexity: PublicTransfer:  {"numberOfBlocks":18, "syncTime":21.340179460525512, "numberOfTransactions":438}
 * blockCount: 10, txCount: 9,  complexity: Spam:            {"numberOfBlocks":17, "syncTime":49.40888188171387,  "numberOfTransactions":105}
 */
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { AztecNodeService } from '@aztec/aztec-node';
import {
  type AccountWallet,
  type AccountWalletWithSecretKey,
  BatchCall,
  type DebugLogger,
  Fr,
  GrumpkinScalar,
  computeSecretHash,
  createDebugLogger,
} from '@aztec/aztec.js';
// eslint-disable-next-line no-restricted-imports
import { ExtendedNote, L2Block, Note, type TxHash } from '@aztec/circuit-types';
import { type AztecAddress, ETHEREUM_SLOT_DURATION } from '@aztec/circuits.js';
import { Timer } from '@aztec/foundation/timer';
import { SpamContract, TokenContract } from '@aztec/noir-contracts.js';
import { type PXEService } from '@aztec/pxe';
import { L1Publisher } from '@aztec/sequencer-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import * as fs from 'fs';

import { addAccounts } from './fixtures/snapshot_manager.js';
import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

const SALT = 420;
const AZTEC_GENERATE_TEST_DATA = !!process.env.AZTEC_GENERATE_TEST_DATA;
const START_TIME = 1893456000; // 2030 01 01 00 00

const MINT_AMOUNT = 1000n;

enum TxComplexity {
  Deployment,
  PrivateTransfer,
  PublicTransfer,
  Spam,
}

/**
 * Helper class that wraps a certain variant of test, provides functionality for
 * setting up the test state (e.g., funding accounts etc) and to generate a list of transactions.
 *
 * Supports multiple complexities, any complexity beyond `Deployment` will be deploying accounts
 * such that every tx in a block can be sent by a different account.
 * The reason for this is that it allow us to not worry about trying to spend the same notes for
 * multiple transactions created by the same account.
 *
 *
 */
class TestVariant {
  private logger: DebugLogger = createDebugLogger(`test_variant`);
  private pxe!: PXEService;
  private token!: TokenContract;
  private spam!: SpamContract;

  private wallets!: AccountWalletWithSecretKey[];

  private seed = 0n;

  constructor(public blockCount: number, public txCount: number, public txComplexity: TxComplexity) {}

  setPXE(pxe: PXEService) {
    this.pxe = pxe;
  }

  setToken(token: TokenContract) {
    this.token = token;
  }

  setSpam(spam: SpamContract) {
    this.spam = spam;
  }

  toString() {
    return this.description();
  }

  description() {
    return `blockCount: ${this.blockCount}, txCount: ${this.txCount}, complexity: ${TxComplexity[this.txComplexity]}`;
  }

  name() {
    return `${this.blockCount}_${this.txCount}_${this.txComplexity}`;
  }

  async setup() {
    if (this.pxe === undefined) {
      throw new Error('Undefined PXE');
    }

    if (this.txComplexity == TxComplexity.Deployment) {
      return;
    }

    // Create accounts such that we can send from many to not have colliding nullifiers
    const { accountKeys } = await addAccounts(this.txCount, this.logger, false)({ pxe: this.pxe });
    const accountManagers = accountKeys.map(ak => getSchnorrAccount(this.pxe, ak[0], ak[1], 1));

    this.wallets = await Promise.all(
      accountManagers.map(async (a, i) => {
        const partialAddress = a.getCompleteAddress().partialAddress;
        await this.pxe.registerAccount(accountKeys[i][0], partialAddress);
        const wallet = await a.getWallet();
        this.logger.verbose(`Wallet ${i} address: ${wallet.getAddress()} registered`);
        return wallet;
      }),
    );

    // Mint tokens publicly if needed
    if (this.txComplexity == TxComplexity.PublicTransfer) {
      await Promise.all(
        this.wallets.map(w =>
          this.token.methods.mint_public(w.getAddress(), MINT_AMOUNT).send().wait({ timeout: 600 }),
        ),
      );
    }

    // Mint tokens privately if needed
    if (this.txComplexity == TxComplexity.PrivateTransfer) {
      const secrets: Fr[] = this.wallets.map(() => Fr.random());

      const txs = await Promise.all(
        this.wallets.map((w, i) =>
          this.token.methods.mint_private(MINT_AMOUNT, computeSecretHash(secrets[i])).send().wait({ timeout: 600 }),
        ),
      );

      // We minted all of them and wait. Now we add them all. Do we need to wait for that to have happened?
      await Promise.all(
        this.wallets.map((wallet, i) =>
          this.addPendingShieldNoteToPXE({
            amount: MINT_AMOUNT,
            secretHash: computeSecretHash(secrets[i]),
            txHash: txs[i].txHash,
            accountAddress: wallet.getAddress(),
            assetAddress: this.token.address,
            wallet: wallet,
          }),
        ),
      );

      await Promise.all(
        this.wallets.map(async (w, i) =>
          (await TokenContract.at(this.token.address, w)).methods
            .redeem_shield(w.getAddress(), MINT_AMOUNT, secrets[i])
            .send()
            .wait({ timeout: 600 }),
        ),
      );
    }
  }

  private async addPendingShieldNoteToPXE(args: {
    amount: bigint;
    secretHash: Fr;
    txHash: TxHash;
    accountAddress: AztecAddress;
    assetAddress: AztecAddress;
    wallet: AccountWallet;
  }) {
    const { accountAddress, assetAddress, amount, secretHash, txHash, wallet } = args;
    const note = new Note([new Fr(amount), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      accountAddress,
      assetAddress,
      TokenContract.storage.pending_shields.slot,
      TokenContract.notes.TransparentNote.id,
      txHash,
    );
    await wallet.addNote(extendedNote);
  }

  async createAndSendTxs() {
    if (!this.pxe) {
      throw new Error('Undefined PXE');
    }

    if (this.txComplexity == TxComplexity.Deployment) {
      const txs = [];
      for (let i = 0; i < this.txCount; i++) {
        const accountManager = getSchnorrAccount(this.pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
        const deployMethod = await accountManager.getDeployMethod();
        await deployMethod.create({
          contractAddressSalt: accountManager.salt,
          skipClassRegistration: true,
          skipPublicDeployment: true,
          universalDeploy: true,
        });
        txs.push(deployMethod.send());
      }
      return txs;
    } else if (this.txComplexity == TxComplexity.PrivateTransfer) {
      // To do a private transfer we need to a lot of accounts that all have funds.
      const txs = [];
      for (let i = 0; i < this.txCount; i++) {
        const recipient = this.wallets[(i + 1) % this.txCount].getAddress();
        const tk = await TokenContract.at(this.token.address, this.wallets[i]);
        txs.push(tk.methods.transfer(recipient, 1n).send());
      }
      return txs;
    } else if (this.txComplexity == TxComplexity.PublicTransfer) {
      // Public transfer is simpler, we can just transfer to our-selves there.
      const txs = [];
      for (let i = 0; i < this.txCount; i++) {
        const sender = this.wallets[i].getAddress();
        const recipient = this.wallets[(i + 1) % this.txCount].getAddress();
        const tk = await TokenContract.at(this.token.address, this.wallets[i]);
        txs.push(tk.methods.transfer_public(sender, recipient, 1n, 0).send());
      }
      return txs;
    } else if (this.txComplexity == TxComplexity.Spam) {
      // This one is slightly more painful. We need to setup a new contract that writes
      // a metric ton of state changes.

      const txs = [];
      for (let i = 0; i < this.txCount; i++) {
        const batch = new BatchCall(this.wallets[i], [
          this.spam.methods.spam(this.seed, 16, false).request(),
          this.spam.methods.spam(this.seed + 16n, 16, false).request(),
          this.spam.methods.spam(this.seed + 32n, 16, false).request(),
          this.spam.methods.spam(this.seed + 48n, 15, true).request(),
        ]);

        this.seed += 100n;
        txs.push(batch.send());
      }
      return txs;
    } else {
      throw new Error('Incorrect tx complexity');
    }
  }

  async writeBlocks(blocks: L2Block[]) {
    await this.writeJson(`blocks`, { blocks: blocks.map(block => block.toString()) });
  }

  loadBlocks() {
    const json = this.loadJson(`blocks`);
    return (json['blocks'] as string[]).map(b => L2Block.fromString(b));
  }

  async writeStats(content: Record<string, string | number>) {
    await this.writeJson(`stats`, {
      description: this.description(),
      ...content,
    });
  }

  numberOfBlocksStored() {
    const files = fs.readdirSync(this.dir());
    return files.filter(file => file.startsWith('block_')).length;
  }

  private async writeJson(fileName: string, toSave: Record<string, string[] | string | number>) {
    const dir = this.dir();
    await fs.promises.mkdir(dir, { recursive: true });

    const path = `${dir}/${fileName}.json`;
    const output = JSON.stringify(toSave, null, 2);
    fs.writeFileSync(path, output, 'utf8');
  }

  private loadJson(fileName: string): Record<string, string[] | string | number> {
    const path = `${this.dir()}/${fileName}.json`;
    const data = fs.readFileSync(path, 'utf8');
    return JSON.parse(data);
  }

  private dir(): string {
    return `./src/fixtures/synching_blocks/${this.name()}`;
  }
}

/**
 * Setting up the different variants we will be testing with.
 *
 * @note  The `MaxDiff` test have much fewer transactions than all others, this is
 *        because each transaction is LARGE, so the block size in kb is hit.
 *        I decided that 1/4 should be acceptable, and still small enough to work.
 */
const variants: TestVariant[] = [
  new TestVariant(10, 36, TxComplexity.Deployment),
  new TestVariant(10, 36, TxComplexity.PrivateTransfer),
  new TestVariant(10, 36, TxComplexity.PublicTransfer),
  new TestVariant(10, 9, TxComplexity.Spam),
];

describe('e2e_l1_with_wall_time', () => {
  // WARNING: Running this with AZTEC_GENERATE_TEST_DATA is VERY slow, and will build a whole slew
  //          of fixtures including multiple blocks with many transaction in.
  it.each(variants)(
    `Add blocks to the pending chain - %s`,
    async (variant: TestVariant) => {
      if (!AZTEC_GENERATE_TEST_DATA) {
        return;
      }

      // The setup is in here and not at the `before` since we are doing different setups depending on what mode we are running in.
      const { teardown, pxe, sequencer, aztecNode, wallet } = await setup(1, { salt: SALT, l1StartTime: START_TIME });
      variant.setPXE(pxe as PXEService);

      // Deploy a token, such that we could use it
      const token = await TokenContract.deploy(wallet, wallet.getAddress(), 'TestToken', 'TST', 18n).send().deployed();
      const spam = await SpamContract.deploy(wallet).send().deployed();

      variant.setToken(token);
      variant.setSpam(spam);

      // Now we create all of our interesting blocks.
      // Alter the block requirements for the sequencer such that we ensure blocks sizes as desired.
      sequencer?.updateSequencerConfig({ minTxsPerBlock: variant.txCount, maxTxsPerBlock: variant.txCount });

      // The setup will mint tokens (private and public)
      await variant.setup();

      for (let i = 0; i < variant.blockCount; i++) {
        const txs = await variant.createAndSendTxs();
        if (txs) {
          await Promise.all(txs.map(tx => tx.wait({ timeout: 1200 })));
        }
      }

      const blocks = await aztecNode.getBlocks(0, await aztecNode.getBlockNumber());

      await variant.writeBlocks(blocks);
      await teardown();
    },
    1_200_000,
  );

  it.each(variants)('replay and then sync - %s', async (variant: TestVariant) => {
    if (AZTEC_GENERATE_TEST_DATA) {
      return;
    }

    const { teardown, logger, deployL1ContractsValues, config, cheatCodes, aztecNode, sequencer, watcher } =
      await setup(0, {
        salt: SALT,
        l1StartTime: START_TIME,
        skipProtocolContracts: true,
      });

    await (aztecNode as any).stop();
    await (sequencer as any).stop();
    await watcher?.stop();

    const sequencerPK: `0x${string}` = `0x${getPrivateKeyFromIndex(0)!.toString('hex')}`;
    const publisher = new L1Publisher(
      {
        l1RpcUrl: config.l1RpcUrl,
        requiredConfirmations: 1,
        l1Contracts: deployL1ContractsValues.l1ContractAddresses,
        publisherPrivateKey: sequencerPK,
        l1PublishRetryIntervalMS: 100,
        l1ChainId: 31337,
      },
      new NoopTelemetryClient(),
    );

    const blocks = variant.loadBlocks();

    // For each of the blocks we progress time such that it land at the correct time
    // We create blocks for every ethereum slot simply to make sure that the test is "closer" to
    // a real world.
    for (const block of blocks) {
      const targetTime = block.header.globalVariables.timestamp.toNumber() - ETHEREUM_SLOT_DURATION;
      while ((await cheatCodes.eth.timestamp()) < targetTime) {
        await cheatCodes.eth.mine();
      }
      await publisher.proposeL2Block(block);
    }

    // All the blocks have been "re-played" and we are now to simply get a new node up to speed
    const timer = new Timer();
    const freshNode = await AztecNodeService.createAndSync(
      { ...config, disableSequencer: true, disableValidator: true },
      new NoopTelemetryClient(),
    );
    const syncTime = timer.s();

    const txCount = blocks.map(b => b.getStats().txCount).reduce((acc, curr) => acc + curr, 0);
    const blockNumber = await freshNode.getBlockNumber();

    // @note  We should consider storing these stats to see changes over time etc.
    // await variant.writeStats({ numberOfBlocks: blockNumber, syncTime, numberOfTransactions: txCount });
    logger.info(
      `Stats: ${variant.description()}: ${JSON.stringify({
        numberOfBlocks: blockNumber,
        syncTime,
        numberOfTransactions: txCount,
      })}`,
    );

    await teardown();
  });
});
