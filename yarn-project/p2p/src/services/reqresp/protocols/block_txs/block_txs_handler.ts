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
export function reqRespBlockTxsHandler(
  attestationPool: AttestationPool | undefined,
  txPool: TxPool,
): ReqRespSubProtocolHandler {
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

    const blockProposal = await attestationPool?.getBlockProposal(request.blockHash.toString());

    if (!blockProposal) {
      throw new ReqRespStatusError(ReqRespStatus.NOT_FOUND);
    }

    if (blockProposal.blockNumber !== request.blockNumber) {
      throw new ReqRespStatusError(ReqRespStatus.FAILURE, {
        cause: new Error(
          `Requested block proposal number: ${request.blockNumber} does not match the proposal number: ${blockProposal.blockNumber}`,
        ),
      });
    }

    const requestedIndices = new Set(request.txIndices.getTrueIndices());
    const requestedTxsHashes = new Set(blockProposal.txHashes.filter((_, idx) => requestedIndices.has(idx)));

    // Fetch all transactions from the pool belonging to the proposal
    const txsFromPool = await txPool.getTxsByHash(blockProposal.txHashes);
    // Calculate hashes for all transactions we fetched from the pool
    await Promise.all(txsFromPool.map(tx => tx?.getTxHash()));
    const txsWithHash = txsFromPool as (TxWithHash | undefined)[];

    // Respond with requested transactions that are available in the pool
    const responseTxs: TxWithHash[] = txsWithHash.filter(
      (tx): tx is TxWithHash => tx !== undefined && requestedTxsHashes.has(tx.txHash),
    );

    const availableIndices = txsWithHash.map((tx, idx) => (tx === undefined ? -1 : idx)).filter(idx => idx !== -1);
    const responseBitVector = BitVector.init(blockProposal.txHashes.length, availableIndices);

    const response = new BlockTxsResponse(
      request.blockNumber,
      request.blockHash,
      new TxArray(...responseTxs),
      responseBitVector,
    );

    return response.toBuffer();
  };
}
