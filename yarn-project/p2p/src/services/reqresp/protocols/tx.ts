import { chunk } from '@aztec/foundation/collection';
import type { P2PClientType } from '@aztec/stdlib/p2p';
import { TxArray, TxHash, TxHashArray } from '@aztec/stdlib/tx';

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
    let txHashes: TxHashArray;
    try {
      txHashes = TxHashArray.fromBuffer(msg);
    } catch (err: any) {
      throw new ReqRespStatusError(ReqRespStatus.BADLY_FORMED_REQUEST, { cause: err });
    }

    try {
      const txs = new TxArray(
        ...(await Promise.all(txHashes.map(txHash => mempools.txPool.getTxByHash(txHash)))).filter(t => !!t),
      );
      return txs.toBuffer();
    } catch (err: any) {
      throw new ReqRespStatusError(ReqRespStatus.INTERNAL_ERROR, { cause: err });
    }
  };
}

/**
 * Helper function to chunk an array of transaction hashes into chunks of a specified size.
 * This is mainly used in ReqResp in order not to request too many transactions at once from the single peer.
 *
 * @param hashes - The array of transaction hashes to chunk.
 * @param chunkSize - The size of each chunk. Default is 8. Reasoning:
 *  Per: https://github.com/AztecProtocol/aztec-packages/issues/15149#issuecomment-2999054485
 *  we define Q as max number of transactions per batch, the comment explains why we use 8.
 */
//TODO: (mralj) chunk size should by default be 8, this is just temporary until the protocol is implemented correctly
//more info:  https://github.com/AztecProtocol/aztec-packages/pull/15516#pullrequestreview-2995474321
export function chunkTxHashesRequest(hashes: TxHash[], chunkSize = 1): Array<TxHashArray> {
  return chunk(hashes, chunkSize).map(chunk => new TxHashArray(...chunk));
}
