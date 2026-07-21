import { TxArray, TxHashArray } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { P2PReqRespConfig } from './config.js';
import type { ConnectionSampler } from './connection-sampler/connection_sampler.js';
import { AuthRequest, AuthResponse } from './protocols/auth.js';
import {
  BlockTxsRequest,
  BlockTxsResponse,
  calculateBlockTxsResponseSize,
} from './protocols/block_txs/block_txs_reqresp.js';
import { StatusMessage } from './protocols/status.js';
import { calculateTxResponseSize } from './protocols/tx.js';
import type { ReqRespStatus } from './status.js';

/*
 * Request Response Sub Protocols
 */
export const PING_PROTOCOL = '/aztec/req/ping/1.0.0';
export const STATUS_PROTOCOL = '/aztec/req/status/1.0.0';
export const GOODBYE_PROTOCOL = '/aztec/req/goodbye/1.0.0';
export const TX_REQ_PROTOCOL = '/aztec/req/tx/1.0.0';
export const AUTH_PROTOCOL = '/aztec/req/auth/1.0.0';
export const BLOCK_TXS_REQ_PROTOCOL = '/aztec/req/block_txs/1.0.0';

export enum ReqRespSubProtocol {
  PING = PING_PROTOCOL,
  STATUS = STATUS_PROTOCOL,
  GOODBYE = GOODBYE_PROTOCOL,
  TX = TX_REQ_PROTOCOL,
  AUTH = AUTH_PROTOCOL,
  BLOCK_TXS = BLOCK_TXS_REQ_PROTOCOL,
}

/**
 * A handler for a sub protocol
 * The message will arrive as a buffer, and the handler must return a buffer
 */
export type ReqRespSubProtocolHandler = (peerId: PeerId, msg: Buffer) => Promise<Buffer>;

/**
 * A type mapping from supprotocol to it's rate limits
 */
export type ReqRespSubProtocolRateLimits = Record<ReqRespSubProtocol, ProtocolRateLimitQuota>;

/**
 * The response from the ReqResp protocol
 * Consists of a status
 * And, optionally, a data buffer (in case status is SUCCESS)
 */
export type ReqRespResponse =
  | { status: ReqRespStatus.SUCCESS; data: Buffer }
  | { status: Exclude<ReqRespStatus, ReqRespStatus.SUCCESS> };

/**
 * A rate limit quota
 */
export interface RateLimitQuota {
  /**
   * The time window in ms
   */
  quotaTimeMs: number;
  /**
   * The number of requests allowed within the time window
   */
  quotaCount: number;
}

export interface ProtocolRateLimitQuota {
  /**
   * The rate limit quota for a single peer
   */
  peerLimit: RateLimitQuota;
  /**
   * The rate limit quota for the global peer set
   */
  globalLimit: RateLimitQuota;
}

/**
 * A type mapping from supprotocol to it's handling function
 */
export type ReqRespSubProtocolHandlers = Record<ReqRespSubProtocol, ReqRespSubProtocolHandler>;

/**
 * Protocols that are always allowed without authentication, even when p2pAllowOnlyValidators is enabled.
 * These are needed for the handshake and connection management flow.
 * All other protocols require the remote peer to be authenticated.
 */
export const UNAUTHENTICATED_ALLOWED_PROTOCOLS: ReadonlySet<ReqRespSubProtocol> = new Set([
  ReqRespSubProtocol.PING,
  ReqRespSubProtocol.STATUS,
  ReqRespSubProtocol.AUTH,
  ReqRespSubProtocol.GOODBYE,
]);

/**
 * Callback that checks whether a peer should be rejected from req/resp data protocols.
 * Returns true if the peer should be rejected (i.e. p2pAllowOnlyValidators is on and peer is unauthenticated).
 */
export type ShouldRejectPeer = (peerId: string) => boolean;

/*
 * Helper class to sub-protocol validation error*/
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Sub protocol map determines the request and response types for each
 * Req Resp protocol
 */
export type SubProtocolMap = {
  [S in ReqRespSubProtocol]: RequestResponsePair<
    InstanceType<(typeof subProtocolMap)[S]['request']>,
    InstanceType<(typeof subProtocolMap)[S]['response']>
  >;
};

/**
 * The Request Response Pair interface defines the methods that each
 * request response pair must implement
 */
interface RequestResponsePair<Req extends { toBuffer(): Buffer }, Res> {
  /**
   * The request must implement the toBuffer method (generic serialisation)
   */
  request: new (...args: any[]) => Req;
  /**
   * The response must implement the static fromBuffer method (generic serialisation)
   */
  response: {
    new (...args: any[]): Res;
    fromBuffer(buffer: Buffer): Res;
  };
}

/*
 * Small helper function which parses buffer into specific response type
 * It is needed to make TypeScript happy, as it cannot infer the type from the buffer
 *
 * @param proto - The sub protocol to parse the response for
 * @param buffer - The buffer to parse
 *
 * @returns - The parsed response object
 * */
export function responseFromBuffer<P extends ReqRespSubProtocol>(
  proto: P,
  buffer: Buffer,
): InstanceType<(typeof subProtocolMap)[P]['response']> {
  return subProtocolMap[proto].response.fromBuffer(buffer) as InstanceType<(typeof subProtocolMap)[P]['response']>;
}

/**
 * RequestableBuffer is a wrapper around a buffer that allows it to be
 * used in generic request response protocols
 *
 * An instance of the RequestResponsePair defined above
 */
export class RequestableBuffer {
  constructor(public buffer: Buffer) {}

  toBuffer() {
    return this.buffer;
  }

  static fromBuffer(buffer: Buffer) {
    return new RequestableBuffer(buffer);
  }
}

/**
 * A mapping from each protocol to their request and response types
 * This defines the request and response types for each sub protocol, used primarily
 * as a type rather than an object
 */
export const subProtocolMap = {
  [ReqRespSubProtocol.PING]: {
    request: RequestableBuffer,
    response: RequestableBuffer,
  },
  [ReqRespSubProtocol.STATUS]: {
    request: StatusMessage,
    response: StatusMessage,
  },
  [ReqRespSubProtocol.TX]: {
    request: TxHashArray,
    response: TxArray,
  },
  [ReqRespSubProtocol.GOODBYE]: {
    request: RequestableBuffer,
    response: RequestableBuffer,
  },
  [ReqRespSubProtocol.AUTH]: {
    request: AuthRequest,
    response: AuthResponse,
  },
  [ReqRespSubProtocol.BLOCK_TXS]: {
    request: BlockTxsRequest,
    response: BlockTxsResponse,
  },
};

/**
 * Type for a function that calculates the expected response size in KB for a given request.
 */
export type ExpectedResponseSizeCalculator = (requestBuffer: Buffer) => number;

/**
 * Map of sub-protocols to their expected response size calculators.
 * These are used to validate that responses don't exceed expected sizes based on request parameters.
 */
export const subProtocolSizeCalculators: Record<ReqRespSubProtocol, ExpectedResponseSizeCalculator> = {
  [ReqRespSubProtocol.TX]: calculateTxResponseSize,
  [ReqRespSubProtocol.BLOCK_TXS]: calculateBlockTxsResponseSize,
  [ReqRespSubProtocol.STATUS]: () => 1,
  [ReqRespSubProtocol.PING]: () => 1,
  [ReqRespSubProtocol.AUTH]: () => 1,
  [ReqRespSubProtocol.GOODBYE]: () => 1, // No response expected, but provide minimal limit
};

export interface ReqRespInterface {
  start(subProtocolHandlers: Partial<ReqRespSubProtocolHandlers>): Promise<void>;
  addSubProtocol(subProtocol: ReqRespSubProtocol, handler: ReqRespSubProtocolHandler): Promise<void>;
  stop(): Promise<void>;
  sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
    dialTimeout?: number,
  ): Promise<ReqRespResponse>;

  updateConfig(config: Partial<P2PReqRespConfig>): void;

  /** Sets the callback used to reject unauthenticated peers on gated req/resp protocols. */
  setShouldRejectPeer(checker: ShouldRejectPeer): void;

  getConnectionSampler(): Pick<ConnectionSampler, 'getPeerListSortedByConnectionCountAsc'>;
}
