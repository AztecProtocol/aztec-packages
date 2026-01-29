import { median } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
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
 * - MidToleranceError: Rate limit exceeded, hash mismatches, protocol violations
 * - HighToleranceError: Rate limit warnings, failed responses, transient errors
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

export class PeerScoring {
  private logger = createLogger('p2p:peer-scoring');
  private scores: Map<string, number> = new Map();
  private lastUpdateTime: Map<string, number> = new Map();
  private decayInterval = 1000 * 60; // 1 minute
  private decayFactor = 0.9;
  peerPenalties: { [key in PeerErrorSeverity]: number };

  private peerStateCounter: UpDownCounter;

  constructor(config: P2PConfig, telemetry: TelemetryClient = getTelemetryClient()) {
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
    const currentTime = Date.now();
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
    return currentScore;
  }

  decayAllScores(): void {
    const currentTime = Date.now();
    for (const [peerId, lastUpdate] of this.lastUpdateTime.entries()) {
      const timePassed = currentTime - lastUpdate;
      const decayPeriods = Math.floor(timePassed / this.decayInterval);
      if (decayPeriods > 0) {
        let score = this.scores.get(peerId) || 0;
        score *= Math.pow(this.decayFactor, decayPeriods);
        this.scores.set(peerId, score);
        this.lastUpdateTime.set(peerId, currentTime);
      }
    }
  }

  getScore(peerId: string): number {
    return this.scores.get(peerId) || 0;
  }

  public getScoreState(peerId: string): PeerScoreState {
    // TODO(#11329): permanently store banned peers?
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

    for (const peerId of this.scores.keys()) {
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
