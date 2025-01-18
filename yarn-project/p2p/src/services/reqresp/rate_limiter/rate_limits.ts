import { ReqRespSubProtocol, type ReqRespSubProtocolRateLimits } from '../interface.js';

// TODO(md): these defaults need to be tuned
export const DEFAULT_RATE_LIMITS: ReqRespSubProtocolRateLimits = {
  [ReqRespSubProtocol.PING]: {
    peerLimit: {
      quotaTimeMs: 1000,
      quotaCount: 5,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 10,
    },
  },
  [ReqRespSubProtocol.STATUS]: {
    peerLimit: {
      quotaTimeMs: 1000,
      quotaCount: 5,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 10,
    },
  },
  [ReqRespSubProtocol.TX]: {
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
