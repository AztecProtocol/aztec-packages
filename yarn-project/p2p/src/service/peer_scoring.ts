import { median } from '@aztec/foundation/collection';

import { type P2PConfig } from '../config.js';

export enum PeerErrorSeverity {
  /**
   * Not malicious action, but it must not be tolerated
   * ~2 occurrences will get the peer banned
   */
  LowToleranceError = 'LowToleranceError',
  /**
   * Negative action that can be tolerated only sometimes
   * ~10 occurrences will get the peer banned
   */
  MidToleranceError = 'MidToleranceError',
  /**
   * Some error that can be tolerated multiple times
   * ~50 occurrences will get the peer banned
   */
  HighToleranceError = 'HighToleranceError',
}

const DefaultPeerPenalties = {
  [PeerErrorSeverity.LowToleranceError]: 2,
  [PeerErrorSeverity.MidToleranceError]: 10,
  [PeerErrorSeverity.HighToleranceError]: 50,
};

export class PeerScoring {
  private scores: Map<string, number> = new Map();
  private lastUpdateTime: Map<string, number> = new Map();
  private decayInterval = 1000 * 60; // 1 minute
  private decayFactor = 0.9;
  peerPenalties: { [key in PeerErrorSeverity]: number };

  constructor(config: P2PConfig) {
    const orderedValues = config.peerPenaltyValues?.sort((a, b) => a - b);
    this.peerPenalties = {
      [PeerErrorSeverity.HighToleranceError]:
        orderedValues?.[0] ?? DefaultPeerPenalties[PeerErrorSeverity.LowToleranceError],
      [PeerErrorSeverity.MidToleranceError]:
        orderedValues?.[1] ?? DefaultPeerPenalties[PeerErrorSeverity.MidToleranceError],
      [PeerErrorSeverity.LowToleranceError]:
        orderedValues?.[2] ?? DefaultPeerPenalties[PeerErrorSeverity.HighToleranceError],
    };
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

  getStats(): { medianScore: number } {
    return { medianScore: median(Array.from(this.scores.values())) ?? 0 };
  }
}
