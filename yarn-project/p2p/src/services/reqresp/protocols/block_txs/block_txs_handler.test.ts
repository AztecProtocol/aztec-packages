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

  // Builds a request whose commitment is computed over `blockTxHashes` (the txs the requester believes the
  // block contains). Passing the responder's actual block tx hashes makes the commitment match; passing a
  // different set simulates a requester that saw a different proposal under the same archive root.
  const makeRequest = (
    archiveRoot: Fr,
    txIndices: BitVector,
    blockTxHashes: TxHash[] = [],
    requestedTxHashes: TxHash[] = [],
  ) =>
    new BlockTxsRequest(
      archiveRoot,
      txIndices,
      BlockTxsRequest.computeBlockTxHashesCommitment(blockTxHashes),
      new TxHashArray(...requestedTxHashes),
    );

  beforeEach(() => {
    attestationPool = mock<AttestationPool>();
    archiver = mock<L2BlockSource>();
    txPool = mock<TxPoolV2>();
    peerId = mock<PeerId>();

    attestationPool.getBlockProposalByArchive.mockResolvedValue(undefined);
    archiver.getBlock.mockResolvedValue(undefined);
    txPool.getTxsByHash.mockResolvedValue([]);
    txPool.hasTxs.mockResolvedValue([]);
  });

  describe('no block proposal or archived block, no tx hashes', () => {
    it('returns an empty response signalling the block is not available', async () => {
      const request = makeRequest(Fr.random(), BitVector.init(0, []));
      const response = await callHandler(request);

      expect(response.txs.length).toBe(0);
      // The handler never returns NOT_FOUND; an empty bitvector is how it signals it lacks the block.
      expect(response.peerHasBlock()).toBe(false);
    });
  });

  describe('no block proposal or archived block, explicit tx hashes', () => {
    it('returns txs found in active pool', async () => {
      const txHashes = [TxHash.random(), TxHash.random()];
      const txs = txHashes.map(h => makeTx(h));
      txPool.getTxsByHash.mockResolvedValue(txs);

      const request = makeRequest(Fr.random(), BitVector.init(0, []), [], txHashes);
      const response = await callHandler(request);

      expect(response.txs.length).toBe(2);
      // An empty bitvector signals the peer did not have the block (only matched the requested hashes).
      expect(response.peerHasBlock()).toBe(false);
    });

    it('returns empty when txs not in pool', async () => {
      const txHashes = [TxHash.random()];
      txPool.getTxsByHash.mockResolvedValue([undefined]);

      const request = makeRequest(Fr.random(), BitVector.init(0, []), [], txHashes);
      const response = await callHandler(request);

      expect(response.txs.length).toBe(0);
    });
  });

  describe('with block proposal', () => {
    it('returns availability bitvector and requested txs', async () => {
      const txHashes = [TxHash.random(), TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);
      const txs = txHashes.map(h => makeTx(h));

      attestationPool.getBlockProposalByArchive.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, true, true]);
      txPool.getTxsByHash.mockResolvedValue(txs);

      const request = makeRequest(proposal.archive, BitVector.init(3, [0, 1, 2]), txHashes);
      const response = await callHandler(request);

      // A non-empty bitvector signals the peer has the block.
      expect(response.peerHasBlock()).toBe(true);
      expect(response.txs.length).toBe(3);
      expect(response.txIndices.getTrueIndices()).toEqual([0, 1, 2]);
    });

    it('returns partial availability when some txs missing from pool', async () => {
      const txHashes = [TxHash.random(), TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);

      attestationPool.getBlockProposalByArchive.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, false, true]);
      txPool.getTxsByHash.mockResolvedValue([makeTx(txHashes[0]), undefined, makeTx(txHashes[2])]);

      const request = makeRequest(proposal.archive, BitVector.init(3, [0, 2]), txHashes);
      const response = await callHandler(request);

      expect(response.txs.length).toBe(2);
      expect(response.txIndices.getTrueIndices()).toEqual([0, 2]);
    });

    it('filters out undefined txs from pool response', async () => {
      const txHashes = [TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);

      attestationPool.getBlockProposalByArchive.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, false]);
      txPool.getTxsByHash.mockResolvedValue([makeTx(txHashes[0]), undefined]);

      const request = makeRequest(proposal.archive, BitVector.init(2, [0, 1]), txHashes);
      const response = await callHandler(request);

      expect(response.txs.length).toBe(1);
    });

    it('does not serve duplicate txs when the same tx is requested by index and by (repeated) explicit hash', async () => {
      const txHashes = [TxHash.random(), TxHash.random(), TxHash.random()];
      const [a, b] = txHashes;
      const proposal = await createBlockProposal(txHashes);

      attestationPool.getBlockProposalByArchive.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, true, true]);
      // Return exactly one tx per hash asked for, so any duplicate hash in the query would surface as a
      // duplicate tx in the response.
      txPool.getTxsByHash.mockImplementation((hashes: TxHash[]) => Promise.resolve(hashes.map(h => makeTx(h))));

      // Ask for `a` by index AND for `[a, a, b]` by explicit hash: `a` is requested three times in total.
      const request = makeRequest(proposal.archive, BitVector.init(3, [0]), txHashes, [a, a, b]);
      const response = await callHandler(request);

      // The pool is queried with deduplicated hashes only ({a, b}).
      const queriedHashes = txPool.getTxsByHash.mock.calls[0][0].map(h => h.toString());
      expect(queriedHashes).toEqual([a.toString(), b.toString()]);

      // And the response carries each tx exactly once.
      const returnedHashes = response.txs.map(tx => tx.getTxHash().toString());
      expect(returnedHashes).toEqual([a.toString(), b.toString()]);
      expect(new Set(returnedHashes).size).toBe(returnedHashes.length);
    });

    it('refuses to serve txs by index when the requester saw a different block under the same archive root', async () => {
      const txHashes = [TxHash.random(), TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);

      attestationPool.getBlockProposalByArchive.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, true, true]);
      txPool.getTxsByHash.mockResolvedValue([]);

      // A malicious proposer equivocated: the requester believes the block holds a different set of txs,
      // so its commitment will not match ours even though the archive root is identical.
      const differentTxHashes = [TxHash.random(), TxHash.random(), TxHash.random()];
      const request = makeRequest(proposal.archive, BitVector.init(3, [0, 1, 2]), differentTxHashes);
      const response = await callHandler(request);

      // We refuse to serve by index and signal "no block" rather than handing back txs the requester
      // would reject (and penalize us for).
      expect(response.peerHasBlock()).toBe(false);
      expect(response.txs.length).toBe(0);
    });
  });

  describe('with archived block (no block proposal)', () => {
    it('returns availability bitvector and requested txs from archived block', async () => {
      const block = await L2Block.random(BlockNumber(5), { txsPerBlock: 3 });
      const txHashes = block.body.txEffects.map(e => e.txHash);
      const txs = txHashes.map(h => makeTx(h));

      archiver.getBlock.mockResolvedValue(block);
      txPool.hasTxs.mockResolvedValue([true, true, true]);
      txPool.getTxsByHash.mockResolvedValue(txs);

      const request = makeRequest(block.archive.root, BitVector.init(3, [0, 1, 2]), txHashes);
      const response = await callHandler(request);

      expect(response.peerHasBlock()).toBe(true);
      expect(response.txs.length).toBe(3);
      expect(response.txIndices.getTrueIndices()).toEqual([0, 1, 2]);

      expect(attestationPool.getBlockProposalByArchive).toHaveBeenCalledWith(block.archive.root.toString());
      expect(archiver.getBlock).toHaveBeenCalledWith({ archive: block.archive.root });
    });

    it('returns partial availability when some txs missing from pool', async () => {
      const block = await L2Block.random(BlockNumber(5), { txsPerBlock: 3 });
      const txHashes = block.body.txEffects.map(e => e.txHash);

      archiver.getBlock.mockResolvedValue(block);
      txPool.hasTxs.mockResolvedValue([true, false, true]);
      txPool.getTxsByHash.mockResolvedValue([makeTx(txHashes[0]), undefined, makeTx(txHashes[2])]);

      const request = makeRequest(block.archive.root, BitVector.init(3, [0, 2]), txHashes);
      const response = await callHandler(request);

      expect(response.txs.length).toBe(2);
      expect(response.txIndices.getTrueIndices()).toEqual([0, 2]);

      expect(attestationPool.getBlockProposalByArchive).toHaveBeenCalledWith(block.archive.root.toString());
      expect(archiver.getBlock).toHaveBeenCalledWith({ archive: block.archive.root });
    });

    it('does not query archiver if attestation pool has the block', async () => {
      const txHashes = [TxHash.random(), TxHash.random()];
      const proposal = await createBlockProposal(txHashes);
      const txs = txHashes.map(h => makeTx(h));

      attestationPool.getBlockProposalByArchive.mockResolvedValue(proposal);
      txPool.hasTxs.mockResolvedValue([true, true]);
      txPool.getTxsByHash.mockResolvedValue(txs);

      const request = makeRequest(proposal.archive, BitVector.init(2, [0, 1]), txHashes);
      await callHandler(request);

      expect(attestationPool.getBlockProposalByArchive).toHaveBeenCalledWith(proposal.archive.toString());
      expect(archiver.getBlock).not.toHaveBeenCalled();
    });
  });
});
