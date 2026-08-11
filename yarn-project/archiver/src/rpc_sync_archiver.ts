import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { BlockNumber, CheckpointNumber, EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { DateProvider } from '@aztec/foundation/timer';
import {
  type ArchiverEmitter,
  type BlockHash,
  type L2Block,
  type L2BlockSource,
  L2BlockSourceEvents,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
  type L2BlockStreamSource,
  type L2Tips,
  l2TipsEqual,
  localTipsMatch,
} from '@aztec/stdlib/block';
import { type L1RollupConstants, getEpochAtSlot, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import { MAX_RPC_BLOCKS_LEN } from '@aztec/stdlib/interfaces/api-limit';
import type { L1ToL2MessageSource, L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import type { BlockHeader, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, type Traceable, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { L1ToL2MessagesNotReadyError, isL1ToL2MessagesNotReadyError } from './errors.js';
import { ArchiverDataSourceBase } from './modules/data_source_base.js';
import { ArchiverDataStoreUpdater } from './modules/data_store_updater.js';
import { type ArchiverDataStores, backupArchiverDataStores } from './store/data_stores.js';
import type { L2TipsCache } from './store/l2_tips_cache.js';

/**
 * Number of checkpoints fetched per upstream request when catching up the checkpointed tier. Kept well below the
 * RPC ceiling because a `PublishedCheckpoint` carries every block body it contains.
 */
const CHECKPOINT_FETCH_BATCH_SIZE = 10;

/**
 * Read surface the {@link RpcSyncArchiver} needs from its upstream node. Deliberately expressed in
 * `L2BlockSource` terms rather than `AztecNode` terms: it is exactly what an `ArchiverApi` RPC client (or an
 * in-process `Archiver`) exposes, so the block stream can be pointed at it with no adaptation and the returned
 * payloads are the domain objects (`L2Block`, `PublishedCheckpoint`) the store updater consumes.
 */
export type RpcSyncArchiverSource = L2BlockStreamSource &
  Pick<L2BlockSource, 'getCheckpoints' | 'getProposedCheckpointData' | 'getL2ToL1MembershipWitness'> &
  Pick<L1ToL2MessageSource, 'getL1ToL2Messages'>;

/** L1 contract addresses the follower reports without ever reading L1 itself. */
export type RpcSyncArchiverL1Addresses = Pick<
  L1ContractAddresses,
  'rollupAddress' | 'registryAddress' | 'inboxAddress' | 'governanceProposerAddress'
> & {
  slashingProposerAddress: EthAddress;
};

/** Tuning of the follower's replication loop. */
export type RpcSyncArchiverConfig = {
  /** How often the follower polls its upstream for new chain state. */
  pollingIntervalMs: number;
  /** Blocks requested per upstream `getBlocks` call. Capped at {@link MAX_RPC_BLOCKS_LEN} by the constructor. */
  batchSize: number;
};

/**
 * Replication health of a {@link RpcSyncArchiver}, for readiness probes and operator dashboards.
 * `lastUpstreamContactAt` separates "upstream unreachable" (no recent contact) from "upstream reachable but
 * stale" (recent contact, `caughtUp` true, but `upstreamTips` not advancing).
 */
export type RpcSyncArchiverHealth = {
  /** Whether the follower has caught up with the upstream at least once since it started. */
  initialSyncComplete: boolean;
  /** Whether local tips matched the upstream tips at the end of the last sync cycle. */
  caughtUp: boolean;
  /** Epoch-ms timestamp of the last sync cycle that completed without errors, if any. */
  lastSuccessfulSyncAt: number | undefined;
  /** Epoch-ms timestamp of the last successful read from the upstream, if any. */
  lastUpstreamContactAt: number | undefined;
  /** Number of consecutive sync cycles that did not complete cleanly. */
  consecutiveFailures: number;
  /** Message of the error that broke the last sync cycle, if it broke. */
  lastError: string | undefined;
  /** Upstream tips as of the last cycle that read them. */
  upstreamTips: L2Tips | undefined;
};

/**
 * A read-only archiver that replicates its local store from an upstream node (a "follower"), driving an
 * {@link L2BlockStream} over an {@link RpcSyncArchiverSource} instead of running an L1 synchronizer. It never
 * talks to L1 and does not implement `L2BlockSink`: every block, checkpoint and L1-to-L2 message it holds was
 * pulled from the upstream, which it trusts.
 *
 * Messages are persisted locally (rather than proxied per query) so `getL1ToL2MessageIndex` works and so
 * world-state advancement does not depend on upstream liveness.
 */
export class RpcSyncArchiver extends ArchiverDataSourceBase implements L2BlockStreamEventHandler, Traceable {
  public readonly events: ArchiverEmitter;

  public readonly tracer: Tracer;

  /** Drives the replication passes; the block stream itself is only ever triggered from here. */
  private readonly runningPromise: RunningPromise;
  private readonly blockStream: L2BlockStream;
  private readonly updater: ArchiverDataStoreUpdater;

  private initialSyncComplete = false;
  private readonly initialSyncPromise: PromiseWithResolvers<void>;

  /** Health counters, all maintained by {@link syncCycle}. */
  private caughtUp = false;
  private lastSuccessfulSyncAt: number | undefined;
  private lastUpstreamContactAt: number | undefined;
  private consecutiveFailures = 0;
  private lastError: string | undefined;
  private upstreamTips: L2Tips | undefined;

  /** Blocks delivered during the in-flight sync cycle, reported by the aggregate update event. */
  private blocksAddedThisCycle: L2Block[] = [];

  constructor(
    private readonly source: RpcSyncArchiverSource,
    stores: ArchiverDataStores,
    private readonly l1Addresses: RpcSyncArchiverL1Addresses,
    protected override readonly l1Constants: L1RollupConstants & { genesisArchiveRoot: Fr },
    config: RpcSyncArchiverConfig,
    events: ArchiverEmitter,
    initialHeader: BlockHeader,
    initialBlockHash: BlockHash,
    private readonly l2TipsCache: L2TipsCache,
    private readonly dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    private readonly log: Logger = createLogger('archiver:rpc-sync'),
  ) {
    super(stores, l1Constants, initialHeader, initialBlockHash, l1Constants.genesisArchiveRoot);

    this.events = events;
    this.tracer = telemetry.getTracer('RpcSyncArchiver');
    this.initialSyncPromise = promiseWithResolvers();
    this.updater = new ArchiverDataStoreUpdater(stores, l2TipsCache, {
      rollupManaLimit: l1Constants.rollupManaLimit,
    });

    const localData: L2BlockStreamLocalDataProvider = {
      getL2Tips: () => this.l2TipsCache.getL2Tips(),
      getL2BlockHash: async (number: number) => {
        if (number === 0) {
          return this.initialBlockHash.toString();
        }
        const data = await this.stores.blocks.getBlockData({ number: BlockNumber(number) });
        return data?.blockHash.toString();
      },
    };

    this.blockStream = new L2BlockStream(
      this.trackedSource(),
      localData,
      this,
      createLogger('archiver:rpc-sync:stream'),
      // The RPC schema rejects `getBlocks` limits above MAX_RPC_BLOCKS_LEN, so the follower can never ask for
      // more than that regardless of what the caller configured.
      { batchSize: Math.min(config.batchSize, MAX_RPC_BLOCKS_LEN) },
    );

    this.runningPromise = new RunningPromise(() => this.syncCycle(), this.log, config.pollingIntervalMs);
  }

  /**
   * Starts the replication loop.
   * @param blockUntilSynced - If true, resolves only once the follower has caught up with the upstream once.
   */
  public async start(blockUntilSynced: boolean): Promise<void> {
    if (this.runningPromise.isRunning()) {
      throw new Error('RpcSyncArchiver is already running');
    }

    const tips = await this.getL2Tips();
    this.log.info(`Starting RPC-sync archiver from checkpoint ${tips.checkpointed.checkpoint.number}`, { tips });
    this.runningPromise.start();

    if (blockUntilSynced) {
      await this.waitForInitialSync();
    }
  }

  /**
   * Stops the replication loop. The data stores are owned by whoever opened them (the factory), so they are
   * deliberately left open here.
   */
  public async stop(): Promise<void> {
    this.log.debug('Stopping RPC-sync archiver');
    await this.runningPromise.stop();
    await this.blockStream.stop();
    this.log.info('Stopped RPC-sync archiver');
  }

  /** Runs one replication cycle immediately. Never rejects: failures are reported via {@link getHealth}. */
  public syncImmediate(): Promise<void> {
    return this.runningPromise.trigger();
  }

  /** Returns whether the follower has caught up with the upstream at least once. */
  public isInitialSyncComplete(): boolean {
    return this.initialSyncComplete;
  }

  /** Resolves once the follower has caught up with the upstream at least once. */
  public waitForInitialSync(): Promise<void> {
    return this.initialSyncPromise.promise;
  }

  /** Returns the replication health, for readiness probes and operator dashboards. */
  public getHealth(): RpcSyncArchiverHealth {
    return {
      initialSyncComplete: this.initialSyncComplete,
      caughtUp: this.caughtUp,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
      lastUpstreamContactAt: this.lastUpstreamContactAt,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
      upstreamTips: this.upstreamTips,
    };
  }

  /** The substores this archiver reads and writes. Exposed so whoever opened them can close them on teardown. */
  public get dataStores(): ArchiverDataStores {
    return this.stores;
  }

  public backupTo(destPath: string): Promise<string> {
    return backupArchiverDataStores(this.stores, destPath);
  }

  /**
   * Runs a single replication pass and folds its outcome into the health counters. The block stream swallows
   * everything that goes wrong inside a pass, so the outcome is read back from it rather than inferred from
   * `sync()` resolving. Catching-up is evaluated once per cycle (not per event) so a warm store on an idle
   * chain — which produces no events at all — still resolves {@link waitForInitialSync}.
   */
  private async syncCycle(): Promise<void> {
    const fromTips = await this.getL2Tips();
    this.blocksAddedThisCycle = [];

    await this.blockStream.sync();

    const outcome = this.blockStream.getLastPassOutcome();
    if (outcome?.status !== 'completed') {
      this.caughtUp = false;
      this.consecutiveFailures++;
      this.lastError =
        outcome?.status === 'failed'
          ? outcome.error instanceof Error
            ? outcome.error.message
            : String(outcome.error)
          : 'Sync pass aborted';
      this.log.warn(`RPC sync cycle did not complete: ${this.lastError}`, {
        status: outcome?.status,
        consecutiveFailures: this.consecutiveFailures,
      });
    } else {
      this.consecutiveFailures = 0;
      this.lastError = undefined;
      this.lastSuccessfulSyncAt = this.dateProvider.now();
      const localTips = await this.getL2Tips();
      this.caughtUp = this.upstreamTips !== undefined && localTipsMatch(localTips, this.upstreamTips);
      if (this.caughtUp && !this.initialSyncComplete) {
        this.log.info(`Initial RPC sync complete at block ${localTips.proposed.number}`, { tips: localTips });
        this.initialSyncComplete = true;
        this.initialSyncPromise.resolve();
      }
    }

    await this.emitSourceUpdated(fromTips);
  }

  /** Emits the aggregate update event so downstream streams reconcile without waiting for their next poll. */
  private async emitSourceUpdated(fromTips: L2Tips): Promise<void> {
    const toTips = await this.getL2Tips();
    const blocksAdded = this.blocksAddedThisCycle;
    this.blocksAddedThisCycle = [];
    if (l2TipsEqual(fromTips, toTips) && blocksAdded.length === 0) {
      return;
    }
    this.events.emit(L2BlockSourceEvents.L2BlockSourceUpdated, {
      type: L2BlockSourceEvents.L2BlockSourceUpdated,
      fromTips,
      toTips,
      blocksAdded,
    });
  }

  /**
   * Wraps the upstream reads so a failed call is attributable to the upstream (rather than to local work) and
   * so the tips snapshot the pass planned against is available to the catch-up check.
   */
  private trackedSource(): L2BlockStreamSource {
    return {
      getL2Tips: () =>
        this.callUpstream(() => this.source.getL2Tips()).then(tips => {
          this.upstreamTips = tips;
          return tips;
        }),
      getBlocks: query => this.callUpstream(() => this.source.getBlocks(query)),
      getBlockData: query => this.callUpstream(() => this.source.getBlockData(query)),
    };
  }

  /** Records upstream reachability around a single upstream read. */
  private async callUpstream<T>(fn: () => Promise<T>): Promise<T> {
    const result = await fn();
    this.lastUpstreamContactAt = this.dateProvider.now();
    return result;
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added':
        await this.handleBlocksAdded(event);
        break;
      case 'chain-checkpointed':
        await this.handleChainCheckpointed(event);
        break;
      case 'chain-pruned':
        await this.handleChainPruned(event);
        break;
      case 'chain-proven':
        await this.handleChainProven(event);
        break;
      case 'chain-finalized':
        await this.handleChainFinalized(event);
        break;
      case 'chain-proposed':
        // Nothing to do: the proposed tip is implied by the blocks delivered above, and the proposed-checkpoint
        // records the store needs are copied from the upstream as those blocks are ingested.
        break;
      default: {
        const _: never = event;
        break;
      }
    }
  }

  /**
   * Ingests a batch of blocks delivered by the stream. Blocks already checkpointed upstream are inserted
   * through their enclosing checkpoint rather than as proposed blocks: the store requires a block's checkpoint
   * to follow the last stored one, which a proposed-block insert cannot satisfy while the checkpoint records
   * are still missing (it breaks as soon as one batch spans two checkpoints). Only the genuinely uncheckpointed
   * tail is inserted as proposed blocks, mirroring how the L1-syncing archiver splits the two.
   */
  private async handleBlocksAdded(event: Extract<L2BlockStreamEvent, { type: 'blocks-added' }>): Promise<void> {
    const lastBatchCheckpoint = event.blocks.at(-1)!.checkpointNumber;

    // Messages first: world-state reads the L1-to-L2 messages of a block's checkpoint as soon as it sees the
    // block, so they must already be local by the time the block lands in the store.
    await this.syncMessagesUpTo(lastBatchCheckpoint);

    // Pull in every checkpoint this batch is covered by. Bounded by the batch so a fresh sync advances the
    // checkpointed tier in step with the block download rather than fetching the whole chain at once.
    const upstreamCheckpointed = this.upstreamTips?.checkpointed.checkpoint.number ?? CheckpointNumber.ZERO;
    await this.catchUpCheckpoints(CheckpointNumber(Math.min(upstreamCheckpointed, lastBatchCheckpoint)));

    // A checkpoint can extend past the end of this batch, so some delivered blocks are already stored.
    const latestStored = await this.stores.blocks.getLatestL2BlockNumber();
    const inserted: L2Block[] = [];
    for (const block of event.blocks.filter(b => b.number > latestStored)) {
      // The store keys its proposed tier off proposed-checkpoint records, which a full node writes from the
      // checkpoint proposals it receives over p2p. A follower has none, so it copies the record from the
      // upstream before inserting a block of the checkpoint that follows it. Under proposer pipelining the
      // upstream routinely holds two uncheckpointed checkpoints at once, so this is the common path.
      if (!(await this.ensureProposedCheckpoint(CheckpointNumber(block.checkpointNumber - 1)))) {
        break;
      }
      await this.updater.addProposedBlock(block);
      inserted.push(block);
    }

    this.blocksAddedThisCycle.push(...inserted);
    if (inserted.length > 0) {
      this.log.debug(`Ingested blocks ${inserted[0].number} to ${inserted.at(-1)!.number} from upstream`);
    }
  }

  /**
   * Makes sure the proposed-checkpoint record for `checkpointNumber` is in the store, copying it from the
   * upstream when it is not. A checkpoint that is already confirmed locally needs no record.
   * @returns Whether the record is now available. False means the upstream has not published the proposal yet,
   * and the caller should leave the blocks that depend on it for a later replication pass.
   */
  private async ensureProposedCheckpoint(checkpointNumber: CheckpointNumber): Promise<boolean> {
    if (checkpointNumber <= (await this.stores.blocks.getLatestCheckpointNumber())) {
      return true;
    }
    if (await this.stores.blocks.getProposedCheckpointByNumber(checkpointNumber)) {
      return true;
    }
    const proposed = await this.callUpstream(() => this.source.getProposedCheckpointData({ number: checkpointNumber }));
    if (!proposed) {
      this.log.debug(`Upstream has not proposed checkpoint ${checkpointNumber} yet; deferring its successors`);
      return false;
    }
    await this.updater.addProposedCheckpoint(proposed);
    this.log.debug(`Copied proposed checkpoint ${checkpointNumber} from upstream`);
    return true;
  }

  /** Catches the checkpointed tier up to the tip the upstream advertised. */
  private handleChainCheckpointed(event: Extract<L2BlockStreamEvent, { type: 'chain-checkpointed' }>): Promise<void> {
    return this.catchUpCheckpoints(event.checkpoint.number);
  }

  /**
   * Fetches and stores every confirmed checkpoint from the local checkpointed tip up to `target`. The stream's
   * checkpoint events carry ids only, so the payloads are fetched on demand; each one also carries its blocks,
   * which the updater reconciles against anything already stored as a proposed block.
   */
  private async catchUpCheckpoints(target: CheckpointNumber): Promise<void> {
    let next = CheckpointNumber((await this.stores.blocks.getLatestCheckpointNumber()) + 1);
    if (next > target) {
      return;
    }

    this.log.debug(`Fetching checkpoints ${next} to ${target} from upstream`);
    while (next <= target) {
      const limit = Math.min(CHECKPOINT_FETCH_BATCH_SIZE, target - next + 1);
      const checkpoints = await this.callUpstream(() => this.source.getCheckpoints({ from: next, limit }));
      if (checkpoints.length === 0) {
        // The upstream no longer has a checkpoint it just advertised (it reorged mid-pass). Leave the local
        // tier where it is; the next pass replans against fresh tips.
        this.log.warn(`Upstream returned no checkpoints from ${next}; skipping checkpoint catch-up`, { next, limit });
        return;
      }
      const last = checkpoints.at(-1)!.checkpoint.number;
      await this.syncMessagesUpTo(last);
      await this.updater.addCheckpoints(checkpoints);
      this.log.verbose(`Added checkpoints ${checkpoints[0].checkpoint.number} to ${last} from upstream`);
      next = CheckpointNumber(last + 1);
    }
  }

  /**
   * Rolls the local chain back to the prune target. Classification is a two-way split: a target at or above the
   * local checkpointed tip only drops the uncheckpointed tail, anything below it drops whole checkpoints.
   * Checkpoint removal stays at checkpoint granularity (matching `Archiver.rollbackTo`), so a target in the
   * middle of a checkpoint rolls back to the previous boundary and the stream re-delivers the difference.
   */
  private async handleChainPruned(event: Extract<L2BlockStreamEvent, { type: 'chain-pruned' }>): Promise<void> {
    const target = event.block.number;
    const checkpointedTip = await this.stores.blocks.getCheckpointedL2BlockNumber();

    if (target >= checkpointedTip) {
      const removed = await this.updater.removeUncheckpointedBlocksAfter(target);
      this.log.info(`Pruned ${removed.length} uncheckpointed blocks after block ${target}`, {
        target,
        checkpointedTip,
      });
      if (removed.length > 0) {
        this.events.emit(L2BlockSourceEvents.L2PruneUncheckpointed, {
          type: L2BlockSourceEvents.L2PruneUncheckpointed,
          slotNumber: removed.at(-1)!.header.globalVariables.slotNumber,
          blocks: removed,
        });
      }
      return;
    }

    const targetCheckpoint = await this.resolveRollbackCheckpoint(target);
    if (targetCheckpoint === undefined) {
      return;
    }

    const blocksRemoved = await this.getBlocksAfterCheckpoint(targetCheckpoint);
    this.log.info(`Pruning ${blocksRemoved.length} blocks after checkpoint ${targetCheckpoint}`, {
      target,
      targetCheckpoint,
      checkpointedTip,
    });
    await this.updater.removeCheckpointsAfter(targetCheckpoint);
    await this.stores.messages.rollbackL1ToL2MessagesToCheckpoint(targetCheckpoint);

    // Clamp the proven cursor down to the upstream's own proven tip when it leads it. The checkpointed cursor
    // needs no clamping: it is derived from the checkpoints still in the store, which we just truncated.
    const localProven = await this.stores.blocks.getProvenCheckpointNumber();
    if (localProven > event.proven.checkpoint.number) {
      await this.updater.setProvenCheckpointNumber(event.proven.checkpoint.number);
    }

    // Any removal here drops at least one checkpointed block, so it is always an unproven-chain prune;
    // L2PruneUncheckpointed is reserved for the uncheckpointed-tail branch above.
    if (blocksRemoved.length > 0) {
      this.events.emit(L2BlockSourceEvents.L2PruneUnproven, {
        type: L2BlockSourceEvents.L2PruneUnproven,
        epochNumber: getEpochAtSlot(blocksRemoved[0].header.globalVariables.slotNumber, this.l1Constants),
        blocks: blocksRemoved,
      });
    }
  }

  /**
   * Returns the checkpoint to roll back to for a prune targeting `blockNumber`, or undefined when the local
   * store cannot resolve it (in which case the prune is skipped rather than thrown, so the stream is not stuck
   * rethrowing on every poll).
   */
  private async resolveRollbackCheckpoint(blockNumber: BlockNumber): Promise<CheckpointNumber | undefined> {
    // A target of block 0 unwinds everything above genesis. There is no block 0 in the store to look up, so it
    // is answered directly rather than through the containing-checkpoint lookup below.
    if (blockNumber === 0) {
      return CheckpointNumber.ZERO;
    }
    const blockData = await this.stores.blocks.getBlockData({ number: blockNumber });
    if (!blockData) {
      this.log.warn(`Cannot resolve checkpoint for pruned block ${blockNumber}; skipping prune`);
      return undefined;
    }
    const checkpointNumber = blockData.checkpointNumber;
    const checkpointData = await this.stores.blocks.getCheckpointData(checkpointNumber);
    if (!checkpointData) {
      this.log.warn(`Missing checkpoint ${checkpointNumber} for pruned block ${blockNumber}; skipping prune`);
      return undefined;
    }
    const lastBlockInCheckpoint = checkpointData.startBlock + checkpointData.blockCount - 1;
    return blockNumber === lastBlockInCheckpoint
      ? checkpointNumber
      : CheckpointNumber(Math.max(checkpointNumber - 1, 0));
  }

  /** Reads the blocks that `removeCheckpointsAfter(checkpointNumber)` is about to delete, for the prune event. */
  private async getBlocksAfterCheckpoint(checkpointNumber: CheckpointNumber): Promise<L2Block[]> {
    const checkpointData =
      checkpointNumber === 0 ? undefined : await this.stores.blocks.getCheckpointData(checkpointNumber);
    const from = BlockNumber(checkpointData ? checkpointData.startBlock + checkpointData.blockCount : 1);
    const latest = await this.stores.blocks.getLatestL2BlockNumber();
    return latest < from ? [] : this.stores.blocks.getBlocks({ from, limit: latest - from + 1 });
  }

  private async handleChainProven(event: Extract<L2BlockStreamEvent, { type: 'chain-proven' }>): Promise<void> {
    const checkpointNumber = event.checkpoint.number;
    if (checkpointNumber === 0 || checkpointNumber <= (await this.stores.blocks.getProvenCheckpointNumber())) {
      return;
    }
    const checkpointData = await this.stores.blocks.getCheckpointData(checkpointNumber);
    if (!checkpointData) {
      this.log.warn(`Missing checkpoint ${checkpointNumber} reported as proven; skipping`);
      return;
    }
    await this.updater.setProvenCheckpointNumber(checkpointNumber);
    this.log.verbose(`Advanced proven checkpoint to ${checkpointNumber}`, { blockNumber: event.block.number });
    this.events.emit(L2BlockSourceEvents.L2BlockProven, {
      type: L2BlockSourceEvents.L2BlockProven,
      blockNumber: event.block.number,
      slotNumber: checkpointData.header.slotNumber,
      epochNumber: getEpochAtSlot(checkpointData.header.slotNumber, this.l1Constants),
    });
  }

  private async handleChainFinalized(event: Extract<L2BlockStreamEvent, { type: 'chain-finalized' }>): Promise<void> {
    const checkpointNumber = event.checkpoint.number;
    if (checkpointNumber === 0 || checkpointNumber <= (await this.stores.blocks.getFinalizedCheckpointNumber())) {
      return;
    }
    await this.updater.setFinalizedCheckpointNumber(checkpointNumber);
    this.log.verbose(`Advanced finalized checkpoint to ${checkpointNumber}`, { blockNumber: event.block.number });
  }

  /**
   * Replicates the L1-to-L2 messages of every checkpoint up to `checkpointNumber` that is not local yet.
   * Checkpoints are fetched in ascending order because the local store reconstructs the inbox rolling hash from
   * the preceding messages. A checkpoint whose message tree the upstream has not sealed yet simply stops the
   * catch-up; the next cycle retries.
   */
  private async syncMessagesUpTo(checkpointNumber: CheckpointNumber): Promise<void> {
    let cursor = await this.stores.messages.getMessagesSyncedToCheckpoint();
    while (cursor < checkpointNumber) {
      const next = CheckpointNumber(cursor + 1);
      let messages: Fr[];
      try {
        messages = await this.callUpstream(() => this.source.getL1ToL2Messages(next));
      } catch (err) {
        // Matched structurally rather than by class so it is still recognised after crossing an RPC boundary,
        // where the error is rehydrated as a plain Error.
        if (isL1ToL2MessagesNotReadyError(err)) {
          this.log.debug(`Upstream has not sealed the message tree for checkpoint ${next} yet`);
          return;
        }
        throw err;
      }
      await this.stores.messages.addL1ToL2MessagesForCheckpoint(next, messages);
      this.log.debug(`Replicated ${messages.length} L1 to L2 messages for checkpoint ${next}`);
      cursor = next;
    }
  }

  public getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.rollupAddress);
  }

  public getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.registryAddress);
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    return Promise.resolve(this.l1Constants);
  }

  public getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: this.l1Constants.genesisArchiveRoot });
  }

  /** The follower never reads L1, so it has no L1 clock of its own. */
  public getL1Timestamp(): Promise<bigint | undefined> {
    return Promise.resolve(undefined);
  }

  public getL2Tips(): Promise<L2Tips> {
    return this.l2TipsCache.getL2Tips();
  }

  /** Forwarded upstream: building the witness needs Outbox roots, which only an L1-connected node can read. */
  public getL2ToL1MembershipWitness(
    txHash: TxHash,
    message: Fr,
    messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined> {
    return this.source.getL2ToL1MembershipWitness(txHash, message, messageIndexInTx);
  }

  /**
   * Served from the local store, which only holds checkpoints replicated so far. Requesting a checkpoint past
   * the replication cursor throws rather than returning an empty set, mirroring what an L1-syncing archiver
   * reports for a message tree that is not sealed yet.
   */
  public override async getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    const syncedTo = await this.stores.messages.getMessagesSyncedToCheckpoint();
    if (checkpointNumber > syncedTo) {
      throw new L1ToL2MessagesNotReadyError(checkpointNumber, BigInt(syncedTo + 1));
    }
    return this.stores.messages.getL1ToL2Messages(checkpointNumber);
  }

  public async getSyncedL2SlotNumber(): Promise<SlotNumber | undefined> {
    const checkpointNumber = await this.stores.blocks.getLatestCheckpointNumber();
    if (checkpointNumber === 0) {
      return undefined;
    }
    const checkpointData = await this.stores.blocks.getCheckpointData(checkpointNumber);
    return checkpointData?.header.slotNumber;
  }

  public async getSyncedL2EpochNumber(): Promise<EpochNumber | undefined> {
    const syncedSlot = await this.getSyncedL2SlotNumber();
    if (syncedSlot === undefined) {
      return undefined;
    }
    // An epoch is fully synced only once its last slot is synced; otherwise only the previous one is.
    const epoch = getEpochAtSlot(syncedSlot, this.l1Constants);
    const [, endSlot] = getSlotRangeForEpoch(epoch, this.l1Constants);
    if (syncedSlot >= endSlot) {
      return epoch;
    }
    return Number(epoch) > 0 ? EpochNumber(Number(epoch) - 1) : undefined;
  }

  /**
   * Unlike the L1-connected archiver, the follower has no L1 clock to fall back on, so an epoch that produced
   * no checkpoints is only reported complete once a later checkpoint has been replicated.
   */
  public async isEpochComplete(epochNumber: EpochNumber): Promise<boolean> {
    const header = (await this.getBlockData({ tag: 'checkpointed' }))?.header;
    const slot = header?.globalVariables.slotNumber;
    const [, endSlot] = getSlotRangeForEpoch(epochNumber, this.l1Constants);
    return slot !== undefined && slot >= endSlot;
  }
}
