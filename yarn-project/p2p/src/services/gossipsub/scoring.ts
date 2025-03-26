import type { PeerScoreThresholds } from '@chainsafe/libp2p-gossipsub/score';

/**
 * The following params is implemented by Lighthouse at
 * https://github.com/sigp/lighthouse/blob/b0ac3464ca5fb1e9d75060b56c83bfaf990a3d25/beacon_node/eth2_libp2p/src/behaviour/gossipsub_scoring_parameters.rs#L83
 */
export const gossipScoreThresholds: PeerScoreThresholds = {
  gossipThreshold: -4000,
  publishThreshold: -8000,
  graylistThreshold: -16000,
  acceptPXThreshold: 100,
  opportunisticGraftThreshold: 5,
};
