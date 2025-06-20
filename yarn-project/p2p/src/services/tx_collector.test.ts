import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { type P2P, TxCollector } from '@aztec/p2p';
import { BlockProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { ProposedBlockHeader, StateReference, type Tx, type TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

type TxResults = { retrievedTxs: Tx[]; missingTxs: TxHash[] };

describe('tx collector', () => {
  // Dependencies
  let p2p: MockProxy<P2P>;

  // There is a tx pool in the p2p layer and one in each node.
  const txPool: Map<string, Tx> = new Map();
  // This is a list of txs that are on the p2p network but not in the pool.
  const additionalP2PTxs: Tx[] = [];

  const generateTransactions = async (numTxs: number) => {
    return await Promise.all(Array.from({ length: numTxs }, () => mockTx()));
  };

  const buildProposal = (txs: Tx[], txHashes: TxHash[]) => {
    const payload = new ConsensusPayload(ProposedBlockHeader.empty(), Fr.random(), StateReference.empty(), txHashes);
    return new BlockProposal(1, payload, Signature.empty(), txs);
  };

  const setupTxPools = async (txsInPool: number, txsOnP2P: number, txs: Tx[]) => {
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    let offset = 0;
    txs.slice(0, txsInPool).forEach((tx, index) => txPool.set(txHashes[index].toString(), tx));
    offset += txsInPool;
    additionalP2PTxs.push(...txs.slice(offset, offset + txsOnP2P));
  };

  const checkTxs = async (received: Tx[], expected: Tx[]) => {
    expect(received.length).toBe(expected.length);
    const receivedHashes = await Promise.all(received.map(tx => tx.getTxHash()));
    const expectedHashes = await Promise.all(expected.map(tx => tx.getTxHash()));
    expect(receivedHashes.map(txHash => txHash.toString())).toEqual(expectedHashes.map(txHash => txHash.toString()));
  };

  const checkHashes = (received: TxHash[] | undefined, expected: TxHash[] | undefined) => {
    if (received === undefined || expected === undefined) {
      expect(received).toBe(expected);
      return;
    }
    expect(received.length).toBe(expected.length);
    expect(received.map(txHash => txHash.toString()).sort()).toEqual(expected.map(txHash => txHash.toString()).sort());
  };

  const checkResults = async (received: TxResults, expected: TxResults) => {
    await checkTxs(received.retrievedTxs, expected.retrievedTxs);
    checkHashes(received.missingTxs, expected.missingTxs);
  };

  const shuffleTxs = (original: Tx[]) => {
    return original
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);
  };

  beforeEach(() => {
    txPool.clear();
    additionalP2PTxs.length = 0;

    p2p = mock<P2P>();
    p2p.getTxsByHash.mockImplementation(async txHashes => {
      const p2pTxs = await Promise.all(additionalP2PTxs.map(tx => tx.getTxHash().then(hash => ({ hash, tx }))));
      const requiredP2PTxs = p2pTxs.filter(p2pTx => txHashes.some(txHash => p2pTx.hash.equals(txHash)));
      requiredP2PTxs.forEach(tx => txPool.set(tx.hash.toString(), tx.tx));
      const txs = txHashes.map(txHash => txPool.get(txHash.toString()));
      return Promise.resolve(txs);
    });
    p2p.hasTxsInPool.mockImplementation(txHashes => {
      return Promise.resolve(txHashes.map(txHash => txPool.has(txHash.toString())));
    });
    p2p.getTxsByHashFromPool.mockImplementation(txHashes => {
      const txs = txHashes.map(txHash => txPool.get(txHash.toString()));
      return Promise.resolve(txs);
    });
    p2p.addTxsToPool.mockImplementation(async txs => {
      const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
      txs.forEach((tx, index) => txPool.set(hashes[index].toString(), tx));
      return Promise.resolve(txs.length);
    });
  });

  it('can be created', () => {
    const collector = new TxCollector(p2p);
    expect(collector).toBeDefined();
  });

  it('can gather transactions from the network', async () => {
    const collector = new TxCollector(p2p);
    const original = await generateTransactions(10);
    await setupTxPools(0, 10, original);

    // Random shuffle the txs so we test that the collection handles gaps in where txs are found
    const txs = shuffleTxs(original);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const proposal = buildProposal([], hashes);
    const results = await collector.collectForBlockProposal(proposal, undefined);
    const expected: TxResults = {
      retrievedTxs: txs,
      missingTxs: [],
    };
    await checkResults({ retrievedTxs: results.txs, missingTxs: results.missing ?? [] }, expected);
    expect(txPool.size).toEqual(10);
  });

  it('reports txs missing from the network', async () => {
    const collector = new TxCollector(p2p);
    const original = await generateTransactions(10);
    const originalHashes = await Promise.all(original.map(tx => tx.getTxHash()));
    await setupTxPools(0, 5, original);

    const txs = original;
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    const proposal = buildProposal([], hashes);
    const results = await collector.collectForBlockProposal(proposal, undefined);
    const expected: TxResults = {
      retrievedTxs: txs.slice(0, 5),
      missingTxs: originalHashes.slice(5),
    };
    await checkResults({ retrievedTxs: results.txs, missingTxs: results.missing ?? [] }, expected);
    expect(txPool.size).toEqual(5);
  });

  it('takes txs from the pool as well as the network', async () => {
    const collector = new TxCollector(p2p);
    const original = await generateTransactions(10);
    const originalHashes = await Promise.all(original.map(tx => tx.getTxHash()));
    await setupTxPools(2, 4, original);

    const txs = original;
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const proposal = buildProposal([], hashes);
    const results = await collector.collectForBlockProposal(proposal, undefined);
    const expected: TxResults = {
      retrievedTxs: txs.slice(0, 6),
      missingTxs: originalHashes.slice(6),
    };
    await checkResults({ retrievedTxs: results.txs, missingTxs: results.missing ?? [] }, expected);
    expect(txPool.size).toEqual(6);
  });

  it('takes txs from the pool, the network, and the proposal', async () => {
    const collector = new TxCollector(p2p);
    const original = await generateTransactions(10);
    await setupTxPools(2, 4, original);

    // Random shuffle the txs so we test that the collection handles gaps in where txs are found
    const txs = shuffleTxs([...original]);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const proposal = buildProposal(original.slice(6), hashes);
    const results = await collector.collectForBlockProposal(proposal, undefined);
    const expected: TxResults = {
      retrievedTxs: txs,
      missingTxs: [],
    };
    await checkResults({ retrievedTxs: results.txs, missingTxs: results.missing ?? [] }, expected);
    // all txs should be in the pool
    expect(txPool.size).toEqual(10);
  });

  it('adds txs from all sources to the pool', async () => {
    const collector = new TxCollector(p2p);
    const original = await generateTransactions(10);
    await setupTxPools(0, 4, original);
    const originalHashes = await Promise.all(original.map(tx => tx.getTxHash()));

    // Random shuffle the txs so we test that the collection handles gaps in where txs are found
    const txs = original;
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const proposal = buildProposal(txs.slice(4, 8), hashes);
    const results = await collector.collectForBlockProposal(proposal, undefined);
    const expected: TxResults = {
      retrievedTxs: txs.slice(0, 8),
      missingTxs: originalHashes.slice(8),
    };
    await checkResults({ retrievedTxs: results.txs, missingTxs: results.missing ?? [] }, expected);
    // all txs should be in the pool
    expect(txPool.size).toEqual(8);
  });

  it("does not add txs from the proposal if their hash isn't in the payload", async () => {
    const collector = new TxCollector(p2p);
    const original = await generateTransactions(10);
    const additional = await generateTransactions(2);
    await setupTxPools(0, 4, original);
    const originalHashes = await Promise.all(original.map(tx => tx.getTxHash()));

    // Random shuffle the txs so we test that the collection handles gaps in where txs are found
    const txs = original;
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Add additional txs and these should not be added to the pool and not in the results
    const proposal = buildProposal(txs.slice(4, 8).concat(additional), hashes);
    const results = await collector.collectForBlockProposal(proposal, undefined);
    const expected: TxResults = {
      retrievedTxs: txs.slice(0, 8),
      missingTxs: originalHashes.slice(8),
    };
    await checkResults({ retrievedTxs: results.txs, missingTxs: results.missing ?? [] }, expected);
    // all txs should be in the pool
    expect(txPool.size).toEqual(8);

    // additional txs should not be in the pool
    const additionalHashes = await Promise.all(additional.map(tx => tx.getTxHash()));
    for (const hash of additionalHashes) {
      expect(txPool.has(hash.toString())).toBeFalsy();
    }
  });
});
