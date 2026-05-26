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
 * Previous results. The `checkpointCount` is the number of blocks we will construct with `txCount`
 * transactions of the `complexity` provided.
 * The `numberOfBlocks` is the total number of blocks, including deployments of canonical contracts
 * and setup before we start the "actual" test.
 * checkpointCount: 10, txCount: 36, complexity: Deployment:      {"numberOfBlocks":16, "syncTime":17.490706521987914}
 * checkpointCount: 10, txCount: 36, complexity: PrivateTransfer: {"numberOfBlocks":19, "syncTime":20.846745924949644}
 * checkpointCount: 10, txCount: 36, complexity: PublicTransfer:  {"numberOfBlocks":18, "syncTime":21.340179460525512}
 * checkpointCount: 10, txCount: 9,  complexity: Spam:            {"numberOfBlocks":17, "syncTime":49.40888188171387}
 */
import type { InitialAccountData } from '@aztec/accounts/testing';
import { createArchiver } from '@aztec/archiver';
import { AztecNodeService } from '@aztec/aztec-node';
import { NO_FROM } from '@aztec/aztec.js/account';
import { BatchCall, type Contract, NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { AnvilTestWatcher } from '@aztec/aztec/testing';
import { createBlobClientWithFileStores } from '@aztec/blob-client/client';
import { Blob } from '@aztec/blob-lib';
import { EpochCache } from '@aztec/epoch-cache';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';
import { createL1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Signature } from '@aztec/foundation/eth-signature';
import { sleep } from '@aztec/foundation/sleep';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { Timer } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import { SchnorrHardcodedAccountContract } from '@aztec/noir-contracts.js/SchnorrHardcodedAccount';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { SequencerPublisher, SequencerPublisherMetrics } from '@aztec/sequencer-client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CommitteeAttestationsAndSigners, L2Block } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { createWorldState, createWorldStateSynchronizer } from '@aztec/world-state';

import * as fs from 'fs';
import { type MockProxy, mock } from 'jest-mock-extended';
import { getContract } from 'viem';

import { PIPELINING_SETUP_OPTS } from './fixtures/fixtures.js';
import { mintTokensToPrivate } from './fixtures/token_utils.js';
import { type EndToEndContext, setup, setupPXEAndGetWallet } from './fixtures/utils.js';
import { TestWallet } from './test-wallet/test_wallet.js';

const AZTEC_GENERATE_TEST_DATA = !!process.env.AZTEC_GENERATE_TEST_DATA;
const START_TIME = 1893456000; // 2030 01 01 00 00
const RUN_THE_BIG_ONE = !!process.env.RUN_THE_BIG_ONE;

const l1ContractsEnvVars = getL1ContractsConfigEnvVars();
const ETHEREUM_SLOT_DURATION = l1ContractsEnvVars.ethereumSlotDuration;
const AZTEC_SLOT_DURATION = l1ContractsEnvVars.aztecSlotDuration;

const MINT_AMOUNT = 1000n;

enum TxComplexity {
  Deployment,
  PrivateTransfer,
  PublicTransfer,
  Spam,
}

type VariantDefinition = {
  checkpointCount: number;
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
  private token!: TokenContract;
  private spam!: SpamContract;

  public wallet!: TestWallet;
  public accounts: AztecAddress[] = [];

  private seed = 0n;

  private contractAddresses: AztecAddress[] = [];

  public checkpointCount: number;
  public txCount: number;
  public txComplexity: TxComplexity;

  constructor(def: VariantDefinition) {
    this.checkpointCount = def.checkpointCount;
    this.txCount = def.txCount;
    this.txComplexity = def.txComplexity;
  }

  setWallet(wallet: TestWallet) {
    this.wallet = wallet;
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
    return `checkpointCount: ${this.checkpointCount}, txCount: ${this.txCount}, complexity: ${TxComplexity[this.txComplexity]}`;
  }

  name() {
    return `${this.checkpointCount}_${this.txCount}_${this.txComplexity}`;
  }

  async deployAccounts(accounts: InitialAccountData[]) {
    // Create accounts such that we can send from many to not have colliding nullifiers
    const managers = await Promise.all(
      accounts.map(account => this.wallet.createSchnorrAccount(account.secret, account.salt)),
    );
    await Promise.all(
      managers.map(async m => {
        const deployMethod = await m.getDeployMethod();
        return deployMethod.send({ from: NO_FROM });
      }),
    );
    return accounts.map(acc => acc.address);
  }

  async setup(accounts: InitialAccountData[] = []) {
    if (this.wallet === undefined) {
      throw new Error('Undefined wallet');
    }

    this.accounts = accounts.map(acc => acc.address);

    if (this.txComplexity == TxComplexity.Deployment) {
      return;
    }

    // Mint tokens publicly if needed
    if (this.txComplexity == TxComplexity.PublicTransfer) {
      await Promise.all(
        accounts.map(acc =>
          this.token.methods
            .mint_to_public(acc.address, MINT_AMOUNT)
            .send({ from: acc.address, wait: { timeout: 600 } }),
        ),
      );
    }

    // Mint tokens privately if needed
    if (this.txComplexity == TxComplexity.PrivateTransfer) {
      await Promise.all(accounts.map(acc => mintTokensToPrivate(this.token, acc.address, acc.address, MINT_AMOUNT)));
    }
  }

  async createAndSendTxs() {
    if (!this.wallet) {
      throw new Error('Undefined wallet');
    }

    if (this.txComplexity == TxComplexity.Deployment) {
      const txHashes = [];
      for (let i = 0; i < this.txCount; i++) {
        const deployAccount = this.accounts[i % this.accounts.length];
        const accountManager = await this.wallet.createSchnorrAccount(
          Fr.random(),
          Fr.random(),
          GrumpkinScalar.random(),
        );
        this.contractAddresses.push(accountManager.address);
        const deployMethod = await accountManager.getDeployMethod();
        const { txHash } = await deployMethod.send({
          from: deployAccount,
          skipClassPublication: true,
          skipInstancePublication: true,
          wait: NO_WAIT,
        });
        txHashes.push(txHash);
      }
      return txHashes;
    } else if (this.txComplexity == TxComplexity.PrivateTransfer) {
      // To do a private transfer we need to a lot of accounts that all have funds.
      const txHashes = [];
      for (let i = 0; i < this.txCount; i++) {
        const recipient = this.accounts[(i + 1) % this.txCount];
        const tk = TokenContract.at(this.token.address, this.wallet);
        txHashes.push(
          (await tk.methods.transfer(recipient, 1n).send({ from: this.accounts[i], wait: NO_WAIT })).txHash,
        );
      }
      return txHashes;
    } else if (this.txComplexity == TxComplexity.PublicTransfer) {
      // Public transfer is simpler, we can just transfer to our-selves there.
      const txHashes = [];
      for (let i = 0; i < this.txCount; i++) {
        const sender = this.accounts[i];
        const recipient = this.accounts[(i + 1) % this.txCount];
        const tk = TokenContract.at(this.token.address, this.wallet);
        txHashes.push(
          (await tk.methods.transfer_in_public(sender, recipient, 1n, 0).send({ from: sender, wait: NO_WAIT })).txHash,
        );
      }
      return txHashes;
    } else if (this.txComplexity == TxComplexity.Spam) {
      // This one is slightly more painful. We need to setup a new contract that writes
      // a metric ton of state changes.

      const txHashes = [];
      for (let i = 0; i < this.txCount; i++) {
        const batch = new BatchCall(this.wallet, [
          this.spam.methods.spam(this.seed, 16, false),
          this.spam.methods.spam(this.seed + 16n, 16, false),
          this.spam.methods.spam(this.seed + 32n, 16, false),
          this.spam.methods.spam(this.seed + 48n, 15, true),
        ]);

        this.seed += 100n;
        txHashes.push((await batch.send({ from: this.accounts[0], wait: NO_WAIT })).txHash);
      }
      return txHashes;
    } else {
      throw new Error('Incorrect tx complexity');
    }
  }

  async writeCheckpoints(checkpoints: Checkpoint[]) {
    await this.writeJson(`checkpoints`, { checkpoints: checkpoints.map(cp => bufferToHex(cp.toBuffer())) });
  }

  loadCheckpoints(): Checkpoint[] {
    const json = this.loadJson(`checkpoints`);
    return (json['checkpoints'] as string[]).map(cp => Checkpoint.fromBuffer(hexToBuffer(cp)));
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
  { checkpointCount: 10, txCount: 36, txComplexity: TxComplexity.Deployment },
  { checkpointCount: 10, txCount: 36, txComplexity: TxComplexity.PrivateTransfer },
  { checkpointCount: 10, txCount: 36, txComplexity: TxComplexity.PublicTransfer },
  { checkpointCount: 10, txCount: 9, txComplexity: TxComplexity.Spam },
  { checkpointCount: 1000, txCount: 4, txComplexity: TxComplexity.PrivateTransfer },
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
      if (!RUN_THE_BIG_ONE && variantDef.checkpointCount === 1000) {
        return;
      }

      const variant = new TestVariant(variantDef);

      // The setup is in here and not at the `before` since we are doing different setups depending on what mode we are running in.
      // We require that at least 200 eth blocks have passed from the START_TIME before we see the first L2 block
      // This is to keep the setup more stable, so as long as the setup is less than 100 L1 txs, changing the setup should not break the setup
      const {
        teardown,
        sequencer,
        aztecNode,
        wallet,
        accounts: [defaultAccountAddress],
        initialFundedAccounts,
        cheatCodes,
      } = await setup(1, {
        ...PIPELINING_SETUP_OPTS,
        l1StartTime: START_TIME,
        l2StartTime: START_TIME + 200 * ETHEREUM_SLOT_DURATION,
        numberOfInitialFundedAccounts: variant.txCount + 1,
      });
      variant.setWallet(wallet);

      // Deploy a token, such that we could use it
      const { contract: token } = await TokenContract.deploy(
        wallet,
        defaultAccountAddress,
        'TestToken',
        'TST',
        18n,
      ).send({
        from: defaultAccountAddress,
      });
      const { contract: spam } = await SpamContract.deploy(wallet).send({ from: defaultAccountAddress });

      variant.setToken(token);
      variant.setSpam(spam);

      // Now we create all of our interesting blocks.
      // Alter the block requirements for the sequencer such that we ensure blocks sizes as desired.
      sequencer?.updateConfig({ minTxsPerBlock: variant.txCount, maxTxsPerBlock: variant.txCount });

      // The setup will mint tokens (private and public)
      const accountsToBeDeployed = initialFundedAccounts.slice(1); // The first one has been deployed in setup.
      await variant.setup(accountsToBeDeployed);

      for (let i = 0; i < variant.checkpointCount; i++) {
        const txHashPromises = await variant.createAndSendTxs();
        if (txHashPromises) {
          const txHashes = await Promise.all(txHashPromises);
          await Promise.all(txHashes.map(txHash => waitForTx(aztecNode, txHash, { timeout: 1200 })));
        }
        await cheatCodes.rollup.markAsProven();
      }

      const blockNumber = await aztecNode.getBlockNumber();
      const checkpointResponses = await aztecNode.getCheckpoints(CheckpointNumber(1), blockNumber, {
        includeBlocks: true,
        includeTransactions: true,
      });
      const checkpoints = checkpointResponses.map(
        cr =>
          new Checkpoint(
            cr.archive,
            cr.header,
            cr.blocks!.map(b => new L2Block(b.archive, b.header, b.body!, b.checkpointNumber, b.indexWithinCheckpoint)),
            cr.number,
            cr.feeAssetPriceModifier,
          ),
      );

      await variant.writeCheckpoints(checkpoints);
      await teardown();
    },
    240_400_000,
  );

  const testTheVariant = async (
    variant: TestVariant,
    alternativeSync: (opts: Partial<EndToEndContext>, variant: TestVariant) => Promise<void>,
    provenThrough: CheckpointNumber = CheckpointNumber(Number.MAX_SAFE_INTEGER),
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
      wallet,
      initialFundedAccounts,
      dateProvider,
    } = await setup(0, {
      ...PIPELINING_SETUP_OPTS,
      l1StartTime: START_TIME,
      numberOfInitialFundedAccounts: 10,
    });

    await (aztecNode as any).stop();
    await (sequencer as any).stop();
    await watcher.stop();

    const blobClient = await createBlobClientWithFileStores(config, createLogger('test:blob-client:client'));

    const l1TxUtils = createL1TxUtils(
      deployL1ContractsValues.l1Client,
      { logger, dateProvider, kzg: Blob.getViemKzgInstance() },
      config,
    );
    const rollupAddress = deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString();
    const rollupContract = new RollupContract(deployL1ContractsValues.l1Client, rollupAddress);
    const governanceProposerContract = new GovernanceProposerContract(
      deployL1ContractsValues.l1Client,
      config.governanceProposerAddress.toString(),
    );
    const slashingProposerContract = await rollupContract.getSlashingProposer();
    const epochCache = await EpochCache.create(config.rollupAddress, config, { dateProvider });
    const sequencerPublisherMetrics: MockProxy<SequencerPublisherMetrics> = mock<SequencerPublisherMetrics>();
    const publisher = new SequencerPublisher(
      {
        l1ChainId: 31337,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
      },
      {
        blobClient,
        l1TxUtils,
        rollupContract,
        governanceProposerContract,
        slashingProposerContract,
        epochCache,
        dateProvider,
        metrics: sequencerPublisherMetrics,
        lastActions: {},
      },
    );

    const checkpoints = variant.loadCheckpoints();

    // For each of the checkpoints we progress time such that it land at the correct time
    // We create blocks for every ethereum slot simply to make sure that the test is "closer" to
    // a real world.
    for (const checkpoint of checkpoints) {
      const lastBlock = checkpoint.blocks.at(-1)!;
      const targetTime = Number(lastBlock.header.globalVariables.timestamp) - ETHEREUM_SLOT_DURATION;
      while ((await cheatCodes.eth.lastBlockTimestamp()) < targetTime) {
        await cheatCodes.eth.mine();
      }
      // If it breaks here, first place you should look is the pruning.
      await publisher.enqueueProposeCheckpoint(
        checkpoint,
        CommitteeAttestationsAndSigners.empty({
          chainId: 31337,
          rollupAddress: deployL1ContractsValues.l1ContractAddresses.rollupAddress,
        }),
        Signature.empty(),
      );

      await cheatCodes.rollup.markAsProven(CheckpointNumber(provenThrough));
    }

    await alternativeSync(
      { deployL1ContractsValues, cheatCodes, config, logger, initialFundedAccounts, wallet },
      variant,
    );

    await teardown();
  };

  describe.skip('replay history and then do a fresh sync', () => {
    it.each(variants)(
      'vanilla - %s',
      async (variantDef: VariantDefinition) => {
        // @note  If the `RUN_THE_BIG_ONE` flag is not set, we DO NOT run it.
        if (!RUN_THE_BIG_ONE && variantDef.checkpointCount === 1000) {
          return;
        }

        await testTheVariant(
          new TestVariant(variantDef),
          async (opts: Partial<EndToEndContext>, variant: TestVariant) => {
            // All the blocks have been "re-played" and we are now to simply get a new node up to speed
            const timer = new Timer();
            const freshNode = await AztecNodeService.createAndSync(
              { ...opts.config!, disableValidator: true },
              {},
              { genesis: opts.genesis },
            );
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
    const ASSUME_PROVEN_THROUGH = CheckpointNumber(0);

    it('archiver following catches reorg as it occur and deletes blocks', async () => {
      if (AZTEC_GENERATE_TEST_DATA) {
        return;
      }

      await testTheVariant(
        new TestVariant({ checkpointCount: 10, txCount: 36, txComplexity: TxComplexity.PrivateTransfer }),
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

            const aztecNode = await AztecNodeService.createAndSync(opts.config!, {}, { genesis: opts.genesis });
            const sequencer = aztecNode.getSequencer();

            const { wallet } = await setupPXEAndGetWallet(aztecNode!);
            variant.setWallet(wallet);
            const defaultAccountAddress = (await variant.deployAccounts(opts.initialFundedAccounts!.slice(0, 1)))[0];

            contracts.push(
              (
                await TokenContract.deploy(wallet, defaultAccountAddress, 'TestToken', 'TST', 18n).send({
                  from: defaultAccountAddress,
                })
              ).contract,
            );
            contracts.push(
              (await SchnorrHardcodedAccountContract.deploy(wallet).send({ from: defaultAccountAddress })).contract,
            );
            contracts.push(
              (
                await TokenContract.deploy(wallet, defaultAccountAddress, 'TestToken', 'TST', 18n).send({
                  from: defaultAccountAddress,
                })
              ).contract,
            );

            await watcher.stop();
            await sequencer?.stop();
            await aztecNode.stop();
          }

          const blobClient = await createBlobClientWithFileStores(
            opts.config!,
            createLogger('test:blob-client:client'),
          );
          const nativeWs = await createWorldState(opts.config!, opts.genesis);
          const initialHeader = nativeWs.getInitialHeader();
          const initialBlockHash = await initialHeader.hash();
          const archiver = await createArchiver(
            opts.config!,
            { blobClient, dateProvider: opts.dateProvider! },
            { blockUntilSync: true },
            initialHeader,
            initialBlockHash,
          );
          const pendingCheckpointNumber = CheckpointNumber.fromBigInt(await rollup.read.getPendingCheckpointNumber());

          const worldState = await createWorldStateSynchronizer(opts.config!, archiver, nativeWs);
          await worldState.start();

          // We prune the last token and schnorr contract
          const provenThrough = CheckpointNumber(pendingCheckpointNumber - 2);
          await opts.cheatCodes!.rollup.markAsProven(CheckpointNumber(provenThrough));

          const timeliness = (await rollup.read.getEpochDuration()) * 2n;
          const blockLog = await rollup.read.getCheckpoint([(await rollup.read.getProvenCheckpointNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo), { resetBlockInterval: true });

          expect(await archiver.getCheckpointNumber()).toBeGreaterThan(provenThrough);
          const blockTip = (await archiver.getBlock({ number: await archiver.getBlockNumber() }))!;
          const txHash = blockTip.body.txEffects[0].txHash;

          const contractClassIds = await archiver.getContractClassIds();
          const contractInstances = await Promise.all(
            contracts.map(async c => (await archiver.getContract(c.address))!),
          );
          for (let i = 0; i < contracts.length; i++) {
            expect(contractInstances[i]).not.toBeUndefined();
            expect(contractClassIds.includes(contractInstances[i].currentContractClassId)).toBeTrue;
          }

          expect(await archiver.getTxEffect(txHash)).not.toBeUndefined;
          expect(
            await archiver.getPublicLogs({ fromBlock: blockTip.number, toBlock: blockTip.number + 1 }),
          ).not.toEqual([]);

          await rollup.write.prune();

          // We need to sleep a bit to make sure that we have caught the prune and deleted blocks.
          await sleep(3000);
          expect(await archiver.getCheckpointNumber()).toBe(provenThrough);

          const contractClassIdsAfter = await archiver.getContractClassIds();

          expect(contractClassIdsAfter.includes(contractInstances[0].currentContractClassId)).toBeTrue;
          expect(contractClassIdsAfter.includes(contractInstances[1].currentContractClassId)).toBeFalse;
          expect(await archiver.getContract(contracts[0].address)).not.toBeUndefined;
          expect(await archiver.getContract(contracts[1].address)).toBeUndefined;
          expect(await archiver.getContract(contracts[2].address)).toBeUndefined;

          // Only the hardcoded schnorr is pruned since the contract class also existed before prune.
          expect(contractClassIdsAfter).toEqual(
            contractClassIds.filter(c => !c.equals(contractInstances[1].currentContractClassId)),
          );

          expect(await archiver.getTxEffect(txHash)).toBeUndefined;
          expect(await archiver.getPublicLogs({ fromBlock: blockTip.number, toBlock: blockTip.number + 1 })).toEqual(
            [],
          );

          // Check world state reverted as well
          const latestBlockNumber = await archiver.getBlockNumber();
          expect(await worldState.getLatestBlockNumber()).toEqual(latestBlockNumber);

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
        new TestVariant({ checkpointCount: 10, txCount: 36, txComplexity: TxComplexity.Deployment }),
        async (opts: Partial<EndToEndContext>, variant: TestVariant) => {
          const rollup = getContract({
            address: opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress.toString(),
            abi: RollupAbi,
            client: opts.deployL1ContractsValues!.l1Client,
          });

          const pendingCheckpointNumber = CheckpointNumber.fromBigInt(await rollup.read.getPendingCheckpointNumber());
          const offset = CheckpointNumber(variant.checkpointCount / 2);
          await opts.cheatCodes!.rollup.markAsProven(CheckpointNumber(pendingCheckpointNumber - offset));

          const aztecNode = await AztecNodeService.createAndSync(opts.config!, {}, { genesis: opts.genesis });
          const sequencer = aztecNode.getSequencer();

          const blockBeforePrune = await aztecNode.getBlockNumber();

          const timeliness = (await rollup.read.getEpochDuration()) * 2n;
          const blockLog = await rollup.read.getCheckpoint([(await rollup.read.getProvenCheckpointNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo), { resetBlockInterval: true });

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
          const { wallet } = await setupPXEAndGetWallet(aztecNode!);
          variant.setWallet(wallet);

          const blockBefore = await aztecNode.getBlock(await aztecNode.getBlockNumber());

          sequencer?.updateConfig({ minTxsPerBlock: variant.txCount, maxTxsPerBlock: variant.txCount });
          const txHashes = await variant.createAndSendTxs();
          await Promise.all(txHashes.map(txHash => waitForTx(aztecNode, txHash, { timeout: 1200 })));

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
        new TestVariant({ checkpointCount: 10, txCount: 36, txComplexity: TxComplexity.Deployment }),
        async (opts: Partial<EndToEndContext>, variant: TestVariant) => {
          const rollup = getContract({
            address: opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress.toString(),
            abi: RollupAbi,
            client: opts.deployL1ContractsValues!.l1Client,
          });

          const pendingCheckpointNumber = CheckpointNumber.fromBigInt(await rollup.read.getPendingCheckpointNumber());
          const offset = CheckpointNumber(variant.checkpointCount / 2);
          await opts.cheatCodes!.rollup.markAsProven(CheckpointNumber(pendingCheckpointNumber - offset));

          const timeliness = (await rollup.read.getEpochDuration()) * 2n;
          const blockLog = await rollup.read.getCheckpoint([(await rollup.read.getProvenCheckpointNumber()) + 1n]);
          const timeJumpTo = await rollup.read.getTimestampForSlot([blockLog.slotNumber + timeliness]);

          await opts.cheatCodes!.eth.warp(Number(timeJumpTo), { resetBlockInterval: true });

          await rollup.write.prune();

          const watcher = new AnvilTestWatcher(
            opts.cheatCodes!.eth,
            opts.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
            opts.deployL1ContractsValues!.l1Client,
          );
          await watcher.start();

          // The sync here could likely be avoided by using the node we just synched.
          const aztecNode = await AztecNodeService.createAndSync(opts.config!, {}, { genesis: opts.genesis });
          const sequencer = aztecNode.getSequencer();

          const { wallet: newWallet } = await setupPXEAndGetWallet(aztecNode!);
          variant.setWallet(newWallet);

          const blockBefore = await aztecNode.getBlock(await aztecNode.getBlockNumber());

          sequencer?.updateConfig({ minTxsPerBlock: variant.txCount, maxTxsPerBlock: variant.txCount });
          const txHashes = await variant.createAndSendTxs();
          await Promise.all(txHashes.map(txHash => waitForTx(aztecNode, txHash, { timeout: 1200 })));

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
