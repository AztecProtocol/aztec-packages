import { BlockNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { makeBlockHeader, makeBlockProposal } from '@aztec/stdlib/testing';
import { Tx, TxHash, TxHashArray } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { AttestationPool } from '../../../../mem_pools/index.js';
import type { TxPoolV2 } from '../../../../mem_pools/tx_pool_v2/interfaces.js';
import { ReqRespStatus } from '../../status.js';
import { BitVector } from './bitvector.js';
import { reqRespBlockTxsHandler } from './block_txs_handler.js';
import { BlockTxsRequest, BlockTxsResponse } from './block_txs_reqresp.js';

describe('reqRespBlockTxsHandler', () => {
  let attestationPool: MockProxy<AttestationPool>;
  let archiver: MockProxy<L2BlockSource>;
  let txPool: MockProxy<TxPoolV2>;
  let peerId: PeerId;

  const makeTx = (txHash?: TxHash) => Tx.random({ txHash }) as Tx;

  const createBlockProposal = (txHashes: TxHash[]): Promise<BlockProposal> => {
    return makeBlockProposal({
      signer: Secp256k1Signer.random(),
      blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(5) }),
      archiveRoot: Fr.random(),
      txHashes,
    });
  };

  const callHandler = async (request: BlockTxsRequest) => {
    const handler = reqRespBlockTxsHandler(attestationPool, archiver, txPool);
    const responseBuffer = await handler(peerId, request.toBuffer());
    return BlockTxsResponse.fromBuffer(responseBuffer);
  };

  beforeEach(() => {
    attestationPool = mock<AttestationPool>();
    archiver = mock<L2BlockSource>();
    txPool = mock<TxPoolV2>();
    peerId = mock<PeerId>();

    attestationPool.getBlockProposal.mockResolvedValue(undefined);
    archiver.getL2BlockByArchive.mockResolvedValue(undefined);
    txPool.getTxsByHash.mockResolvedValue([]);
    txPool.hasTxs.mockResolvedValue([]);
  });

  describe('no block proposal or archived block, no tx hashes', () => {
    it('throws NOT_FOUND', async () => {
      const request = new BlockTxsRequest(Fr.random(), new TxHashArray(), BitVector.init(0, []));
      const handler = reqRespBlockTxsHandler(attestationPool, archiver, txPool);
      await expect(handler(peerId, request.toBuffer())).rejects.toMatchObject({
        status: ReqRespStatus.NOT_FOUND,
      });
    });
  });

  describe('no block proposal or archived block, explicit tx hashes', () => {
    it('returns txs found in active pool', async () => {
      const txHashes = [TxHash.random(), TxHash.random()];
      const txs = txHashes.map(h => makeTx(h));
      txPool.getTxsByHash.mockResolvedValue(txs);

      const request = new BlockTxsRequest(Fr.random(), new TxHashArray(...txHashes), BitVector.init(0, []));
      const response = await callHandler(request);

      expect(response.txs.length).toBe(2);
      expect(response.archiveRoot).toEqual(Fr.zero());
    });

    it('returns empty when txs not in pool', async () => {
      const txHashes = [TxHash.random()];
      txPool.getTxsByHash.mockResolvedValue([undefined]);

      const request = new BlockTxsRequest(Fr.random(), new TxHashArray(...txHashes), BitVector.init(0, []));
      const response = await callHandler(request);

      expect(response.txs.length).toBe(0);
    });
  });

  describe('with block proposal', () => {
    it('returns availability bitvector and requested txs', async () => {
      const txHashes = [TxHash.random(), TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);
      const txs = txHashes.map(h => makeTx(h));

      attestationPool.getBlockProposal.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, true, true]);
      txPool.getTxsByHash.mockResolvedValue(txs);

      const request = new BlockTxsRequest(proposal.archive, new TxHashArray(), BitVector.init(3, [0, 1, 2]));
      const response = await callHandler(request);

      expect(response.archiveRoot).toEqual(proposal.archive);
      expect(response.txs.length).toBe(3);
      expect(response.txIndices.getTrueIndices()).toEqual([0, 1, 2]);
    });

    it('returns partial availability when some txs missing from pool', async () => {
      const txHashes = [TxHash.random(), TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);

      attestationPool.getBlockProposal.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, false, true]);
      txPool.getTxsByHash.mockResolvedValue([makeTx(txHashes[0]), undefined, makeTx(txHashes[2])]);

      const request = new BlockTxsRequest(proposal.archive, new TxHashArray(), BitVector.init(3, [0, 2]));
      const response = await callHandler(request);

      expect(response.txs.length).toBe(2);
      expect(response.txIndices.getTrueIndices()).toEqual([0, 2]);
    });

    it('filters out undefined txs from pool response', async () => {
      const txHashes = [TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);

      attestationPool.getBlockProposal.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, false]);
      txPool.getTxsByHash.mockResolvedValue([makeTx(txHashes[0]), undefined]);

      const request = new BlockTxsRequest(proposal.archive, new TxHashArray(), BitVector.init(2, [0, 1]));
      const response = await callHandler(request);

      expect(response.txs.length).toBe(1);
    });
  });

  describe('with archived block (no block proposal)', () => {
    it('returns availability bitvector and requested txs from archived block', async () => {
      const block = await L2Block.random(BlockNumber(5), { txsPerBlock: 3 });
      const txHashes = block.body.txEffects.map(e => e.txHash);
      const txs = txHashes.map(h => makeTx(h));

      archiver.getL2BlockByArchive.mockResolvedValue(block);
      txPool.hasTxs.mockResolvedValue([true, true, true]);
      txPool.getTxsByHash.mockResolvedValue(txs);

      const request = new BlockTxsRequest(block.archive.root, new TxHashArray(), BitVector.init(3, [0, 1, 2]));
      const response = await callHandler(request);

      expect(response.archiveRoot).toEqual(block.archive.root);
      expect(response.txs.length).toBe(3);
      expect(response.txIndices.getTrueIndices()).toEqual([0, 1, 2]);

      expect(attestationPool.getBlockProposal).toHaveBeenCalledWith(block.archive.root.toString());
      expect(archiver.getL2BlockByArchive).toHaveBeenCalledWith(block.archive.root);
    });

    it('returns partial availability when some txs missing from pool', async () => {
      const block = await L2Block.random(BlockNumber(5), { txsPerBlock: 3 });
      const txHashes = block.body.txEffects.map(e => e.txHash);

      archiver.getL2BlockByArchive.mockResolvedValue(block);
      txPool.hasTxs.mockResolvedValue([true, false, true]);
      txPool.getTxsByHash.mockResolvedValue([makeTx(txHashes[0]), undefined, makeTx(txHashes[2])]);

      const request = new BlockTxsRequest(block.archive.root, new TxHashArray(), BitVector.init(3, [0, 2]));
      const response = await callHandler(request);

      expect(response.txs.length).toBe(2);
      expect(response.txIndices.getTrueIndices()).toEqual([0, 2]);

      expect(attestationPool.getBlockProposal).toHaveBeenCalledWith(block.archive.root.toString());
      expect(archiver.getL2BlockByArchive).toHaveBeenCalledWith(block.archive.root);
    });

    it('does not query archiver if attestation pool has the block', async () => {
      const txHashes = [TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);
      const txs = txHashes.map(h => makeTx(h));

      attestationPool.getBlockProposal.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, true]);
      txPool.getTxsByHash.mockResolvedValue(txs);

      const request = new BlockTxsRequest(proposal.archive, new TxHashArray(), BitVector.init(2, [0, 1]));
      await callHandler(request);

      expect(attestationPool.getBlockProposal).toHaveBeenCalledWith(proposal.archive.toString());
      expect(archiver.getL2BlockByArchive).not.toHaveBeenCalled();
    });
  });
});
