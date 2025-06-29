import type { P2PClientType } from '@aztec/stdlib/p2p';
import { TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { MemPools } from '../../../mem_pools/interface.js';
import type { ReqRespSubProtocolHandler } from '../interface.js';
import { ReqRespStatus, ReqRespStatusError } from '../status.js';

/**
 * We want to keep the logic of the req resp handler in this file, but we do not have a reference to the mempools here
 * so we need to pass it in as a parameter.
 *
 * Handler for tx requests
 * @param mempools - the mempools
 * @returns the Tx request handler
 */
export function reqRespTxHandler<T extends P2PClientType>(mempools: MemPools<T>): ReqRespSubProtocolHandler {
  /**
   * Handler for tx requests
   * @param msg - the tx request message
   * @returns the tx response message
   * @throws if msg is not a valid tx hash
   */
  return async (_peerId: PeerId, msg: Buffer) => {
    try {
      const txHash = TxHash.fromBuffer(msg);
      const foundTx = await mempools.txPool.getTxByHash(txHash);
      const buf = foundTx ? foundTx.toBuffer() : Buffer.alloc(0);
      return buf;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      // This is ok, because the only thing that can go wrong is parsing tx hash
      throw new ReqRespStatusError(ReqRespStatus.BADLY_FORMED_REQUEST);
    }
  };
}
