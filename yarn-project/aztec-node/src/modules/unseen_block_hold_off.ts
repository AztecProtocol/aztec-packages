import { TimeoutError } from '@aztec/foundation/error';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { Timer } from '@aztec/foundation/timer';
import {
  type AnchoredBlockParameter,
  type BlockData,
  type L2Block,
  type L2BlockSource,
  type NormalizedBlockParameter,
  inspectBlockParameter,
  isAnchoredBlockParameter,
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

/** What {@link UnseenBlockHoldOff} needs from whatever a read returns: both {@link BlockData} and {@link L2Block}. */
type ReadBlock = { header: BlockHeader };

/** A read of a single block by a query naming it one way, as the block source exposes it. */
type BlockReader<T extends ReadBlock> = (query: NormalizedBlockParameter) => Promise<T | undefined>;

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
 * in under a block time, so a miss on an anchor that plausibly names a block this node is about to see is retried for
 * a bounded budget. Anchors that carry no such promise — a tag, or a bare number that is not the next block — resolve
 * exactly as the bare block source would, as does any miss once a budget is zero or too many requests are already held.
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
   *
   * This is also the only place that understands the anchored `{ number, hash }` form, which it reduces to a
   * single-selector query before it reads the block source. Callers holding a {@link BlockParameter} from the RPC
   * boundary must therefore resolve it here before reading the block source themselves, even when they do not want
   * to wait (`{ holdOff: false }`).
   */
  public getBlockData(
    query: NormalizedBlockParameter | AnchoredBlockParameter,
    opts: UnseenBlockHoldOffOptions = {},
  ): Promise<BlockData | undefined> {
    return this.#readWithHoldOff(query, q => this.blockSource.getBlockData(q), opts);
  }

  /** Resolves `query` to a full block with its transactions, holding off as {@link getBlockData} does. */
  public getBlock(
    query: NormalizedBlockParameter | AnchoredBlockParameter,
    opts: UnseenBlockHoldOffOptions = {},
  ): Promise<L2Block | undefined> {
    return this.#readWithHoldOff(query, q => this.blockSource.getBlock(q), opts);
  }

  /**
   * Reads `query` through `read`, and on a miss keeps re-reading it for the query's wait budget. The read the caller
   * wants is what gets polled, so nothing is read twice, and the anchored form is reduced to a single-selector query
   * before `read` ever sees it.
   *
   * A budget is approximate: the poll loop sleeps a full interval before re-checking the deadline, so the actual
   * wait can exceed the configured budget by up to one poll interval plus the read's own latency.
   */
  async #readWithHoldOff<T extends ReadBlock>(
    query: NormalizedBlockParameter | AnchoredBlockParameter,
    read: BlockReader<T>,
    opts: UnseenBlockHoldOffOptions,
  ): Promise<T | undefined> {
    return isAnchoredBlockParameter(query)
      ? await this.#readAnchored(query, read, opts)
      : await this.#readNormalized(query, read, opts);
  }

  /** Reads a query naming a block one way, and waits for it if it plausibly lies just ahead. */
  async #readNormalized<T extends ReadBlock>(
    query: NormalizedBlockParameter,
    read: BlockReader<T>,
    opts: UnseenBlockHoldOffOptions,
  ): Promise<T | undefined> {
    const value = await read(query);
    if (value !== undefined || opts.holdOff === false) {
      return value;
    }

    const waitMs = await this.#resolveWaitBudgetMs(query);
    return await this.#pollWithHoldOff(query, read, waitMs, inspectBlockParameter(query));
  }

  /**
   * Reads an anchor pinned by both number and hash, which is precise enough to tell a client that raced one block
   * ahead from one naming a block this node will never have.
   *
   * The hash is what resolves the anchor, so the fork it pins is honored exactly as a bare hash would be. The number
   * only decides how a miss is waited out. At exactly one past the tip the wait runs by number, because that is the
   * block the node is about to add: once it lands, reading the anchor by hash settles whether it is the anchored one,
   * and an empty read there means the client is on a fork this node is not building on, so the rest of the budget is
   * not waited out. Any other height is waited out by hash on the shorter budget, as a bare hash would be — the node
   * may be about to prune onto the client's fork, which can place the anchor at a height this node already holds.
   */
  async #readAnchored<T extends ReadBlock>(
    query: AnchoredBlockParameter,
    read: BlockReader<T>,
    opts: UnseenBlockHoldOffOptions,
  ): Promise<T | undefined> {
    const blockParameter = inspectBlockParameter(query);
    const value = await read({ hash: query.hash });
    if (value !== undefined) {
      return this.#verifyAnchorHeight(value, query);
    }
    if (opts.holdOff === false) {
      return undefined;
    }

    const tip = await this.blockSource.getBlockNumber();
    if (query.number !== tip + 1) {
      const arrived = await this.#pollWithHoldOff({ hash: query.hash }, read, this.config.byHashWaitMs, blockParameter);
      return arrived === undefined ? undefined : this.#verifyAnchorHeight(arrived, query);
    }
    const arrived = await this.#pollWithHoldOff(
      { number: query.number },
      read,
      this.config.byNumberWaitMs,
      blockParameter,
    );
    if (arrived === undefined) {
      return undefined;
    }
    const anchored = await read({ hash: query.hash });
    if (anchored === undefined) {
      // The node built a different block at that height, so the anchor names a fork this node is not on. That is a
      // genuine miss and reporting it right away is more useful than waiting out the rest of the budget.
      this.log.verbose(`Block at unseen anchor height arrived on a different fork`, { blockParameter });
      return undefined;
    }
    return this.#verifyAnchorHeight(anchored, query);
  }

  /** Rejects an anchor whose hash resolves to a block at a height other than the one it names. */
  #verifyAnchorHeight<T extends ReadBlock>(value: T, query: AnchoredBlockParameter): T {
    if (value.header.getBlockNumber() !== query.number) {
      throw new BadRequestError(
        `Anchor block ${query.hash.toString()} is block ${value.header.getBlockNumber()}, not the requested ` +
          `block ${query.number}`,
      );
    }
    return value;
  }

  /**
   * Polls `read(query)` until it resolves or `waitMs` elapses, subject to the concurrent-hold cap. Returns undefined
   * without waiting when the budget is empty or the cap is saturated, so a miss fails as fast as it would with the
   * hold-off disabled. `blockParameter` describes the anchor the caller asked for, which for an anchored query is
   * not the query being polled.
   */
  async #pollWithHoldOff<T extends ReadBlock>(
    query: NormalizedBlockParameter,
    read: BlockReader<T>,
    waitMs: number,
    blockParameter: string,
  ): Promise<T | undefined> {
    if (!Number.isFinite(waitMs) || waitMs <= 0) {
      return undefined;
    }
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
