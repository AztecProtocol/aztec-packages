import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

import { ENR } from '@nethermindeth/enr';

/** Map name under which discovered peer ENRs are persisted so discovery can be re-seeded after a restart. */
const PERSISTED_ENRS_MAP_NAME = 'discovered_peer_enrs';

/**
 * A persisted peer entry: the ENR text plus a monotonic sequence number recording when the peer was
 * last seen. The sequence orders the store as a FIFO so eviction drops the oldest-seen peers first.
 */
interface PersistedEnr {
  enr: string;
  seq: number;
}

function parsePersistedEnr(value: string): PersistedEnr | undefined {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.enr === 'string' && typeof parsed?.seq === 'number') {
      return parsed;
    }
  } catch {
    // Unparseable entry; caller treats it as stale.
  }
  return undefined;
}

/**
 * A bounded, transactional store of discovered peer ENRs used to re-seed discovery after a restart.
 *
 * Entries are keyed by nodeId (so re-seeing a peer dedups in place) and carry a monotonic sequence so
 * the store behaves as a FIFO: when it exceeds its cap, the oldest-seen peers are evicted first. All
 * writes run in a transaction so concurrent discovery events can't race the size check.
 */
export class PersistedEnrStore {
  private readonly enrs: AztecAsyncMap<string, string>;
  /** Monotonic sequence stamped on each entry; seeded from the store's max in {@link load}. */
  private seq = 0;

  constructor(
    private readonly store: AztecAsyncKVStore,
    private readonly maxEntries: number,
    private readonly logger: Logger = createLogger('p2p:discv5:enr-store'),
  ) {
    this.enrs = store.openMap(PERSISTED_ENRS_MAP_NAME);
  }

  /** Adds or replaces a peer's ENR, stamping it as most-recently-seen and evicting the oldest if over cap. */
  public async persist(enr: ENR): Promise<void> {
    const nodeId = enr.nodeId;
    const enrTxt = enr.encodeTxt();
    try {
      await this.store.transactionAsync(async () => {
        const seq = ++this.seq;
        // Reads inside a write transaction see committed state, not our own pending set, so gather the
        // existing entries first and account for the one we're about to add when deciding what to evict.
        const others: { nodeId: string; seq: number }[] = [];
        for await (const [id, value] of this.enrs.entriesAsync()) {
          if (id !== nodeId) {
            others.push({ nodeId: id, seq: parsePersistedEnr(value)?.seq ?? 0 });
          }
        }
        const overflow = others.length + 1 - this.maxEntries;
        if (overflow > 0) {
          others.sort((a, b) => a.seq - b.seq); // oldest-seen (lowest sequence) first
          for (let i = 0; i < overflow; i++) {
            await this.enrs.delete(others[i].nodeId);
          }
        }
        await this.enrs.set(nodeId, JSON.stringify({ enr: enrTxt, seq }));
      });
    } catch (err) {
      this.logger.warn(`Failed to persist discovered ENR ${nodeId}`, err);
    }
  }

  /**
   * Refreshes an already-persisted peer's stored ENR when a newer one (higher ENR sequence) is seen.
   * A no-op for peers we don't already track — we never add new peers via this path, only update.
   *
   * This exists because discv5 updates an existing routing-table entry on an ENR sequence bump without
   * emitting an `enrAdded` event, so a peer that changes address would otherwise keep its stale ENR
   * persisted until evicted.
   */
  public async refresh(enr: ENR): Promise<void> {
    const nodeId = enr.nodeId;
    try {
      await this.store.transactionAsync(async () => {
        const existing = await this.enrs.getAsync(nodeId);
        if (!existing) {
          return;
        }
        const storedSeq = this.decodeStoredEnr(existing)?.seq;
        if (storedSeq !== undefined && enr.seq <= storedSeq) {
          return;
        }
        await this.enrs.set(nodeId, JSON.stringify({ enr: enr.encodeTxt(), seq: ++this.seq }));
      });
    } catch (err) {
      this.logger.warn(`Failed to refresh persisted ENR ${nodeId}`, err);
    }
  }

  /**
   * Loads all persisted ENRs, decoding each and keeping those the `accept` predicate allows. Entries
   * that fail to decode or are rejected are removed from the store. The FIFO sequence resumes from the
   * highest persisted value so eviction order survives restarts.
   */
  public async load(accept: (enr: ENR) => boolean): Promise<ENR[]> {
    const valid: ENR[] = [];
    const stale: string[] = [];
    let maxSeq = 0;
    for await (const [nodeId, value] of this.enrs.entriesAsync()) {
      const parsed = parsePersistedEnr(value);
      let enr: ENR | undefined;
      if (parsed) {
        try {
          enr = ENR.decodeTxt(parsed.enr);
        } catch (err) {
          this.logger.debug(`Dropping undecodable persisted ENR ${nodeId}`, err);
        }
      }
      if (!parsed || !enr || !accept(enr)) {
        stale.push(nodeId);
        continue;
      }
      maxSeq = Math.max(maxSeq, parsed.seq);
      valid.push(enr);
    }
    this.seq = maxSeq;
    if (stale.length > 0) {
      await this.store.transactionAsync(async () => {
        for (const nodeId of stale) {
          await this.enrs.delete(nodeId);
        }
      });
    }
    return valid;
  }

  private decodeStoredEnr(value: string): ENR | undefined {
    const parsed = parsePersistedEnr(value);
    if (!parsed) {
      return undefined;
    }
    try {
      return ENR.decodeTxt(parsed.enr);
    } catch {
      return undefined;
    }
  }
}
