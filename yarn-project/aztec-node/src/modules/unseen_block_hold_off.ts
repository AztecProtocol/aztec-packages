import { TimeoutError } from '@aztec/foundation/error';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { Timer } from '@aztec/foundation/timer';
import {
  type BlockData,
  type L2Block,
  type L2BlockSource,
  type NormalizedBlockParameter,
  inspectBlockParameter,
} from '@aztec/stdlib/block';
import type { BlockHeader } from '@aztec/stdlib/tx';

/** How often a held request re-reads the block source while waiting. */
const POLL_INTERVAL_MS = 200;

/** Max requests held simultaneously. Beyond this, misses fail fast as if the hold-off were disabled. */
export const MAX_CONCURRENT_HOLDS = 100;

/** Wait budgets for {@link UnseenBlockHoldOff}, in milliseconds. Zero (or negative) disables a budget. */
export type UnseenBlockHoldOffConfig = {
  /** Budget for a query anchored on the block number right after the node's proposed tip. */
  byNumberWaitMs: number;
  /** Budget for a query anchored on a block hash or archive root the node does not know. */
  byHashWaitMs: number;
};

/** Options for a single {@link UnseenBlockHoldOff} query. */
export type UnseenBlockHoldOffOptions = {
  /** Set to false to resolve without ever waiting (used by callers that already spent their budget). */
  holdOff?: boolean;
};

/**
 * Resolves RPC block anchors against the block source, briefly holding a request whose anchor the node is about to
 * see instead of failing it immediately.
 *
 * Behind a load balancer a client can sync to block N+1 through one node and then anchor follow-up queries against
 * another node that is still at block N. Failing those queries aborts a whole client flow over a skew that resolves
 * in under a block time, so a miss on an anchor that plausibly lies just ahead of the tip is retried for a bounded
 * budget. Everything else — a tag, a number far past the tip, a budget of zero, or too many requests already held —
 * resolves exactly as the bare block source would.
 */
export class UnseenBlockHoldOff {
  private activeHolds = 0;
  private readonly log: Logger;

  constructor(
    private readonly blockSource: L2BlockSource,
    private readonly config: UnseenBlockHoldOffConfig,
    log?: Logger,
  ) {
    this.log = log ?? createLogger('node:unseen-block-hold-off');
  }

  /** Number of requests currently held waiting for their anchor block. Exposed for tests and diagnostics. */
  public get holds(): number {
    return this.activeHolds;
  }

  /**
   * Resolves `query` to block metadata, holding off briefly when it references a block the node is about to see.
   * Returns undefined on a miss, so callers keep whatever behavior they had before (throwing or returning
   * undefined) — the hold-off only delays that outcome.
   */
  public getBlockData(
    query: NormalizedBlockParameter,
    opts: UnseenBlockHoldOffOptions = {},
  ): Promise<BlockData | undefined> {
    return this.#readWithHoldOff(query, q => this.blockSource.getBlockData(q), opts);
  }

  /** Resolves `query` to a full block with its transactions, holding off as {@link getBlockData} does. */
  public getBlock(query: NormalizedBlockParameter, opts: UnseenBlockHoldOffOptions = {}): Promise<L2Block | undefined> {
    return this.#readWithHoldOff(query, q => this.blockSource.getBlock(q), opts);
  }

  /**
   * Reads `query` through `read`, and on a miss keeps re-reading it for the query's wait budget. Subject to the
   * concurrent-hold cap: once it is saturated a miss resolves without waiting, as it would with the hold-off
   * disabled.
   *
   * A budget is approximate: the poll loop sleeps a full interval before re-checking the deadline, so the actual
   * wait can exceed the configured budget by up to one poll interval plus the read's own latency.
   */
  async #readWithHoldOff<T extends { header: BlockHeader }>(
    query: NormalizedBlockParameter,
    read: (query: NormalizedBlockParameter) => Promise<T | undefined>,
    opts: UnseenBlockHoldOffOptions,
  ): Promise<T | undefined> {
    const value = await read(query);
    if (value !== undefined || opts.holdOff === false) {
      return value;
    }

    const waitMs = await this.#resolveWaitBudgetMs(query);
    if (!Number.isFinite(waitMs) || waitMs <= 0) {
      return undefined;
    }
    const blockParameter = inspectBlockParameter(query);
    if (this.activeHolds >= MAX_CONCURRENT_HOLDS) {
      this.log.verbose(`Not holding off query for unseen block, too many requests already held`, {
        blockParameter,
        holds: this.activeHolds,
      });
      return undefined;
    }

    this.activeHolds++;
    const timer = new Timer();
    try {
      this.log.verbose(`Holding off query for unseen block`, { blockParameter, waitMs, holds: this.activeHolds });
      const arrived = await retryUntil(
        () => read(query),
        `block ${blockParameter}`,
        waitMs / 1000,
        POLL_INTERVAL_MS / 1000,
      );
      this.log.verbose(`Unseen block arrived after ${timer.ms()}ms`, {
        blockParameter,
        blockNumber: arrived.header.getBlockNumber(),
        elapsedMs: timer.ms(),
      });
      return arrived;
    } catch (err) {
      if (!(err instanceof TimeoutError)) {
        throw err;
      }
      this.log.verbose(`Gave up waiting for unseen block after ${timer.ms()}ms`, {
        blockParameter,
        waitMs,
        elapsedMs: timer.ms(),
      });
      return undefined;
    } finally {
      this.activeHolds--;
    }
  }

  /**
   * Budget for waiting on a missing anchor, decided once on entry rather than per poll. A tag always resolves
   * against the current tip, so a tag miss is never a skew. A number is only worth waiting on when it is the very
   * next block: further ahead the client is not merely one block in front, and at or below the tip the block was
   * pruned or reorged away. A hash or archive root carries no height, so "one ahead" and "reorged away" are
   * indistinguishable and both get the shorter hash budget.
   */
  async #resolveWaitBudgetMs(query: NormalizedBlockParameter): Promise<number> {
    if ('tag' in query) {
      return 0;
    }
    if ('number' in query) {
      const tip = await this.blockSource.getBlockNumber();
      return query.number === tip + 1 ? this.config.byNumberWaitMs : 0;
    }
    return this.config.byHashWaitMs;
  }
}
