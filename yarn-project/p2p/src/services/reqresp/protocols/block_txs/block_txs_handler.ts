import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { TxArray } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { AttestationPool, TxPool } from '../../../../mem_pools/index.js';
import type { ReqRespSubProtocolHandler } from '../../interface.js';
import { ReqRespStatus, ReqRespStatusError } from '../../status.js';
import { BitVector } from './bitvector.js';
import { BlockTxsRequest, BlockTxsResponse } from './block_txs_reqresp.js';

/**
 * Handler for block txs requests
 * @param attestationPool - the attestation pool to check for block proposals
 * @param archiver - the archiver to look up blocks by archive root
 * @param txPool - the tx pool to fetch transactions from
 * @returns the BlockTxs request handler
 */
export function reqRespBlockTxsHandler(
  attestationPool: AttestationPool,
  archiver: L2BlockSource,
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
    // First try attestation pool, then fall back to archiver
    let txHashes = (await attestationPool.getBlockProposal(request.archiveRoot.toString()))?.txHashes;
    if (!txHashes) {
      txHashes = (await archiver.getL2BlockByArchive(request.archiveRoot))?.body.txEffects.map(effect => effect.txHash);
    }

    let requestedTxsHashes;
    if (request.txHashes.length > 0) {
      requestedTxsHashes = request.txHashes;
    }

    // This is scenario in which we don't have this block the peer is requesting from us
    // But peer has sent requested tx hashes, so we can send them the transactions
    if (!txHashes && requestedTxsHashes !== undefined) {
      const responseTxs = (await txPool.getTxsByHash(requestedTxsHashes)).filter(tx => !!tx);
      const response = new BlockTxsResponse(Fr.zero(), new TxArray(...responseTxs), BitVector.init(0, []));
      return response.toBuffer();
    }

    // If we don't have this block and peer has not sent requested tx hashes
    if (!txHashes) {
      throw new ReqRespStatusError(ReqRespStatus.NOT_FOUND);
    }

    const txsAvailableInPool = await txPool.hasTxs(txHashes);
    // Map txs in the pool to their indices in the block
    const availableIndices = txsAvailableInPool.map((hasTx, idx) => (hasTx ? idx : -1)).filter(idx => idx !== -1);
    const responseBitVector = BitVector.init(txHashes.length, availableIndices);

    const requestedIndices = new Set(request.txIndices.getTrueIndices());
    requestedTxsHashes = txHashes.filter((_, idx) => requestedIndices.has(idx));

    const responseTxs = (await txPool.getTxsByHash(requestedTxsHashes)).filter(tx => !!tx);
    const response = new BlockTxsResponse(request.archiveRoot, new TxArray(...responseTxs), responseBitVector);

    return response.toBuffer();
  };
}
