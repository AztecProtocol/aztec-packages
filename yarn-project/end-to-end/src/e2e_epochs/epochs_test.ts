import type { InitialAccountData } from '@aztec/accounts/testing';
import type { Archiver } from '@aztec/archiver';
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import { getTimestampRangeForEpoch } from '@aztec/aztec.js/block';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { MerkleTreeId } from '@aztec/aztec.js/trees';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { EpochCache } from '@aztec/epoch-cache';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { RollupContract } from '@aztec/ethereum/contracts';
import { Delayer, createDelayer, waitUntilL1Timestamp, wrapClientWithDelayer } from '@aztec/ethereum/l1-tx-utils';
import { ChainMonitor } from '@aztec/ethereum/test';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { withLoggerBindings } from '@aztec/foundation/log/server';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getMockPubSubP2PServiceFactory } from '@aztec/p2p/test-helpers';
import type { ProverNodeConfig } from '@aztec/prover-node';
import type { PXEConfig } from '@aztec/pxe/config';
import { type SequencerClient, type SequencerEvents, SequencerState } from '@aztec/sequencer-client';
import { type BlockParameter, EthAddress } from '@aztec/stdlib/block';
import { type L1RollupConstants, getProofSubmissionDeadlineTimestamp } from '@aztec/stdlib/epoch-helpers';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import type { SlashingProtectionDatabase } from '@aztec/validator-ha-signer/types';

import { join } from 'path';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  SCHNORR_HARDCODED_PRIVATE_KEY,
  SchnorrHardcodedKeyAccountContract,
} from '../fixtures/schnorr_hardcoded_account_contract.js';
import {
  type EndToEndContext,
  type SetupOptions,
  createAndSyncProverNode,
  getPrivateKeyFromIndex,
  setup,
} from '../fixtures/utils.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';

export const WORLD_STATE_CHECKPOINT_HISTORY = 2;
export const WORLD_STATE_BLOCK_CHECK_INTERVAL = 50;
export const ARCHIVER_POLL_INTERVAL = 50;
export const DEFAULT_L1_BLOCK_TIME = process.env.CI ? 12 : 8;

export type EpochsTestOpts = Partial<SetupOptions> & {
  numberOfAccounts?: number;
  pxeOpts?: Partial<PXEConfig>;
  aztecSlotDurationInL1Slots?: number;
  /** Skip creating/registering the hardcoded account during setup (for tests that handle accounts themselves). */
  skipHardcodedAccount?: boolean;
  /**
   * Force the hardcoded-account fast-path even when an initial sequencer is running. Useful for
   * tests with tight per-block gas budgets that can't fit a full account-deploy tx.
   */
  useHardcodedAccount?: boolean;
};

export type TrackedSequencerEvent = {
  [K in keyof SequencerEvents]: Parameters<SequencerEvents[K]>[0] & {
    type: K;
    sequencerIndex: number;
    validator: EthAddress;
  };
}[keyof SequencerEvents];

/**
 * Tests building of epochs using fast block times and short epochs.
 * Spawns an aztec node and a prover node with fake proofs.
 * Sequencer is allowed to build empty blocks.
 */
export class EpochsTestContext {
  public context!: EndToEndContext;
  public l1Client!: ExtendedViemWalletClient;
  public rollup!: RollupContract;
  public constants!: L1RollupConstants;
  public logger!: Logger;
  public monitor!: ChainMonitor;
  public epochCache!: EpochCache;
  public proverDelayer!: Delayer;
  public sequencerDelayer!: Delayer;

  public proverNodes: AztecNodeService[] = [];
  public nodes: AztecNodeService[] = [];

  public epochDuration!: number;

  public L1_BLOCK_TIME_IN_S!: number;
  public L2_SLOT_DURATION_IN_S!: number;

  public static async setup(opts: EpochsTestOpts = {}) {
    const test = new EpochsTestContext();
    await test.setup(opts);
    return test;
  }

  public static getSlotDurations(opts: EpochsTestOpts = {}) {
    const envEthereumSlotDuration = process.env.L1_BLOCK_TIME
      ? parseInt(process.env.L1_BLOCK_TIME)
      : DEFAULT_L1_BLOCK_TIME;
    const ethereumSlotDuration = opts.ethereumSlotDuration ?? envEthereumSlotDuration;
    const aztecSlotDuration = opts.aztecSlotDuration ?? (opts.aztecSlotDurationInL1Slots ?? 2) * ethereumSlotDuration;
    const aztecEpochDuration = opts.aztecEpochDuration ?? 6;
    const aztecProofSubmissionEpochs = opts.aztecProofSubmissionEpochs ?? 1;
    return {
      ethereumSlotDuration,
      aztecSlotDuration,
      aztecEpochDuration,
      aztecProofSubmissionEpochs,
    };
  }

  public async setup(opts: EpochsTestOpts = {}) {
    const { ethereumSlotDuration, aztecSlotDuration, aztecEpochDuration, aztecProofSubmissionEpochs } =
      EpochsTestContext.getSlotDurations(opts);

    this.L1_BLOCK_TIME_IN_S = ethereumSlotDuration;
    this.L2_SLOT_DURATION_IN_S = aztecSlotDuration;

    // Auto-create a hardcoded account funded via genesis when:
    //  - skipInitialSequencer is set (no sequencer to deploy on-chain), or
    //  - useHardcodedAccount is explicitly requested (e.g. tight per-block gas budgets that
    //    can't fit a full account-deploy tx).
    const useHardcodedAccount = (opts.skipInitialSequencer || opts.useHardcodedAccount) && !opts.skipHardcodedAccount;
    let hardcodedAccountData: InitialAccountData | undefined;
    if (useHardcodedAccount) {
      hardcodedAccountData = await EpochsTestContext.getHardcodedAccountData(Fr.random(), Fr.random());
    }

    // Set up system without any account nor protocol contracts
    // and with faster block times and shorter epochs.
    const context = await setup(
      useHardcodedAccount ? 0 : (opts.numberOfAccounts ?? 0),
      {
        automineL1Setup: true,
        checkIntervalMs: 50,
        archiverPollingIntervalMS: ARCHIVER_POLL_INTERVAL,
        worldStateBlockCheckIntervalMS: WORLD_STATE_BLOCK_CHECK_INTERVAL,
        aztecEpochDuration,
        aztecSlotDuration,
        ethereumSlotDuration,
        aztecProofSubmissionEpochs,
        aztecTargetCommitteeSize: opts.initialValidators?.length ?? 0,
        minTxsPerBlock: 0,
        realProofs: false,
        startProverNode: true,
        proverTestDelayMs: opts.proverTestDelayMs ?? 0,
        proverId: EthAddress.fromNumber(1),
        worldStateCheckpointHistory: WORLD_STATE_CHECKPOINT_HISTORY,
        exitDelaySeconds: DefaultL1ContractsConfig.exitDelaySeconds,
        slasherEnabled: false,
        ...opts,
        ...(hardcodedAccountData ? { additionallyFundedAccounts: [hardcodedAccountData], numberOfAccounts: 0 } : {}),
      },
      // Use checkpointed chain tip for PXE by default to avoid issues with blocks being dropped due to pruned anchor blocks.
      // Can be overridden via opts.pxeOpts.
      { syncChainTip: 'checkpointed', ...opts.pxeOpts },
    );

    this.context = context;

    // Register the hardcoded account in PXE (local only, no on-chain deployment needed).
    if (hardcodedAccountData) {
      await this.registerHardcodedAccount(hardcodedAccountData);
    }
    this.proverNodes = context.proverNode ? [context.proverNode] : [];
    this.nodes = context.aztecNode ? [context.aztecNode as AztecNodeService] : [];
    this.logger = context.logger;
    this.l1Client = context.deployL1ContractsValues.l1Client;
    this.rollup = RollupContract.getFromConfig(context.config);
    this.epochCache = await EpochCache.create(this.rollup, context.config, { dateProvider: context.dateProvider });

    // Loop that tracks L1 and L2 block numbers and logs whenever there's a new one.
    this.monitor = new ChainMonitor(this.rollup, context.dateProvider, this.logger).start();

    this.proverDelayer = context.proverDelayer!;
    this.sequencerDelayer = context.sequencerDelayer!;

    if ((context.proverNode && !this.proverDelayer) || (context.sequencer && !this.sequencerDelayer)) {
      throw new Error(`Could not find prover or sequencer delayer`);
    }

    // Constants used for time calculation
    this.epochDuration = aztecEpochDuration;
    this.constants = {
      epochDuration: aztecEpochDuration,
      slotDuration: aztecSlotDuration,
      l1StartBlock: await this.rollup.getL1StartBlock(),
      l1GenesisTime: await this.rollup.getL1GenesisTime(),
      ethereumSlotDuration,
      proofSubmissionEpochs: Number(await this.rollup.getProofSubmissionEpochs()),
      targetCommitteeSize: await this.rollup.getTargetCommitteeSize(),
      rollupManaLimit: Number(await this.rollup.getManaLimit()),
    };

    this.logger.info(
      `L2 genesis at L1 block ${this.constants.l1StartBlock} (timestamp ${this.constants.l1GenesisTime})`,
    );
  }

  public async teardown() {
    await this.monitor.stop();
    await Promise.all(this.proverNodes.map(node => tryStop(node, this.logger)));
    await Promise.all(this.nodes.map(node => tryStop(node, this.logger)));
    await this.context.teardown();
  }

  /**
   * Computes InitialAccountData for a SchnorrHardcodedKeyAccountContract.
   * This contract has a hardcoded signing key and no initializer, so it can be used without
   * on-chain deployment. Pass the returned data in `additionallyFundedAccounts` so the address
   * gets funded with fee juice in genesis.
   */
  public static async getHardcodedAccountData(secret: Fr, salt: Fr): Promise<InitialAccountData> {
    const contract = new SchnorrHardcodedKeyAccountContract();
    const address = await getAccountContractAddress(contract, secret, salt);
    const signingKey = SCHNORR_HARDCODED_PRIVATE_KEY;
    return { secret, salt, signingKey, address };
  }

  /**
   * Registers a SchnorrHardcodedKeyAccountContract in PXE. The account must have been funded
   * at genesis (via getHardcodedAccountData). No on-chain deployment or block mining needed.
   */
  public async registerHardcodedAccount(accountData: InitialAccountData) {
    const contract = new SchnorrHardcodedKeyAccountContract();
    const wallet = this.context.wallet;
    const accountManager = await (wallet as TestWallet).createAccount({
      secret: accountData.secret,
      salt: accountData.salt,
      contract,
    });
    this.context.accounts = [accountManager.address];
    return accountManager.address;
  }

  public async createProverNode(opts: { dontStart?: boolean } & Partial<ProverNodeConfig> = {}) {
    this.logger.warn('Creating and syncing a simulated prover node...');
    const proverNodePrivateKey = this.getNextPrivateKey();
    const proverIndex = this.proverNodes.length + 1;
    const { mockGossipSubNetwork } = this.context;
    const { proverNode } = await withLoggerBindings({ actor: `prover-${proverIndex}` }, () =>
      createAndSyncProverNode(
        proverNodePrivateKey,
        {
          ...this.context.config,
          p2pEnabled: this.context.config.p2pEnabled || mockGossipSubNetwork !== undefined,
          proverId: EthAddress.fromNumber(proverIndex),
          dontStart: opts.dontStart,
          ...opts,
        },
        {
          dataDirectory: join(this.context.config.dataDirectory!, randomBytes(8).toString('hex')),
        },
        {
          dateProvider: this.context.dateProvider,
          p2pClientDeps: {
            p2pServiceFactory: mockGossipSubNetwork ? getMockPubSubP2PServiceFactory(mockGossipSubNetwork) : undefined,
            rpcTxProviders: [this.context.aztecNode],
          },
        },
        {
          genesis: this.context.genesis,
          dontStart: opts.dontStart,
        },
      ),
    );
    this.proverNodes.push(proverNode);
    return proverNode;
  }

  public createNonValidatorNode(opts: Partial<AztecNodeConfig> = {}) {
    this.logger.warn('Creating and syncing a node without a validator...');
    return this.createNode({ ...opts, disableValidator: true });
  }

  public createValidatorNode(
    privateKeys: `0x${string}`[],
    opts: Partial<AztecNodeConfig> & {
      dontStartSequencer?: boolean;
      slashingProtectionDb?: SlashingProtectionDatabase;
    } = {},
  ) {
    this.logger.warn('Creating and syncing a validator node...');
    return this.createNode({ ...opts, disableValidator: false, validatorPrivateKeys: new SecretValue(privateKeys) });
  }

  private async createNode(
    opts: Partial<AztecNodeConfig> & {
      dontStartSequencer?: boolean;
      slashingProtectionDb?: SlashingProtectionDatabase;
    } = {},
  ) {
    const nodeIndex = this.nodes.length + 1;
    const actorPrefix = opts.disableValidator ? 'node' : 'validator';
    const { mockGossipSubNetwork } = this.context;
    const resolvedConfig = { ...this.context.config, ...opts };
    const p2pEnabled = resolvedConfig.p2pEnabled || mockGossipSubNetwork !== undefined;
    const p2pIp = resolvedConfig.p2pIp ?? (p2pEnabled ? '127.0.0.1' : undefined);
    const node = await withLoggerBindings({ actor: `${actorPrefix}-${nodeIndex}` }, () =>
      AztecNodeService.createAndSync(
        {
          ...resolvedConfig,
          dataDirectory: join(this.context.config.dataDirectory!, randomBytes(8).toString('hex')),
          validatorPrivateKeys: opts.validatorPrivateKeys ?? new SecretValue([]),
          nodeId: resolvedConfig.nodeId || `${actorPrefix}-${nodeIndex}`,
          p2pEnabled,
          p2pIp,
        },
        {
          dateProvider: this.context.dateProvider,
          p2pClientDeps: {
            p2pServiceFactory: mockGossipSubNetwork ? getMockPubSubP2PServiceFactory(mockGossipSubNetwork) : undefined,
          },
          slashingProtectionDb: opts.slashingProtectionDb,
        },
        {
          genesis: this.context.genesis,
          ...opts,
        },
      ),
    );

    this.nodes.push(node);
    return node;
  }

  private getNextPrivateKey(): Hex {
    const key = getPrivateKeyFromIndex(this.nodes.length + this.proverNodes.length + 1);
    return `0x${key!.toString('hex')}`;
  }

  /** Waits until the epoch begins (ie until the immediately previous L1 block is mined). */
  public async waitUntilEpochStarts(epoch: number) {
    const [start] = getTimestampRangeForEpoch(EpochNumber(epoch), this.constants);
    this.logger.info(`Waiting until L1 timestamp ${start} is reached as the start of epoch ${epoch}`);
    // Cover at least two full epochs of wall time so callers issuing the wait mid-epoch
    // still have headroom — the prior `30 * epochDuration` mixed units (slots vs seconds)
    // and timed out at 120s for configs whose epoch wall time is 144s+.
    await waitUntilL1Timestamp(
      this.l1Client,
      start - BigInt(this.L1_BLOCK_TIME_IN_S),
      undefined,
      2 * this.epochDuration * this.L2_SLOT_DURATION_IN_S,
    );
    return start;
  }

  /**
   * Waits until the next epoch boundary and returns that epoch's number. Anchors tests
   * on a guaranteed-fresh epoch regardless of how much wall time `beforeEach` consumed —
   * `waitUntilEpochStarts(1)` returns immediately when the chain has already advanced past
   * slot 4, which under CI load can leave only seconds of the target epoch remaining.
   *
   * If the chain has more than two slots of headroom before the target boundary, warps
   * the L1 clock to within two slots of the boundary instead of waiting in wall-clock.
   * The two-slot tail is intentional — it lets the sequencer/builder settle so the first
   * checkpoint of the target epoch lands correctly.
   */
  public async waitUntilNextEpochStarts(): Promise<EpochNumber> {
    const { epoch } = this.epochCache.getEpochAndSlotNow();
    const target = EpochNumber(Number(epoch) + 1);
    const [targetTs] = getTimestampRangeForEpoch(target, this.constants);
    const safeTs = targetTs - BigInt(2 * this.L2_SLOT_DURATION_IN_S);
    const currentTs = BigInt(await this.context.cheatCodes.eth.lastBlockTimestamp());
    if (currentTs < safeTs) {
      this.logger.info(`Warping L1 from ${currentTs} to ${safeTs} (2 slots before epoch ${target})`);
      await this.context.cheatCodes.eth.warp(Number(safeTs), { resetBlockInterval: true });
    }
    await this.waitUntilEpochStarts(Number(target));
    return target;
  }

  /** Waits until the given checkpoint number is mined. */
  public async waitUntilCheckpointNumber(target: CheckpointNumber, timeout = 120) {
    await retryUntil(
      () => Promise.resolve(target <= this.monitor.checkpointNumber),
      `Wait until checkpoint ${target}`,
      timeout,
      0.1,
    );
  }

  /** Waits until the given checkpoint number is marked as proven. */
  public async waitUntilProvenCheckpointNumber(target: CheckpointNumber, timeout = 120) {
    await retryUntil(
      () => Promise.resolve(target <= this.monitor.provenCheckpointNumber),
      `Wait proven checkpoint ${target}`,
      timeout,
      0.1,
    );
    return this.monitor.provenCheckpointNumber;
  }

  /** Waits until the last slot of the proof submission window for a given epoch. */
  public async waitUntilLastSlotOfProofSubmissionWindow(epochNumber: number | bigint) {
    const deadline = getProofSubmissionDeadlineTimestamp(EpochNumber.fromBigInt(BigInt(epochNumber)), this.constants);
    const oneSlotBefore = deadline - BigInt(this.constants.slotDuration);
    const date = new Date(Number(oneSlotBefore) * 1000);
    this.logger.info(`Waiting until last slot of submission window for epoch ${epochNumber} at ${date}`, {
      oneSlotBefore,
    });
    // Use a timeout that accounts for the full proof submission window
    const proofSubmissionWindowDuration =
      this.constants.proofSubmissionEpochs * this.epochDuration * this.L2_SLOT_DURATION_IN_S;
    await waitUntilL1Timestamp(this.l1Client, oneSlotBefore, undefined, proofSubmissionWindowDuration * 2);
  }

  /** Waits for the aztec node to sync to the target block number. */
  public async waitForNodeToSync(blockNumber: BlockNumber, type: 'proven' | 'finalized' | 'historic') {
    const waitTime = ARCHIVER_POLL_INTERVAL + WORLD_STATE_BLOCK_CHECK_INTERVAL;
    let synched = false;
    while (!synched) {
      await sleep(waitTime);
      const [syncState, tips] = await Promise.all([
        this.context.aztecNode.getWorldStateSyncStatus(),
        await this.context.aztecNode.getChainTips(),
      ]);
      this.logger.info(`Wait for node synch ${blockNumber} ${type}`, { blockNumber, type, syncState, tips });
      if (type === 'proven') {
        synched = tips.proven.block.number >= blockNumber && syncState.latestBlockNumber >= blockNumber;
      } else if (type === 'finalized') {
        synched = syncState.finalizedBlockNumber >= blockNumber;
      } else {
        synched = syncState.oldestHistoricBlockNumber >= blockNumber;
      }
    }
  }

  /** Registers the SpamContract on the given wallet. */
  public async registerSpamContract(wallet: Wallet, salt = Fr.ZERO) {
    const instance = await getContractInstanceFromInstantiationParams(SpamContract.artifact, {
      constructorArgs: [],
      constructorArtifact: undefined,
      salt,
      publicKeys: undefined,
      deployer: undefined,
    });
    await wallet.registerContract(instance, SpamContract.artifact);
    return SpamContract.at(instance.address, wallet);
  }

  /** Registers the TestContract on the given wallet. */
  public async registerTestContract(wallet: Wallet, salt = Fr.ZERO) {
    const instance = await getContractInstanceFromInstantiationParams(TestContract.artifact, {
      constructorArgs: [],
      constructorArtifact: undefined,
      salt,
      publicKeys: undefined,
      deployer: undefined,
    });
    await wallet.registerContract(instance, TestContract.artifact);
    return TestContract.at(instance.address, wallet);
  }

  /** Creates an L1 client using a fresh account with funds from anvil, with a tx delayer already set up. */
  public async createL1Client() {
    const rawClient = createExtendedL1Client(
      [...this.l1Client.chain.rpcUrls.default.http],
      privateKeyToAccount(this.getNextPrivateKey()),
      this.l1Client.chain,
    );
    const delayer = createDelayer(this.context.dateProvider, { ethereumSlotDuration: this.L1_BLOCK_TIME_IN_S }, {});
    const client = wrapClientWithDelayer(rawClient, delayer);
    expect(await client.getBalance({ address: client.account.address })).toBeGreaterThan(0n);
    return { client, delayer };
  }

  /** Verifies whether the given block number is found on the aztec node. */
  public async verifyHistoricBlock(blockNumber: BlockParameter, expectedSuccess: boolean) {
    // We use `findLeavesIndexes` here, but could use any function that queries the world-state
    // at a particular block, so we know whether that historic block is available or has been
    // pruned. Note that `getBlock` would not work here, since it only hits the archiver.
    const result = await this.context.aztecNode
      .findLeavesIndexes(blockNumber, MerkleTreeId.NULLIFIER_TREE, [Fr.ZERO])
      .then(_ => true)
      .catch(_ => false);
    expect(result).toBe(expectedSuccess);
  }

  /** Verifies at least one checkpoint has the target number of blocks (for MBPS validation). */
  public async assertMultipleBlocksPerSlot(targetBlockCount: number) {
    const archiver = (this.context.aztecNode as AztecNodeService).getBlockSource() as Archiver;
    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });

    this.logger.warn(`Retrieved ${checkpoints.length} checkpoints from archiver`, {
      checkpoints: checkpoints.map(pc => pc.checkpoint.getStats()),
    });

    let expectedBlockNumber = checkpoints[0].checkpoint.blocks[0].number;
    let targetFound = false;

    for (const checkpoint of checkpoints) {
      const blockCount = checkpoint.checkpoint.blocks.length;
      targetFound = targetFound || blockCount >= targetBlockCount;

      this.logger.verbose(`Checkpoint ${checkpoint.checkpoint.number} has ${blockCount} blocks`, {
        checkpoint: checkpoint.checkpoint.getStats(),
      });

      for (let i = 0; i < blockCount; i++) {
        const block = checkpoint.checkpoint.blocks[i];
        expect(block.indexWithinCheckpoint).toBe(i);
        expect(block.checkpointNumber).toBe(checkpoint.checkpoint.number);
        expect(block.number).toBe(expectedBlockNumber);
        expectedBlockNumber++;
      }
    }

    expect(targetFound).toBe(true);
  }

  public watchSequencerEvents(
    sequencers: SequencerClient[],
    getMetadata: (i: number) => Record<string, any> = () => ({}),
    additionalFailEventKeys: (keyof SequencerEvents)[] = [],
  ) {
    const stateChanges: TrackedSequencerEvent[] = [];
    const failEvents: TrackedSequencerEvent[] = [];

    // Note we do not include the 'block-tx-count-check-failed' event here, since it is fine if we dont build
    // due to lack of txs available.
    const failEventsKeys: (keyof SequencerEvents)[] = [
      'block-build-failed',
      'checkpoint-publish-failed',
      'proposer-rollup-check-failed',
      'checkpoint-error',
      'checkpoint-publish-failed',
      'header-validation-failed',
      'pipelined-checkpoint-discarded',
      ...additionalFailEventKeys,
    ];

    const makeEvent = (
      i: number,
      eventName: keyof SequencerEvents,
      args: Parameters<SequencerEvents[keyof SequencerEvents]>[0],
    ) =>
      ({
        ...args,
        type: eventName,
        sequencerIndex: i + 2,
        ...getMetadata(i),
      }) as TrackedSequencerEvent;

    sequencers.forEach((sequencer, i) => {
      const sequencerIndex = i + 2;
      sequencer.getSequencer().on('state-changed', (args: Parameters<SequencerEvents['state-changed']>[0]) => {
        const noisyStates = [SequencerState.IDLE, SequencerState.PROPOSER_CHECK, SequencerState.SYNCHRONIZING];
        if (!noisyStates.includes(args.newState)) {
          const evt = makeEvent(i, 'state-changed', args);
          stateChanges.push(evt);
          this.logger.verbose(
            `Sequencer ${sequencerIndex} transitioned from state ${args.oldState} to state ${args.newState}`,
            evt,
          );
        }
      });
      failEventsKeys.forEach(eventName => {
        sequencer.getSequencer().on(eventName, (args: Parameters<SequencerEvents[typeof eventName]>[0]) => {
          // Skip benign block-build-failed events where the builder rejected the block because it
          // could not collect enough valid txs. This is the same "not enough txs" case as
          // block-tx-count-check-failed (which is already excluded above), just detected after we
          // started processing txs rather than before.
          if (eventName === 'block-build-failed' && (args as { reason?: string }).reason === 'Insufficient valid txs') {
            return;
          }
          const evt = makeEvent(i, eventName, args);
          failEvents.push(evt);
          this.logger.error(`Failed event ${eventName} from sequencer ${sequencerIndex}`, undefined, evt);
        });
      });
    });

    return { failEvents, stateChanges };
  }

  public assertNoFailuresFromSequencers(failEvents: TrackedSequencerEvent[]) {
    if (failEvents.length > 0) {
      this.logger.error(`Failed events from sequencers`, failEvents);
    }
    expect(failEvents).toEqual([]);
  }
}
