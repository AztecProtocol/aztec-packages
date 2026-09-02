import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { L1SyncPoint, L2BlockSource, L2Frontier } from '@aztec/stdlib/block';
import type { GasFees } from '@aztec/stdlib/gas';
import { GlobalVariables } from '@aztec/stdlib/tx';

import { NextBlockFeeCache, type NextBlockFeeCacheDeps } from './next_block_fee_cache.js';
import { type NextBlockPlan, computeBoundaryFeeKey, getClockSlot, planNextBlock } from './next_block_planner.js';

/**
 * How long a fee quote waits for a boundary refresh before answering with what it already has. Long enough for
 * a slow but alive L1 RPC; short enough that an L1 outage does not turn every quote into a multi-second RPC.
 */
export const QUOTE_MAX_WAIT_MS = 5000;

/** The next block as this node predicts it: how it sits on the chain, plus the globals it would carry. */
export type NextBlockPrediction = {
  plan: NextBlockPlan;
  /** Snapshot the plan was derived from, so callers can pin their own reads to the same instant. */
  frontier: L2Frontier;
  globals: GlobalVariables;
};

/** Dependencies required to build a {@link NextBlockPredictor}. */
export interface NextBlockPredictorDeps {
  blockSource: L2BlockSource;
  feeCache: NextBlockFeeCache;
  epochCache: EpochCacheInterface;
  log?: Logger;
}

/**
 * Answers "what would the next block look like" for everything on the RPC side: the public simulation forks and
 * executes against this prediction, and the fee quote reports the fee it carries.
 *
 * The plan is re-derived from a fresh archiver snapshot on every call — it is a handful of in-memory reads, and
 * a stale plan would fork the wrong block, target the wrong checkpoint's L1-to-L2 messages, or miss that an
 * in-progress checkpoint froze a different fee. Only the L1-derived part, the checkpoint globals of a block that
 * opens a fresh checkpoint, is cached (see {@link NextBlockFeeCache}).
 *
 * Deliberately not used by the sequencer: its slot policy is stricter (it declines to build rather than
 * predicting inclusion) and a stale fee would make L1 reject its checkpoint.
 */
export class NextBlockPredictor {
  private readonly blockSource: L2BlockSource;
  private readonly feeCache: NextBlockFeeCache;
  private readonly epochCache: EpochCacheInterface;
  private readonly log: Logger;

  constructor(deps: NextBlockPredictorDeps) {
    this.blockSource = deps.blockSource;
    this.feeCache = deps.feeCache;
    this.epochCache = deps.epochCache;
    this.log = deps.log ?? createLogger('node:next-block-predictor');
  }

  /** Builds a predictor together with the fee cache it reads from. */
  public static create(deps: NextBlockFeeCacheDeps): NextBlockPredictor {
    const feeCache = new NextBlockFeeCache({ ...deps, log: deps.log?.createChild('fee-cache') });
    return new NextBlockPredictor({
      blockSource: deps.blockSource,
      feeCache,
      epochCache: deps.epochCache,
      log: deps.log,
    });
  }

  public start(pollingIntervalMs?: number): Promise<void> {
    return this.feeCache.start(pollingIntervalMs);
  }

  public stop(): Promise<void> {
    return this.feeCache.stop();
  }

  /**
   * Plans the next block and builds the globals it would carry, in one of two ways, mirroring how the sequencer
   * builds the next block:
   *
   * - **Continuing an in-progress checkpoint**: every block in a checkpoint shares the same
   *   `CheckpointGlobalVariables`, so the latest proposed block's globals are copied verbatim — including the
   *   proposer's real coinbase and fee recipient — with only the block number bumped. No L1 involved.
   * - **Opening a new checkpoint**: the globals are priced for the slot the next block will land in, under the
   *   same overrides plan the sequencer applies, so the simulated mana min fee matches what the sequencer will
   *   write into the block header. Coinbase and fee recipient stay zero: the future proposer's payout addresses
   *   are unknowable.
   *
   * Waits without a bound for a boundary fee it does not have cached, and surfaces the L1 failure if that read
   * fails, as a simulation did before this cache existed.
   */
  public async predict(): Promise<NextBlockPrediction> {
    const { frontier, plan, key } = await this.planFromFrontier();
    const blockNumber = BlockNumber.add(plan.latestBlockNumber, 1);
    if (!key) {
      return { plan, frontier, globals: this.copyGlobalsFromLatestBlock(frontier, blockNumber) };
    }

    const checkpointGlobals = await this.feeCache.getBoundaryGlobals(key, frontier);
    if (!checkpointGlobals) {
      throw new Error(`Could not price the next block at slot ${key.targetSlot}: no boundary fee available`);
    }
    return { plan, frontier, globals: GlobalVariables.from({ blockNumber, ...checkpointGlobals }) };
  }

  /**
   * The mana min fee the next block will charge, for wallets to pad and pay. Mid-checkpoint this is the fee the
   * in-progress checkpoint froze into its first block, which no forward-looking L1 projection can see. At a
   * boundary it is the cached L1 price, waited on for at most {@link QUOTE_MAX_WAIT_MS}; undefined when the node
   * has nothing usable, in which case the caller falls back to the fee provider's projections alone.
   *
   * Returns the L1 block the answer describes so the caller can tag its own fee reads with the same anchor.
   */
  public async quoteMinFees(): Promise<{ fees: GasFees; l1SyncPoint: L1SyncPoint | undefined } | undefined> {
    const { frontier, plan, key } = await this.planFromFrontier();
    if (!key) {
      const fees = frontier.latestBlockHeader?.globalVariables.gasFees;
      if (!fees) {
        this.log.warn(`Cannot quote the next block fee: frontier reports no header for its proposed tip`, {
          blockNumber: plan.latestBlockNumber,
        });
        return undefined;
      }
      return { fees, l1SyncPoint: frontier.l1SyncPoint };
    }

    const checkpointGlobals = await this.feeCache.getBoundaryGlobals(key, frontier, { maxWaitMs: QUOTE_MAX_WAIT_MS });
    return checkpointGlobals ? { fees: checkpointGlobals.gasFees, l1SyncPoint: frontier.l1SyncPoint } : undefined;
  }

  /** Plans the next block from a fresh archiver snapshot; `key` is set only when that block opens a checkpoint. */
  private async planFromFrontier() {
    const frontier = await this.blockSource.getL2Frontier();
    const plan = planNextBlock(frontier, getClockSlot(this.epochCache));
    const key = computeBoundaryFeeKey(plan, frontier.pendingChainValidationStatus);
    return { frontier, plan, key };
  }

  /**
   * The header comes from the same snapshot as the tips, so it cannot describe a different block than the
   * proposed tip. A missing header at a non-genesis proposed tip is an invariant violation and throws rather
   * than falling through to the new-checkpoint path: a fork at the proposed tip already contains the ongoing
   * checkpoint's L1-to-L2 messages, so a caller inserting the next checkpoint's messages would append them a
   * second time.
   */
  private copyGlobalsFromLatestBlock(frontier: L2Frontier, blockNumber: BlockNumber): GlobalVariables {
    if (!frontier.latestBlockHeader) {
      throw new Error(
        `Cannot predict the next block: frontier reports proposed tip ${frontier.tips.proposed.number} but carries no header`,
      );
    }
    return GlobalVariables.from({ ...frontier.latestBlockHeader.globalVariables, blockNumber });
  }
}
