import { times } from '@aztec/foundation/collection';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { P2PClient, type PeerId, type TxPool, TxProvider } from '@aztec/p2p';
import { BlockProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { ProposedBlockHeader, StateReference, Tx, type TxHash, type TxWithHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxCollection } from './tx_collection/tx_collection.js';
import type { TxProviderInstrumentation } from './tx_provider_instrumentation.js';

type TxResults = { txs: Tx[]; missingTxs: TxHash[] };

describe('TxProvider', () => {
  // Dependencies
  let txCollection: MockProxy<TxCollection>;
  let txPool: MockProxy<TxPool>;
  let txValidator: MockProxy<Pick<P2PClient, 'validate'>>;

  // Subject under test
  let txProvider: TestTxProvider;

  // There is a tx pool in the p2p layer and one in each node.
  const txPools: Map<string, Tx> = new Map();
  // This is a list of txs that are on the p2p network but not in the pool.
  const additionalP2PTxs: TxWithHash[] = [];
  // Opts for requesting txs
  let opts: { deadline: Date; pinnedPeer: PeerId | undefined };

  const generateTransactions = async (numTxs: number) => {
    return Tx.toTxsWithHashes(await Promise.all(times(numTxs, () => mockTx())));
  };

  const buildProposal = (txs: Tx[], txHashes: TxHash[]) => {
    const payload = new ConsensusPayload(ProposedBlockHeader.empty(), Fr.random(), StateReference.empty(), txHashes);
    return new BlockProposal(1, payload, Signature.empty(), txs);
  };

  const setupTxPools = (txsInPool: number, txsOnP2P: number, txs: TxWithHash[]) => {
    let offset = 0;
    txs.slice(0, txsInPool).forEach(tx => txPools.set(tx.txHash.toString(), tx));
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
    await checkTxs(received.txs, expected.txs);
    checkHashes(received.missingTxs, expected.missingTxs);
  };

  const shuffleTxs = (original: Tx[]) => {
    return original
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);
  };

  beforeEach(() => {
    txPools.clear();
    additionalP2PTxs.length = 0;
    opts = { deadline: new Date(Date.now() + 10_000), pinnedPeer: undefined };

    txCollection = mock<TxCollection>();
    txPool = mock<TxPool>();
    txValidator = mock<Pick<P2PClient, 'validate'>>();

    txPool.getTxsByHash.mockImplementation(txHashes =>
      Promise.resolve(txHashes.map(txHash => txPools.get(txHash.toString()))),
    );

    txPool.addTxs.mockImplementation(async txs => {
      const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
      txs.forEach((tx, index) => txPools.set(hashes[index].toString(), tx));
      return Promise.resolve(txs.length);
    });

    txCollection.collectFastFor.mockImplementation((_request, txHashes) => {
      const requestedP2PTxs = additionalP2PTxs.filter(p2pTx =>
        txHashes.some(txHash => p2pTx.txHash.toString() === txHash.toString()),
      );
      requestedP2PTxs.forEach(tx => txPools.set(tx.txHash.toString(), tx));
      return Promise.resolve(requestedP2PTxs);
    });

    txProvider = new TestTxProvider(txCollection, txPool, txValidator);
  });

  it('can be created', () => {
    expect(txProvider).toBeDefined();
  });

  it('can gather transactions from the network', async () => {
    const original = await generateTransactions(10);
    setupTxPools(0, 10, original);

    // Random shuffle the txs so we test that the collection handles gaps in where txs are found
    const txs = shuffleTxs(original);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const proposal = buildProposal([], hashes);
    const results = await txProvider.getTxsForBlockProposal(proposal, opts);
    const expected: TxResults = { txs, missingTxs: [] };
    await checkResults(results, expected);
    expect(txPools.size).toEqual(10);
  });

  it('reports txs missing from the network', async () => {
    const original = await generateTransactions(10);
    const originalHashes = await Promise.all(original.map(tx => tx.getTxHash()));
    setupTxPools(0, 5, original);

    const txs = original;
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    const proposal = buildProposal([], hashes);
    const results = await txProvider.getTxsForBlockProposal(proposal, opts);
    const expected: TxResults = { txs: txs.slice(0, 5), missingTxs: originalHashes.slice(5) };
    await checkResults(results, expected);
    expect(txPools.size).toEqual(5);
  });

  it('takes txs from the pool as well as the network', async () => {
    const original = await generateTransactions(10);
    const originalHashes = await Promise.all(original.map(tx => tx.getTxHash()));
    setupTxPools(2, 4, original);

    const txs = original;
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const proposal = buildProposal([], hashes);
    const results = await txProvider.getTxsForBlockProposal(proposal, opts);
    const expected: TxResults = { txs: txs.slice(0, 6), missingTxs: originalHashes.slice(6) };
    await checkResults(results, expected);
    expect(txPools.size).toEqual(6);
  });

  it('takes txs from the pool, the network, and the proposal', async () => {
    const original = await generateTransactions(10);
    setupTxPools(2, 4, original);

    // Random shuffle the txs so we test that the collection handles gaps in where txs are found
    const txs = shuffleTxs([...original]);
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const proposal = buildProposal(original.slice(6), hashes);
    const results = await txProvider.getTxsForBlockProposal(proposal, opts);
    const expected: TxResults = { txs, missingTxs: [] };
    await checkResults(results, expected);
    // all txs should be in the pool
    expect(txPools.size).toEqual(10);
  });

  it('prioritizes txs from the pool, then proposal, then network', async () => {
    // Annotate txs with "source" to track where they came from
    const txs = await generateTransactions(10);

    const poolTxs = txs.slice(0, 5).map(tx => Object.assign(Tx.clone(tx) as TxWithHash, { source: 'pool' })); // 5 txs in pool
    poolTxs.forEach(tx => txPools.set(tx.txHash.toString(), tx));

    const proposalTxs = txs.slice(0, 6).map(tx => Object.assign(Tx.clone(tx) as TxWithHash, { source: 'proposal' })); // 6 txs in proposal
    const proposalTxHashes = txs.map(tx => tx.txHash);
    const proposal = buildProposal(proposalTxs, proposalTxHashes);

    const p2pTxs = txs.slice(0, 8).map(tx => Object.assign(Tx.clone(tx) as TxWithHash, { source: 'network' })); // 8 txs on p2p
    additionalP2PTxs.push(...p2pTxs);

    // Spy on the instrumentation methods to check how many txs were collected from each source
    const [incMissingTxsSpy, incTxsFromProposalsSpy, incTxsFromP2PSpy, incTxsFromMempoolSpy] = (
      ['incMissingTxs', 'incTxsFromProposals', 'incTxsFromP2P', 'incTxsFromMempool'] as const
    ).map(method => jest.spyOn(txProvider.instrumentation, method));

    // Check result is correct
    const results = await txProvider.getTxsForBlockProposal(proposal, opts);
    const expected: TxResults = { txs: txs.slice(0, 8), missingTxs: txs.slice(8).map(t => t.txHash) };
    await checkResults(results, expected);
    expect(txPools.size).toEqual(8);

    // Check the sources of the txs
    expect(results.txs.slice(0, 5).every(tx => 'source' in tx && tx.source === 'pool')).toBeTruthy();
    expect(results.txs.slice(5, 6).every(tx => 'source' in tx && tx.source === 'proposal')).toBeTruthy();
    expect(results.txs.slice(6, 8).every(tx => 'source' in tx && tx.source === 'network')).toBeTruthy();

    // Check instrumentation calls
    expect(incTxsFromMempoolSpy).toHaveBeenCalledWith(5);
    expect(incTxsFromProposalsSpy).toHaveBeenCalledWith(1);
    expect(incTxsFromP2PSpy).toHaveBeenCalledWith(2);
    expect(incMissingTxsSpy).toHaveBeenCalledWith(2);
  });

  it('reports missing txs', async () => {
    const original = await generateTransactions(10);
    setupTxPools(0, 4, original);
    const originalHashes = await Promise.all(original.map(tx => tx.getTxHash()));

    // Random shuffle the txs so we test that the collection handles gaps in where txs are found
    const txs = original;
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    const proposal = buildProposal(txs.slice(4, 8), hashes);
    const results = await txProvider.getTxsForBlockProposal(proposal, opts);
    const expected: TxResults = { txs: txs.slice(0, 8), missingTxs: originalHashes.slice(8) };
    await checkResults(results, expected);
    // all txs should be in the pool
    expect(txPools.size).toEqual(8);
  });

  it("does not add txs from the proposal if their hash isn't in the payload", async () => {
    const original = await generateTransactions(10);
    const additional = await generateTransactions(2);
    setupTxPools(0, 4, original);
    const originalHashes = await Promise.all(original.map(tx => tx.getTxHash()));

    // Random shuffle the txs so we test that the collection handles gaps in where txs are found
    const txs = original;
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Add additional txs and these should not be added to the pool and not in the results
    const proposal = buildProposal(txs.slice(4, 8).concat(additional), hashes);
    const results = await txProvider.getTxsForBlockProposal(proposal, opts);
    const expected: TxResults = { txs: txs.slice(0, 8), missingTxs: originalHashes.slice(8) };
    await checkResults(results, expected);
    // all txs should be in the pool
    expect(txPools.size).toEqual(8);

    // additional txs should not be in the pool
    const additionalHashes = await Promise.all(additional.map(tx => tx.getTxHash()));
    for (const hash of additionalHashes) {
      expect(txPools.has(hash.toString())).toBeFalsy();
    }
  });
});

class TestTxProvider extends TxProvider {
  declare instrumentation: TxProviderInstrumentation;
}
