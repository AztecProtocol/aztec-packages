import { BlockNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BlockProposal } from '@aztec/stdlib/p2p';
import { makeBlockHeader, makeBlockProposal, mockTx } from '@aztec/stdlib/testing';
import { TxArray, TxHash, TxHashArray } from '@aztec/stdlib/tx';

import { describe, expect, it } from '@jest/globals';

import { BitVector } from './bitvector.js';
import { BlockTxsRequest, BlockTxsResponse } from './block_txs_reqresp.js';

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
    const blockHash = Fr.random();
    const missing = new TxHashArray(...Array.from({ length: 4 }, () => TxHash.random()));
    const txIndices = BitVector.init(16, [0, 5, 10, 15]);

    const original = new BlockTxsRequest(blockHash, missing, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.blockHash).toEqual(original.blockHash);
    expect(deserialized.txHashes.length).toBe(original.txHashes.length);
    expect(deserialized.txHashes).toEqual(original.txHashes);
    expect(deserialized.txIndices.getLength()).toBe(original.txIndices.getLength());
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());
  });

  it('should handle empty BitVector', () => {
    const blockHash = Fr.random();
    const txIndices = BitVector.init(8, []);

    const original = new BlockTxsRequest(blockHash, new TxHashArray(), txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.blockHash).toEqual(blockHash);
    expect(deserialized.txIndices.getTrueIndices()).toEqual([]);
  });

  it('should create request with full tx hashes when includeFullTxHashes=true', async () => {
    const allTxHashes = Array.from({ length: 5 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[1], allTxHashes[3]];

    const request = BlockTxsRequest.fromBlockProposalAndMissingTxs(blockProposal, missingHashes, true);

    expect(request).toBeDefined();
    expect(request!.blockHash).toEqual(blockProposal.archive);
    expect(request!.txHashes.length).toBe(2);
    expect(request!.txHashes).toEqual(new TxHashArray(...missingHashes));
    expect(request!.txIndices.getTrueIndices()).toEqual([1, 3]);
    expect(request!.txIndices.getLength()).toBe(5);
  });

  it('should create request without tx hashes when includeFullTxHashes=false', async () => {
    const allTxHashes = Array.from({ length: 5 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[0], allTxHashes[2], allTxHashes[4]];

    const request = BlockTxsRequest.fromBlockProposalAndMissingTxs(blockProposal, missingHashes, false);

    expect(request).toBeDefined();
    expect(request!.blockHash).toEqual(blockProposal.archive);
    expect(request!.txHashes.length).toBe(0);
    expect(request!.txIndices.getTrueIndices()).toEqual([0, 2, 4]);
    expect(request!.txIndices.getLength()).toBe(5);
  });

  it('should create request without tx hashes when includeFullTxHashes is not provided', async () => {
    const allTxHashes = Array.from({ length: 3 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[1]];

    const request = BlockTxsRequest.fromBlockProposalAndMissingTxs(blockProposal, missingHashes);

    expect(request).toBeDefined();
    expect(request!.blockHash).toEqual(blockProposal.archive);
    expect(request!.txHashes.length).toBe(0);
    expect(request!.txIndices.getTrueIndices()).toEqual([1]);
  });

  it('should return undefined when no missing txs are provided', async () => {
    const allTxHashes = Array.from({ length: 3 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);

    const request = BlockTxsRequest.fromBlockProposalAndMissingTxs(blockProposal, [], true);
    expect(request).toBeUndefined();

    const requestDefault = BlockTxsRequest.fromBlockProposalAndMissingTxs(blockProposal, []);
    expect(requestDefault).toBeUndefined();
  });

  it('should return undefined when missing tx hashes do not match proposal hashes', async () => {
    const allTxHashes = Array.from({ length: 3 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const nonMatchingHashes = Array.from({ length: 2 }, () => TxHash.random());

    const request = BlockTxsRequest.fromBlockProposalAndMissingTxs(blockProposal, nonMatchingHashes, true);
    expect(request).toBeUndefined();
  });

  it('should serialize and deserialize correctly with full tx hashes', async () => {
    const allTxHashes = Array.from({ length: 4 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[0], allTxHashes[3]];

    const original = BlockTxsRequest.fromBlockProposalAndMissingTxs(blockProposal, missingHashes, true)!;
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.blockHash).toEqual(original.blockHash);
    expect(deserialized.txHashes).toEqual(original.txHashes);
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());
  });

  it('should serialize and deserialize correctly without tx hashes', async () => {
    const allTxHashes = Array.from({ length: 4 }, () => TxHash.random());
    const blockProposal = await createBlockProposal(allTxHashes);
    const missingHashes = [allTxHashes[1], allTxHashes[2]];

    const original = BlockTxsRequest.fromBlockProposalAndMissingTxs(blockProposal, missingHashes, false)!;
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.blockHash).toEqual(original.blockHash);
    expect(deserialized.txHashes.length).toBe(0);
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());
  });
});

describe('BlockTxResponse', () => {
  it('should serialize and deserialize correctly', async () => {
    const blockHash = Fr.random();
    const txs = new TxArray(await mockTx(), await mockTx(), await mockTx());
    const txIndices = BitVector.init(8, [0, 2, 5]);

    const original = new BlockTxsResponse(blockHash, txs, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsResponse.fromBuffer(buffer);

    expect(deserialized.blockHash).toEqual(original.blockHash);
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
    const blockHash = Fr.random();
    const txs = new TxArray(); // No transactions
    const txIndices = BitVector.init(10, []); // No indices

    const original = new BlockTxsResponse(blockHash, txs, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsResponse.fromBuffer(buffer);

    expect(deserialized.blockHash).toEqual(blockHash);
    expect(deserialized.txs.length).toBe(0);
    expect(deserialized.txIndices.getTrueIndices()).toEqual([]);
  });
});
