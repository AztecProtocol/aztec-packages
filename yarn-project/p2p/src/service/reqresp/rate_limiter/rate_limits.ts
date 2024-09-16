import { PING_PROTOCOL, type ReqRespSubProtocolRateLimits, STATUS_PROTOCOL, TX_REQ_PROTOCOL } from '../interface.js';

// TODO(md): these defaults need to be tuned
export const DEFAULT_RATE_LIMITS: ReqRespSubProtocolRateLimits = {
  [PING_PROTOCOL]: {
    peerLimit: {
      quotaTimeMs: 1000,
      quotaCount: 5,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 10,
    },
  },
  [STATUS_PROTOCOL]: {
    peerLimit: {
      quotaTimeMs: 1000,
      quotaCount: 5,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 10,
    },
  },
  [TX_REQ_PROTOCOL]: {
    peerLimit: {
      quotaTimeMs: 1000,
      quotaCount: 5,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 10,
    },
  },
};
