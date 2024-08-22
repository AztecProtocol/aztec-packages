import { Tx, TxHash } from "@aztec/circuit-types";

export enum ReqRespType {
  Status = 'status',
  Ping = 'ping',
  /** Ask peers for specific transactions */
  TxsByHash = 'txs_by_hash',
}

// TODO: map version to one place
export const PING_PROTOCOL = '/aztec/ping/0.1.0';
export const STATUS_PROTOCOL = '/aztec/status/0.1.0';
export const TX_REQ_PROTOCOL = '/aztec/tx_req/0.1.0';

export type SubProtocol = typeof PING_PROTOCOL | typeof STATUS_PROTOCOL | typeof TX_REQ_PROTOCOL;

export type SubProtocolHandler = (msg: string) => Uint8Array;

/**
 * RequestableBuffer is a wrapper around a buffer that allows it to be
 * used in generic request response protocols
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

// The Request Response Pair interface defines the methods that each
// request response pair must implement
interface RequestResponsePair<Req, Res> {
  request: new (...args: any[]) => Req;
  response: {
    new (...args: any[]): Res;
    fromBuffer(buffer: Buffer): Res;
  };
}


/**
 * Sub protocol map determines the request and response types for each
 * Req Resp protocol
 */
export type SubProtocolMap = {
  [S in SubProtocol]: RequestResponsePair<any, any>;
}


/**
 * A mapping from each protocol to their request and response types
 */
export const subProtocolMap: SubProtocolMap = {
  [PING_PROTOCOL]: {
    request: RequestableBuffer,
    response: RequestableBuffer
  },
  [STATUS_PROTOCOL]: {
    request: RequestableBuffer,
    response: RequestableBuffer
  },
  [TX_REQ_PROTOCOL]: {
    request: TxHash,
    response: Tx
  },
}
