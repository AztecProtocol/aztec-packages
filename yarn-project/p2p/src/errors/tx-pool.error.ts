import type { TxPoolRejectionError } from '../mem_pools/tx_pool_v2/eviction/interfaces.js';

/** Error thrown when a transaction is not added to the mempool. */
export class TxPoolError extends Error {
  public readonly data: TxPoolRejectionError;

  constructor(public readonly reason: TxPoolRejectionError) {
    super(reason.message);
    this.name = 'TxPoolError';
    this.data = reason;
  }
}
