import { TxArray, type TxWithHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { AttestationPool } from '../../../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPool } from '../../../../mem_pools/index.js';
import type { ReqRespSubProtocolHandler } from '../../interface.js';
import { ReqRespStatus, ReqRespStatusError } from '../../status.js';
import { BitVector } from './bitvector.js';
import { BlockTxsRequest, BlockTxsResponse } from './block_txs_reqresp.js';

/**
 * Handler for block txs requests
 * @param attestationPool - the attestation pool to check for block proposals
 * @param mempools - the mempools containing the tx pool
 * @returns the BlockTxs request handler
 */
export function reqRespBlockTxsHandler(attestationPool: AttestationPool, txPool: TxPool): ReqRespSubProtocolHandler {
  /**
   * Handler for block txs requests
   * @param msg - the block txs request message
   * @returns the block txs response message
   * @throws if msg is not a valid block txs request
   */
  return async (_peerId: PeerId, msg: Buffer) => {
    let request: BlockTxsRequest;
    try {
      request = BlockTxsRequest.fromBuffer(msg);
    } catch (err: any) {
      throw new ReqRespStatusError(ReqRespStatus.BADLY_FORMED_REQUEST, { cause: err });
    }

    const blockProposal = await attestationPool.getBlockProposal(request.blockHash.toString());

    if (!blockProposal) {
      throw new ReqRespStatusError(ReqRespStatus.NOT_FOUND);
    }

    const txsAvailableInPool = await txPool.hasTxs(blockProposal.txHashes);
    //Map txs in the pool to their indices in the block proposal
    const availableIndices = txsAvailableInPool.map((hasTx, idx) => (hasTx ? idx : -1)).filter(idx => idx !== -1);
    const responseBitVector = BitVector.init(blockProposal.txHashes.length, availableIndices);

    const requestedIndices = new Set(request.txIndices.getTrueIndices());
    const requestedTxsHashes = blockProposal.txHashes.filter((_, idx) => requestedIndices.has(idx));

    const responseTxs = (await txPool.getTxsByHash(requestedTxsHashes)).filter(tx => !!tx);

    const response = new BlockTxsResponse(request.blockHash, new TxArray(...responseTxs), responseBitVector);

    return response.toBuffer();
  };
}
