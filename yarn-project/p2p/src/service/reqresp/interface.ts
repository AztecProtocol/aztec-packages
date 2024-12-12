import { Tx, TxHash } from '@aztec/circuit-types';

import { type PeerId } from '@libp2p/interface';

/*
 * Request Response Sub Protocols
 */
export const PING_PROTOCOL = '/aztec/req/ping/0.1.0';
export const STATUS_PROTOCOL = '/aztec/req/status/0.1.0';
export const TX_REQ_PROTOCOL = '/aztec/req/tx/0.1.0';

// Sum type for sub protocols
export type ReqRespSubProtocol = typeof PING_PROTOCOL | typeof STATUS_PROTOCOL | typeof TX_REQ_PROTOCOL;

/**
 * A handler for a sub protocol
 * The message will arrive as a buffer, and the handler must return a buffer
 */
export type ReqRespSubProtocolHandler = (msg: Buffer) => Promise<Buffer>;

/**
 * A type mapping from supprotocol to it's rate limits
 */
export type ReqRespSubProtocolRateLimits = Record<ReqRespSubProtocol, ProtocolRateLimitQuota>;

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

export const noopValidator = () => Promise.resolve(true);

/**
 * A type mapping from supprotocol to it's handling funciton
 */
export type ReqRespSubProtocolHandlers = Record<ReqRespSubProtocol, ReqRespSubProtocolHandler>;

type ResponseValidator<RequestIdentifier, Response> = (
  request: RequestIdentifier,
  response: Response,
  peerId: PeerId,
) => Promise<boolean>;

export type ReqRespSubProtocolValidators = {
  [S in ReqRespSubProtocol]: ResponseValidator<any, any>;
};

export const DEFAULT_SUB_PROTOCOL_VALIDATORS: ReqRespSubProtocolValidators = {
  [PING_PROTOCOL]: noopValidator,
  [STATUS_PROTOCOL]: noopValidator,
  [TX_REQ_PROTOCOL]: noopValidator,
};

/**
 * Sub protocol map determines the request and response types for each
 * Req Resp protocol
 */
export type SubProtocolMap = {
  [S in ReqRespSubProtocol]: RequestResponsePair<any, any>;
};

/**
 * Default handler for unimplemented sub protocols, this SHOULD be overwritten
 * by the service, but is provided as a fallback
 */
const defaultHandler = (_msg: any): Promise<Buffer> => {
  return Promise.resolve(Buffer.from('unimplemented'));
};

/**
 * Default sub protocol handlers - this SHOULD be overwritten by the service,
 */
export const DEFAULT_SUB_PROTOCOL_HANDLERS: ReqRespSubProtocolHandlers = {
  [PING_PROTOCOL]: defaultHandler,
  [STATUS_PROTOCOL]: defaultHandler,
  [TX_REQ_PROTOCOL]: defaultHandler,
};

/**
 * The Request Response Pair interface defines the methods that each
 * request response pair must implement
 */
interface RequestResponsePair<Req, Res> {
  request: new (...args: any[]) => Req;
  /**
   * The response must implement the static fromBuffer method (generic serialisation)
   */
  response: {
    new (...args: any[]): Res;
    fromBuffer(buffer: Buffer): Res;
  };
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
export const subProtocolMap: SubProtocolMap = {
  [PING_PROTOCOL]: {
    request: RequestableBuffer,
    response: RequestableBuffer,
  },
  [STATUS_PROTOCOL]: {
    request: RequestableBuffer,
    response: RequestableBuffer,
  },
  [TX_REQ_PROTOCOL]: {
    request: TxHash,
    response: Tx,
  },
};
