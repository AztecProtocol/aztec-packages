/**
 * @attribution Rate limiter approach implemented in the lodestar ethereum 2 client.
 * Rationale is that if it was good enough for them, then it should be good enough for us.
 * https://github.com/ChainSafe/lodestar
 */

import { ReqRespSubProtocol, ReqRespSubProtocolRateLimits, TX_REQ_PROTOCOL } from "../interface.js";
import { PeerId } from "@libp2p/interface";
import { DEFAULT_RATE_LIMITS } from "./rate_limits.js";

// Check for disconnected peers every 10 minutes
// at which time we will clean up their rate limits
// TODO(md): setup a job that will run this cleanup functionality periodically
const CHECK_DISCONNECTED_PEERS_INTERVAL_MS = 10 * 60 * 1000;

// TODO: make this a nice interface like in the requests that takes the SubProtocol and defines the rate limits
// can probably borrow the types from there


class GCRARateLimiter {
    private vst: number;
    private readonly emissionInterval: number;
    private readonly limitInterval: number;

    constructor(quotaCount: number, quotaTimeMs: number) {
        this.emissionInterval = quotaTimeMs / quotaCount;
        this.limitInterval = quotaTimeMs;
        this.vst = Date.now();
    }

    allow(): boolean {
        const now = Date.now();
        const newVst = Math.max(now, this.vst + this.emissionInterval);

        if (newVst - now > this.limitInterval) {
            this.vst = newVst;
            return true;
        }

        return false;
    }
}

interface PeerRateLimiter {
    limiter: GCRARateLimiter;
    lastAccess: number;
}

class SubProtocolRateLimiter {
    private peerLimiters: Map<string, PeerRateLimiter> = new Map();
    private globalLimiter: GCRARateLimiter;
    private readonly peerRate: number;
    private readonly peerBurst: number;

    // TODO:DOC
    private readonly cleanupInterval: NodeJS.Timeout;

    constructor(peerRate: number, peerBurst: number, globalRate: number, globalBurst: number) {
        this.peerLimiters = new Map();
        this.globalLimiter = new GCRARateLimiter(globalRate, globalBurst);
        this.peerRate = peerRate;
        this.peerBurst = peerBurst;

        this.cleanupInterval = setInterval(() => {
            this.cleanupInactivePeers();
        }, CHECK_DISCONNECTED_PEERS_INTERVAL_MS);
    }

    allow(peerId: PeerId): boolean {
        if (!this.globalLimiter.allow()) {
            return false;
        }

        const peerIdStr = peerId.toString();
        let peerLimiter: PeerRateLimiter | undefined = this.peerLimiters.get(peerIdStr);
        if (!peerLimiter) {
            // Create a limiter for this peer
            peerLimiter = {
                limiter: new GCRARateLimiter(this.peerRate, this.peerBurst),
                lastAccess: Date.now(),
            };
            this.peerLimiters.set(peerIdStr, peerLimiter);
        } else {
            peerLimiter.lastAccess = Date.now();
        }
        return peerLimiter.limiter.allow();
    }

    private cleanupInactivePeers() {
        const now = Date.now();
        this.peerLimiters.forEach((peerLimiter, peerId) => {
            if (now - peerLimiter.lastAccess > CHECK_DISCONNECTED_PEERS_INTERVAL_MS) {
                this.peerLimiters.delete(peerId);
            }
        });
    }

    /**
     * Make sure to call destroy on each of the sub protocol rate limiters when cleaning up
     */
    destroy() {
        clearInterval(this.cleanupInterval);
    }
}

export class RequestResponseRateLimiter {
    private subProtocolRateLimiters: Map<ReqRespSubProtocol, SubProtocolRateLimiter>;

    constructor(rateLimits: ReqRespSubProtocolRateLimits = DEFAULT_RATE_LIMITS) {
        this.subProtocolRateLimiters = new Map();

        for (const [subProtocol, protocolLimits] of Object.entries(rateLimits)) {
            this.subProtocolRateLimiters.set(
                subProtocol as ReqRespSubProtocol,
                new SubProtocolRateLimiter(
                    protocolLimits.peerLimit.quotaCount,
                    protocolLimits.peerLimit.quotaTimeMs,
                    protocolLimits.globalLimit.quotaCount,
                    protocolLimits.globalLimit.quotaTimeMs
                ));
        }
    }

    allow(subProtocol: ReqRespSubProtocol, peerId: PeerId): boolean {
        const limiter = this.subProtocolRateLimiters.get(subProtocol);
        if (!limiter) {
            // TODO: maybe throw an error here if no rate limiter is configured?
            return true;
        }
        return limiter.allow(peerId);
    }

    destroy() {
        this.subProtocolRateLimiters.forEach((limiter) => limiter.destroy());
    }
}

