import { ManualDateProvider } from '@aztec/foundation/timer';
import { type AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';

import { getP2PDefaultConfig } from '../../config.js';
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
    const localPeerScoring = new PeerScoring(testConfig, undefined, undefined, localDateProvider);

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
    expect(peerScoring.getScore(testPeerId)).toBe(0);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Healthy);

    // Test Disconnect state (score between -100 and -50)
    peerScoring.updateScore(testPeerId, -60);
    expect(peerScoring.getScore(testPeerId)).toBe(-60);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Disconnect);

    // Test Banned state (score below -100)
    peerScoring.updateScore(testPeerId, -50); // Total now -110
    expect(peerScoring.getScore(testPeerId)).toBe(-110);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Banned);

    // Improving the score does not lift the ban: getScore returns the persisted ban floor (-110),
    // not the recovered live score, for the full 24h window.
    peerScoring.updateScore(testPeerId, 120); // Live score now +10, but the ban floor still applies
    expect(peerScoring.getScore(testPeerId)).toBe(-110);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Banned);

    // Once the 24h ban expires, the live (improved) score takes over and the peer is Healthy again.
    dateProvider.advanceTimeMs(24 * 60 * 60 * 1000 + 1);
    expect(peerScoring.getScore(testPeerId)).toBe(10);
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

describe('PeerScoring ban persistence', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const bannedPeerId = 'bannedPeer';
  const config = { ...getP2PDefaultConfig(), peerPenaltyValues: [2, 10, 50] };

  let dateProvider: ManualDateProvider;
  let store: AztecLMDBStoreV2;

  beforeEach(async () => {
    dateProvider = new ManualDateProvider();
    store = await openTmpStore('peer-scoring-ban-test');
  });

  afterEach(async () => {
    await store.close();
  });

  it('honours peerBanDurationSeconds for the ban window', async () => {
    const banDurationSeconds = 60;
    const scoring = await PeerScoring.new(
      { ...config, peerBanDurationSeconds: banDurationSeconds },
      store,
      undefined,
      dateProvider,
    );

    scoring.updateScore(bannedPeerId, -150);
    expect(scoring.getScore(bannedPeerId)).toBe(-150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Banned);
    // Recover the live score so that only the ban floor keeps the peer banned.
    scoring.updateScore(bannedPeerId, 300); // live score now +150

    // Still banned just before the configured window elapses: getScore returns the ban floor.
    dateProvider.advanceTimeMs(banDurationSeconds * 1000 - 1);
    expect(scoring.getScore(bannedPeerId)).toBe(-150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Banned);

    // Unbanned once it elapses: the recovered live score takes over.
    dateProvider.advanceTimeMs(2);
    expect(scoring.getScore(bannedPeerId)).toBe(150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Healthy);
  });

  it('keeps a peer banned for the full 24h window even if its score recovers', async () => {
    const scoring = await PeerScoring.new(config, store, undefined, dateProvider);

    scoring.updateScore(bannedPeerId, -150);
    expect(scoring.getScore(bannedPeerId)).toBe(-150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Banned);

    // A large positive update lifts the live score, but getScore keeps returning the ban floor.
    scoring.updateScore(bannedPeerId, 300); // live score now +150
    expect(scoring.getScore(bannedPeerId)).toBe(-150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Banned);

    // Just before expiry the peer is still banned at the ban floor.
    dateProvider.advanceTimeMs(DAY_MS - 1);
    expect(scoring.getScore(bannedPeerId)).toBe(-150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Banned);

    // After expiry the live (recovered) score takes over.
    dateProvider.advanceTimeMs(2);
    expect(scoring.getScore(bannedPeerId)).toBe(150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Healthy);
  });

  it('restores an active ban from the store on restart', async () => {
    const scoring = await PeerScoring.new(config, store, undefined, dateProvider);
    scoring.updateScore(bannedPeerId, -150);
    await scoring.flushBanPersistence();

    // Simulate a restart: PeerScoring.new over the same store reloads the ban with its score.
    const restarted = await PeerScoring.new(config, store, undefined, dateProvider);
    expect(restarted.getScore(bannedPeerId)).toBe(-150);
    expect(restarted.getScoreState(bannedPeerId)).toBe(PeerScoreState.Banned);
  });

  it('drops bans that expired while offline on restart', async () => {
    const scoring = await PeerScoring.new(config, store, undefined, dateProvider);
    scoring.updateScore(bannedPeerId, -150);
    await scoring.flushBanPersistence();

    // The ban expires before the node comes back up.
    dateProvider.advanceTimeMs(DAY_MS + 1);

    // The expired ban is not restored; with no live score the peer reads back at zero.
    const restarted = await PeerScoring.new(config, store, undefined, dateProvider);
    expect(restarted.getScore(bannedPeerId)).toBe(0);
    expect(restarted.getScoreState(bannedPeerId)).toBe(PeerScoreState.Healthy);
  });
});
