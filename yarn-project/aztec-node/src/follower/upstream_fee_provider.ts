import type { DateProvider } from '@aztec/foundation/timer';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { type GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { FeeProvider } from '@aztec/stdlib/tx';

/** The slice of the upstream node's API a follower needs in order to answer fee queries. */
export type UpstreamFeeSource = Pick<AztecNode, 'getCurrentMinFees' | 'getPredictedMinFees'>;

/** A pending or resolved upstream answer, tagged with the L1 slot it was requested in. */
type CachedFees<T> = { l1Slot: bigint; result: Promise<T> };

/** Constants needed to tell which L1 slot the wall clock is in. */
type L1SlotConstants = Pick<L1RollupConstants, 'l1GenesisTime' | 'ethereumSlotDuration'>;

/**
 * Answers a follower node's fee queries from its upstream node instead of from the rollup contract, so the
 * follower needs no L1 connection to price transactions. Both queries are forwarded verbatim: the upstream
 * computes them from its own live L1 view, which is exactly the view a transaction forwarded to that upstream
 * will be priced against.
 *
 * Caching mirrors `FeeProviderImpl`, which recomputes only when the L1 block number advances: min fees only
 * move with L1 blocks, so at most one upstream round trip per query is made per L1 slot. The slot is derived
 * from the wall clock and the rollup constants rather than from an `eth_blockNumber` call, which means a
 * cached answer can be up to one L1 slot stale (the same bound `FeeProviderImpl` has, since it caches for the
 * lifetime of an L1 block).
 */
export class UpstreamFeeProvider implements FeeProvider {
  private currentMinFees: CachedFees<GasFees> | undefined;
  private readonly predictedMinFees = new Map<ManaUsageEstimate, CachedFees<GasFees[]>>();

  constructor(
    private readonly upstream: UpstreamFeeSource,
    private readonly dateProvider: DateProvider,
    private readonly l1Constants: L1SlotConstants,
  ) {}

  public getCurrentMinFees(): Promise<GasFees> {
    return this.fetchOncePerL1Slot(
      () => this.currentMinFees,
      entry => {
        this.currentMinFees = entry;
      },
      () => this.upstream.getCurrentMinFees(),
    );
  }

  public getPredictedMinFees(manaUsage: ManaUsageEstimate = ManaUsageEstimate.Target): Promise<GasFees[]> {
    return this.fetchOncePerL1Slot(
      () => this.predictedMinFees.get(manaUsage),
      entry => {
        if (entry === undefined) {
          this.predictedMinFees.delete(manaUsage);
        } else {
          this.predictedMinFees.set(manaUsage, entry);
        }
      },
      () => this.upstream.getPredictedMinFees(manaUsage),
    );
  }

  /**
   * Returns the cached answer when it was requested in the current L1 slot, and issues a single upstream call
   * otherwise. A rejection evicts its own entry (unless a later slot already replaced it) so that a transient
   * upstream failure is retried on the next call rather than replayed for the rest of the L1 slot.
   */
  private fetchOncePerL1Slot<T>(
    load: () => CachedFees<T> | undefined,
    store: (entry: CachedFees<T> | undefined) => void,
    fetch: () => Promise<T>,
  ): Promise<T> {
    const l1Slot = this.currentL1Slot();
    const cached = load();
    if (cached !== undefined && cached.l1Slot === l1Slot) {
      return cached.result;
    }

    const entry: CachedFees<T> = {
      l1Slot,
      result: fetch().catch(err => {
        if (load() === entry) {
          store(undefined);
        }
        throw err;
      }),
    };
    store(entry);
    return entry.result;
  }

  /** Index of the L1 slot containing the current wall-clock time. */
  private currentL1Slot(): bigint {
    const { l1GenesisTime, ethereumSlotDuration } = this.l1Constants;
    const now = BigInt(this.dateProvider.nowInSeconds());
    return now <= l1GenesisTime ? 0n : (now - l1GenesisTime) / BigInt(ethereumSlotDuration);
  }
}
