import { median } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
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

/** An active ban: the score the peer held when banned, and the timestamp at which the ban lifts. */
type BanRecord = { score: number; expiry: number };

export class PeerScoring {
  private logger = createLogger('p2p:peer-scoring');
  private scores: Map<string, number> = new Map();
  private lastUpdateTime: Map<string, number> = new Map();
  private decayInterval = 1000 * 60; // 1 minute
  private decayFactor = 0.9;
  peerPenalties: { [key in PeerErrorSeverity]: number };

  private peerStateCounter: UpDownCounter;

  /** Active bans, keyed by peer id. Held in memory only, so they are cleared on restart. */
  private bannedPeers: Map<string, BanRecord> = new Map();
  /**
   * How long a peer remains banned once its score crosses MIN_SCORE_BEFORE_BAN. While banned, the
   * peer's ban score is returned by getScore regardless of decay, so it cannot recover its way out
   * of the ban early. After the ban expires the live (decayed) score takes over again.
   */
  private readonly banDurationMs: number;

  constructor(
    config: P2PConfig,
    telemetry: TelemetryClient = getTelemetryClient(),
    private readonly dateProvider: DateProvider = new DateProvider(),
  ) {
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
   * Records a ban for a peer whose score has crossed the ban threshold, with an expiry banDurationMs
   * in the future. No-op if the score is above the threshold or the peer is already serving an active
   * ban (an existing ban is not extended; the original window stands). A previously expired ban does
   * not block a fresh one — getActiveBanScore prunes it first.
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

  /**
   * Removes bans whose window has elapsed. Expired bans are otherwise only pruned lazily when their
   * peer's score is next queried, so a banned peer that disconnects and is never queried again would
   * linger in the map. Called periodically (per heartbeat) to bound the ban map's size.
   */
  pruneExpiredBans(): void {
    const now = this.dateProvider.now();
    for (const [peerId, ban] of this.bannedPeers) {
      if (ban.expiry <= now) {
        this.bannedPeers.delete(peerId);
      }
    }
  }

  /** Resets all peer scores. Useful for benchmarks to prevent cross-case contamination. */
  resetAllScores(): void {
    this.scores.clear();
    this.lastUpdateTime.clear();
    this.bannedPeers.clear();
  }

  removePeer(peerId: string): void {
    this.scores.delete(peerId);
    this.lastUpdateTime.delete(peerId);
  }

  /**
   * The single source of truth for whether a peer is banned. Returns the ban score while the ban is
   * active, or undefined if the peer is not banned. A ban that has expired is lazily lifted before
   * returning undefined, so callers never see a stale ban.
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
    return undefined;
  }

  getScore(peerId: string): number {
    // While a ban is active its ban score is returned regardless of how the live score has decayed,
    // so the peer stays banned for the full duration.
    return this.getActiveBanScore(peerId) ?? this.scores.get(peerId) ?? 0;
  }

  public getScoreState(peerId: string): PeerScoreState {
    // A banned peer stays banned for the full ban duration regardless of score decay (see getScore /
    // maybeBanPeer), rather than silently recovering once its decayed score is cleaned up.
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
