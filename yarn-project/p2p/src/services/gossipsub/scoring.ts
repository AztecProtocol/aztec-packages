import type { PeerScoreThresholds } from '@chainsafe/libp2p-gossipsub/score';

/**
 * Weight applied to application-level peer scores before contributing to gossipsub score.
 *
 * Note: positive topic scores can partially offset app penalties, so alignment with
 * app-level thresholds is best-effort rather than strict.
 */
export const APP_SPECIFIC_WEIGHT = 10;

/**
 * Gossipsub peer score thresholds aligned with application-level scoring.
 *
 * These thresholds work with appSpecificWeight=10 to align gossipsub behavior
 * with application-level peer states (Healthy → Disconnect → Banned).
 *
 * Alignment:
 * - gossipThreshold (-500): Matches Disconnect state (app score -50 × weight 10)
 * - publishThreshold (-1000): Matches Ban state (app score -100 × weight 10)
 * - graylistThreshold (-2000): For severe attacks (ban + topic penalties)
 *
 * The 1:2:4 ratio follows Lodestar's approach and gossipsub spec recommendations.
 *
 * @see https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md#peer-scoring
 */
export const gossipScoreThresholds: PeerScoreThresholds = {
  /** Below this, peer is not gossiped to (matches Disconnect state) */
  gossipThreshold: -500,
  /** Below this, self-published messages are not propagated to peer (matches Ban state) */
  publishThreshold: -1000,
  /** Below this, all RPCs from peer are ignored (severe attack scenario) */
  graylistThreshold: -2000,
  /** Above this, peer can offer peer exchange (PX) */
  acceptPXThreshold: 100,
  /** Above this, peer can be grafted to mesh opportunistically */
  opportunisticGraftThreshold: 5,
};
