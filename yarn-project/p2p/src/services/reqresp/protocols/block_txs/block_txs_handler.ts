import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { TxArray, type TxHash } from '@aztec/stdlib/tx';

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
 * @param txPool - the tx pool containing pending and archived transactions
 * @param l2BlockSource - source for persisted L2 blocks
 * @returns the BlockTxs request handler
 */
export function reqRespBlockTxsHandler(
  attestationPool: AttestationPool,
  txPool: TxPool,
  l2BlockSource: L2BlockSource,
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

    const getTxsByHashIncludingArchived = async (txHashes: TxHash[]) => {
      if (txHashes.length === 0) {
        return [];
      }

      const txsFromPool = await txPool.getTxsByHash(txHashes);
      const missingIndices = txsFromPool.map((tx, idx) => (tx ? -1 : idx)).filter(idx => idx !== -1);
      if (missingIndices.length === 0) {
        return txsFromPool;
      }

      const archivedTxs = await Promise.all(missingIndices.map(idx => txPool.getArchivedTxByHash(txHashes[idx])));
      missingIndices.forEach((missingIdx, i) => {
        if (archivedTxs[i]) {
          txsFromPool[missingIdx] = archivedTxs[i];
        }
      });

      return txsFromPool;
    };

    const getTxAvailabilityIncludingArchived = async (txHashes: TxHash[]) => {
      if (txHashes.length === 0) {
        return [];
      }

      const availableInPool = await txPool.hasTxs(txHashes);
      const missingIndices = availableInPool.map((hasTx, idx) => (hasTx ? -1 : idx)).filter(idx => idx !== -1);
      if (missingIndices.length === 0) {
        return availableInPool;
      }

      const archivedTxs = await Promise.all(missingIndices.map(idx => txPool.getArchivedTxByHash(txHashes[idx])));
      missingIndices.forEach((missingIdx, i) => {
        if (archivedTxs[i]) {
          availableInPool[missingIdx] = true;
        }
      });

      return availableInPool;
    };

    const blockProposal = await attestationPool.getBlockProposal(request.archiveRoot.toString());

    let requestedTxsHashes;
    if (request.txHashes.length > 0) {
      requestedTxsHashes = request.txHashes;
    }

    if (blockProposal) {
      const txsAvailableInPool = await getTxAvailabilityIncludingArchived(blockProposal.txHashes);
      // Map txs in the pool to their indices in the block proposal
      const availableIndices = txsAvailableInPool.map((hasTx, idx) => (hasTx ? idx : -1)).filter(idx => idx !== -1);
      const responseBitVector = BitVector.init(blockProposal.txHashes.length, availableIndices);

      const requestedIndices = new Set(request.txIndices.getTrueIndices());
      requestedTxsHashes = blockProposal.txHashes.filter((_, idx) => requestedIndices.has(idx));

      const responseTxs = (await getTxsByHashIncludingArchived(requestedTxsHashes)).filter(tx => !!tx);
      const response = new BlockTxsResponse(request.archiveRoot, new TxArray(...responseTxs), responseBitVector);

      return response.toBuffer();
    }

    const block = await l2BlockSource.getL2BlockByArchive(request.archiveRoot);
    if (block) {
      const blockTxHashes = block.body.txEffects.map(txEffect => txEffect.txHash);
      const bitVectorLength = request.txIndices.getLength();

      if (bitVectorLength > 0 && bitVectorLength !== blockTxHashes.length) {
        throw new ReqRespStatusError(ReqRespStatus.BADLY_FORMED_REQUEST);
      }

      if (bitVectorLength > 0) {
        const txsAvailableInPool = await getTxAvailabilityIncludingArchived(blockTxHashes);
        const availableIndices = txsAvailableInPool.map((hasTx, idx) => (hasTx ? idx : -1)).filter(idx => idx !== -1);
        const responseBitVector = BitVector.init(bitVectorLength, availableIndices);

        const requestedIndices = new Set(request.txIndices.getTrueIndices());
        requestedTxsHashes = blockTxHashes.filter((_, idx) => requestedIndices.has(idx));

        const responseTxs = (await getTxsByHashIncludingArchived(requestedTxsHashes)).filter(tx => !!tx);
        const response = new BlockTxsResponse(request.archiveRoot, new TxArray(...responseTxs), responseBitVector);
        return response.toBuffer();
      }

      // If no bitvector was provided, fall back to requested tx hashes (if provided) to produce a response.
      if (request.txHashes.length > 0) {
        const requestedHashesSet = new Set(request.txHashes.map(h => h.toString()));
        requestedTxsHashes = blockTxHashes.filter(hash => requestedHashesSet.has(hash.toString()));
      } else {
        requestedTxsHashes = [];
      }

      const responseTxs = (await getTxsByHashIncludingArchived(requestedTxsHashes)).filter(tx => !!tx);
      const response = new BlockTxsResponse(request.archiveRoot, new TxArray(...responseTxs), BitVector.init(0, []));
      return response.toBuffer();
    }

    // This is scenario in which we don't have this block proposal nor the block the peer is requesting from us
    // But peer has sent requested tx hashes, so we can send them the transactions
    if (requestedTxsHashes !== undefined) {
      const responseTxs = (await getTxsByHashIncludingArchived(requestedTxsHashes)).filter(tx => !!tx);
      const response = new BlockTxsResponse(Fr.zero(), new TxArray(...responseTxs), BitVector.init(0, []));
      return response.toBuffer();
    }

    // If we don't have this block proposal or block and peer has not sent requested tx hashes
    throw new ReqRespStatusError(ReqRespStatus.NOT_FOUND);
  };
}
