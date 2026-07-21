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
      quotaCount: 50,
    },
  },
  [ReqRespSubProtocol.STATUS]: {
    peerLimit: {
      quotaTimeMs: 1000,
      quotaCount: 5,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 50,
    },
  },
  [ReqRespSubProtocol.AUTH]: {
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
      quotaCount: 10,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 200,
    },
  },
  [ReqRespSubProtocol.GOODBYE]: {
    peerLimit: {
      quotaTimeMs: 1000,
      quotaCount: 5,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 50,
    },
  },
  [ReqRespSubProtocol.BLOCK_TXS]: {
    peerLimit: {
      quotaTimeMs: 1000,
      quotaCount: 10,
    },
    globalLimit: {
      quotaTimeMs: 1000,
      quotaCount: 200,
    },
  },
};
