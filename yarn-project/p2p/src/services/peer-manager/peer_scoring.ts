import { median } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import {
  Attributes,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';

import type { P2PConfig } from '../../config.js';

/**
 * Application-level peer penalties.
 *
 * These scores are multiplied by appSpecificWeight (10) when contributing to gossipsub score.
 * The values are designed to align with gossipsub thresholds:
 *
 * - LowToleranceError (50): 1 error → app score -50 → gossipsub -500 → gossipThreshold
 * - MidToleranceError (10): 5 errors → app score -50 → gossipsub -500 → gossipThreshold
 * - HighToleranceError (2): 25 errors → app score -50 → gossipsub -500 → gossipThreshold
 *
 * Examples of each severity:
 * - LowToleranceError: Invalid messages, deserialization errors, manipulation attempts
 * - MidToleranceError: Hash mismatches, protocol violations
 * - HighToleranceError: Rate limit exceeded, failed responses, transient errors
 */
const DefaultPeerPenalties = {
  [PeerErrorSeverity.LowToleranceError]: 50,
  [PeerErrorSeverity.MidToleranceError]: 10,
  [PeerErrorSeverity.HighToleranceError]: 2,
};

export enum PeerScoreState {
  Banned,
  Disconnect,
  Healthy,
}

/**
 * Score thresholds for peer states.
 *
 * These values align with gossipsub thresholds when multiplied by appSpecificWeight (10):
 * - MIN_SCORE_BEFORE_DISCONNECT (-50) × 10 = -500 = gossipThreshold
 * - MIN_SCORE_BEFORE_BAN (-100) × 10 = -1000 = publishThreshold
 *
 * This ensures that when a peer is disconnected at the application level,
 * they also stop receiving gossip, and when banned, they cannot publish.
 */
// TODO: move into config / constants
const MIN_SCORE_BEFORE_BAN = -100;
const MIN_SCORE_BEFORE_DISCONNECT = -50;
const SCORE_CLEANUP_THRESHOLD = 0.1;

/** A persisted ban: the score the peer held when banned, and the timestamp at which the ban lifts. */
type BanRecord = { score: number; expiry: number };

/** Name of the kv-store map used to persist bans across restarts. */
const BANNED_PEERS_MAP_NAME = 'banned_peers';

export class PeerScoring {
  private logger = createLogger('p2p:peer-scoring');
  private scores: Map<string, number> = new Map();
  private lastUpdateTime: Map<string, number> = new Map();
  private decayInterval = 1000 * 60; // 1 minute
  private decayFactor = 0.9;
  peerPenalties: { [key in PeerErrorSeverity]: number };

  private peerStateCounter: UpDownCounter;

  /** Active bans held in memory so getScore/getScoreState stay synchronous. Mirrors bannedPeersStore. */
  private bannedPeers: Map<string, BanRecord> = new Map();
  /** The kv-store backing bans, kept so ban pruning can run in a single transaction. */
  private readonly kvStore?: AztecAsyncKVStore;
  /** Backing store for bans, so they survive restarts. */
  private readonly bannedPeersStore?: AztecAsyncMap<string, BanRecord>;
  /**
   * Serializes the fire-and-forget ban writes so they never race each other, and so callers can
   * await durability via flushBanPersistence. Only created when a store is configured.
   */
  private readonly banPersistenceQueue?: SerialQueue;
  /**
   * How long a peer remains banned once its score crosses MIN_SCORE_BEFORE_BAN. While banned, the
   * peer's persisted ban score is returned by getScore regardless of decay, so it cannot recover its
   * way out of the ban early. After the ban expires the live (decayed) score takes over again.
   */
  private readonly banDurationMs: number;

  constructor(
    config: P2PConfig,
    store?: AztecAsyncKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    private readonly dateProvider: DateProvider = new DateProvider(),
  ) {
    this.kvStore = store;
    this.bannedPeersStore = store?.openMap(BANNED_PEERS_MAP_NAME);
    if (store) {
      this.banPersistenceQueue = new SerialQueue();
      this.banPersistenceQueue.start();
    }
    this.banDurationMs = config.peerBanDurationSeconds * 1000;
    const orderedValues = config.peerPenaltyValues?.sort((a, b) => a - b);
    this.peerPenalties = {
      [PeerErrorSeverity.HighToleranceError]:
        orderedValues?.[0] ?? DefaultPeerPenalties[PeerErrorSeverity.HighToleranceError],
      [PeerErrorSeverity.MidToleranceError]:
        orderedValues?.[1] ?? DefaultPeerPenalties[PeerErrorSeverity.MidToleranceError],
      [PeerErrorSeverity.LowToleranceError]:
        orderedValues?.[2] ?? DefaultPeerPenalties[PeerErrorSeverity.LowToleranceError],
    };

    const meter = telemetry.getMeter('PeerScoring');

    this.peerStateCounter = createUpDownCounterWithDefault(meter, Metrics.P2P_PEER_STATE_COUNT, {
      [Attributes.P2P_PEER_SCORE_STATE]: ['Healthy', 'Disconnect', 'Banned'],
    });
  }

  /**
   * Builds a PeerScoring and restores any active bans from the store, so persisted bans survive
   * restarts. Prefer this over the constructor when a store is provided; the constructor alone does
   * not load persisted bans.
   */
  static async new(
    config: P2PConfig,
    store?: AztecAsyncKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    dateProvider: DateProvider = new DateProvider(),
  ): Promise<PeerScoring> {
    const peerScoring = new PeerScoring(config, store, telemetry, dateProvider);
    await peerScoring.restoreBannedPeers();
    return peerScoring;
  }

  public penalizePeer(peerId: PeerId, penalty: PeerErrorSeverity) {
    const id = peerId.toString();
    const penaltyValue = this.peerPenalties[penalty];
    const newScore = this.updateScore(id, -penaltyValue);
    this.logger.verbose(`Penalizing peer ${id} with ${penalty} (new score is ${newScore})`);
    return newScore;
  }

  updateScore(peerId: string, scoreDelta: number): number {
    const currentTime = this.dateProvider.now();
    const lastUpdate = this.lastUpdateTime.get(peerId) || currentTime;
    const timePassed = currentTime - lastUpdate;
    const decayPeriods = Math.floor(timePassed / this.decayInterval);

    let currentScore = this.scores.get(peerId) || 0;

    // Apply decay
    currentScore *= Math.pow(this.decayFactor, decayPeriods);

    // Apply new score delta
    currentScore += scoreDelta;

    this.scores.set(peerId, currentScore);
    this.lastUpdateTime.set(peerId, currentTime);

    this.maybeBanPeer(peerId, currentScore);

    return currentScore;
  }

  /**
   * Records a ban for a peer whose score has crossed the ban threshold, persisting it with an
   * expiry banDurationMs in the future. No-op if the score is above the threshold or the peer is
   * already serving an active ban (an existing ban is not extended; the original window stands). A
   * previously expired ban does not block a fresh one — getActiveBanScore prunes it first.
   */
  private maybeBanPeer(peerId: string, score: number): void {
    if (score >= MIN_SCORE_BEFORE_BAN || this.getActiveBanScore(peerId) !== undefined) {
      return;
    }
    const record: BanRecord = { score, expiry: this.dateProvider.now() + this.banDurationMs };
    this.bannedPeers.set(peerId, record);
    this.logger.verbose(`Banning peer ${peerId} until ${new Date(record.expiry).toISOString()}`, {
      peerId,
      score,
      expiry: record.expiry,
    });
    this.enqueueBanPersistence(store => store.set(peerId, record), `Failed to persist ban for peer ${peerId}`);
  }

  /**
   * Enqueues a ban-store mutation onto the serial persistence queue so writes run one at a time and
   * never reject unhandled. No-op when no store is configured. The in-memory ban map has already
   * been updated by the caller, so getScore reflects the change immediately regardless of the write.
   */
  private enqueueBanPersistence(
    op: (store: AztecAsyncMap<string, BanRecord>) => Promise<void>,
    errorMsg: string,
  ): void {
    const store = this.bannedPeersStore;
    if (!store || !this.banPersistenceQueue) {
      return;
    }
    void this.banPersistenceQueue.put(() => op(store)).catch(err => this.logger.error(errorMsg, err));
  }

  /** Resolves once all pending ban writes have been flushed to the store (for graceful shutdown/tests). */
  public async flushBanPersistence(): Promise<void> {
    await this.banPersistenceQueue?.syncPoint();
  }

  decayAllScores(): void {
    const currentTime = this.dateProvider.now();
    for (const [peerId, lastUpdate] of this.lastUpdateTime.entries()) {
      const timePassed = currentTime - lastUpdate;
      const decayPeriods = Math.floor(timePassed / this.decayInterval);
      if (decayPeriods > 0) {
        let score = this.scores.get(peerId) || 0;
        score *= Math.pow(this.decayFactor, decayPeriods);
        if (Math.abs(score) < SCORE_CLEANUP_THRESHOLD) {
          this.scores.delete(peerId);
          this.lastUpdateTime.delete(peerId);
        } else {
          this.scores.set(peerId, score);
          this.lastUpdateTime.set(peerId, currentTime);
        }
      }
    }
  }

  /** Resets all peer scores. Useful for benchmarks to prevent cross-case contamination. */
  resetAllScores(): void {
    this.scores.clear();
    this.lastUpdateTime.clear();
    this.bannedPeers.clear();
  }

  /**
   * Loads persisted bans into memory, dropping any that have already expired. Must be called on
   * startup before the peer manager begins querying scores, so bans survive restarts.
   */
  public async restoreBannedPeers(): Promise<void> {
    const map = this.bannedPeersStore;
    const kvStore = this.kvStore;
    if (!map || !kvStore) {
      return;
    }
    const now = this.dateProvider.now();
    const expired: string[] = [];
    for await (const [peerId, record] of map.entriesAsync()) {
      if (record.expiry > now) {
        this.bannedPeers.set(peerId, record);
      } else {
        expired.push(peerId);
      }
    }
    if (expired.length > 0) {
      await kvStore.transactionAsync(async () => {
        for (const peerId of expired) {
          await map.delete(peerId);
        }
      });
    }
    this.logger.verbose(`Restored ${this.bannedPeers.size} active peer ban(s) from store`);
  }

  removePeer(peerId: string): void {
    this.scores.delete(peerId);
    this.lastUpdateTime.delete(peerId);
  }

  /**
   * The single source of truth for whether a peer is banned. Returns the persisted ban score while
   * the ban is active, or undefined if the peer is not banned. A ban that has expired is lazily
   * lifted (removed in memory and in the store) before returning undefined, so callers never see a
   * stale ban.
   */
  private getActiveBanScore(peerId: string): number | undefined {
    const ban = this.bannedPeers.get(peerId);
    if (ban === undefined) {
      return undefined;
    }
    if (ban.expiry > this.dateProvider.now()) {
      return ban.score;
    }
    // Ban expired: lift it so the peer can recover.
    this.bannedPeers.delete(peerId);
    this.enqueueBanPersistence(store => store.delete(peerId), `Failed to remove expired ban for peer ${peerId}`);
    return undefined;
  }

  getScore(peerId: string): number {
    // While a ban is active its persisted score is returned regardless of how the live score has
    // decayed, so the peer stays banned for the full duration.
    return this.getActiveBanScore(peerId) ?? this.scores.get(peerId) ?? 0;
  }

  public getScoreState(peerId: string): PeerScoreState {
    // Banned peers are persisted with a configured expiry (see getScore / maybeBanPeer), so a banned peer
    // stays banned for the full duration even across restarts and regardless of score decay.
    const score = this.getScore(peerId);
    if (score < MIN_SCORE_BEFORE_BAN) {
      return PeerScoreState.Banned;
    }
    if (score < MIN_SCORE_BEFORE_DISCONNECT) {
      return PeerScoreState.Disconnect;
    }
    return PeerScoreState.Healthy;
  }

  getStats(): { medianScore: number; healthyCount: number; disconnectCount: number; bannedCount: number } {
    const stateCounts = { healthy: 0, disconnect: 0, banned: 0 };

    // Include banned peers whose live score may have been decayed away but whose ban is still active.
    const peerIds = new Set([...this.scores.keys(), ...this.bannedPeers.keys()]);
    for (const peerId of peerIds) {
      const state = this.getScoreState(peerId);
      switch (state) {
        case PeerScoreState.Healthy:
          stateCounts.healthy++;
          break;
        case PeerScoreState.Disconnect:
          stateCounts.disconnect++;
          break;
        case PeerScoreState.Banned:
          stateCounts.banned++;
          break;
      }
    }

    this.peerStateCounter.add(stateCounts.healthy, { [Attributes.P2P_PEER_SCORE_STATE]: 'Healthy' });
    this.peerStateCounter.add(stateCounts.disconnect, { [Attributes.P2P_PEER_SCORE_STATE]: 'Disconnect' });
    this.peerStateCounter.add(stateCounts.banned, { [Attributes.P2P_PEER_SCORE_STATE]: 'Banned' });

    return {
      medianScore: median(Array.from(this.scores.values())) ?? 0,
      healthyCount: stateCounts.healthy,
      disconnectCount: stateCounts.disconnect,
      bannedCount: stateCounts.banned,
    };
  }
}
