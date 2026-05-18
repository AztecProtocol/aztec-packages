import type { EthCheatCodes } from '@aztec/ethereum/test';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { retryUntil } from '@aztec/foundation/retry';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { TestDateProvider } from '@aztec/foundation/timer';
import type { P2P } from '@aztec/p2p';
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
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import type { FullNodeCheckpointsBuilder } from '@aztec/validator-client';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import type { SequencerConfig } from './config.js';

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
  p2pClient: P2P;
  ethCheatCodes: EthCheatCodes;
  dateProvider: TestDateProvider;
  l1Constants: AutomineSequencerConstants;
  coinbase: EthAddress;
  feeRecipient: AztecAddress;
  signatureContext: CoordinationSignatureContext;
  config: SequencerConfig & Pick<ChainConfig, 'l1ChainId' | 'rollupAddress'>;
  /** How often to poll the mempool for new txs while running. Defaults to 50ms. */
  pollIntervalMs?: number;
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
  private mempoolPoller?: RunningPromise;
  private publisher?: SequencerPublisher;
  private attestorAddress?: EthAddress;

  /** True while a mempool-driven build is queued but not yet run; used to coalesce. */
  private buildQueued = false;

  /** Last L2 slot we published a checkpoint for (-1 means none yet). */
  private lastBuiltSlot: number = -1;

  constructor(deps: AutomineSequencerDeps) {
    this.deps = deps;
    this.log = deps.log ?? createLogger('sequencer:automine');
    this.queue = new SerialQueue();
    this.pollIntervalMs = deps.pollIntervalMs ?? 50;
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

    const pair = await this.deps.publisherFactory.create();
    this.publisher = pair.publisher;
    this.attestorAddress = pair.attestorAddress;
    this.log.info(`AutomineSequencer started`, {
      publisher: this.publisher.getSenderAddress().toString(),
      attestor: this.attestorAddress.toString(),
    });

    this.queue.start();

    // Fallback poller that triggers a build if we discover pending txs without an explicit
    // notification. Tests can also call `buildIfPending()` directly to skip the poll wait.
    this.mempoolPoller = new RunningPromise(() => this.maybeEnqueueBuild(), this.log, this.pollIntervalMs);
    this.mempoolPoller.start();
  }

  /** Stops the sequencer. Drains the queue, unsubscribes the mempool poller. */
  public async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    await this.mempoolPoller?.stop();
    await this.queue.end();
    this.log.info('AutomineSequencer stopped');
  }

  /**
   * Enqueues a mempool-driven build. Coalesces consecutive calls so a burst of new txs
   * collapses into one build job. Returns the built block (or undefined if nothing was built).
   */
  public buildIfPending(): Promise<L2Block | undefined> {
    if (!this.running) {
      return Promise.resolve(undefined);
    }
    if (this.buildQueued) {
      // A build is already queued; coalesce. The pending build will pick up the new txs.
      return Promise.resolve(undefined);
    }
    this.buildQueued = true;
    return this.queue.put(async () => {
      this.buildQueued = false;
      return this.runBuild({ allowEmpty: false });
    });
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
   * the queue ensures no build is in flight while the warp executes.
   */
  public warpTo(targetTimestampSec: number): Promise<void> {
    return this.queue.put(() => this.runWarp(targetTimestampSec));
  }

  /** Warps L1 timestamp forward by `deltaSec` seconds from the current L1 time. */
  public warpBy(deltaSec: number): Promise<void> {
    return this.queue.put(async () => {
      const current = await this.deps.ethCheatCodes.lastBlockTimestamp();
      await this.runWarp(current + deltaSec);
    });
  }

  /** Awaits the queue draining to a fully idle state. */
  public syncPoint(): Promise<void> {
    return this.queue.syncPoint();
  }

  // ============================================================================
  // Internal
  // ============================================================================

  /** Called from the mempool poller. Enqueues a build if there are pending txs. */
  private async maybeEnqueueBuild(): Promise<void> {
    if (!this.running || this.buildQueued) {
      return;
    }
    try {
      const pending = await this.deps.p2pClient.getPendingTxCount();
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

  /** Builds one checkpoint with a single block, publishes it, syncs the date provider. */
  private async runBuild({ allowEmpty }: { allowEmpty: boolean }): Promise<L2Block | undefined> {
    if (!this.running || !this.publisher || !this.attestorAddress) {
      return undefined;
    }

    const txCount = await this.deps.p2pClient.getPendingTxCount();
    if (txCount === 0 && !allowEmpty) {
      return undefined;
    }

    // Decide target slot and timestamps from anvil's current clock.
    const currentL1TsSec = await this.deps.ethCheatCodes.lastBlockTimestamp();
    const automineBumpedTs = currentL1TsSec + 1;
    let targetSlot = Number(getSlotAtTimestamp(BigInt(automineBumpedTs), this.deps.l1Constants));
    if (targetSlot <= this.lastBuiltSlot) {
      // Anvil's clock hasn't crossed into a new slot; advance to the next slot we own.
      targetSlot = this.lastBuiltSlot + 1;
    }
    const slotBoundaryTs = Number(getTimestampForSlot(SlotNumber(targetSlot), this.deps.l1Constants));

    // Pre-set anvil's next block timestamp only if it would advance the chain forward.
    // `setNextBlockTimestamp` rejects past timestamps, so we guard by current.
    if (slotBoundaryTs > currentL1TsSec) {
      await this.deps.ethCheatCodes.setNextBlockTimestamp(slotBoundaryTs);
    }

    const tips = await this.deps.l2BlockSource.getL2Tips();
    const syncedToBlockNumber = tips.proposed.number;
    const nextBlockNumber = BlockNumber(syncedToBlockNumber + 1);
    const checkpointNumber = CheckpointNumber(tips.proposedCheckpoint.checkpoint.number + 1);
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

    const pendingTxs = this.deps.p2pClient.iterateEligiblePendingTxs();

    const buildResult = await checkpointBuilder.buildBlock(pendingTxs, nextBlockNumber, checkpointGlobals.timestamp, {
      maxTransactions: this.deps.config.maxTxsPerBlock,
      // Allow empty for explicit-empty builds; require at least 1 valid tx otherwise.
      minValidTxs: allowEmpty ? 0 : 1,
      isBuildingProposal: true,
      maxBlocksPerCheckpoint: 1,
      perBlockAllocationMultiplier: 1,
    });

    const checkpoint = await checkpointBuilder.completeCheckpoint();

    // Empty CommitteeAttestationsAndSigners is accepted on-chain when committee size is 0.
    const emptyAttestations = CommitteeAttestationsAndSigners.empty(this.deps.signatureContext);
    const emptyAttestationsSignature = Signature.empty();

    await this.publisher.enqueueProposeCheckpoint(checkpoint, emptyAttestations, emptyAttestationsSignature);
    const result = await this.publisher.sendRequests(SlotNumber(targetSlot));

    const successful = result?.successfulActions?.find(a => a === 'propose');
    if (!successful) {
      this.log.error('Propose action did not succeed under automine', {
        slot: targetSlot,
        checkpointNumber,
        successful: result?.successfulActions,
        failed: result?.failedActions,
      });
      throw new Error(`AutomineSequencer: propose did not succeed for slot ${targetSlot}`);
    }

    // Sync the date provider to the L1 block timestamp we just mined.
    const newL1Ts = await this.deps.ethCheatCodes.lastBlockTimestamp();
    this.deps.dateProvider.setTime(newL1Ts * 1000);

    this.lastBuiltSlot = targetSlot;

    // Wait for the archiver to surface the new checkpoint as its proposed tip. Without this,
    // the next mempool-driven build picks up a stale tip and L1 rejects the propose with
    // Rollup__InvalidArchive (we built our header pointing at the pre-publish lastArchive,
    // but L1's lastArchive has already advanced).
    await retryUntil(
      async () => {
        const tips = await this.deps.l2BlockSource.getL2Tips();
        return tips.proposedCheckpoint.checkpoint.number >= checkpointNumber;
      },
      `archiver sync to checkpoint ${checkpointNumber}`,
      this.deps.l1Constants.slotDuration * 2,
      0.05,
    );

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
   * Warps L1 timestamp to (or past) `targetTimestampSec`, rounded up to the next aztec-slot
   * boundary, syncs the date provider, and advances internal slot bookkeeping.
   */
  private async runWarp(targetTimestampSec: number): Promise<void> {
    const currentL1Ts = await this.deps.ethCheatCodes.lastBlockTimestamp();
    if (targetTimestampSec <= currentL1Ts) {
      this.log.debug(`Warp target ${targetTimestampSec} is not in the future of current L1 ts ${currentL1Ts}`);
      return;
    }

    // Round up to the next aztec-slot boundary so the next build naturally lands on a new slot.
    const targetSlot = Number(getSlotAtTimestamp(BigInt(targetTimestampSec), this.deps.l1Constants));
    const slotBoundaryTs = Number(getTimestampForSlot(SlotNumber(targetSlot + 1), this.deps.l1Constants));

    // `EthCheatCodes.warp` is atomic: setNextBlockTimestamp + doMine + dateProvider.setTime.
    await this.deps.ethCheatCodes.warp(slotBoundaryTs, { resetBlockInterval: false, silent: true });
    this.lastBuiltSlot = targetSlot;

    this.log.verbose(`Warped L1 to slot boundary`, { slot: targetSlot + 1, timestamp: slotBoundaryTs });
  }
}
