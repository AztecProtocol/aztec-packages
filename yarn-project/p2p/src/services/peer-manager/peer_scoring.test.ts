import { ManualDateProvider } from '@aztec/foundation/timer';

import { getP2PDefaultConfig } from '../../config.js';
import { PeerErrorSeverity } from '../../types/index.js';
import { PeerScoreState, PeerScoring } from './peer_scoring.js';

describe('PeerScoring', () => {
  let peerScoring: PeerScoring;
  let dateProvider: ManualDateProvider;
  const testPeerId = 'testPeer123';

  beforeEach(() => {
    dateProvider = new ManualDateProvider();
    peerScoring = new PeerScoring(
      {
        ...getP2PDefaultConfig(),
        peerPenaltyValues: [2, 10, 50],
      },
      undefined,
      dateProvider,
    );
  });

  test('should initialize with zero score for a new peer', () => {
    expect(peerScoring.getScore(testPeerId)).toBe(0);
  });

  test('should update score correctly', () => {
    peerScoring.updateScore(testPeerId, 5);
    expect(peerScoring.getScore(testPeerId)).toBe(5);
  });

  test('should accumulate scores', () => {
    peerScoring.updateScore(testPeerId, 3);
    peerScoring.updateScore(testPeerId, 2);
    expect(peerScoring.getScore(testPeerId)).toBe(5);
  });

  test('should decay scores over time', () => {
    peerScoring.updateScore(testPeerId, 10);

    // Advance time by 1 minute (decay interval)
    dateProvider.advanceTimeMs(60000);

    peerScoring.updateScore(testPeerId, 0); // Trigger decay calculation
    expect(peerScoring.getScore(testPeerId)).toBeCloseTo(9, 1); // 10 * 0.9 ≈ 9
  });

  test('should decay all scores', () => {
    peerScoring.updateScore(testPeerId, 10);
    peerScoring.updateScore('anotherPeer', 20);

    // Advance time by 2 minutes
    dateProvider.advanceTimeMs(120000);

    peerScoring.decayAllScores();
    expect(peerScoring.getScore(testPeerId)).toBeCloseTo(8.1, 1); // 10 * 0.9 * 0.9 ≈ 8.1
    expect(peerScoring.getScore('anotherPeer')).toBeCloseTo(16.2, 1); // 20 * 0.9 * 0.9 ≈ 16.2
  });

  test('should apply correct penalties for different error severities', () => {
    peerScoring.updateScore(testPeerId, -peerScoring.peerPenalties[PeerErrorSeverity.HighToleranceError]);
    expect(peerScoring.getScore(testPeerId)).toBe(-2);

    peerScoring.updateScore(testPeerId, -peerScoring.peerPenalties[PeerErrorSeverity.MidToleranceError]);
    expect(peerScoring.getScore(testPeerId)).toBe(-12);

    peerScoring.updateScore(testPeerId, -peerScoring.peerPenalties[PeerErrorSeverity.LowToleranceError]);
    expect(peerScoring.getScore(testPeerId)).toBe(-62);
  });

  test('should return zero for non-existent peers', () => {
    expect(peerScoring.getScore('nonExistentPeer')).toBe(0);
  });

  test('should apply maximum penalty correctly', () => {
    const maxPenalty = Math.max(...Object.values(peerScoring.peerPenalties));
    peerScoring.updateScore(testPeerId, -maxPenalty);
    expect(peerScoring.getScore(testPeerId)).toBe(-maxPenalty);
  });

  test('should handle score updates after long periods of inactivity', () => {
    peerScoring.updateScore(testPeerId, 100);
    dateProvider.advanceTimeMs(1000 * 60 * 60 * 24); // Advance 24 hours
    peerScoring.updateScore(testPeerId, 10);
    expect(peerScoring.getScore(testPeerId)).toBeCloseTo(10, 1);
  });

  test('should handle penalties in the correct order', () => {
    const testConfig = {
      ...getP2PDefaultConfig(),
      peerPenaltyValues: [50, 2, 11],
    };

    const localDateProvider = new ManualDateProvider();
    const localPeerScoring = new PeerScoring(testConfig, undefined, localDateProvider);

    localPeerScoring.updateScore(testPeerId, -localPeerScoring.peerPenalties[PeerErrorSeverity.HighToleranceError]);
    expect(localPeerScoring.getScore(testPeerId)).toBe(-2);

    localPeerScoring.updateScore(testPeerId, -localPeerScoring.peerPenalties[PeerErrorSeverity.MidToleranceError]);
    expect(localPeerScoring.getScore(testPeerId)).toBe(-13);

    localPeerScoring.updateScore(testPeerId, -localPeerScoring.peerPenalties[PeerErrorSeverity.LowToleranceError]);
    expect(localPeerScoring.getScore(testPeerId)).toBe(-63);
  });

  test('should correctly determine peer score state', () => {
    const testPeerId = 'testPeerState';

    // Test Healthy state (default)
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Healthy);

    // Test Disconnect state (score between -100 and -50)
    peerScoring.updateScore(testPeerId, -60);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Disconnect);

    // Test Banned state (score below -100)
    peerScoring.updateScore(testPeerId, -50); // Total now -110
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Banned);

    // Test return to Healthy state
    peerScoring.updateScore(testPeerId, 120); // Total now +10
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Healthy);
  });

  test('should handle score state transitions with decay', () => {
    const testPeerId = 'testPeerStateDecay';

    // Put peer in Disconnect state
    peerScoring.updateScore(testPeerId, -60);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Disconnect);

    // Advance time by 10 minutes (should decay score significantly)
    dateProvider.advanceTimeMs(10 * 60 * 1000);
    peerScoring.decayAllScores();

    // Score should have decayed enough to return to Healthy state
    // -60 * (0.9^10) ≈ -23.2, which is above the Disconnect threshold
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Healthy);
  });

  test('removePeer should delete all score data for a peer', () => {
    peerScoring.updateScore(testPeerId, -30);
    expect(peerScoring.getScore(testPeerId)).toBe(-30);

    peerScoring.removePeer(testPeerId);
    expect(peerScoring.getScore(testPeerId)).toBe(0);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Healthy);
  });

  test('decayAllScores should remove entries that have decayed to near-zero', () => {
    peerScoring.updateScore(testPeerId, -2);
    peerScoring.updateScore('otherPeer', -100);

    // Advance enough time for the small score to decay below threshold
    // -2 * 0.9^50 ≈ -0.01, which is below 0.1
    dateProvider.advanceTimeMs(50 * 60 * 1000);
    peerScoring.decayAllScores();

    // Small score should be cleaned up
    expect(peerScoring.getScore(testPeerId)).toBe(0);
    // Large score should still exist (decayed but still significant)
    expect(peerScoring.getScore('otherPeer')).not.toBe(0);

    const stats = peerScoring.getStats();
    expect(stats.healthyCount).toBe(1);
  });
});
