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
 * and setup before we start the "actual" test.
 * blockCount: 10, txCount: 36, complexity: Deployment:      {"numberOfBlocks":16, "syncTime":17.490706521987914}
 * blockCount: 10, txCount: 36, complexity: PrivateTransfer: {"numberOfBlocks":19, "syncTime":20.846745924949644}
 * blockCount: 10, txCount: 36, complexity: PublicTransfer:  {"numberOfBlocks":18, "syncTime":21.340179460525512}
 * blockCount: 10, txCount: 9,  complexity: Spam:            {"numberOfBlocks":17, "syncTime":49.40888188171387}
 */
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { createArchiver } from '@aztec/archiver';
import { AztecNodeService } from '@aztec/aztec-node';
import {
  type AccountWalletWithSecretKey,
  AnvilTestWatcher,
  BatchCall,
  type Contract,
  Fr,
  GrumpkinScalar,
  type Logger,
  createLogger,
  sleep,
} from '@aztec/aztec.js';
// eslint-disable-next-line no-restricted-imports
import { L2Block, tryStop } from '@aztec/circuit-types';
import { type AztecAddress } from '@aztec/circuits.js';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import { SchnorrHardcodedAccountContract } from '@aztec/noir-contracts.js/SchnorrHardcodedAccount';
import { SpamContract } from '@aztec/noir-contracts.js/Spam';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { type PXEService } from '@aztec/pxe';
import { L1Publisher } from '@aztec/sequencer-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import * as fs from 'fs';
import { getContract } from 'viem';

import { addAccounts } from './fixtures/snapshot_manager.js';
import { mintTokensToPrivate } from './fixtures/token_utils.js';
import { type EndToEndContext, getPrivateKeyFromIndex, setup, setupPXEService } from './fixtures/utils.js';

const SALT = 420;
const AZTEC_GENERATE_TEST_DATA = !!process.env.AZTEC_GENERATE_TEST_DATA;
const START_TIME = 1893456000; // 2030 01 01 00 00
const RUN_THE_BIG_ONE = !!process.env.RUN_THE_BIG_ONE;
const ETHEREUM_SLOT_DURATION = getL1ContractsConfigEnvVars().ethereumSlotDuration;
const MINT_AMOUNT = 1000n;

enum TxComplexity {
  Deployment,
  PrivateTransfer,
  PublicTransfer,
  Spam,
}

type VariantDefinition = {
  blockCount: number;
  txCount: number;
  txComplexity: TxComplexity;
};

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
  private logger: Logger = createLogger(`test_variant`);
  private pxe!: PXEService;
  private token!: TokenContract;
  private spam!: SpamContract;

  public wallets!: AccountWalletWithSecretKey[];

  private seed = 0n;

  private contractAddresses: AztecAddress[] = [];

  public blockCount: number;
  public txCount: number;
  public txComplexity: TxComplexity;

  constructor(def: VariantDefinition) {
    this.blockCount = def.blockCount;
    this.txCount = def.txCount;
    this.txComplexity = def.txComplexity;
  }

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

  async deployWallets(numberOfAccounts: number) {
    // Create accounts such that we can send from many to not have colliding nullifiers
    const { accountKeys } = await addAccounts(numberOfAccounts, this.logger, false)({ pxe: this.pxe });
    const accountManagers = accountKeys.map(ak => getSchnorrAccount(this.pxe, ak[0], ak[1], 1));

    return await Promise.all(
      accountManagers.map(async (a, i) => {
        const partialAddress = a.getCompleteAddress().partialAddress;
        await this.pxe.registerAccount(accountKeys[i][0], partialAddress);
        const wallet = await a.getWallet();
        this.logger.verbose(`Wallet ${i} address: ${wallet.getAddress()} registered`);
        return wallet;
      }),
    );
  }

  async setup() {
    if (this.pxe === undefined) {
      throw new Error('Undefined PXE');
    }

    if (this.txComplexity == TxComplexity.Deployment) {
      return;
    }
    this.wallets = await this.deployWallets(this.txCount);

    // Mint tokens publicly if needed
    if (this.txComplexity == TxComplexity.PublicTransfer) {
      await Promise.all(
        this.wallets.map(w =>
          this.token.methods.mint_to_public(w.getAddress(), MINT_AMOUNT).send().wait({ timeout: 600 }),
        ),
      );
    }

    // Mint tokens privately if needed
    if (this.txComplexity == TxComplexity.PrivateTransfer) {
      await Promise.all(this.wallets.map((w, _) => mintTokensToPrivate(this.token, w, w.getAddress(), MINT_AMOUNT)));
    }
  }

  async createAndSendTxs() {
    if (!this.pxe) {
      throw new Error('Undefined PXE');
    }

    if (this.txComplexity == TxComplexity.Deployment) {
      const txs = [];
      for (let i = 0; i < this.txCount; i++) {
        const accountManager = getSchnorrAccount(this.pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
        this.contractAddresses.push(accountManager.getAddress());
        const deployMethod = await accountManager.getDeployMethod();
        const tx = deployMethod.send({
          contractAddressSalt: accountManager.salt,
          skipClassRegistration: true,
          skipPublicDeployment: true,
          universalDeploy: true,
        });
        txs.push(tx);
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
        txs.push(tk.methods.transfer_in_public(sender, recipient, 1n, 0).send());
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
 * @note  The `Spam` test have much fewer transactions than all others, this is
 *        because each transaction is LARGE, so the block size in kb is hit.
 *        I decided that 1/4 should be acceptable, and still small enough to work.
 */
const variants: VariantDefinition[] = [
  { blockCount: 10, txCount: 36, txComplexity: TxComplexity.Deployment },
  { blockCount: 10, txCount: 36, txComplexity: TxComplexity.PrivateTransfer },
  { blockCount: 10, txCount: 36, txComplexity: TxComplexity.PublicTransfer },
  { blockCount: 10, txCount: 9, txComplexity: TxComplexity.Spam },
  { blockCount: 1000, txCount: 4, txComplexity: TxComplexity.PrivateTransfer },
];

describe('e2e_synching', () => {
  // WARNING: Running this with AZTEC_GENERATE_TEST_DATA is VERY slow, and will build a whole slew
  //          of fixtures including multiple blocks with many transaction in.
  it.each(variants)(
    `Add blocks to the pending chain - %s`,
    async (variantDef: VariantDefinition) => {
      if (!AZTEC_GENERATE_TEST_DATA) {
        return;
      }

      // @note  If the `RUN_THE_BIG_ONE` flag is not set, we DO NOT run it.
      if (!RUN_THE_BIG_ONE && variantDef.blockCount === 1000) {
        return;
      }

      const variant = new TestVariant(variantDef);

      // The setup is in here and not at the `before` since we are doing different setups depending on what mode we are running in.
      // We require that at least 200 eth blocks have passed from the START_TIME before we see the first L2 block
      // This is to keep the setup more stable, so as long as the setup is less than 100 L1 txs, changing the setup should not break the setup
      const { teardown, pxe, sequencer, aztecNode, wallet } = await setup(1, {
        salt: SALT,
        l1StartTime: START_TIME,
        l2StartTime: START_TIME + 200 * ETHEREUM_SLOT_DURATION,
        assumeProvenThrough: 10 + variant.blockCount,
      });
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

      const blocks = await aztecNode.getBlocks(1, await aztecNode.getBlockNumber());

      await variant.writeBlocks(blocks);
      await teardown();
    },
    240_400_000,
  );

  const testTheVariant = async (
    variant: TestVariant,
    alternativeSync: (opts: Partial<EndToEndContext>, variant: TestVariant) => Promise<void>,
    assumeProvenThrough: number = Number.MAX_SAFE_INTEGER,
  ) => {
    if (AZTEC_GENERATE_TEST_DATA) {
      return;
    }

    const {
      teardown,
      logger,
      deployL1ContractsValues,
      config,
      cheatCodes,
      aztecNode,
      sequencer,
      watcher,
      pxe,
      blobSink,
    } = await setup(0, {
      salt: SALT,
      l1StartTime: START_TIME,
      skipProtocolContracts: true,
      assumeProvenThrough,
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
        viemPollingIntervalMS: 100,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        blobSinkUrl: `http://localhost:${blobSink?.port ?? 5052}`,
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
      // If it breaks here, first place you should look is the pruning.
      await publisher.proposeL2Block(block);
    }

    await alternativeSync({ deployL1ContractsValues, cheatCodes, config, logger, pxe }, variant);

    await teardown();
  };

  describe.skip('replay history and then do a fresh sync', () => {
    it.each(variants)(
      'vanilla - %s',
      async (variantDef: VariantDefinition) => {
        // @note  If the `RUN_THE_BIG_ONE` flag is not set, we DO NOT run it.
        if (!RUN_THE_BIG_ONE && variantDef.blockCount === 1000) {
          return;
        }

        await testTheVariant(
          new TestVariant(variantDef),
          async (opts: Partial<EndToEndContext>, variant: TestVariant) => {
            // All the blocks have been "re-played" and we are now to simply get a new node up to speed
            const timer = new Timer();
            const freshNode = await AztecNodeService.createAndSync({ ...opts.config!, disableValidator: true });
            const syncTime = timer.s();

            const blockNumber = await freshNode.getBlockNumber();

            opts.logger!.info(
              `Stats: ${variant.description()}: ${JSON.stringify({
                numberOfBlocks: blockNumber,
                syncTime,
              })}`,
            );

            await freshNode.stop();
          },
        );
      },
      RUN_THE_BIG_ONE ? 600_000 : 300_000,
    );
  });

  describe.skip('a wild prune appears', () => {
    const ASSUME_PROVEN_THROUGH = 0;

    it('archiver following catches reorg as it occur and deletes blocks', async () => {
      if (AZTEC_GENERATE_TEST_DATA) {
        return;
      }

      await testTheVariant(
        new TestVariant({ blockCount: 10, txCount: 36, txComplexity: TxComplexity.PrivateTransfer }),
        async (opts: Partial<EndToEndContext>, variant: TestVariant) => {
          const rollup = getContract({
            address: opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress.toString(),
            abi: RollupAbi,
            client: opts.deployL1ContractsValues!.walletClient,
          });

          const contracts: Contract[] = [];
          {
            const watcher = new AnvilTestWatcher(
              opts.cheatCodes!.eth,
              opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
              opts.deployL1ContractsValues!.publicClient,
            );
            await watcher.start();

            const aztecNode = await AztecNodeService.createAndSync(opts.config!);
            const sequencer = aztecNode.getSequencer();

            const { pxe } = await setupPXEService(aztecNode!);

            variant.setPXE(pxe);
            const wallet = (await variant.deployWallets(1))[0];

            contracts.push(
              await TokenContract.deploy(wallet, wallet.getAddress(), 'TestToken', 'TST', 18n).send().deployed(),
            );
            contracts.push(await SchnorrHardcodedAccountContract.deploy(wallet).send().deployed());
            contracts.push(
              await TokenContract.deploy(wallet, wallet.getAddress(), 'TestToken', 'TST', 18n).send().deployed(),
            );

            await watcher.stop();
            await sequencer?.stop();
            await aztecNode.stop();
          }

          const archiver = await createArchiver(opts.config!);
          const pendingBlockNumber = await rollup.read.getPendingBlockNumber();

          const worldState = await createWorldStateSynchronizer(opts.config!, archiver, new NoopTelemetryClient());
          await worldState.start();
          expect(await worldState.getLatestBlockNumber()).toEqual(Number(pendingBlockNumber));

          // We prune the last token and schnorr contract
          const assumeProvenThrough = pendingBlockNumber - 2n;
          await rollup.write.setAssumeProvenThroughBlockNumber([assumeProvenThrough]);

          const timeliness = (await rollup.read.EPOCH_DURATION()) * 2n;
          const blockLog = await rollup.read.getBlock([(await rollup.read.getProvenBlockNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo));

          expect(await archiver.getBlockNumber()).toBeGreaterThan(Number(assumeProvenThrough));
          const blockTip = (await archiver.getBlock(await archiver.getBlockNumber()))!;
          const txHash = blockTip.body.txEffects[0].txHash;

          const contractClassIds = await archiver.getContractClassIds();
          contracts.forEach(async c => {
            expect(contractClassIds.includes(c.instance.contractClassId)).toBeTrue;
            expect(await archiver.getContract(c.address)).not.toBeUndefined;
          });

          expect(await archiver.getTxEffect(txHash)).not.toBeUndefined;
          expect(await archiver.getPrivateLogs(blockTip.number, 1)).not.toEqual([]);
          expect(
            await archiver.getPublicLogs({ fromBlock: blockTip.number, toBlock: blockTip.number + 1 }),
          ).not.toEqual([]);

          await rollup.write.prune();

          // We need to sleep a bit to make sure that we have caught the prune and deleted blocks.
          await sleep(3000);
          expect(await archiver.getBlockNumber()).toBe(Number(assumeProvenThrough));

          const contractClassIdsAfter = await archiver.getContractClassIds();

          expect(contractClassIdsAfter.includes(contracts[0].instance.contractClassId)).toBeTrue;
          expect(contractClassIdsAfter.includes(contracts[1].instance.contractClassId)).toBeFalse;
          expect(await archiver.getContract(contracts[0].address)).not.toBeUndefined;
          expect(await archiver.getContract(contracts[1].address)).toBeUndefined;
          expect(await archiver.getContract(contracts[2].address)).toBeUndefined;

          // Only the hardcoded schnorr is pruned since the contract class also existed before prune.
          expect(contractClassIdsAfter).toEqual(
            contractClassIds.filter(c => !c.equals(contracts[1].instance.contractClassId)),
          );

          expect(await archiver.getTxEffect(txHash)).toBeUndefined;
          expect(await archiver.getPrivateLogs(blockTip.number, 1)).toEqual([]);
          expect(await archiver.getPublicLogs({ fromBlock: blockTip.number, toBlock: blockTip.number + 1 })).toEqual(
            [],
          );

          // Check world state reverted as well
          expect(await worldState.getLatestBlockNumber()).toEqual(Number(assumeProvenThrough));
          const worldStateLatestBlockHash = await worldState.getL2BlockHash(Number(assumeProvenThrough));
          const archiverLatestBlockHash = await archiver
            .getBlockHeader(Number(assumeProvenThrough))
            .then(b => b?.hash());
          expect(worldStateLatestBlockHash).toEqual(archiverLatestBlockHash?.toString());

          await tryStop(archiver);
          await worldState.stop();
        },
        ASSUME_PROVEN_THROUGH,
      );
    });

    it('node following prunes and can extend chain (fresh pxe)', async () => {
      // @todo this should be rewritten slightly when the PXE can handle re-orgs
      // such that it does not need to be run "fresh" Issue #9327
      if (AZTEC_GENERATE_TEST_DATA) {
        return;
      }

      await testTheVariant(
        new TestVariant({ blockCount: 10, txCount: 36, txComplexity: TxComplexity.Deployment }),
        async (opts: Partial<EndToEndContext>, variant: TestVariant) => {
          const rollup = getContract({
            address: opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress.toString(),
            abi: RollupAbi,
            client: opts.deployL1ContractsValues!.walletClient,
          });

          const pendingBlockNumber = await rollup.read.getPendingBlockNumber();
          await rollup.write.setAssumeProvenThroughBlockNumber([pendingBlockNumber - BigInt(variant.blockCount) / 2n]);

          const aztecNode = await AztecNodeService.createAndSync(opts.config!);
          const sequencer = aztecNode.getSequencer();

          const blockBeforePrune = await aztecNode.getBlockNumber();

          const timeliness = (await rollup.read.EPOCH_DURATION()) * 2n;
          const blockLog = await rollup.read.getBlock([(await rollup.read.getProvenBlockNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo));

          const watcher = new AnvilTestWatcher(
            opts.cheatCodes!.eth,
            opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
            opts.deployL1ContractsValues!.publicClient,
          );
          await watcher.start();

          await opts.deployL1ContractsValues!.publicClient.waitForTransactionReceipt({
            hash: await rollup.write.prune(),
          });

          await sleep(5000);
          expect(await aztecNode.getBlockNumber()).toBeLessThan(blockBeforePrune);

          // We need to start the pxe after the re-org for now, because it won't handle it otherwise
          const { pxe } = await setupPXEService(aztecNode!);
          variant.setPXE(pxe);

          const blockBefore = await aztecNode.getBlock(await aztecNode.getBlockNumber());

          sequencer?.updateSequencerConfig({ minTxsPerBlock: variant.txCount, maxTxsPerBlock: variant.txCount });
          const txs = await variant.createAndSendTxs();
          await Promise.all(txs.map(tx => tx.wait({ timeout: 1200 })));

          const blockAfter = await aztecNode.getBlock(await aztecNode.getBlockNumber());

          expect(blockAfter!.number).toEqual(blockBefore!.number + 1);
          expect(blockAfter!.header.lastArchive).toEqual(blockBefore!.archive);

          await sequencer?.stop();
          await aztecNode.stop();
          await watcher.stop();
        },
        ASSUME_PROVEN_THROUGH,
      );
    });

    it('fresh sync can extend chain', async () => {
      if (AZTEC_GENERATE_TEST_DATA) {
        return;
      }

      await testTheVariant(
        new TestVariant({ blockCount: 10, txCount: 36, txComplexity: TxComplexity.Deployment }),
        async (opts: Partial<EndToEndContext>, variant: TestVariant) => {
          const rollup = getContract({
            address: opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress.toString(),
            abi: RollupAbi,
            client: opts.deployL1ContractsValues!.walletClient,
          });

          const pendingBlockNumber = await rollup.read.getPendingBlockNumber();
          await rollup.write.setAssumeProvenThroughBlockNumber([pendingBlockNumber - BigInt(variant.blockCount) / 2n]);

          const timeliness = (await rollup.read.EPOCH_DURATION()) * 2n;
          const blockLog = await rollup.read.getBlock([(await rollup.read.getProvenBlockNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo));

          await rollup.write.prune();

          const watcher = new AnvilTestWatcher(
            opts.cheatCodes!.eth,
            opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
            opts.deployL1ContractsValues!.publicClient,
          );
          await watcher.start();

          // The sync here could likely be avoided by using the node we just synched.
          const aztecNode = await AztecNodeService.createAndSync(opts.config!);
          const sequencer = aztecNode.getSequencer();

          const { pxe } = await setupPXEService(aztecNode!);

          variant.setPXE(pxe);

          const blockBefore = await aztecNode.getBlock(await aztecNode.getBlockNumber());

          sequencer?.updateSequencerConfig({ minTxsPerBlock: variant.txCount, maxTxsPerBlock: variant.txCount });
          const txs = await variant.createAndSendTxs();
          await Promise.all(txs.map(tx => tx.wait({ timeout: 1200 })));

          const blockAfter = await aztecNode.getBlock(await aztecNode.getBlockNumber());

          expect(blockAfter!.number).toEqual(blockBefore!.number + 1);
          expect(blockAfter!.header.lastArchive).toEqual(blockBefore!.archive);

          await sequencer?.stop();
          await aztecNode.stop();
          await watcher.stop();
        },
        ASSUME_PROVEN_THROUGH,
      );
    });
  });
});
