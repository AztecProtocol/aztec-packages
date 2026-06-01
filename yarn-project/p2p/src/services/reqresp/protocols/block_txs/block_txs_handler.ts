import type { L2BlockSource } from '@aztec/stdlib/block';
import { TxArray, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

import type { AttestationPoolApi } from '../../../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPoolV2 } from '../../../../mem_pools/tx_pool_v2/interfaces.js';
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
  attestationPool: AttestationPoolApi,
  archiver: L2BlockSource,
  txPool: TxPoolV2,
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

    // In principle assume we haven't found the block. This is how that is signaled to the requester.
    let availableIndicesBitVector: BitVector = BitVector.init(0, []);
    // We always try to service the explicitly requested tx hashes, even if we don't have the block.
    const requestedTxsHashes: Set<string> = new Set(request.txHashes.map(h => h.toString()));

    // First try attestation pool, then fall back to archiver.
    let blockTxHashes = (await attestationPool.getBlockProposalByArchive(request.archiveRoot.toString()))?.txHashes;
    if (!blockTxHashes) {
      blockTxHashes = (await archiver.getBlock({ archive: request.archiveRoot }))?.body.txEffects.map(
        effect => effect.txHash,
      );
    }

    // If we have found the block,
    if (blockTxHashes) {
      // First confirm that we are talking about the same block (up to tx hashes and order).
      // If we are not, then we can't:
      // 1. Use the indices from the request to get the txs from the pool.
      // 2. Respond to the peer with the txs we have using indices.
      const blockTxHashesCommitment = BlockTxsRequest.computeBlockTxHashesCommitment(blockTxHashes);
      if (blockTxHashesCommitment.equals(request.blockTxHashesCommitment)) {
        // In that case, we can also get the available indices from the pool.
        const txsAvailableInPool = await txPool.hasTxs(blockTxHashes);
        // Map txs in the pool to their indices in the block
        const availableIndices = txsAvailableInPool.map((hasTx, idx) => (hasTx ? idx : -1)).filter(idx => idx !== -1);
        availableIndicesBitVector = BitVector.init(blockTxHashes.length, availableIndices);

        // We add the requested tx hashes (by index) to the list of tx hashes we are sending to the peer.
        const requestedIndices = new Set(request.txIndices.getTrueIndices());
        blockTxHashes.filter((_, idx) => requestedIndices.has(idx)).forEach(h => requestedTxsHashes.add(h.toString()));
      }
    }

    // Finally, get the txs from the pool and create the response.
    const responseTxs = (
      await txPool.getTxsByHash(Array.from(requestedTxsHashes).map(h => TxHash.fromString(h)))
    ).filter(tx => !!tx);
    const response = new BlockTxsResponse(new TxArray(...responseTxs), availableIndicesBitVector);

    return response.toBuffer();
  };
}
