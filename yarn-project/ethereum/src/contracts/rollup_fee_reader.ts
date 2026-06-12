import type { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { LruMap, compactArray } from '@aztec/foundation/collection';

import type { StateOverride } from 'viem';

import { type SimulationOverridesPlan, buildSimulationOverridesStateOverride } from './chain_state_override.js';
import type { CheckpointLog, L1FeeData, RollupContract } from './rollup.js';

/** Bound on entries kept per cached method. Keys advance with L1 blocks/slots so old keys are never re-queried. */
const FEE_READER_LRU_SIZE = 8;

/**
 * Single point through which every fee-relevant L1 read on a node flows, so that if any component
 * (sequencer, public-calls simulator, the global-variable builder, the fee getters used by the RPC
 * `getCurrentBaseFees` endpoint and p2p tx validation, the fee predictor) has gone to L1 to decide
 * on fees, the result is shared with all the others. One instance per process wraps one
 * {@link RollupContract}; constructing several readers defeats the sharing.
 *
 * ## Caching model
 *
 * Every cached read is a pure function of an L1 block number plus its query parameters (timestamps,
 * checkpoint numbers, and — for `getManaMinFeeAt` — the *content* of the translated state override).
 * Local/archiver state never enters a cache key directly. Instead it flows into the
 * {@link SimulationOverridesPlan}, which is translated into a viem `StateOverride` whose bytes are
 * fingerprinted into the key. This makes invalidation trivial to reason about and is the reason this
 * class is the only place fee caching happens.
 *
 * ## Cache invalidation
 *
 * 1. **Every entry is scoped to a single L1 block number.** Either the caller threads a block number
 *    (for snapshot consistency across a multi-read computation) or the reader stamps the current
 *    max-seen block. Staleness is therefore bounded by one L1 block (~12s), the same trade
 *    `FeeProviderImpl.getCurrentMinFees` and `FeePredictor.getState` already make.
 *
 * 2. **One block of staleness is sufficient.** Checkpoint landings, prunes and invalidations change
 *    fee inputs only via L1 transactions, i.e. only by producing a new L1 block — which produces a
 *    new key. The L1 gas oracle is permissionlessly pokeable (`RollupCore.sol`), but a poke applies
 *    with `LAG = 2` L2 slots (`FeeLib.sol`), while consumers only ever serve the next slot or the one
 *    after; the fee inputs for the slot being served are already frozen except at the L1 block
 *    boundary, which the block-number key closes. Governance fee config (`updateManaTarget`,
 *    `setProvingCostPerMana`) is owner-only and rate-limited — and the constants below are memoized on
 *    the underlying {@link RollupContract}, so a governance change is only observed on process restart
 *    (a pre-existing caveat, unchanged by this class).
 *
 * 3. **Local (archiver/proposed) state never invalidates the cache and never needs to.** It
 *    determines the `StateOverride` content (pending archive, temp-checkpoint-log fields, fee-header
 *    override, chain tips); that content is fingerprinted into the `getManaMinFeeAt` key. A new
 *    proposed parent, a changed `feeAssetPriceModifier` or `totalManaUsed`, a pending-chain
 *    invalidation — each changes the override bytes and therefore the key. There is no archiver-state
 *    subscription, no TTL, and no manual invalidation anywhere.
 *
 * 4. **Errors are never cached.** A rejected promise is evicted via `.catch` so the next call retries.
 *    Entries are bounded by small LRUs; since keys advance monotonically with L1 blocks/slots, old
 *    keys are never queried again and the LRU only ever holds the few live keys around a boundary.
 *
 * ## Snapshot consistency
 *
 * A multi-read fee computation (grandparent fee header + min-fee `eth_call`) must not straddle an L1
 * block boundary with mixed snapshots. Callers fetch {@link getL1BlockNumber} once per logical
 * operation and thread it through {@link SimulationOverridesPlan.l1BlockNumber} and the
 * `options.blockNumber` of direct reads, so every read in the operation pins to the same block.
 */
export class RollupFeeReader {
  /** Highest L1 block number seen so far; never decreases even if a load-balanced RPC returns an older block. */
  private maxSeenL1BlockNumber: bigint | undefined;

  private readonly manaMinFeeCache = new LruMap<string, Promise<bigint>>(FEE_READER_LRU_SIZE);
  private readonly checkpointCache = new LruMap<string, Promise<CheckpointLog>>(FEE_READER_LRU_SIZE);
  private readonly pendingCheckpointCache = new LruMap<string, Promise<CheckpointLog>>(FEE_READER_LRU_SIZE);
  private readonly effectivePendingCheckpointCache = new LruMap<string, Promise<CheckpointLog>>(FEE_READER_LRU_SIZE);
  private readonly l1FeesCache = new LruMap<string, Promise<L1FeeData>>(FEE_READER_LRU_SIZE);
  private readonly slotNumberCache = new LruMap<string, Promise<SlotNumber>>(FEE_READER_LRU_SIZE);

  constructor(private readonly rollup: RollupContract) {}

  /** The underlying rollup contract. Exposed for callers that need non-fee reads or the L1 client. */
  public get rollupContract(): RollupContract {
    return this.rollup;
  }

  /**
   * Returns the current L1 block number, kept monotonic (max-seen). Cached reads stamp this block so
   * a load-balanced RPC briefly returning an older block cannot flip-flop cache entries between two
   * heights. Callers thread the returned value through a single logical operation for a consistent
   * snapshot.
   */
  public async getL1BlockNumber(): Promise<bigint> {
    const blockNumber = await this.rollup.client.getBlockNumber({ cacheTime: 0 });
    if (this.maxSeenL1BlockNumber === undefined || blockNumber > this.maxSeenL1BlockNumber) {
      this.maxSeenL1BlockNumber = blockNumber;
    }
    return this.maxSeenL1BlockNumber;
  }

  /**
   * Minimum fee per mana at `timestamp`, with the given simulation plan applied as a state override.
   *
   * The plan is translated into a viem `StateOverride` *before* the cache lookup; the key is
   * `(blockNumber, timestamp, inFeeAsset, fingerprint(stateOverride))`, where `blockNumber` is
   * `plan.l1BlockNumber` when set (snapshot consistency) or the current max-seen block. Because the
   * fingerprint is over the translated override *content*, two plans built by different components
   * that translate to identical overrides share one `eth_call`, while a single differing override byte
   * yields a distinct entry.
   *
   * Translation is read-free for every current caller: `makeChainTipsOverride` skips its storage read
   * when both tip halves are set (which every plan in these paths does) and `getRollupConstants` is
   * memoized. A hypothetical future plan that sets only one tip half would pay one (uncached) storage
   * read per call to translate — correct, just not cached.
   */
  public async getManaMinFeeAt(
    timestamp: bigint,
    inFeeAsset: boolean,
    plan?: SimulationOverridesPlan,
  ): Promise<bigint> {
    const blockNumber = plan?.l1BlockNumber ?? (await this.getL1BlockNumber());
    const stateOverride = await buildSimulationOverridesStateOverride(this.rollup, plan);
    const key = [blockNumber, timestamp, inFeeAsset, fingerprintStateOverride(stateOverride)].join('|');

    return this.cached(this.manaMinFeeCache, key, () =>
      this.rollup.getManaMinFeeAt(timestamp, inFeeAsset, stateOverride, { blockNumber }),
    );
  }

  /** Checkpoint log for `checkpointNumber`, pinned to a block (the passed one or the current max-seen). */
  public async getCheckpoint(
    checkpointNumber: CheckpointNumber,
    options?: { blockNumber?: bigint },
  ): Promise<CheckpointLog> {
    const blockNumber = options?.blockNumber ?? (await this.getL1BlockNumber());
    const key = [blockNumber, checkpointNumber].join('|');
    return this.cached(this.checkpointCache, key, () => this.rollup.getCheckpoint(checkpointNumber, { blockNumber }));
  }

  /**
   * Pending checkpoint. Pinned to a block (the passed one or the current max-seen). The underlying
   * read does not currently support `{ blockNumber }`, so the pin only scopes the cache key.
   */
  public async getPendingCheckpoint(options?: { blockNumber?: bigint }): Promise<CheckpointLog> {
    const blockNumber = options?.blockNumber ?? (await this.getL1BlockNumber());
    return this.cached(this.pendingCheckpointCache, `${blockNumber}`, () => this.rollup.getPendingCheckpoint());
  }

  /**
   * Effective pending checkpoint at `timestamp` (accounting for prunes), pinned to a block (the
   * passed one or the current max-seen). Callers thread one block number across a logical operation
   * for a consistent snapshot.
   */
  public async getEffectivePendingCheckpoint(
    timestamp: bigint,
    options?: { blockNumber?: bigint },
  ): Promise<CheckpointLog> {
    const blockNumber = options?.blockNumber ?? (await this.getL1BlockNumber());
    const key = [blockNumber, timestamp].join('|');
    return this.cached(this.effectivePendingCheckpointCache, key, () =>
      this.rollup.getEffectivePendingCheckpoint(timestamp, { blockNumber }),
    );
  }

  /** L1 base/blob fees at `timestamp`, pinned to a block (the passed one or the current max-seen). */
  public async getL1FeesAt(timestamp: bigint, options?: { blockNumber?: bigint }): Promise<L1FeeData> {
    const blockNumber = options?.blockNumber ?? (await this.getL1BlockNumber());
    const key = [blockNumber, timestamp].join('|');
    return this.cached(this.l1FeesCache, key, () => this.rollup.getL1FeesAt(timestamp, { blockNumber }));
  }

  /** Current L2 slot number, pinned to a block (the passed one or the current max-seen). */
  public async getSlotNumber(options?: { blockNumber?: bigint }): Promise<SlotNumber> {
    const blockNumber = options?.blockNumber ?? (await this.getL1BlockNumber());
    return this.cached(this.slotNumberCache, `${blockNumber}`, () => this.rollup.getSlotNumber({ blockNumber }));
  }

  /** Timestamp for a slot. Pure function of immutable genesis constants — passthrough, no caching needed. */
  public getTimestampForSlot(slot: SlotNumber): Promise<bigint> {
    return this.rollup.getTimestampForSlot(slot);
  }

  /** Mana target. Governance config memoized on the underlying contract; see the cache-invalidation note. */
  public getManaTarget(): Promise<bigint> {
    return this.rollup.getManaTarget();
  }

  /** Mana limit. Governance config memoized on the underlying contract; see the cache-invalidation note. */
  public getManaLimit(): Promise<bigint> {
    return this.rollup.getManaLimit();
  }

  /** Proving cost per mana in ETH. Governance config memoized on the underlying contract. */
  public getProvingCostPerMana(): Promise<bigint> {
    return this.rollup.getProvingCostPerMana();
  }

  /** Epoch duration. Immutable rollup constant memoized on the underlying contract. */
  public getEpochDuration(): Promise<number> {
    return this.rollup.getEpochDuration();
  }

  /** Epoch number for a checkpoint. Passthrough; checkpoint-to-epoch mapping is immutable once landed. */
  public getEpochNumberForCheckpoint(checkpointNumber: CheckpointNumber): Promise<EpochNumber> {
    return this.rollup.getEpochNumberForCheckpoint(checkpointNumber);
  }

  /**
   * Single-flight cache helper: returns an in-flight promise for `key` if present, otherwise runs
   * `compute`, stores its promise, and evicts the entry on rejection so failures are not cached. The
   * get→set has no `await` between them, so concurrent callers race-free share one in-flight promise.
   */
  private cached<V>(cache: LruMap<string, Promise<V>>, key: string, compute: () => Promise<V>): Promise<V> {
    const existing = cache.get(key);
    if (existing) {
      return existing;
    }
    const promise = compute().catch(err => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, promise);
    return promise;
  }
}

/**
 * Stable string fingerprint of a viem `StateOverride`'s content. Two overrides with identical content
 * produce the same string regardless of entry ordering; any difference in a single byte produces a
 * distinct one. Every field viem supports on an override entry is serialized — not just the
 * `stateDiff` our builders emit today — so a future override shape cannot silently alias cache
 * entries that differ in a field the fingerprint ignores.
 */
function fingerprintStateOverride(stateOverride: StateOverride): string {
  if (stateOverride.length === 0) {
    return '';
  }
  const slotValues = (pairs: { slot: `0x${string}`; value: `0x${string}` }[]) =>
    pairs
      .map(({ slot, value }) => `${slot.toLowerCase()}:${value.toLowerCase()}`)
      .sort()
      .join(',');
  return stateOverride
    .map(entry => {
      const parts = compactArray([
        entry.stateDiff && `diff{${slotValues(entry.stateDiff)}}`,
        entry.state && `state{${slotValues(entry.state)}}`,
        entry.balance !== undefined ? `balance:${entry.balance}` : undefined,
        entry.nonce !== undefined ? `nonce:${entry.nonce}` : undefined,
        entry.code && `code:${entry.code.toLowerCase()}`,
      ]);
      return `${entry.address.toLowerCase()}=${parts.join('|')}`;
    })
    .sort()
    .join(';');
}
