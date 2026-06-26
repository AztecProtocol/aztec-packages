import type { Archiver } from '@aztec/archiver';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { type EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { isErrorClass } from '@aztec/foundation/types';
import type { P2PClient as ConcreteP2PClient, P2P } from '@aztec/p2p';
import { settleEpochOutbox } from '@aztec/prover-client/test';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CommitteeAttestationsAndSigners, type L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import { getPreviousCheckpointOutHashes } from '@aztec/stdlib/checkpoint';
import type { ChainConfig } from '@aztec/stdlib/config';
import {
  type L1RollupConstants,
  getEpochAtSlot,
  getSlotAtTimestamp,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';
import { InsufficientValidTxsError, type WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import type { FailedTx, Tx } from '@aztec/stdlib/tx';
import type {
  BuildBlockInCheckpointResult,
  CheckpointBuilder,
  FullNodeCheckpointsBuilder,
} from '@aztec/validator-client';

import type { GlobalVariableBuilder } from '../../global_variable_builder/global_builder.js';
import type { SequencerPublisherFactory } from '../../publisher/sequencer-publisher-factory.js';
import type { SequencerPublisher } from '../../publisher/sequencer-publisher.js';
import type { SequencerConfig } from '../config.js';

/**
 * L1 rollup constants needed by the AutomineSequencer. Same as SequencerRollupConstants
 * plus `epochDuration` for the epoch-based checkpoint out-hash lookup.
 */
export type AutomineSequencerConstants = Pick<
  L1RollupConstants,
  'ethereumSlotDuration' | 'l1GenesisTime' | 'slotDuration' | 'rollupManaLimit' | 'epochDuration'
>;

/** Dependencies for the AutomineSequencer. */
export type AutomineSequencerDeps = {
  publisherFactory: SequencerPublisherFactory;
  checkpointsBuilder: FullNodeCheckpointsBuilder;
  globalsBuilder: GlobalVariableBuilder;
  worldState: WorldStateSynchronizer;
  l2BlockSource: L2BlockSource;
  l1ToL2MessageSource: L1ToL2MessageSource;
  /** P2P client; must also expose `sync()` for post-rollback pool recovery. */
  p2pClient: P2P & Pick<ConcreteP2PClient, 'sync'>;
  ethCheatCodes: EthCheatCodes;
  dateProvider: TestDateProvider;
  l1Constants: AutomineSequencerConstants;
  coinbase: EthAddress;
  feeRecipient: AztecAddress;
  signatureContext: CoordinationSignatureContext;
  config: SequencerConfig & Pick<ChainConfig, 'l1ChainId' | 'rollupAddress'>;
  /**
   * Archiver used to push locally-built blocks and proposed checkpoints into the in-memory
   * store, force an immediate L1 sync after publishing, and roll back state during reorgs.
   */
  archiver: Pick<
    Archiver,
    'rollbackTo' | 'addBlock' | 'addProposedCheckpoint' | 'syncImmediate' | 'removeUncheckpointedBlocksAfter'
  >;
  /** L1 tx utils whose cached nonces must be reset after an L1 reorg. */
  l1TxUtils: Pick<L1TxUtils, 'resetNonce'>[];
  /**
   * Optional extra cleanup hook awaited inside {@link AutomineSequencer.stop}. Used by the
   * factory to shut down the PublisherManager funding loop after the queue and poller drain.
   */
  stopExtras?: () => Promise<void>;
  /** How often to poll the mempool for new txs while running. Defaults to 50ms. */
  pollIntervalMs?: number;
  /**
   * When true, run a loop that synthetically settles epochs (writes outbox roots and advances the
   * proven tip) as checkpoints land, replacing the standalone `EpochTestSettler`. Local-network only;
   * e2e tests leave this off and drive proving explicitly.
   */
  autoSettle?: boolean;
  /** How often the auto-settle / clock-reconcile loop runs while {@link autoSettle} is enabled. Defaults to 200ms. */
  settlePollIntervalMs?: number;
  log?: Logger;
};

/**
 * Minimal, deterministic, queue-driven sequencer for e2e tests that don't exercise
 * block-building or consensus (e.g. e2e_token, e2e_amm, e2e_authwit).
 *
 * Differences from the production `Sequencer`:
 *   - No proposer-turn check (single sequencer).
 *   - No sync check, no pipelining, no validator orchestration, no attestations,
 *     no slashing, no votes, no P2P proposal gossip, no timetable enforcement.
 *   - No event emission — consumers (archiver, world-state, `EpochTestSettler`) observe
 *     L1 and the archiver tip rather than sequencer events.
 *   - All test-driven time control (warp / mine empty block) goes through a single
 *     serial queue alongside mempool-driven builds; the three never interleave.
 *
 * Requires `aztecTargetCommitteeSize == 0` on the deployed rollup so that the
 * L1 `verifyProposer` / `verifyAttestations` short-circuits accept an empty
 * `CommitteeAttestationsAndSigners` (see
 * `l1-contracts/src/core/libraries/rollup/ValidatorSelectionLib.sol:244`).
 */
export class AutomineSequencer {
  private readonly log: Logger;
  private readonly queue: SerialQueue;
  private readonly pollIntervalMs: number;
  private readonly deps: AutomineSequencerDeps;

  private running = false;
  private stopped = false;
  private paused = false;
  private mempoolPoller?: RunningPromise;
  /** Loop that settles epochs and reconciles the clock while {@link AutomineSequencerDeps.autoSettle} is set. */
  private settler?: RunningPromise;
  private publisher?: SequencerPublisher;
  private attestorAddress?: EthAddress;

  /** Set while a mempool-driven build is queued but not yet run; used to coalesce. */
  private buildQueued: Promise<L2Block | undefined> | undefined = undefined;

  /** Last L2 slot we published a checkpoint for (-1 means none yet). */
  private lastBuiltSlot: number = -1;

  /** Lazily-built cheat codes for synthetic epoch settlement (outbox roots + proven tip). */
  private rollupCheatCodes?: RollupCheatCodes;

  constructor(deps: AutomineSequencerDeps) {
    this.deps = deps;
    this.log = deps.log ?? createLogger('sequencer:automine');
    this.queue = new SerialQueue();
    this.pollIntervalMs = deps.pollIntervalMs ?? 50;
  }

  /** Cheat codes for the rollup, built from the same EthCheatCodes the sequencer uses for time control. */
  private getRollupCheatCodes(): RollupCheatCodes {
    this.rollupCheatCodes ??= new RollupCheatCodes(this.deps.ethCheatCodes, {
      rollupAddress: this.deps.config.rollupAddress,
    });
    return this.rollupCheatCodes;
  }

  /**
   * Starts the sequencer. Switches anvil into automine mode (no interval mining),
   * acquires a publisher, and begins polling the mempool for pending txs.
   */
  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    await this.deps.ethCheatCodes.setIntervalMining(0, { silent: true });
    await this.deps.ethCheatCodes.setAutomine(true, { silent: true });

    const { publisher, attestorAddress } = await this.deps.publisherFactory.create();
    this.publisher = publisher;
    this.attestorAddress = attestorAddress;
    this.log.info(`AutomineSequencer started`, {
      publisher: this.publisher.getSenderAddress().toString(),
      attestor: this.attestorAddress.toString(),
    });

    this.queue.start();

    // Fallback poller that triggers a build if we discover pending txs without an explicit
    // notification. Tests can also call `buildIfPending()` directly to skip the poll wait.
    this.mempoolPoller = new RunningPromise(() => this.maybeEnqueueBuild(), this.log, this.pollIntervalMs);
    this.mempoolPoller.start();

    // Local-network only: settle epochs and reconcile the clock to L1 as checkpoints land. Both run
    // through the same serial queue as builds/warps, so they never interleave with a checkpoint build.
    if (this.deps.autoSettle) {
      this.settler = new RunningPromise(() => this.maybeSettle(), this.log, this.deps.settlePollIntervalMs ?? 200);
      this.settler.start();
    }
  }

  /**
   * Stops the sequencer. Drains the queue, unsubscribes the mempool poller, and runs any
   * registered {@link AutomineSequencerDeps.stopExtras} hook (e.g. the PublisherManager's
   * funding loop). Idempotent: subsequent calls return without re-running cleanup.
   */
  public async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.running = false;
    await this.mempoolPoller?.stop();
    await this.settler?.stop();
    await this.queue.end();
    await this.deps.stopExtras?.();
    this.log.info('AutomineSequencer stopped');
  }

  /**
   * Enqueues a mempool-driven build. Coalesces consecutive calls so a burst of new txs
   * collapses into one build job. Returns the built block (or undefined if nothing was built
   * or the sequencer is paused).
   */
  public buildIfPending(): Promise<L2Block | undefined> {
    if (!this.running || this.paused) {
      return Promise.resolve(undefined);
    }
    if (this.buildQueued) {
      // A build is already queued; coalesce. The pending build will pick up the new txs.
      return this.buildQueued;
    }
    this.buildQueued = this.queue.put(async () => {
      try {
        return await this.runBuild({ allowEmpty: false });
      } finally {
        this.buildQueued = undefined;
      }
    });
    return this.buildQueued;
  }

  /**
   * Pauses mempool-driven block production. Pending txs accumulate in the pool without being
   * mined. Explicit test-harness operations (`buildEmptyBlock`, `warpTo`, `revertToCheckpoint`)
   * continue to work; this only gates the mempool poller and `buildIfPending`.
   */
  public pause(): void {
    if (this.paused) {
      return;
    }
    this.paused = true;
    this.log.info('AutomineSequencer paused');
  }

  /** Resumes mempool-driven block production after a previous {@link pause}. */
  public resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.log.info('AutomineSequencer resumed');
  }

  /**
   * Updates the in-memory sequencer config. Mirrors {@link SequencerClient.updateConfig} so that
   * `AztecNode.setConfig` (e.g. tests bumping `minTxsPerBlock` to bundle multiple txs into one
   * block) propagates to the AutomineSequencer's gating logic in {@link runBuild}.
   */
  public updateConfig(config: Partial<SequencerConfig>): void {
    Object.assign(this.deps.config, config);
  }

  /** Returns a snapshot of the current sequencer config (used by pause/resume bookkeeping). */
  public getConfig(): SequencerConfig {
    return this.deps.config;
  }

  /** Enqueues an empty-block build. Resolves to the built block. */
  public buildEmptyBlock(): Promise<L2Block> {
    return this.queue.put(async () => {
      const block = await this.runBuild({ allowEmpty: true });
      if (!block) {
        throw new Error('buildEmptyBlock: runBuild returned undefined');
      }
      return block;
    });
  }

  /**
   * Warps L1 timestamp to `targetTimestampSec`. Rounded up to the next aztec-slot
   * boundary so the next build lands on a fresh slot. Atomic with respect to builds —
   * the queue ensures no build is in flight while the warp executes. A no-op when the
   * target is already at or behind the current L1 time (see {@link runWarp}).
   */
  public warpTo(targetTimestampSec: number): Promise<void> {
    return this.queue.put(() => this.runWarp(targetTimestampSec));
  }

  /**
   * Warps L1 timestamp forward by `deltaSec` seconds from the current L1 time, rounded up to the next
   * aztec-slot boundary. Throws if `deltaSec` is not positive (warping "by" a non-positive amount is a
   * caller bug — unlike {@link warpTo}, which no-ops on a past target).
   */
  public warpBy(deltaSec: number): Promise<void> {
    if (deltaSec <= 0) {
      throw new Error(`warpL2TimeAtLeastBy: duration must be positive, got ${deltaSec} seconds.`);
    }
    return this.queue.put(async () => {
      const current = await this.deps.ethCheatCodes.lastBlockTimestamp();
      await this.runWarp(current + deltaSec);
    });
  }

  /**
   * Reorgs L1 so that every L1 block strictly after the one that published
   * `targetCheckpoint` is removed. The archiver, world-state, and date provider
   * are all brought back in sync before the promise resolves.
   *
   * Runs inside the serial queue so it never interleaves with a build or warp.
   */
  public revertToCheckpoint(targetCheckpoint: number): Promise<void> {
    return this.queue.put(() => this.runRevert(targetCheckpoint));
  }

  /** Awaits the queue draining to a fully idle state. */
  public syncPoint(): Promise<void> {
    return this.queue.syncPoint();
  }

  /**
   * Synthetically "proves" the L2 chain up to `upToCheckpoint` (default: the latest checkpointed
   * checkpoint). For every epoch newly covered — including a partial final epoch — the epoch out hash
   * is written into the L1 Outbox so the L2-to-L1 messages in those checkpoints become consumable,
   * then the rollup's proven tip is advanced to the target. There is no real proof; this is the
   * local-network equivalent of an epoch proof landing on L1.
   *
   * Clamps the target down to the latest checkpointed checkpoint and no-ops when it is already proven.
   * Runs inside the serial queue so it never interleaves with a build or warp.
   *
   * @returns The proven checkpoint after the call (the target, or the existing proven tip on no-op).
   */
  public prove(upToCheckpoint?: CheckpointNumber): Promise<CheckpointNumber> {
    return this.queue.put(() => this.runProve(upToCheckpoint));
  }

  /**
   * Auto-settle tick (local-network only). Proving up to the latest checkpointed checkpoint also
   * reconciles the clock at the head of {@link runProve}, so this single tick keeps both the
   * proven tip and the date provider current even when no build is happening.
   */
  private async maybeSettle(): Promise<void> {
    if (!this.running) {
      return;
    }
    try {
      await this.prove();
    } catch (err) {
      this.log.warn('Automine auto-settle tick failed', { err: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Advances the injected date provider to the latest *mined* L1 timestamp when it has fallen behind
   * (e.g. an unrelated L1 tx mined a block between our builds). Never advances to the pending, un-mined
   * timestamp. Keeps node-side consumers of `dateProvider.now()` aligned with L1 without our own builds.
   */
  private async reconcileDateProvider(): Promise<void> {
    const lastTsMs = (await this.deps.ethCheatCodes.lastBlockTimestamp()) * 1000;
    if (lastTsMs > this.deps.dateProvider.now()) {
      this.deps.dateProvider.setTime(lastTsMs);
    }
  }

  /** Called from the mempool poller. Enqueues a build if there are pending txs. */
  private async maybeEnqueueBuild(): Promise<void> {
    if (!this.running || this.paused || this.buildQueued) {
      return;
    }
    try {
      const pending = await this.deps.p2pClient.getEligiblePendingTxCount();
      if (pending > 0) {
        // Fire-and-forget; the build result is delivered via `buildIfPending()` callers,
        // not via the poller.
        void this.buildIfPending().catch(err => {
          this.log.error('Mempool-driven build failed', err);
        });
      }
    } catch (err) {
      this.log.warn('Failed to poll mempool', { err: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Builds and publishes one checkpoint, returning the built block — or `undefined` when there was
   * nothing to build or the propose failed. A failed propose mines no checkpoint on L1 (it reverts
   * inside the multicall or is never sent), so recovery is purely local: the optimistic archiver insert
   * is rolled back, the block's txs return to the pending pool, and the L1 nonce is reset. No L1 reorg
   * is performed, and the build is not retried inline — once the txs are back in the pending pool the
   * mempool poller re-enqueues a build on its next tick (see {@link maybeEnqueueBuild}).
   */
  private async runBuild({ allowEmpty }: { allowEmpty: boolean }): Promise<L2Block | undefined> {
    if (!this.running || !this.publisher || !this.attestorAddress) {
      return undefined;
    }
    await this.reconcileDateProvider();

    const txCount = await this.deps.p2pClient.getEligiblePendingTxCount();
    // For mempool-driven builds, wait for at least `minTxsPerBlock` pending txs (or 1 if not set)
    // before building. This mirrors the production sequencer's `waitForMinTxs` behavior, and is
    // required for tests that bundle multiple txs into one block via `setConfig({ minTxsPerBlock })`.
    // Explicit empty-block / warp paths pass `allowEmpty: true` and bypass this gate.
    const minRequired = allowEmpty ? 0 : Math.max(this.deps.config.minTxsPerBlock ?? 1, 1);
    if (txCount < minRequired) {
      return undefined;
    }

    // Decide target slot from the pending block's timestamp — picks up any prior
    // `setNextBlockTimestamp` call (e.g. queued by runWarp) instead of assuming +1 over
    // the last mined block.
    const pendingBlockTs = await this.deps.ethCheatCodes.nextBlockTimestamp();
    let targetSlot = Number(getSlotAtTimestamp(BigInt(pendingBlockTs), this.deps.l1Constants));
    if (targetSlot <= this.lastBuiltSlot) {
      // Pending block doesn't reach a new slot yet; advance to the next slot we own.
      targetSlot = this.lastBuiltSlot + 1;
    }
    const slotBoundaryTs = Number(getTimestampForSlot(SlotNumber(targetSlot), this.deps.l1Constants));

    // Pre-set anvil's next block timestamp only if the slot boundary is past what's already
    // scheduled. setNextBlockTimestamp rejects values not strictly greater than the last block's
    // timestamp, and pendingBlockTs is always > lastBlockTimestamp, so this guard is sufficient.
    if (slotBoundaryTs > pendingBlockTs) {
      await this.deps.ethCheatCodes.setNextBlockTimestamp(slotBoundaryTs);
    }

    const [tips, proposedCheckpoint] = await Promise.all([
      this.deps.l2BlockSource.getL2Tips(),
      this.deps.l2BlockSource.getProposedCheckpointData(),
    ]);
    const syncedToBlockNumber = tips.proposed.number;

    // Ensure world state has processed the archiver's tip before forking. Without this,
    // world state may still be at the previous block (since it syncs asynchronously from
    // the archiver), and `fork(syncedToBlockNumber)` would fail with
    // "Unable to initialize from future block".
    await this.deps.worldState.syncImmediate(BlockNumber(syncedToBlockNumber));

    const nextBlockNumber = BlockNumber(syncedToBlockNumber + 1);
    const parentCheckpointNumber = proposedCheckpoint?.checkpointNumber ?? tips.checkpointed.checkpoint.number;
    const checkpointNumber = CheckpointNumber(parentCheckpointNumber + 1);
    const targetEpoch = getEpochAtSlot(SlotNumber(targetSlot), this.deps.l1Constants);

    this.log.verbose(`Building automine checkpoint`, {
      checkpointNumber,
      blockNumber: nextBlockNumber,
      slot: targetSlot,
      slotTimestamp: slotBoundaryTs,
      txCount,
      allowEmpty,
    });

    const checkpointGlobals = await this.deps.globalsBuilder.buildCheckpointGlobalVariables(
      this.deps.coinbase,
      this.deps.feeRecipient,
      SlotNumber(targetSlot),
    );

    const l1ToL2Messages = await this.deps.l1ToL2MessageSource.getL1ToL2Messages(checkpointNumber);

    const previousCheckpointOutHashes = await getPreviousCheckpointOutHashes({
      blockSource: this.deps.l2BlockSource,
      epoch: targetEpoch,
      checkpointNumber,
      l1Constants: this.deps.l1Constants,
      pipeliningEnabled: false,
      log: this.log,
    });

    const feeAssetPriceModifier = await this.publisher.getFeeAssetPriceModifier();

    await using fork = await this.deps.worldState.fork(syncedToBlockNumber, { closeDelayMs: 0 });

    const checkpointBuilder = await this.deps.checkpointsBuilder.startCheckpoint(
      checkpointNumber,
      checkpointGlobals,
      feeAssetPriceModifier,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      fork,
      this.log.getBindings(),
    );

    // Block building only executes txs, and automine publishes straight to L1, so the proofs are never needed.
    const pendingTxs = this.deps.p2pClient.iterateEligiblePendingTxs({ includeProof: false });

    const buildResult = await this.tryBuildBlock(
      checkpointBuilder,
      pendingTxs,
      nextBlockNumber,
      checkpointGlobals.timestamp,
      allowEmpty,
      checkpointNumber,
    );
    if (!buildResult) {
      return undefined;
    }

    const checkpoint = await checkpointBuilder.completeCheckpoint();

    // Empty CommitteeAttestationsAndSigners is accepted on-chain when committee size is 0.
    const emptyAttestations = CommitteeAttestationsAndSigners.empty(this.deps.signatureContext);
    const emptyAttestationsSignature = Signature.empty();

    // Push the block and proposed checkpoint into the archiver locally BEFORE publishing to L1.
    // This avoids racing the archiver's L1 polling: if the L1 publish happened first, polling
    // could surface the checkpoint and reject our subsequent local push as duplicate. Pushing
    // first means the archiver already has the proposed entry when L1 polling fires; the L1
    // sync path then promotes the existing proposed checkpoint via promoteProposedToCheckpointed
    // rather than re-adding it.
    await this.deps.archiver.addBlock(buildResult.block);
    await this.deps.archiver.addProposedCheckpoint({
      header: checkpoint.header,
      checkpointNumber,
      startBlock: BlockNumber(buildResult.block.number),
      blockCount: 1,
      totalManaUsed: checkpoint.header.totalManaUsed.toBigInt(),
      feeAssetPriceModifier,
    });

    await this.publisher.enqueueProposeCheckpoint(checkpoint, emptyAttestations, emptyAttestationsSignature);
    // Automine publishes synchronously in the current slot via `sendRequests`. It must NOT use the
    // production `sendRequestsAt` (or `canProposeAt`), which always apply the one-slot pipelining
    // offset — automine is the deliberate non-pipelined exception and builds/publishes in place.
    const result = await this.publisher.sendRequests(SlotNumber(targetSlot));

    const proposeSucceeded = !!result?.successfulActions?.some(action => action === 'propose');
    if (!proposeSucceeded) {
      this.log.warn('Automine propose did not succeed; rolled back optimistic insert, will rebuild from the poller', {
        slot: targetSlot,
        checkpointNumber,
        successful: result?.successfulActions,
        failed: result?.failedActions,
      });
      await this.rollbackOptimisticInsert(syncedToBlockNumber);
      return undefined;
    }

    // Force one full L1-sync cycle synchronously. The local addBlock/addProposedCheckpoint
    // above advances the proposed tip, but tips.checkpointed and the L1->L2 inbox tree state
    // only advance when the archiver observes the L1-confirmed checkpoint via its sync loop.
    await this.deps.archiver.syncImmediate();

    // Sync the date provider to the L1 block timestamp we just mined.
    const newL1Ts = await this.deps.ethCheatCodes.lastBlockTimestamp();
    this.deps.dateProvider.setTime(newL1Ts * 1000);

    // A successful propose is validated on-chain against the mined L1 block's slot, so the mined slot
    // should equal our target; warn (without rolling back — the checkpoint is on L1) if it ever differs.
    const minedSlot = Number(getSlotAtTimestamp(BigInt(newL1Ts), this.deps.l1Constants));
    if (minedSlot !== targetSlot) {
      this.log.warn(`Automine checkpoint mined in slot ${minedSlot} but targeted ${targetSlot}`, {
        minedSlot,
        targetSlot,
        checkpointNumber,
      });
    }

    this.lastBuiltSlot = targetSlot;

    this.log.verbose(`Automine checkpoint published`, {
      checkpointNumber,
      blockNumber: nextBlockNumber,
      slot: targetSlot,
      l1Timestamp: newL1Ts,
      txCount: buildResult.numTxs,
    });

    return buildResult.block;
  }

  /**
   * Undoes an optimistic archiver insert (uncheckpointed block + proposed checkpoint) without reorging
   * L1: removes the uncheckpointed block and evicts the proposed checkpoint that referenced it, so the
   * proposed tip drops back to `toBlockNumber`. `p2pClient.sync()` then observes the lowered tip and
   * restores the block's txs to the pending pool; `worldState.syncImmediate()` drops any applied effects;
   * and the L1 nonce is reset (a reverted-but-mined propose consumes one) so the build can be retried.
   *
   * Note: `archiver.rollbackTo` is NOT usable here — it is checkpoint-granular and no-ops on a
   * proposed-only tip (the inserted checkpoint is not yet in the checkpointed set).
   */
  private async rollbackOptimisticInsert(toBlockNumber: BlockNumber): Promise<void> {
    await this.deps.archiver.removeUncheckpointedBlocksAfter(toBlockNumber);
    await this.deps.p2pClient.sync();
    await this.deps.worldState.syncImmediate();
    this.deps.l1TxUtils.forEach(utils => utils.resetNonce());
  }

  /**
   * Warps L1 timestamp to (or past) `targetTimestampSec`, rounded up to the next aztec-slot
   * boundary, by queuing an empty-checkpoint build at that slot. Mines exactly one L1 block
   * (the propose tx auto-mined under anvil's automine mode), with the timestamp pre-set so
   * the mined block lands on the slot boundary.
   */
  private async runWarp(targetTimestampSec: number): Promise<void> {
    await this.reconcileDateProvider();
    const currentL1Ts = await this.deps.ethCheatCodes.lastBlockTimestamp();
    if (targetTimestampSec <= currentL1Ts) {
      this.log.debug(`Warp target ${targetTimestampSec} is not in the future of current L1 ts ${currentL1Ts}`);
      return;
    }

    // Round up to the next aztec-slot boundary so the next build naturally lands on a new slot.
    const targetSlot = Number(getSlotAtTimestamp(BigInt(targetTimestampSec), this.deps.l1Constants));
    const slotBoundaryTs = Number(getTimestampForSlot(SlotNumber(targetSlot + 1), this.deps.l1Constants));

    // Queue the next L1 block at the slot boundary timestamp, then build (and publish) an
    // empty L2 checkpoint. The propose tx auto-mines a single L1 block at slotBoundaryTs,
    // and `runBuild` syncs the date provider to the new L1 timestamp.
    await this.deps.ethCheatCodes.setNextBlockTimestamp(slotBoundaryTs);
    await this.runBuild({ allowEmpty: true });

    this.log.verbose(`Warped L1 to slot boundary`, { slot: targetSlot + 1, timestamp: slotBoundaryTs });
  }

  /**
   * Rolls L1 back to the block that published `targetCheckpoint`, drops the archiver's
   * in-memory state to match, and resets internal slot bookkeeping.
   */
  private async runRevert(targetCheckpoint: number): Promise<void> {
    const checkpointData = await this.deps.l2BlockSource.getCheckpointData({
      number: CheckpointNumber(targetCheckpoint),
    });
    if (!checkpointData) {
      throw new Error(`AutomineSequencer: checkpoint ${targetCheckpoint} not found in archiver`);
    }

    const targetL1Block = Number(checkpointData.l1.blockNumber);
    this.log.verbose(`Reverting to checkpoint ${targetCheckpoint}`, {
      targetCheckpoint,
      targetL1Block,
      checkpointSlot: checkpointData.header.slotNumber,
    });

    // Roll the archiver back to the last block of targetCheckpoint before the L1 reorg,
    // since the archiver needs to fetch the target checkpoint's L1 block hash during rollback.
    const lastBlockInCheckpoint = BlockNumber(checkpointData.startBlock + checkpointData.blockCount - 1);
    await this.deps.archiver.rollbackTo(lastBlockInCheckpoint);

    // Force the P2P block stream to run one cycle immediately so it processes the
    // chain-pruned event triggered by the archiver rollback above. Without this, the
    // P2P pool may not have restored rolled-back txs to pending by the time the next
    // build runs.
    await this.deps.p2pClient.sync();

    // Force world-state to process the archiver's prune event immediately, so the next build
    // doesn't try to insert nullifiers that were already in the pruned checkpoints.
    await this.deps.worldState.syncImmediate();

    // Remove all L1 blocks strictly after the target checkpoint's publish block so that
    // the propose txs for later checkpoints are gone from L1. We use reorg(depth) directly
    // to keep targetL1Block itself as the new chain tip.
    const currentL1Block = await this.deps.ethCheatCodes.publicClient.getBlockNumber();
    const depth = Number(currentL1Block) - targetL1Block;
    if (depth > 0) {
      await this.deps.ethCheatCodes.reorg(depth);
    }

    // anvil_rollback re-queues the rolled-back txs into the mempool. Clear them so they
    // don't get re-mined, then reset the publisher nonce tracker so the next propose tx
    // uses the correct nonce for the post-reorg chain state.
    await this.deps.ethCheatCodes.rpcCall('anvil_dropAllTransactions', []);
    this.deps.l1TxUtils.forEach(utils => utils.resetNonce());

    // Reset slot bookkeeping so the next build picks up at the correct slot.
    this.lastBuiltSlot = Number(checkpointData.header.slotNumber);

    this.log.verbose(`Reverted to checkpoint ${targetCheckpoint}`, {
      targetCheckpoint,
      targetL1Block,
    });
  }

  /**
   * Writes outbox roots for every epoch newly covered up to `maybeCheckpoint` and advances the proven
   * tip. Settles each fully-covered epoch in full and the final epoch only up to the target checkpoint
   * (a partial epoch, which the AZIP-14 Outbox supports via per-`numCheckpointsInEpoch` roots).
   */
  private async runProve(upToCheckpoint?: CheckpointNumber): Promise<CheckpointNumber> {
    await this.reconcileDateProvider();
    const rollupCheatCodes = this.getRollupCheatCodes();
    const tips = await this.deps.l2BlockSource.getL2Tips();
    const checkpointedTip = tips.checkpointed.checkpoint.number;

    // Never prove beyond what the archiver has actually checkpointed; default to that tip.
    const target = CheckpointNumber(Math.min(upToCheckpoint ?? checkpointedTip, checkpointedTip));

    const { proven } = await rollupCheatCodes.getTips();
    if (target <= proven) {
      this.log.debug(`Checkpoint ${target} already proven`, { target, proven, checkpointedTip });
      return proven;
    }

    const startEpoch = await this.getEpochOfCheckpoint(CheckpointNumber(proven + 1));
    const endEpoch = await this.getEpochOfCheckpoint(target);
    if (startEpoch === undefined || endEpoch === undefined) {
      this.log.warn(`Cannot resolve epoch range to prove up to checkpoint ${target}`, {
        target,
        proven,
        startEpoch,
        endEpoch,
      });
      return proven;
    }

    for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
      const lastCovered = await settleEpochOutbox({
        rollupCheatCodes,
        l2BlockSource: this.deps.l2BlockSource,
        epoch: EpochNumber(epoch),
        maxCheckpoint: epoch === endEpoch ? target : undefined,
        log: this.log,
      });
      if (lastCovered === undefined) {
        // An epoch in (proven, target] with no checkpointed blocks — expected when warps skip a whole
        // epoch. Logged so it's distinguishable from the archiver failing to serve the epoch's blocks.
        this.log.debug(`No checkpointed blocks to settle for epoch ${epoch} while proving to ${target}`, {
          epoch,
          target,
        });
      }
    }

    await rollupCheatCodes.markAsProven(target);
    // Settlement is a direct L1 storage write that mines no block, unlike a real epoch proof landing
    // on L1. The archiver's L1 sync short-circuits while the L1 block hash is unchanged, so it would
    // never re-read the proven tip until the next build/warp mines a block. Mine one empty L1 block so
    // the block hash advances, then force an immediate sync that observes the new proven checkpoint.
    await this.deps.ethCheatCodes.mineEmptyBlock();
    await this.deps.archiver.syncImmediate();

    this.log.verbose(`Proved up to checkpoint ${target}`, { target, proven, startEpoch, endEpoch });
    return target;
  }

  /** Resolves the epoch a checkpoint belongs to from its slot, or undefined if the archiver lacks it. */
  private async getEpochOfCheckpoint(checkpointNumber: CheckpointNumber): Promise<number | undefined> {
    const checkpointData = await this.deps.l2BlockSource.getCheckpointData({ number: checkpointNumber });
    if (!checkpointData) {
      return undefined;
    }
    const slot = SlotNumber(Number(checkpointData.header.slotNumber));
    return Number(getEpochAtSlot(slot, this.deps.l1Constants));
  }

  /**
   * Wraps `checkpointBuilder.buildBlock` with the failed-tx handling shared by both error
   * and success paths: drops the failed txs from the P2P mempool, and returns `undefined`
   * when `InsufficientValidTxsError` aborts the build (so the caller skips publishing).
   */
  private async tryBuildBlock(
    checkpointBuilder: CheckpointBuilder,
    pendingTxs: AsyncIterableIterator<Tx>,
    nextBlockNumber: BlockNumber,
    timestamp: bigint,
    allowEmpty: boolean,
    checkpointNumber: CheckpointNumber,
  ): Promise<BuildBlockInCheckpointResult | undefined> {
    let buildResult: BuildBlockInCheckpointResult;
    try {
      buildResult = await checkpointBuilder.buildBlock(pendingTxs, nextBlockNumber, timestamp, {
        maxTransactions: this.deps.config.maxTxsPerBlock,
        // Allow empty for explicit-empty builds; require at least 1 valid tx otherwise.
        minValidTxs: allowEmpty ? 0 : 1,
        isBuildingProposal: true,
        maxBlocksPerCheckpoint: 1,
        perBlockAllocationMultiplier: 1,
      });
    } catch (err) {
      // Mirrors production's checkpoint_proposal_job: if every pending tx failed execution and
      // we didn't reach minValidTxs, drop the failed txs from the mempool so they don't block
      // the poller forever, then abort this build with no checkpoint published.
      if (isErrorClass(err, InsufficientValidTxsError)) {
        await this.dropFailedTxsFromP2P(err.failedTxs);
        this.log.verbose(`AutomineSequencer: insufficient valid txs, skipping build`, {
          checkpointNumber,
          processedCount: err.processedCount,
          minRequired: err.minRequired,
          failedCount: err.failedTxs.length,
        });
        return undefined;
      }
      throw err;
    }

    // Drop any txs that failed execution but didn't trigger InsufficientValidTxsError, so we
    // don't re-pick them up on the next build.
    await this.dropFailedTxsFromP2P(buildResult.failedTxs);

    return buildResult;
  }

  /** Removes txs that failed execution from the P2P mempool so they don't get retried. */
  private async dropFailedTxsFromP2P(failedTxs: FailedTx[]): Promise<void> {
    if (failedTxs.length === 0) {
      return;
    }
    const failedTxHashes = failedTxs.map(fail => fail.tx.getTxHash());
    this.log.verbose(`Dropping failed txs ${failedTxHashes.join(', ')}`);
    await this.deps.p2pClient.handleFailedExecution(failedTxHashes);
  }
}
