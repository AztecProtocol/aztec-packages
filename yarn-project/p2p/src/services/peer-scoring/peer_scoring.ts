import { PeerErrorSeverity } from '@aztec/circuit-types';
import { median } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';

import { type PeerId } from '@libp2p/interface';

import { type P2PConfig } from '../../config.js';

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

  constructor(config: P2PConfig) {
    const orderedValues = config.peerPenaltyValues?.sort((a, b) => a - b);
    this.peerPenalties = {
      [PeerErrorSeverity.HighToleranceError]:
        orderedValues?.[0] ?? DefaultPeerPenalties[PeerErrorSeverity.HighToleranceError],
      [PeerErrorSeverity.MidToleranceError]:
        orderedValues?.[1] ?? DefaultPeerPenalties[PeerErrorSeverity.MidToleranceError],
      [PeerErrorSeverity.LowToleranceError]:
        orderedValues?.[2] ?? DefaultPeerPenalties[PeerErrorSeverity.LowToleranceError],
    };
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
    const score = this.getScore(peerId);
    if (score <= MIN_SCORE_BEFORE_BAN) {
      return PeerScoreState.Banned;
    }
    if (score <= MIN_SCORE_BEFORE_DISCONNECT) {
      return PeerScoreState.Disconnect;
    }
    return PeerScoreState.Healthy;
  }

  getStats(): { medianScore: number } {
    return { medianScore: median(Array.from(this.scores.values())) ?? 0 };
  }
}
