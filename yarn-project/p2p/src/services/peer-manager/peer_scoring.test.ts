import { ManualDateProvider } from '@aztec/foundation/timer';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';

import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';

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

    // Improving the score does not lift the ban: getScore returns the ban floor (-110), not the
    // recovered live score, for the full ban window.
    peerScoring.updateScore(testPeerId, 120); // Live score now +10, but the ban floor still applies
    expect(peerScoring.getScore(testPeerId)).toBe(-110);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Banned);

    // Once the ban expires, the live (improved) score takes over and the peer is Healthy again.
    dateProvider.advanceTimeMs(24 * 60 * 60 * 1000 + 1);
    expect(peerScoring.getScore(testPeerId)).toBe(10);
    expect(peerScoring.getScoreState(testPeerId)).toBe(PeerScoreState.Healthy);
  });

  test('honours peerBanDurationSeconds for the ban window', () => {
    const banDurationSeconds = 60;
    const localDateProvider = new ManualDateProvider();
    const scoring = new PeerScoring(
      { ...getP2PDefaultConfig(), peerPenaltyValues: [2, 10, 50], peerBanDurationSeconds: banDurationSeconds },
      undefined,
      localDateProvider,
    );
    const bannedPeerId = 'bannedPeer';

    scoring.updateScore(bannedPeerId, -150);
    expect(scoring.getScore(bannedPeerId)).toBe(-150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Banned);
    // Recover the live score so only the ban floor keeps it banned.
    scoring.updateScore(bannedPeerId, 300); // live score now +150

    // Still banned just before the configured window elapses: getScore returns the ban floor.
    localDateProvider.advanceTimeMs(banDurationSeconds * 1000 - 1);
    expect(scoring.getScore(bannedPeerId)).toBe(-150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Banned);

    // Unbanned once it elapses: the recovered live score takes over.
    localDateProvider.advanceTimeMs(2);
    expect(scoring.getScore(bannedPeerId)).toBe(150);
    expect(scoring.getScoreState(bannedPeerId)).toBe(PeerScoreState.Healthy);
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

  test('re-bans a peer whose previous ban has expired', () => {
    const reBanPeerId = 'reBanPeer';
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Initial ban.
    peerScoring.updateScore(reBanPeerId, -150);
    expect(peerScoring.getScoreState(reBanPeerId)).toBe(PeerScoreState.Banned);

    // Let the ban expire without anyone reading the peer's score, so the stale record lingers in the
    // ban map (expired bans are only pruned lazily on read).
    dateProvider.advanceTimeMs(DAY_MS + 1);

    // A fresh offence after expiry must start a new ban window despite the stale record.
    peerScoring.updateScore(reBanPeerId, -150);
    // Recover the live score above the ban threshold so only a fresh ban floor can keep it banned.
    peerScoring.updateScore(reBanPeerId, 200);

    expect(peerScoring.getScore(reBanPeerId)).toBe(-150);
    expect(peerScoring.getScoreState(reBanPeerId)).toBe(PeerScoreState.Banned);
  });

  test('pruneExpiredBans removes expired bans but keeps active ones', () => {
    const expiredPeer = 'expiredBanPeer';
    const activePeer = 'activeBanPeer';

    // Ban the first peer at t0 (expires at t0 + 24h).
    peerScoring.updateScore(expiredPeer, -150);

    // 23h later, ban the second peer (expires at t0 + 47h).
    dateProvider.advanceTimeMs(23 * 60 * 60 * 1000);
    peerScoring.updateScore(activePeer, -150);

    // Advance to t0 + 25h: the first ban has expired, the second is still active. Neither has been
    // read, so both records still linger in the map.
    dateProvider.advanceTimeMs(2 * 60 * 60 * 1000);

    peerScoring.pruneExpiredBans();

    // The sweep dropped the expired ban from the map proactively, without a getScore read, and kept
    // the active one.
    const bannedPeers = (peerScoring as any).bannedPeers as Map<string, unknown>;
    expect(bannedPeers.has(expiredPeer)).toBe(false);
    expect(bannedPeers.has(activePeer)).toBe(true);
  });

  // Regression test for the original advisory (GHSA-h4vv-85x5-6hmh): decayAllScores used to delete a
  // banned peer's decayed score entry, after which getScore returned 0 and the peer was silently
  // restored to Healthy — an effective ~66-minute ban. The ban must keep it Banned.
  test('does not silently restore a banned peer to Healthy after decay (GHSA-h4vv-85x5-6hmh)', async () => {
    const peer = await createSecp256k1PeerId();

    // Ban the peer: 3 x LowToleranceError (50 each) = -150, below MIN_SCORE_BEFORE_BAN (-100).
    peerScoring.penalizePeer(peer, PeerErrorSeverity.LowToleranceError);
    peerScoring.penalizePeer(peer, PeerErrorSeverity.LowToleranceError);
    peerScoring.penalizePeer(peer, PeerErrorSeverity.LowToleranceError);
    expect(peerScoring.getScore(peer.toString())).toBe(-150);
    expect(peerScoring.getScoreState(peer.toString())).toBe(PeerScoreState.Banned);

    // Stay idle long enough that decay drives the live score below SCORE_CLEANUP_THRESHOLD, so
    // decayAllScores removes the entry (the exact mechanism the advisory exploited) — but still
    // within the ban window.
    dateProvider.advanceTimeMs(2 * 60 * 60 * 1000); // 2 hours
    peerScoring.decayAllScores();

    // Previously the decayed live score would have been cleaned up and getScore would have read back
    // 0 (Healthy). The persisted ban score (-150) is returned instead, keeping the peer Banned.
    expect(peerScoring.getScore(peer.toString())).toBe(-150);
    expect(peerScoring.getScoreState(peer.toString())).toBe(PeerScoreState.Banned);
  });
});
