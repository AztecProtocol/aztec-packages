import { Fr } from '@aztec/foundation/fields';
import { L2Block } from '@aztec/stdlib/block';
import { TxArray, TxHashArray } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import { AuthRequest, AuthResponse } from './protocols/auth.js';
import { StatusMessage } from './protocols/status.js';
import type { ReqRespStatus } from './status.js';

/*
 * Request Response Sub Protocols
 */
export const PING_PROTOCOL = '/aztec/req/ping/0.1.0';
export const STATUS_PROTOCOL = '/aztec/req/status/0.1.0';
export const GOODBYE_PROTOCOL = '/aztec/req/goodbye/0.1.0';
export const TX_REQ_PROTOCOL = '/aztec/req/tx/0.1.0';
export const BLOCK_REQ_PROTOCOL = '/aztec/req/block/0.1.0';
export const AUTH_PROTOCOL = '/aztec/req/auth/0.1.0';

export enum ReqRespSubProtocol {
  PING = PING_PROTOCOL,
  STATUS = STATUS_PROTOCOL,
  GOODBYE = GOODBYE_PROTOCOL,
  TX = TX_REQ_PROTOCOL,
  BLOCK = BLOCK_REQ_PROTOCOL,
  AUTH = AUTH_PROTOCOL,
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

export const noopValidator = () => Promise.resolve(true);

/**
 * A type mapping from supprotocol to it's handling function
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
  [ReqRespSubProtocol.PING]: noopValidator,
  [ReqRespSubProtocol.STATUS]: noopValidator,
  [ReqRespSubProtocol.TX]: noopValidator,
  [ReqRespSubProtocol.GOODBYE]: noopValidator,
  [ReqRespSubProtocol.BLOCK]: noopValidator,
  [ReqRespSubProtocol.AUTH]: noopValidator,
};

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
 * Default handler for unimplemented sub protocols, this SHOULD be overwritten
 * by the service, but is provided as a fallback
 */
export const defaultHandler = (_msg: any): Promise<Buffer> => {
  return Promise.resolve(Buffer.from('unimplemented'));
};

/**
 * Default sub protocol handlers - this SHOULD be overwritten by the service,
 */
export const DEFAULT_SUB_PROTOCOL_HANDLERS: ReqRespSubProtocolHandlers = {
  [ReqRespSubProtocol.PING]: defaultHandler,
  [ReqRespSubProtocol.STATUS]: defaultHandler,
  [ReqRespSubProtocol.TX]: defaultHandler,
  [ReqRespSubProtocol.GOODBYE]: defaultHandler,
  [ReqRespSubProtocol.BLOCK]: defaultHandler,
  [ReqRespSubProtocol.AUTH]: defaultHandler,
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
  [ReqRespSubProtocol.BLOCK]: {
    request: Fr, // block number
    response: L2Block,
  },
  [ReqRespSubProtocol.AUTH]: {
    request: AuthRequest,
    response: AuthResponse,
  },
};

export interface ReqRespInterface {
  start(
    subProtocolHandlers: Partial<ReqRespSubProtocolHandlers>,
    subProtocolValidators: ReqRespSubProtocolValidators,
  ): Promise<void>;
  addSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void>;
  stop(): Promise<void>;
  sendBatchRequest<SubProtocol extends ReqRespSubProtocol>(
    subProtocol: SubProtocol,
    requests: InstanceType<SubProtocolMap[SubProtocol]['request']>[],
    pinnedPeer: PeerId | undefined,
    timeoutMs?: number,
    maxPeers?: number,
    maxRetryAttempts?: number,
  ): Promise<InstanceType<SubProtocolMap[SubProtocol]['response']>[]>;
  sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
    dialTimeout?: number,
  ): Promise<ReqRespResponse>;
}
