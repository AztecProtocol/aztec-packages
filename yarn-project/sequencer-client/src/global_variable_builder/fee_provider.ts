import { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import type { L1SyncPoint, L2BlockSource } from '@aztec/stdlib/block';
import { getNextL1SlotTimestamp } from '@aztec/stdlib/epoch-helpers';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { FeeAsOf, FeeProvider } from '@aztec/stdlib/tx';

import { type FeeOracleState, FeePredictor } from './fee_predictor.js';
import type { GlobalVariableBuilderConfig } from './global_builder.js';

/** Default interval for the background refresh loop, well below L1's block time. */
const DEFAULT_REFRESH_POLLING_INTERVAL_MS = 1000;

/** How many recent L1 views are retained, so a caller that planned a block or two ago is still answerable. */
const RING_SIZE = 4;

/**
 * Refresh passes a tagged request waits through before settling for the closest view. The first pass it joins
 * may have started from an older sync point than the one it is tagged with; the second is its own.
 */
const MAX_REFRESH_ATTEMPTS = 2;

/** Fees as read at one L1 block. Every read that produced it was pinned to `blockNumber`. */
type FeeEntry = L1SyncPoint & {
  currentMinFees: GasFees;
  predictorState: FeeOracleState;
};

/**
 * Provides current and predicted fee information based on on-chain state, refreshed from the archiver's L1 sync
 * point rather than from a poll of its own.
 *
 * Following the archiver means the fees and the block plans that consume them describe the same L1 block: two
 * independent L1 pollers would otherwise disagree for up to a poll interval after a checkpoint lands, and the
 * mana min fee is a step function of the slot, so that disagreement shows up as a wallet quote the node's own
 * public simulation then rejects.
 *
 * Every L1 read in a refresh is pinned to the sync point's block number, and the resulting entry is kept in a
 * small ring so a caller that planned from a slightly older archiver snapshot can be answered for that same
 * block via {@link FeeAsOf}.
 */
export class FeeProviderImpl implements FeeProvider {
  /** Recent L1 views, newest first. */
  private entries: FeeEntry[] = [];
  private refreshLoop: RunningPromise | undefined;
  private inFlightRefresh: Promise<void> | undefined;

  private readonly rollupContract: RollupContract;
  private readonly feePredictor: FeePredictor;
  private readonly ethereumSlotDuration: number;
  private readonly l1GenesisTime: bigint;
  private readonly log: Logger = createLogger('sequencer-client:fee-provider');

  constructor(
    private readonly dateProvider: DateProvider,
    private readonly publicClient: ViemPublicClient,
    config: GlobalVariableBuilderConfig,
    private readonly syncPointSource: Pick<L2BlockSource, 'getL1SyncPoint'>,
  ) {
    this.ethereumSlotDuration = config.ethereumSlotDuration;
    this.l1GenesisTime = config.l1GenesisTime;

    this.rollupContract = new RollupContract(this.publicClient, config.rollupAddress);
    this.feePredictor = new FeePredictor(this.rollupContract, this.dateProvider, {
      slotDuration: config.slotDuration,
      l1GenesisTime: config.l1GenesisTime,
      ethereumSlotDuration: config.ethereumSlotDuration,
    });
  }

  public async start(pollingIntervalMs = DEFAULT_REFRESH_POLLING_INTERVAL_MS): Promise<void> {
    await this.refresh();
    this.refreshLoop = new RunningPromise(() => this.refresh(), this.log, pollingIntervalMs);
    this.refreshLoop.start();
  }

  public async stop(): Promise<void> {
    await this.refreshLoop?.stop();
    await this.inFlightRefresh?.catch(() => {});
  }

  /**
   * Refreshes the fee entries against the archiver's current L1 sync point, unless the newest entry already
   * describes it. Single-flight: a call made while a refresh is running joins that refresh instead of
   * starting a second one, so the loop and any waiting requests share one round of L1 reads.
   */
  public refresh(): Promise<void> {
    return (this.inFlightRefresh ??= this.doRefresh().finally(() => {
      this.inFlightRefresh = undefined;
    }));
  }

  public async getCurrentMinFees(asOf?: FeeAsOf): Promise<GasFees> {
    const entry = await this.getEntry(asOf);
    return entry?.currentMinFees ?? new GasFees(0, 0);
  }

  public async getPredictedMinFees(manaUsage?: ManaUsageEstimate, asOf?: FeeAsOf): Promise<GasFees[]> {
    const entry = await this.getEntry(asOf);
    if (entry === undefined) {
      throw new Error('FeeProviderImpl.start() must be called before getPredictedMinFees()');
    }
    const predictions = this.feePredictor.computePredictions(
      entry.predictorState,
      manaUsage ?? ManaUsageEstimate.Target,
    );
    return [entry.currentMinFees, ...predictions];
  }

  /**
   * Picks the entry to serve: the newest one when untagged, otherwise the one for the tagged L1 block. A tag
   * ahead of every entry waits for the shared refresh, and once more for its own if the one it joined was
   * already under way from an older sync point, all within `maxWaitMs` when set; a tag behind the ring gets the
   * oldest entry. A tagged miss never throws: the caller asked for a specific L1 view as a consistency
   * preference, not as a precondition, so it is answered with the closest view available.
   */
  private async getEntry(asOf?: FeeAsOf): Promise<FeeEntry | undefined> {
    if (asOf === undefined) {
      return this.entries[0];
    }

    const findTagged = () => this.entries.find(entry => entry.blockNumber === asOf.blockNumber);
    const timer = new Timer();
    for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt++) {
      const hit = findTagged();
      if (hit) {
        return hit;
      }

      const oldest = this.entries.at(-1);
      if (oldest !== undefined && asOf.blockNumber < oldest.blockNumber) {
        this.log.debug(`Requested fees for L1 block ${asOf.blockNumber} predate the retained views`, {
          requestedBlockNumber: asOf.blockNumber,
          servedBlockNumber: oldest.blockNumber,
        });
        return oldest;
      }

      const remainingMs = asOf.maxWaitMs === undefined ? undefined : asOf.maxWaitMs - timer.ms();
      if (remainingMs !== undefined && remainingMs <= 0) {
        break;
      }
      await this.awaitRefresh(remainingMs);
    }

    const refreshed = findTagged();
    if (!refreshed) {
      this.log.debug(`No fees available for L1 block ${asOf.blockNumber} after refreshing`, {
        requestedBlockNumber: asOf.blockNumber,
        servedBlockNumber: this.entries[0]?.blockNumber,
      });
    }
    return refreshed ?? this.entries[0];
  }

  /** Waits for the shared refresh, giving up after `maxWaitMs` if set. Never rejects. */
  private async awaitRefresh(maxWaitMs: number | undefined): Promise<void> {
    const refresh = this.refresh().catch(err =>
      this.log.warn(`Failed to refresh fees while serving a request`, { err }),
    );
    if (maxWaitMs === undefined) {
      return refresh;
    }

    const cap = promiseWithResolvers<void>();
    const timer = setTimeout(cap.resolve, maxWaitMs);
    await Promise.race([refresh, cap.promise]).finally(() => clearTimeout(timer));
  }

  private async doRefresh(): Promise<void> {
    const syncPoint = await this.resolveSyncPoint();
    if (this.entries[0]?.blockHash.equals(syncPoint.blockHash)) {
      return;
    }

    const { blockNumber } = syncPoint;
    const [currentMinFees, predictorState] = await Promise.all([
      this.computeCurrentMinFees(blockNumber),
      this.feePredictor.computeState(blockNumber),
    ]);

    this.entries = [{ ...syncPoint, currentMinFees, predictorState }, ...this.entries].slice(0, RING_SIZE);
  }

  /**
   * The L1 block to price at: the archiver's sync point once it has run a pass, otherwise L1's head. The
   * fallback only applies before the archiver's first pass, so a node can answer fee queries while it is still
   * catching up rather than blocking startup on the archiver.
   */
  private async resolveSyncPoint(): Promise<L1SyncPoint> {
    const syncPoint = await this.syncPointSource.getL1SyncPoint();
    if (syncPoint !== undefined) {
      return syncPoint;
    }
    const block = await this.publicClient.getBlock({ blockTag: 'latest' });
    return { blockNumber: block.number, blockHash: Buffer32.fromString(block.hash) };
  }

  /**
   * Computes the "current" min fees, e.g., the price that you currently should pay to get include in the next block
   * @param blockNumber - L1 block every read is pinned to.
   * @returns Min fees for the next block
   */
  private async computeCurrentMinFees(blockNumber: bigint): Promise<GasFees> {
    // Since this might be called in the middle of a slot where a block might have been published,
    // we need to fetch the last block written, and estimate the earliest timestamp for the next block.
    // The timestamp of that last block will act as a lower bound for the next block.
    const options = { blockNumber };

    const lastCheckpoint = await this.rollupContract.getPendingCheckpoint(options);
    const earliestTimestamp = await this.rollupContract.getTimestampForSlot(
      SlotNumber.fromBigInt(BigInt(lastCheckpoint.slotNumber) + 1n),
      options,
    );
    const nextEthTimestamp = getNextL1SlotTimestamp(this.dateProvider.nowInSeconds(), {
      l1GenesisTime: this.l1GenesisTime,
      ethereumSlotDuration: this.ethereumSlotDuration,
    });
    const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;

    return new GasFees(0, await this.rollupContract.getManaMinFeeAt(timestamp, true, options));
  }
}
