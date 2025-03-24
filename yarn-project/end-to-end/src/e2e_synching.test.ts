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
import { type InitialAccountData, deployFundedSchnorrAccounts } from '@aztec/accounts/testing';
import { createArchiver } from '@aztec/archiver';
import { AztecNodeService } from '@aztec/aztec-node';
import {
  type AccountWalletWithSecretKey,
  BatchCall,
  type Contract,
  Fr,
  GrumpkinScalar,
  type Logger,
  createLogger,
  sleep,
} from '@aztec/aztec.js';
import { AnvilTestWatcher } from '@aztec/aztec.js/testing';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { EpochCache } from '@aztec/epoch-cache';
import {
  GovernanceProposerContract,
  RollupContract,
  SlashingProposerContract,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestDateProvider, Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import { SchnorrHardcodedAccountContract } from '@aztec/noir-contracts.js/SchnorrHardcodedAccount';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import type { PXEService } from '@aztec/pxe/server';
import { SequencerPublisher } from '@aztec/sequencer-client';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2Block } from '@aztec/stdlib/block';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import * as fs from 'fs';
import { getContract } from 'viem';

import { DEFAULT_BLOB_SINK_PORT } from './fixtures/fixtures.js';
import { mintTokensToPrivate } from './fixtures/token_utils.js';
import {
  type EndToEndContext,
  createForwarderContract,
  getPrivateKeyFromIndex,
  setup,
  setupPXEService,
} from './fixtures/utils.js';

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

  setWallets(wallets: AccountWalletWithSecretKey[]) {
    this.wallets = wallets;
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

  async deployWallets(accounts: InitialAccountData[]) {
    // Create accounts such that we can send from many to not have colliding nullifiers
    const managers = await deployFundedSchnorrAccounts(this.pxe, accounts);
    return await Promise.all(managers.map(m => m.getWallet()));
  }

  async setup(accounts: InitialAccountData[] = []) {
    if (this.pxe === undefined) {
      throw new Error('Undefined PXE');
    }

    if (this.txComplexity == TxComplexity.Deployment) {
      return;
    }

    this.wallets = await this.deployWallets(accounts);

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
        const deployWallet = this.wallets[i % this.wallets.length];
        const accountManager = await getSchnorrAccount(this.pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
        this.contractAddresses.push(accountManager.getAddress());
        const tx = accountManager.deploy({
          deployWallet,
          skipClassRegistration: true,
          skipPublicDeployment: true,
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
          this.spam.methods.spam(this.seed, 16, false),
          this.spam.methods.spam(this.seed + 16n, 16, false),
          this.spam.methods.spam(this.seed + 32n, 16, false),
          this.spam.methods.spam(this.seed + 48n, 15, true),
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
      const { teardown, pxe, sequencer, aztecNode, wallet, initialFundedAccounts, cheatCodes } = await setup(1, {
        salt: SALT,
        l1StartTime: START_TIME,
        l2StartTime: START_TIME + 200 * ETHEREUM_SLOT_DURATION,
        numberOfInitialFundedAccounts: variant.txCount + 1,
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
      const accountsToBeDeployed = initialFundedAccounts.slice(1); // The first one has been deployed in setup.
      await variant.setup(accountsToBeDeployed);

      for (let i = 0; i < variant.blockCount; i++) {
        const txs = await variant.createAndSendTxs();
        if (txs) {
          await Promise.all(txs.map(tx => tx.wait({ timeout: 1200 })));
        }
        await cheatCodes.rollup.markAsProven();
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
    provenThrough: number = Number.MAX_SAFE_INTEGER,
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
      initialFundedAccounts,
    } = await setup(0, {
      salt: SALT,
      l1StartTime: START_TIME,
      skipProtocolContracts: true,
      numberOfInitialFundedAccounts: 10,
    });

    await (aztecNode as any).stop();
    await (sequencer as any).stop();
    await watcher?.stop();

    const blobSinkClient = createBlobSinkClient({
      blobSinkUrl: `http://localhost:${blobSink?.port ?? DEFAULT_BLOB_SINK_PORT}`,
    });

    const sequencerPK: `0x${string}` = `0x${getPrivateKeyFromIndex(0)!.toString('hex')}`;

    const l1TxUtils = new L1TxUtilsWithBlobs(deployL1ContractsValues.l1Client, logger, config);
    const rollupAddress = deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString();
    const rollupContract = new RollupContract(deployL1ContractsValues.l1Client, rollupAddress);
    const governanceProposerContract = new GovernanceProposerContract(
      deployL1ContractsValues.l1Client,
      config.l1Contracts.governanceProposerAddress.toString(),
    );
    const slashingProposerAddress = await rollupContract.getSlashingProposerAddress();
    const slashingProposerContract = new SlashingProposerContract(
      deployL1ContractsValues.l1Client,
      slashingProposerAddress.toString(),
    );
    const forwarderContract = await createForwarderContract(config, sequencerPK, rollupAddress);
    const epochCache = await EpochCache.create(config.l1Contracts.rollupAddress, config, {
      dateProvider: new TestDateProvider(),
    });
    const publisher = new SequencerPublisher(
      {
        l1RpcUrls: config.l1RpcUrls,
        l1Contracts: deployL1ContractsValues.l1ContractAddresses,
        publisherPrivateKey: new SecretValue(sequencerPK),
        l1PublishRetryIntervalMS: 100,
        l1ChainId: 31337,
        viemPollingIntervalMS: 100,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        blobSinkUrl: `http://localhost:${blobSink?.port ?? 5052}`,
        customForwarderContractAddress: EthAddress.ZERO,
      },
      {
        blobSinkClient,
        l1TxUtils,
        rollupContract,
        forwarderContract,
        governanceProposerContract,
        slashingProposerContract,
        epochCache,
      },
    );

    const blocks = variant.loadBlocks();

    // For each of the blocks we progress time such that it land at the correct time
    // We create blocks for every ethereum slot simply to make sure that the test is "closer" to
    // a real world.
    for (const block of blocks) {
      const targetTime = Number(block.header.globalVariables.timestamp) - ETHEREUM_SLOT_DURATION;
      while ((await cheatCodes.eth.timestamp()) < targetTime) {
        await cheatCodes.eth.mine();
      }
      // If it breaks here, first place you should look is the pruning.
      await publisher.enqueueProposeL2Block(block);

      await cheatCodes.rollup.markAsProven(provenThrough);
    }

    await alternativeSync({ deployL1ContractsValues, cheatCodes, config, logger, pxe, initialFundedAccounts }, variant);

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
            client: opts.deployL1ContractsValues!.l1Client,
          });

          const contracts: Contract[] = [];
          {
            const watcher = new AnvilTestWatcher(
              opts.cheatCodes!.eth,
              opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
              opts.deployL1ContractsValues!.l1Client,
            );
            await watcher.start();

            const aztecNode = await AztecNodeService.createAndSync(opts.config!);
            const sequencer = aztecNode.getSequencer();

            const { pxe } = await setupPXEService(aztecNode!);

            variant.setPXE(pxe);
            const wallet = (await variant.deployWallets(opts.initialFundedAccounts!.slice(0, 1)))[0];

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

          const blobSinkClient = createBlobSinkClient({
            blobSinkUrl: `http://localhost:${opts.blobSink?.port ?? DEFAULT_BLOB_SINK_PORT}`,
          });
          const archiver = await createArchiver(opts.config!, blobSinkClient, {
            blockUntilSync: true,
          });
          const pendingBlockNumber = await rollup.read.getPendingBlockNumber();

          const worldState = await createWorldStateSynchronizer(opts.config!, archiver);
          await worldState.start();
          expect(await worldState.getLatestBlockNumber()).toEqual(Number(pendingBlockNumber));

          // We prune the last token and schnorr contract
          const provenThrough = pendingBlockNumber - 2n;
          await opts.cheatCodes!.rollup.markAsProven(provenThrough);

          const timeliness = (await rollup.read.getEpochDuration()) * 2n;
          const blockLog = await rollup.read.getBlock([(await rollup.read.getProvenBlockNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo));

          expect(await archiver.getBlockNumber()).toBeGreaterThan(Number(provenThrough));
          const blockTip = (await archiver.getBlock(await archiver.getBlockNumber()))!;
          const txHash = blockTip.body.txEffects[0].txHash;

          const contractClassIds = await archiver.getContractClassIds();
          for (const c of contracts) {
            expect(contractClassIds.includes(c.instance.currentContractClassId)).toBeTrue;
            expect(await archiver.getContract(c.address)).not.toBeUndefined;
          }

          expect(await archiver.getTxEffect(txHash)).not.toBeUndefined;
          expect(await archiver.getPrivateLogs(blockTip.number, 1)).not.toEqual([]);
          expect(
            await archiver.getPublicLogs({ fromBlock: blockTip.number, toBlock: blockTip.number + 1 }),
          ).not.toEqual([]);

          await rollup.write.prune();

          // We need to sleep a bit to make sure that we have caught the prune and deleted blocks.
          await sleep(3000);
          expect(await archiver.getBlockNumber()).toBe(Number(provenThrough));

          const contractClassIdsAfter = await archiver.getContractClassIds();

          expect(contractClassIdsAfter.includes(contracts[0].instance.currentContractClassId)).toBeTrue;
          expect(contractClassIdsAfter.includes(contracts[1].instance.currentContractClassId)).toBeFalse;
          expect(await archiver.getContract(contracts[0].address)).not.toBeUndefined;
          expect(await archiver.getContract(contracts[1].address)).toBeUndefined;
          expect(await archiver.getContract(contracts[2].address)).toBeUndefined;

          // Only the hardcoded schnorr is pruned since the contract class also existed before prune.
          expect(contractClassIdsAfter).toEqual(
            contractClassIds.filter(c => !c.equals(contracts[1].instance.currentContractClassId)),
          );

          expect(await archiver.getTxEffect(txHash)).toBeUndefined;
          expect(await archiver.getPrivateLogs(blockTip.number, 1)).toEqual([]);
          expect(await archiver.getPublicLogs({ fromBlock: blockTip.number, toBlock: blockTip.number + 1 })).toEqual(
            [],
          );

          // Check world state reverted as well
          expect(await worldState.getLatestBlockNumber()).toEqual(Number(provenThrough));
          const worldStateLatestBlockHash = await worldState.getL2BlockHash(Number(provenThrough));
          const archiverLatestBlockHash = await archiver.getBlockHeader(Number(provenThrough)).then(b => b?.hash());
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
            client: opts.deployL1ContractsValues!.l1Client,
          });

          const pendingBlockNumber = await rollup.read.getPendingBlockNumber();
          await opts.cheatCodes!.rollup.markAsProven(pendingBlockNumber - BigInt(variant.blockCount) / 2n);

          const aztecNode = await AztecNodeService.createAndSync(opts.config!);
          const sequencer = aztecNode.getSequencer();

          const blockBeforePrune = await aztecNode.getBlockNumber();

          const timeliness = (await rollup.read.getEpochDuration()) * 2n;
          const blockLog = await rollup.read.getBlock([(await rollup.read.getProvenBlockNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo));

          const watcher = new AnvilTestWatcher(
            opts.cheatCodes!.eth,
            opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
            opts.deployL1ContractsValues!.l1Client,
          );
          await watcher.start();

          await opts.deployL1ContractsValues!.l1Client.waitForTransactionReceipt({
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
            client: opts.deployL1ContractsValues!.l1Client,
          });

          const pendingBlockNumber = await rollup.read.getPendingBlockNumber();
          await opts.cheatCodes!.rollup.markAsProven(pendingBlockNumber - BigInt(variant.blockCount) / 2n);

          const timeliness = (await rollup.read.getEpochDuration()) * 2n;
          const blockLog = await rollup.read.getBlock([(await rollup.read.getProvenBlockNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo));

          await rollup.write.prune();

          const watcher = new AnvilTestWatcher(
            opts.cheatCodes!.eth,
            opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
            opts.deployL1ContractsValues!.l1Client,
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
