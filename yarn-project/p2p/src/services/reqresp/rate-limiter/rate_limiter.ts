/**
 * @attribution Rate limiter approach implemented in the lodestar ethereum 2 client.
 * Rationale is that if it was good enough for them, then it should be good enough for us.
 * https://github.com/ChainSafe/lodestar
 */
import { PeerErrorSeverity } from '@aztec/circuit-types';

import { type PeerId } from '@libp2p/interface';

import { type PeerScoring } from '../../peer-manager/peer_scoring.js';
import { type ReqRespSubProtocol, type ReqRespSubProtocolRateLimits } from '../interface.js';
import { DEFAULT_RATE_LIMITS } from './rate_limits.js';

// Check for disconnected peers every 10 minutes
const CHECK_DISCONNECTED_PEERS_INTERVAL_MS = 10 * 60 * 1000;

/**
 * GCRARateLimiter: A Generic Cell Rate Algorithm (GCRA) based rate limiter.
 *
 * How it works:
 * 1. The rate limiter allows a certain number of operations (quotaCount) within a specified
 *    time interval (quotaTimeMs).
 * 2. It uses a "virtual scheduling time" (VST) to determine when the next operation should be allowed.
 * 3. When an operation is requested, the limiter checks if enough time has passed since the last
 *    allowed operation.
 * 4. If sufficient time has passed, the operation is allowed, and the VST is updated.
 * 5. If not enough time has passed, the operation is denied.
 *
 * The limiter also allows for short bursts of activity, as long as the overall rate doesn't exceed
 * the specified quota over time.
 *
 * Usage example:
 * ```
 * const limiter = new GCRARateLimiter(100, 60000); // 100 operations per minute
 * ```
 */
export class GCRARateLimiter {
  // Virtual scheduling time: i.e. the time at which we should allow the next request
  private vst: number;
  // The interval at which we emit a new token
  private readonly emissionInterval: number;
  // The interval over which we limit the number of requests
  private readonly limitInterval: number;

  /**
   * @param quotaCount - The number of requests to allow over the limit interval
   * @param quotaTimeMs - The time interval over which the quotaCount applies
   */
  constructor(quotaCount: number, quotaTimeMs: number) {
    this.emissionInterval = quotaTimeMs / quotaCount;
    this.limitInterval = quotaTimeMs;
    this.vst = Date.now();
  }

  allow(): boolean {
    const now = Date.now();

    const newVst = Math.max(this.vst, now) + this.emissionInterval;
    if (newVst - now <= this.limitInterval) {
      this.vst = newVst;
      return true;
    }

    return false;
  }
}

interface PeerRateLimiter {
  // The rate limiter for this peer
  limiter: GCRARateLimiter;
  // The last time the peer was accessed - used to determine if the peer is still connected
  lastAccess: number;
}

enum RateLimitStatus {
  Allowed,
  DeniedGlobal,
  DeniedPeer,
}

/**
 * SubProtocolRateLimiter: A rate limiter for managing request rates on a per-peer and global basis for a specific subprotocol.
 *
 * This class provides a two-tier rate limiting system:
 * 1. A global rate limit for all requests across all peers for this subprotocol.
 * 2. Individual rate limits for each peer.
 *
 * How it works:
 * - When a request comes in, it first checks against the global rate limit.
 * - If the global limit allows, it then checks against the specific peer's rate limit.
 * - The request is only allowed if both the global and peer-specific limits allow it.
 * - It automatically creates and manages rate limiters for new peers as they make requests.
 * - It periodically cleans up rate limiters for inactive peers to conserve memory.
 *
 * Note: Remember to call `start()` to begin the cleanup process and `stop()` when shutting down to clear the cleanup interval.
 */
export class SubProtocolRateLimiter {
  private peerLimiters: Map<string, PeerRateLimiter> = new Map();
  private globalLimiter: GCRARateLimiter;
  private readonly peerQuotaCount: number;
  private readonly peerQuotaTimeMs: number;

  constructor(peerQuotaCount: number, peerQuotaTimeMs: number, globalQuotaCount: number, globalQuotaTimeMs: number) {
    this.peerLimiters = new Map();
    this.globalLimiter = new GCRARateLimiter(globalQuotaCount, globalQuotaTimeMs);
    this.peerQuotaCount = peerQuotaCount;
    this.peerQuotaTimeMs = peerQuotaTimeMs;
  }

  allow(peerId: PeerId): RateLimitStatus {
    if (!this.globalLimiter.allow()) {
      return RateLimitStatus.DeniedGlobal;
    }

    const peerIdStr = peerId.toString();
    let peerLimiter: PeerRateLimiter | undefined = this.peerLimiters.get(peerIdStr);
    if (!peerLimiter) {
      // Create a limiter for this peer
      peerLimiter = {
        limiter: new GCRARateLimiter(this.peerQuotaCount, this.peerQuotaTimeMs),
        lastAccess: Date.now(),
      };
      this.peerLimiters.set(peerIdStr, peerLimiter);
    } else {
      peerLimiter.lastAccess = Date.now();
    }
    const peerLimitAllowed = peerLimiter.limiter.allow();
    if (!peerLimitAllowed) {
      return RateLimitStatus.DeniedPeer;
    }
    return RateLimitStatus.Allowed;
  }

  cleanupInactivePeers() {
    const now = Date.now();
    this.peerLimiters.forEach((peerLimiter, peerId) => {
      if (now - peerLimiter.lastAccess > CHECK_DISCONNECTED_PEERS_INTERVAL_MS) {
        this.peerLimiters.delete(peerId);
      }
    });
  }
}

/**
 * RequestResponseRateLimiter.
 *
 * A rate limiter that is protocol aware, then peer aware.
 * SubProtocols can have their own global / peer level rate limits.
 *
 * How it works:
 * - Initializes with a set of rate limit configurations for different subprotocols.
 * - Creates a separate SubProtocolRateLimiter for each configured subprotocol.
 * - When a request comes in, it routes the rate limiting decision to the appropriate subprotocol limiter.
 * - Peers who exceed their peer rate limits will be penalised by the peer manager.
 *
 * Usage:
 * ```
 * const peerManager = new PeerManager(...);
 * const rateLimits = {
 *   subprotocol1: { peerLimit: { quotaCount: 10, quotaTimeMs: 1000 }, globalLimit: { quotaCount: 100, quotaTimeMs: 1000 } },
 *   subprotocol2: { peerLimit: { quotaCount: 5, quotaTimeMs: 1000 }, globalLimit: { quotaCount: 50, quotaTimeMs: 1000 } }
 * };
 * const limiter = new RequestResponseRateLimiter(peerManager, rateLimits);
 *
 * Note: Ensure to call `stop()` when shutting down to properly clean up all subprotocol limiters.
 */
export class RequestResponseRateLimiter {
  private subProtocolRateLimiters: Map<ReqRespSubProtocol, SubProtocolRateLimiter>;

  private cleanupInterval: NodeJS.Timeout | undefined = undefined;

  constructor(private peerScoring: PeerScoring, rateLimits: ReqRespSubProtocolRateLimits = DEFAULT_RATE_LIMITS) {
    this.subProtocolRateLimiters = new Map();

    for (const [subProtocol, protocolLimits] of Object.entries(rateLimits)) {
      this.subProtocolRateLimiters.set(
        subProtocol as ReqRespSubProtocol,
        new SubProtocolRateLimiter(
          protocolLimits.peerLimit.quotaCount,
          protocolLimits.peerLimit.quotaTimeMs,
          protocolLimits.globalLimit.quotaCount,
          protocolLimits.globalLimit.quotaTimeMs,
        ),
      );
    }
  }

  start() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactivePeers();
    }, CHECK_DISCONNECTED_PEERS_INTERVAL_MS);
  }

  allow(subProtocol: ReqRespSubProtocol, peerId: PeerId): boolean {
    const limiter = this.subProtocolRateLimiters.get(subProtocol);
    if (!limiter) {
      return true;
    }
    const rateLimitStatus = limiter.allow(peerId);

    switch (rateLimitStatus) {
      case RateLimitStatus.DeniedPeer:
        this.peerScoring.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        return false;
      case RateLimitStatus.DeniedGlobal:
        return false;
      default:
        return true;
    }
  }

  cleanupInactivePeers() {
    this.subProtocolRateLimiters.forEach(limiter => limiter.cleanupInactivePeers());
  }

  /**
   * Make sure to call destroy on each of the sub protocol rate limiters when cleaning up
   */
  stop() {
    clearInterval(this.cleanupInterval);
  }
}
