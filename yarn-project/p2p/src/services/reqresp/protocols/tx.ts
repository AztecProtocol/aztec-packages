import { P2PClientType } from '@aztec/circuit-types';
import { TxHash } from '@aztec/circuit-types/tx_hash';

import { MemPools } from '../../../mem_pools/interface.js';

/**
 * We want to keep the logic of the req resp handler in this file, but we do not have a reference to the mempools here
 * so we need to pass it in as a parameter.
 *
 * Handler for tx requests
 * @param mempools - the mempools
 * @returns the tx response message
 */
export function reqRespTxHandler<T extends P2PClientType>(mempools: MemPools<T>): (msg: Buffer) => Promise<Buffer> {
  /**
   * Handler for tx requests
   * @param msg - the tx request message
   * @returns the tx response message
   */
  return (msg: Buffer) => {
    const txHash = TxHash.fromBuffer(msg);
    const foundTx = mempools.txPool.getTxByHash(txHash);
    const buf = foundTx ? foundTx.toBuffer() : Buffer.alloc(0);
    return Promise.resolve(buf);
  };
}
