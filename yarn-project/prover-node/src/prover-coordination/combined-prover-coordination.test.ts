import type { P2P } from '@aztec/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import type { Tx } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import {
  type CombinedCoordinationOptions,
  CombinedProverCoordination,
  type TxSource,
} from './combined-prover-coordination.js';

describe('combined prover coordination', () => {
  // Dependencies
  let p2p: MockProxy<P2P>;
  let nodes: MockProxy<TxSource>[];

  const NUM_NODES = 3;

  // There is a tx pool in the p2p layer and one in each node.
  const txPool: Map<string, Tx> = new Map();
  const nodeTxs: Map<string, Tx>[] = Array.from({ length: NUM_NODES }, () => new Map());
  // This is a list of txs that are on the p2p network but not in the pool.
  const additionalP2PTxs: Tx[] = [];

  const generateTransactions = async (numTxs: number) => {
    return await Promise.all(Array.from({ length: numTxs }, () => mockTx()));
  };

  const setupTxPools = async (txsInPool: number, txsInNodes: number[], txsOnP2P: number, txs: Tx[]) => {
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    let offset = 0;
    txs.slice(0, txsInPool).forEach((tx, index) => txPool.set(txHashes[index].toString(), tx));
    offset += txsInPool;
    txsInNodes.forEach((numTxs, index) => {
      const nodeTxHashes = txHashes.slice(offset, offset + numTxs);
      nodeTxHashes.forEach((txHash, hashIndex) => nodeTxs[index].set(txHash.toString(), txs[offset + hashIndex]));
      offset += numTxs;
    });
    additionalP2PTxs.push(...txs.slice(offset, offset + txsOnP2P));
  };

  beforeEach(() => {
    txPool.clear();
    nodeTxs.forEach(nodeTx => nodeTx.clear());
    additionalP2PTxs.length = 0;

    p2p = mock<P2P>();
    p2p.getTxsByHash.mockImplementation(async txHashes => {
      const hashes = await Promise.all(additionalP2PTxs.map(tx => tx.getTxHash()));
      additionalP2PTxs.forEach((tx, index) => txPool.set(hashes[index].toString(), tx));
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
    nodes = Array.from({ length: NUM_NODES }, () => mock<TxSource>());
    nodes.forEach((node, index) => {
      node.getTxsByHash.mockImplementation(txHashes => {
        const txs = txHashes.map(txHash => nodeTxs[index].get(txHash.toString()));
        return Promise.resolve(txs);
      });
    });
  });

  it('can be created', () => {
    const coordination = new CombinedProverCoordination(p2p, nodes);
    expect(coordination).toBeDefined();
  });

  it('can gather txs from nodes', async () => {
    const coordination = new CombinedProverCoordination(p2p, nodes);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Start with 3 txs in the pool, 3 on node 1, and 4 on node 2
    await setupTxPools(3, [3, 4], 0, txs);
    await coordination.gatherTxs(hashes);

    // All txs should now be in the pool
    expect(txPool.size).toEqual(10);
  });

  it('can gather txs from nodes and p2p', async () => {
    const coordination = new CombinedProverCoordination(p2p, nodes);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Start with 1 tx in the pool, 2 on node 1, and 3 on node 3.
    // The remainder will be out on the p2p network.
    await setupTxPools(1, [2, 0, 3], 4, txs);
    await coordination.gatherTxs(hashes);

    // All txs should now be in the pool
    expect(txPool.size).toEqual(10);
  });

  it('does not ask nodes or p2p if txs are already in the pool', async () => {
    const coordination = new CombinedProverCoordination(p2p, nodes);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Start with all txs in the pool
    await setupTxPools(10, [], 0, txs);
    await coordination.gatherTxs(hashes);

    // All txs should now be in the pool
    expect(txPool.size).toEqual(10);
    expect(p2p.getTxsByHash).not.toHaveBeenCalled();
    nodes.forEach(node => expect(node.getTxsByHash).not.toHaveBeenCalled());
  });

  it('only gathers what it can', async () => {
    const coordination = new CombinedProverCoordination(p2p, nodes);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Start with 1 tx in the pool, 0 on node 1, 1 on node 2, 0 on node 3, 2 on the p2p network
    await setupTxPools(1, [0, 1, 0], 2, txs);
    await coordination.gatherTxs(hashes);

    // Not all txs should be in the pool
    expect(txPool.size).toEqual(4);
  });

  it('gathers from nodes when txs are requested', async () => {
    const coordination = new CombinedProverCoordination(p2p, nodes);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Start with 3 txs in the pool, 3 on node 1, and 4 on node 2
    await setupTxPools(3, [3, 4], 0, txs);
    const retrieved = await coordination.getTxsByHash(hashes);

    // All txs should now be in the pool
    expect(txPool.size).toEqual(10);
    expect(retrieved).toEqual(expect.arrayContaining(txs));
  });

  it('gathers from nodes and p2p when txs are requested', async () => {
    const coordination = new CombinedProverCoordination(p2p, nodes);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Start with 1 tx in the pool, 2 on node 1, and 3 on node 3.
    // The remainder will be out on the p2p network.
    await setupTxPools(1, [2, 0, 3], 4, txs);
    const retrieved = await coordination.getTxsByHash(hashes);

    // All txs should now be in the pool
    expect(txPool.size).toEqual(10);
    expect(retrieved).toEqual(expect.arrayContaining(txs));
  });

  it("throws if requesting txs that can't be gathered", async () => {
    const coordination = new CombinedProverCoordination(p2p, nodes);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Start with 1 tx in the pool, 0 on node 1, 1 on node 2, 0 on node 3, 2 on the p2p network
    await setupTxPools(1, [0, 1, 0], 2, txs);
    await expect(coordination.getTxsByHash(hashes)).rejects.toThrow();

    // Not all txs should be in the pool
    expect(txPool.size).toEqual(4);
  });

  it('can request txs from nodes if no p2p', async () => {
    const coordination = new CombinedProverCoordination(undefined, nodes);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // All txs are on the nodes
    await setupTxPools(0, [1, 3, 6], 0, txs);
    const retrieved = await coordination.getTxsByHash(hashes);

    // Nothing is in the pool
    expect(txPool.size).toEqual(0);
    expect(retrieved).toEqual(expect.arrayContaining(txs));
  });

  it('can request txs from p2p if no nodes', async () => {
    const coordination = new CombinedProverCoordination(p2p, []);
    const txs = await generateTransactions(10);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Some txs in the pool already, some on the network
    await setupTxPools(2, [], 8, txs);
    const retrieved = await coordination.getTxsByHash(hashes);

    // All txs should now be in the pool
    expect(txPool.size).toEqual(10);
    expect(retrieved).toEqual(expect.arrayContaining(txs));
  });

  it('can gather a large amount of transactions in batches', async () => {
    const options: CombinedCoordinationOptions = {
      txGatheringBatchSize: 5,
      txGatheringMaxParallelRequestsPerNode: 2,
    };
    const coordination = new CombinedProverCoordination(p2p, nodes, options);
    const txs = await generateTransactions(100);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Start with 1 tx in the pool, 5 on the network and the rest over the nodes
    await setupTxPools(1, [30, 20, 44], 5, txs);
    const retrieved = await coordination.getTxsByHash(hashes);

    // All txs should now be in the pool
    expect(txPool.size).toEqual(100);
    expect(retrieved).toEqual(expect.arrayContaining(txs));
  });
});
