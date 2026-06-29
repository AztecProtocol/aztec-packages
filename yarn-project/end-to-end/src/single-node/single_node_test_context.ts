import type { InitialAccountData } from '@aztec/accounts/testing';
import type { Archiver } from '@aztec/archiver';
import { type AztecNodeConfig, AztecNodeService, createAztecNodeService } from '@aztec/aztec-node';
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
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
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { withLoggerBindings } from '@aztec/foundation/log/server';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { executeTimeout } from '@aztec/foundation/timer';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getMockPubSubP2PServiceFactory } from '@aztec/p2p/test-helpers';
import type { ProverNodeConfig } from '@aztec/prover-node';
import type { PXEConfig } from '@aztec/pxe/config';
import { type Sequencer, type SequencerClient, type SequencerEvents, SequencerState } from '@aztec/sequencer-client';
import { type BlockParameter, EthAddress } from '@aztec/stdlib/block';
import {
  type L1RollupConstants,
  getProofSubmissionDeadlineTimestamp,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';
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

export type SingleNodeTestOpts = Partial<SetupOptions> & {
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

/** A `block-proposed` sequencer event captured for the pipelining-offset assertion. */
export type BlockProposedEvent = { blockNumber: BlockNumber; slot: SlotNumber; buildSlot: SlotNumber };

/**
 * The 36s-slot reorg cadence shared by every reorg/prune/HA test, regardless of single-node vs
 * multi-validator topology: a 36s L2 slot, 8s blocks, and a 4-slot epoch. The two concrete reorg
 * profiles ({@link FAST_REORG_TIMING}, {@link MULTI_VALIDATOR_REORG_TIMING}) extend this with their topology's L1
 * slot duration and any extra knobs. Kept timing-only — `maxSpeedUpAttempts`, `cancelTxOnTimeout`, and
 * `aztecProofSubmissionEpochs` encode per-test scenario intent and stay explicit at the call site.
 */
export const REORG_TIMING_BASE = {
  aztecSlotDuration: 36,
  blockDurationMs: 8000,
  aztecEpochDuration: 4,
} as const;

/**
 * Timing-only profile shared by the fast single-node L1-reorg tests (`proving/optimistic`'s reorg
 * cases and `l1-reorgs/`). Extends {@link REORG_TIMING_BASE} with mainnet-style 32-slot anvil epochs
 * and a 4s L1 slot. Note: `ethereumSlotDuration` stays at 4 here (not unified to
 * {@link MULTI_VALIDATOR_REORG_TIMING}'s 6) — at eth=6 the proof-submission-window timing in the
 * proof-removal/proof-restore reorg assertions in `l1-reorgs/blocks` starves and times out, so the 4s
 * L1 slot is required for the single-node reorg path. Tests that need a different epoch length (e.g. 8
 * for the "with replacement" case) override `aztecEpochDuration` after the spread.
 */
export const FAST_REORG_TIMING = {
  ...REORG_TIMING_BASE,
  ethereumSlotDuration: 4,
  anvilSlotsInAnEpoch: 32,
} as const;

/**
 * Timing-only profile naming the 36s/6s reorg-and-prune cadence copied verbatim across the
 * multi-validator recovery and high-availability tests (`recovery/proposal_failure_recovery`,
 * `recovery/equivocation_recovery`, `high-availability/ha_sync`,
 * `high-availability/ha_checkpoint_handoff`). The multi-validator analogue of
 * {@link FAST_REORG_TIMING}, adding the 0.5s attestation-propagation budget those committee tests
 * need. Timing-only: committee size, `aztecProofSubmissionEpochs`, and the slasher block stay
 * per-test. Spread BEFORE per-test overrides so a test can still bump e.g. `aztecEpochDuration`.
 */
export const MULTI_VALIDATOR_REORG_TIMING = {
  ...REORG_TIMING_BASE,
  ethereumSlotDuration: 6,
  attestationPropagationTime: 0.5,
} as const;

/**
 * Timing-only profile naming the 36s/12s multi-validator block-production cadence copied across
 * `block-production/` (`simple`, `high_tps`, `first_slot`, and `proof_boundary`). Uses
 * `aztecSlotDurationInL1Slots: 3` rather than an explicit `aztecSlotDuration: 36` so the L2 slot stays
 * coupled to `ethereumSlotDuration` if a test overrides eth. Deliberately omits
 * `attestationPropagationTime` (per-scenario: default 2, 0.5, or 1) — set it per test. Spread BEFORE
 * per-test overrides.
 */
export const MULTI_VALIDATOR_BLOCK_PRODUCTION_TIMING = {
  ethereumSlotDuration: 12,
  aztecSlotDurationInL1Slots: 3,
  blockDurationMs: 6000,
} as const;

/**
 * Timing-only profile naming the 72s wide-slot multiple-blocks-per-slot cadence copied across the
 * block-production and recovery tests (`block-production/`'s `setupBlockProductionWithProver`, `block-production/blob_promotion`,
 * `recovery/pipeline_prune`). A-914:
 * pipelined multiple-blocks-per-slot needs this 72s/12s cadence (not the tighter 36s/4s), otherwise non-proposer nodes hit
 * `CheckpointNumberNotSequentialError` when the pipelined proposer races ahead of L1 confirmation. The
 * larger `perBlockAllocationMultiplier` lets each of the several blocks per slot fit non-trivial txs.
 * Spread BEFORE per-test overrides (e.g. `mockGossipSubNetworkLatency`, `maxTxsPerCheckpoint`).
 */
export const WIDE_SLOT_TIMING = {
  ethereumSlotDuration: 12,
  aztecSlotDuration: 72,
  blockDurationMs: 5500,
  aztecEpochDuration: 4,
  perBlockAllocationMultiplier: 8,
  aztecTargetCommitteeSize: 3,
} as const;

/**
 * Base class for the prod-sequencer single-node test topology: one node running the production
 * sequencer with fast block times and short epochs, an optional fake-proof prover node, and the
 * environment it runs in (in-proc anvil + L1 deploy). Owns node spawning
 * (`createNonValidatorNode` / `createProverNode` incl. the mock-gossip `p2pServiceFactory` wiring,
 * which is harmless with a single node), the `ChainMonitor`, and the epoch / proof-window / reorg
 * waiters and assertion helpers shared by every test in the category.
 *
 * {@link MultiNodeTestContext} extends this with the N-validator topology (validator-node spawning,
 * committee/proposal/attestation convergence helpers). Single-node-topology tests use this base
 * directly from the sibling `single-node/` category.
 */
export class SingleNodeTestContext {
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

  public static async setup<T extends SingleNodeTestContext>(this: new () => T, opts: SingleNodeTestOpts = {}) {
    const test = new this();
    await test.setup(opts);
    return test;
  }

  public static getSlotDurations(opts: SingleNodeTestOpts = {}) {
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

  public async setup(opts: SingleNodeTestOpts = {}) {
    const { ethereumSlotDuration, aztecSlotDuration, aztecEpochDuration, aztecProofSubmissionEpochs } =
      SingleNodeTestContext.getSlotDurations(opts);

    // Auto-create a hardcoded account funded via genesis when:
    //  - skipInitialSequencer is set (no sequencer to deploy on-chain), or
    //  - useHardcodedAccount is explicitly requested (e.g. tight per-block gas budgets that
    //    can't fit a full account-deploy tx).
    const useHardcodedAccount = (opts.skipInitialSequencer || opts.useHardcodedAccount) && !opts.skipHardcodedAccount;
    let hardcodedAccountData: InitialAccountData | undefined;
    if (useHardcodedAccount) {
      hardcodedAccountData = await SingleNodeTestContext.getHardcodedAccountData(Fr.random(), Fr.random());
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
        // `inboxLag: 2` is the intended value when running with pipelining (the production config
        // default of 1 is a separate bug). Set before `...opts` so tests can still override.
        inboxLag: 2,
        ...opts,
        ...(hardcodedAccountData ? { additionallyFundedAccounts: [hardcodedAccountData], numberOfAccounts: 0 } : {}),
      },
      // Use checkpointed chain tip for PXE by default to avoid issues with blocks being dropped due to pruned anchor blocks.
      // Can be overridden via opts.pxeOpts.
      { syncChainTip: 'checkpointed', ...opts.pxeOpts },
    );

    // Register the hardcoded account in PXE (local only, no on-chain deployment needed).
    if (hardcodedAccountData) {
      this.context = context;
      await this.registerHardcodedAccount(hardcodedAccountData);
    }

    await this.hydrateFromContext(context);
  }

  /**
   * Populates the context-derived state (tracked nodes, L1 client, rollup, epoch cache, chain
   * monitor, delayers, timing constants) from an already-built {@link EndToEndContext}. Split out of
   * {@link setup} so prover-specific subclasses that build the environment with their own bespoke
   * `setup(...)` opts (e.g. `FullProverTest`) can still reuse the base node/teardown machinery
   * without inheriting the base's default node config. Slot/epoch durations are read from the
   * resolved `context.config` so the recorded constants match whatever the environment was deployed
   * with.
   */
  protected async hydrateFromContext(context: EndToEndContext): Promise<void> {
    this.context = context;

    const { ethereumSlotDuration, aztecSlotDuration, aztecEpochDuration } = context.config;

    this.L1_BLOCK_TIME_IN_S = ethereumSlotDuration;
    this.L2_SLOT_DURATION_IN_S = aztecSlotDuration;

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
  public async registerHardcodedAccount(accountData: InitialAccountData): Promise<AztecAddress> {
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

  protected async createNode(
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
      createAztecNodeService(
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

  protected getNextPrivateKey(): Hex {
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

  /**
   * Timestamp one L1 block before L2 `slot` begins — the instant a pipelined proposer starts
   * building for that slot. `opts.lead` overrides the default one-L1-block lead (e.g. when a test
   * needs an extra block-duration margin to guarantee sub-slot 1 is reachable).
   */
  public buildWindowTimestampForSlot(slot: SlotNumber, opts: { lead?: number } = {}): bigint {
    const lead = opts.lead ?? this.L1_BLOCK_TIME_IN_S;
    return getTimestampForSlot(slot, this.constants) - BigInt(lead);
  }

  /**
   * Warps the L1 clock to the build window of `slot` (one L1 block before the slot begins) with
   * `resetBlockInterval`, so a pipelined proposer engages cleanly when its sequencer starts.
   * @returns The slot warped to.
   */
  public async warpToBuildWindowForSlot(slot: SlotNumber): Promise<SlotNumber> {
    const target = this.buildWindowTimestampForSlot(slot);
    this.logger.info(`Warping L1 to build window of slot ${slot}`, { slot, target });
    await this.context.cheatCodes.eth.warp(Number(target), { resetBlockInterval: true });
    return slot;
  }

  /**
   * Waits (in wall-clock, without warping) until the L1 clock reaches the build window of `slot`.
   * For production-sequencer tests that can't warp. `opts.lead` extends the lead beyond the default
   * one L1 block; `opts.timeout` bounds the wait (defaults to three L2 slots).
   * @returns The slot waited for.
   */
  public async waitForBuildWindowForSlot(
    slot: SlotNumber,
    opts: { lead?: number; timeout?: number } = {},
  ): Promise<SlotNumber> {
    const target = this.buildWindowTimestampForSlot(slot, { lead: opts.lead });
    const timeout = opts.timeout ?? this.L2_SLOT_DURATION_IN_S * 3;
    this.logger.info(`Waiting until L1 reaches build window of slot ${slot}`, { slot, target });
    await waitUntilL1Timestamp(this.l1Client, target, undefined, timeout);
    return slot;
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

  /**
   * Waits until every prover node has submitted a proof for `epoch` (of length `epochLength`
   * checkpoints) on L1. Polls `rollup.getHasSubmittedProof` for each prover registered in
   * {@link proverNodes}.
   */
  public async waitForAllProversToSubmit(
    epoch: EpochNumber,
    epochLength: number,
    opts: { timeout?: number } = {},
  ): Promise<void> {
    const proverIds = this.proverNodes.map(node => node.getProverNode()!.getProverId());
    await retryUntil(
      async () => {
        const haveSubmitted = await Promise.all(
          proverIds.map(proverId => this.rollup.getHasSubmittedProof(epoch, epochLength, proverId)),
        );
        this.logger.info(`Proof submissions: ${haveSubmitted.join(', ')}`);
        return haveSubmitted.every(submitted => submitted);
      },
      'Provers have submitted proofs',
      opts.timeout ?? 120,
    );
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

  /**
   * Verifies that at least one checkpoint has `targetBlockCount` blocks and that block numbering is
   * contiguous within every checkpoint (MBPS validation).
   *
   * Two optional wait modes (both poll before reading checkpoints):
   *  - `opts.wait`: waits until some checkpoint reaches `targetBlockCount` blocks (the proposed-tip
   *    MBPS setup case), and
   *  - `opts.targetBlock`: waits until the archiver's checkpointed tip reaches that block number
   *    (the pipeline-prune recovery case).
   *
   * Reads from `opts.archiver` when given (e.g. a specific validator node's block source); otherwise
   * from the initial node's archiver.
   * @returns The number of the first checkpoint with at least `targetBlockCount` blocks.
   */
  public async assertMultipleBlocksPerSlot(
    targetBlockCount: number,
    opts: { wait?: boolean; targetBlock?: BlockNumber; archiver?: Archiver; timeout?: number } = {},
  ): Promise<CheckpointNumber> {
    const archiver = opts.archiver ?? ((this.context.aztecNode as AztecNodeService).getBlockSource() as Archiver);
    const waitTimeout = opts.timeout ?? this.L2_SLOT_DURATION_IN_S * 3;

    if (opts.targetBlock !== undefined) {
      const targetBlock = opts.targetBlock;
      await retryUntil(
        async () => {
          const checkpointed = await archiver.getBlockNumber({ tag: 'checkpointed' });
          return checkpointed !== undefined && checkpointed >= targetBlock;
        },
        `archiver checkpointed block ${targetBlock}`,
        10,
        0.1,
      );
    }

    if (opts.wait) {
      await retryUntil(
        async () => {
          const found = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
          return found.some(pc => pc.checkpoint.blocks.length >= targetBlockCount) || undefined;
        },
        `checkpoint with at least ${targetBlockCount} blocks`,
        waitTimeout,
        0.5,
      );
    }

    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });

    this.logger.warn(`Retrieved ${checkpoints.length} checkpoints from archiver`, {
      checkpoints: checkpoints.map(pc => pc.checkpoint.getStats()),
    });

    let expectedBlockNumber = checkpoints[0].checkpoint.blocks[0].number;
    let multiBlockCheckpointNumber: CheckpointNumber | undefined;

    for (const checkpoint of checkpoints) {
      const blockCount = checkpoint.checkpoint.blocks.length;
      if (blockCount >= targetBlockCount && multiBlockCheckpointNumber === undefined) {
        multiBlockCheckpointNumber = checkpoint.checkpoint.number;
      }

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

    expect(multiBlockCheckpointNumber).toBeDefined();
    return multiBlockCheckpointNumber!;
  }

  /**
   * Asserts pipelining by comparing the build slot (from block-proposed events) against the
   * submission slot (from block headers). With pipelining, the block is built in slot N but its
   * header carries submission slot N+1. Also checks each block's coinbase matches the expected
   * proposer for its submission slot. Reads checkpoints from `archiver` (typically a validator
   * node's block source).
   */
  public async assertProposerPipelining(
    archiver: Archiver,
    blockProposedEvents: BlockProposedEvent[],
    logger: Logger,
  ): Promise<void> {
    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    const allBlocks = checkpoints.flatMap(pc => pc.checkpoint.blocks);

    logger.warn(`assertProposerPipelining: ${allBlocks.length} blocks, ${blockProposedEvents.length} events`, {
      blockNumbers: allBlocks.map(b => b.number),
      eventBlockNumbers: blockProposedEvents.map(e => e.blockNumber),
    });

    let foundPipelining = false;

    for (const block of allBlocks) {
      const headerSlot = block.header.globalVariables.slotNumber; // submission slot (N+1)
      const coinbase = block.header.globalVariables.coinbase;

      // Find the block-proposed event for this block (use Number() for safe comparison)
      const event = blockProposedEvents.find(e => Number(e.blockNumber) === Number(block.number));
      // if there is no event, then it was probably block number one - which was proposed in setup
      if (!event) {
        continue;
      }

      const buildSlot = event.buildSlot; // build slot (N)

      // Verify the pipelining offset: block built in slot N, submitted in slot N+1
      expect(Number(headerSlot)).toBe(Number(buildSlot) + 1);
      foundPipelining = true;

      // Verify coinbase matches the expected proposer for the submission slot
      const expectedProposer = await this.rollup.getProposerAt(getTimestampForSlot(headerSlot, this.constants));
      expect(coinbase).toEqual(expectedProposer);

      logger.warn(`Block ${block.number}: buildSlot=${buildSlot}, submissionSlot=${headerSlot}, coinbase=${coinbase}`, {
        blockNumber: block.number,
        buildSlot,
        headerSlot,
        coinbase: coinbase.toString(),
        expectedProposer: expectedProposer.toString(),
      });
    }

    expect(foundPipelining).toBe(true);
    logger.warn(`Pipelining assertion passed for ${allBlocks.length} blocks`);
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

  /**
   * Resolves with the event args the first time `sequencer` emits `event` with args matching
   * `match`. Rejects after `opts.timeout` ms (default 60s). Wraps the
   * `executeTimeout(signal => new Promise(...))` one-shot subscription boilerplate, cleaning up
   * the listener on both the resolve and the abort paths.
   */
  public waitForSequencerEvent<E extends keyof SequencerEvents>(
    sequencer: Sequencer,
    event: E,
    match: (args: Parameters<SequencerEvents[E]>[0]) => boolean = () => true,
    opts: { timeout?: number } = {},
  ): Promise<Parameters<SequencerEvents[E]>[0]> {
    const timeout = opts.timeout ?? 60_000;
    return executeTimeout(
      signal =>
        new Promise<Parameters<SequencerEvents[E]>[0]>(resolve => {
          const listener = (args: Parameters<SequencerEvents[E]>[0]) => {
            if (match(args)) {
              sequencer.off(event, listener as SequencerEvents[E]);
              resolve(args);
            }
          };
          signal.addEventListener('abort', () => sequencer.off(event, listener as SequencerEvents[E]), { once: true });
          sequencer.on(event, listener as SequencerEvents[E]);
        }),
      timeout,
      `wait for sequencer event ${String(event)}`,
    );
  }

  /** Returns the {@link SequencerClient} of each given node, throwing if any node has no sequencer. */
  public getSequencers(nodes: AztecNodeService[]): SequencerClient[] {
    return nodes.map(node => {
      const sequencer = node.getSequencer();
      if (!sequencer) {
        throw new Error('Node has no sequencer');
      }
      return sequencer;
    });
  }

  /** Starts the sequencer on each given node in parallel. */
  public async startSequencers(nodes: AztecNodeService[]): Promise<void> {
    await Promise.all(this.getSequencers(nodes).map(sequencer => sequencer.start()));
  }

  /**
   * Resolves once `sequencer` is in `state`, returning immediately if it is already there. Use to
   * flush in-flight work (e.g. wait for `IDLE` so pending L1 publishes have been issued) before
   * sampling chain state. Builds on {@link waitForSequencerEvent} for the not-yet-there path.
   */
  public async waitForSequencerState(
    sequencer: Sequencer,
    state: SequencerState,
    opts: { timeout?: number } = {},
  ): Promise<void> {
    if (sequencer.status().state === state) {
      return;
    }
    await this.waitForSequencerEvent(sequencer, 'state-changed', args => args.newState === state, opts);
  }

  public assertNoFailuresFromSequencers(failEvents: TrackedSequencerEvent[]) {
    if (failEvents.length > 0) {
      this.logger.error(`Failed events from sequencers`, failEvents);
    }
    expect(failEvents).toEqual([]);
  }
}
