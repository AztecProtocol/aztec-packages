import { BlockNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BlockProposal, MAX_TX_SIZE_KB } from '@aztec/stdlib/p2p';
import { makeBlockHeader, makeBlockProposal, mockTx } from '@aztec/stdlib/testing';
import { TxArray, TxHash, TxHashArray } from '@aztec/stdlib/tx';

import { describe, expect, it } from '@jest/globals';

import { BitVector } from './bitvector.js';
import { BlockTxsRequest, BlockTxsResponse, calculateBlockTxsResponseSize } from './block_txs_reqresp.js';

describe('BlockTxRequest', () => {
  // eslint-disable-next-line require-await
  const createBlockProposal = async (txHashes: TxHash[]): Promise<BlockProposal> => {
    return makeBlockProposal({
      signer: Secp256k1Signer.random(),
      blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(5) }),
      archiveRoot: Fr.random(),
      txHashes,
    });
  };

  it('should serialize and deserialize correctly', () => {
    const archiveRoot = Fr.random();
    const missing = new TxHashArray(...Array.from({ length: 4 }, () => TxHash.random()));
    const txIndices = BitVector.init(16, [0, 5, 10, 15]);

    const original = new BlockTxsRequest(archiveRoot, missing, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.archiveRoot).toEqual(original.archiveRoot);
    expect(deserialized.txHashes.length).toBe(original.txHashes.length);
    expect(deserialized.txHashes).toEqual(original.txHashes);
    expect(deserialized.txIndices.getLength()).toBe(original.txIndices.getLength());
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());
  });

  it('should handle empty BitVector', () => {
    const archiveRoot = Fr.random();
    const txIndices = BitVector.init(8, []);

    const original = new BlockTxsRequest(archiveRoot, new TxHashArray(), txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.archiveRoot).toEqual(archiveRoot);
    expect(deserialized.txIndices.getTrueIndices()).toEqual([]);
  });

  it('should create request with full tx hashes when includeFullTxHashes=true', async () => {
    const allTxHashes = Array.from({ length: 5 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[1], allTxHashes[3]];

    const request = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, missingHashes, true);

    expect(request).toBeDefined();
    expect(request!.archiveRoot).toEqual(blockProposal.archive);
    expect(request!.txHashes.length).toBe(2);
    expect(request!.txHashes).toEqual(new TxHashArray(...missingHashes));
    expect(request!.txIndices.getTrueIndices()).toEqual([1, 3]);
    expect(request!.txIndices.getLength()).toBe(5);
  });

  it('should create request without tx hashes when includeFullTxHashes=false', async () => {
    const allTxHashes = Array.from({ length: 5 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[0], allTxHashes[2], allTxHashes[4]];

    const request = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, missingHashes, false);

    expect(request).toBeDefined();
    expect(request!.archiveRoot).toEqual(blockProposal.archive);
    expect(request!.txHashes.length).toBe(0);
    expect(request!.txIndices.getTrueIndices()).toEqual([0, 2, 4]);
    expect(request!.txIndices.getLength()).toBe(5);
  });

  it('should create request without tx hashes when includeFullTxHashes is not provided', async () => {
    const allTxHashes = Array.from({ length: 3 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[1]];

    const request = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, missingHashes);

    expect(request).toBeDefined();
    expect(request!.archiveRoot).toEqual(blockProposal.archive);
    expect(request!.txHashes.length).toBe(0);
    expect(request!.txIndices.getTrueIndices()).toEqual([1]);
  });

  it('should return undefined when no missing txs are provided', async () => {
    const allTxHashes = Array.from({ length: 3 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);

    const request = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, [], true);
    expect(request).toBeUndefined();

    const requestDefault = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, []);
    expect(requestDefault).toBeUndefined();
  });

  it('should return undefined when missing tx hashes do not match proposal hashes', async () => {
    const allTxHashes = Array.from({ length: 3 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const nonMatchingHashes = Array.from({ length: 2 }, () => TxHash.random());

    const request = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, nonMatchingHashes, true);
    expect(request).toBeUndefined();
  });

  it('should serialize and deserialize correctly with full tx hashes', async () => {
    const allTxHashes = Array.from({ length: 4 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[0], allTxHashes[3]];

    const original = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, missingHashes, true)!;
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.archiveRoot).toEqual(original.archiveRoot);
    expect(deserialized.txHashes).toEqual(original.txHashes);
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());
  });

  it('should serialize and deserialize correctly without tx hashes', async () => {
    const allTxHashes = Array.from({ length: 4 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[1], allTxHashes[2]];

    const original = BlockTxsRequest.fromTxsSourceAndMissingTxs(blockProposal, missingHashes, false)!;
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.archiveRoot).toEqual(original.archiveRoot);
    expect(deserialized.txHashes.length).toBe(0);
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());
  });
});

describe('BlockTxResponse', () => {
  it('should serialize and deserialize correctly', async () => {
    const archiveRoot = Fr.random();
    const txs = new TxArray(await mockTx(), await mockTx(), await mockTx());
    const txIndices = BitVector.init(8, [0, 2, 5]);

    const original = new BlockTxsResponse(archiveRoot, txs, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsResponse.fromBuffer(buffer);

    expect(deserialized.archiveRoot).toEqual(original.archiveRoot);
    expect(deserialized.txs.length).toBe(original.txs.length);
    expect(deserialized.txIndices.getLength()).toBe(original.txIndices.getLength());
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());

    // Make sure we calculate transaction hashes before comparison
    await Promise.all([...original.txs.map(tx => tx.getTxHash()), ...deserialized.txs.map(tx => tx.getTxHash())]);
    original.txs.forEach((tx, i) => {
      expect(deserialized.txs[i]).toEqual(tx);
    });
  });

  it('should handle empty response', () => {
    const archiveRoot = Fr.random();
    const txs = new TxArray(); // No transactions
    const txIndices = BitVector.init(10, []); // No indices

    const original = new BlockTxsResponse(archiveRoot, txs, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsResponse.fromBuffer(buffer);

    expect(deserialized.archiveRoot).toEqual(archiveRoot);
    expect(deserialized.txs.length).toBe(0);
    expect(deserialized.txIndices.getTrueIndices()).toEqual([]);
  });
});

describe('calculateBlockTxsResponseSize', () => {
  it('should return correct size based on requested tx indices', () => {
    const archiveRoot = Fr.random();
    const txIndices = BitVector.init(16, [0, 5, 10, 15]); // 4 txs requested
    const request = new BlockTxsRequest(archiveRoot, new TxHashArray(), txIndices);
    const buffer = request.toBuffer();

    expect(calculateBlockTxsResponseSize(buffer)).toBe(4 * MAX_TX_SIZE_KB + 1);
  });

  it('should return correct size for a single requested tx', () => {
    const archiveRoot = Fr.random();
    const txIndices = BitVector.init(8, [3]); // 1 tx requested
    const request = new BlockTxsRequest(archiveRoot, new TxHashArray(), txIndices);
    const buffer = request.toBuffer();

    expect(calculateBlockTxsResponseSize(buffer)).toBe(MAX_TX_SIZE_KB + 1);
  });

  it('should return overhead-only for request with no indices set', () => {
    const archiveRoot = Fr.random();
    const txIndices = BitVector.init(8, []); // 0 txs requested
    const request = new BlockTxsRequest(archiveRoot, new TxHashArray(), txIndices);
    const buffer = request.toBuffer();

    expect(calculateBlockTxsResponseSize(buffer)).toBe(1); // just overhead
  });

  it('should return correct size for request with all indices set', () => {
    const count = 32;
    const allIndices = Array.from({ length: count }, (_, i) => i);
    const archiveRoot = Fr.random();
    const txIndices = BitVector.init(count, allIndices);
    const request = new BlockTxsRequest(archiveRoot, new TxHashArray(), txIndices);
    const buffer = request.toBuffer();

    expect(calculateBlockTxsResponseSize(buffer)).toBe(count * MAX_TX_SIZE_KB + 1);
  });

  it('should fall back to single tx size for garbage buffer', () => {
    const garbage = Buffer.from('not a valid buffer');

    expect(calculateBlockTxsResponseSize(garbage)).toBe(MAX_TX_SIZE_KB + 1);
  });
});
