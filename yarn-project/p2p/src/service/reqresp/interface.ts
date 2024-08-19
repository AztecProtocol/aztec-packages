export enum ReqRespType {
  Status = 'status',
  Ping = 'ping',
  /** Ask peers for specific transactions */
  TxsByHash = 'txs_by_hash',
}

export const PING_PROTOCOL: string = '/aztec/ping/0.1.0';
export const STATUS_PROTOCOL: string = '/aztec/status/0.1.0';
