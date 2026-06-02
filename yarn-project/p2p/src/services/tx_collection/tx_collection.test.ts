import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { getDefaultConfig } from '@aztec/foundation/config';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { L2Block } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxPoolV2, TxPoolV2Events } from '../../mem_pools/tx_pool_v2/interfaces.js';
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import type { BlockTxsSource } from '../reqresp/protocols/block_txs/block_txs_reqresp.js';
import { type TxCollectionConfig, txCollectionConfigMappings } from './config.js';
import type { FileStoreTxSource } from './file_store_tx_source.js';
import { type FastCollectionRequest, type IReqRespTxsCollector, TxCollection } from './tx_collection.js';
import type { TxSource } from './tx_source.js';

describe('TxCollection', () => {
  let txCollection: TestTxCollection;

  const mockP2PService = mock<BatchTxRequesterLibP2PService>();
  let nodes: MockProxy<TxSource>[];
  let txPool: MockProxy<TxPoolV2>;
  let constants: L1RollupConstants;
  let config: TxCollectionConfig;
  let dateProvider: TestDateProvider;

  let deadline: Date;
  let txs: Tx[];
  let txHashes: TxHash[];
  let block: L2Block;

  const makeNode = (name: string) => {
    const node = mock<TxSource>();
    node.getInfo.mockReturnValue(name);
    node.getTxsByHash.mockResolvedValue({ validTxs: [], invalidTxHashes: [] });
    return node;
  };

  const makeFileStoreSource = (name: string) => {
    const source = mock<FileStoreTxSource>();
    source.getInfo.mockReturnValue(name);
    source.getTxsByHash.mockResolvedValue({ validTxs: [], invalidTxHashes: [] });
    return source;
  };

  const makeTx = async (txHash?: string | TxHash) => {
    const tx = Tx.random({ txHash });
    await tx.recomputeHash();
    return tx;
  };

  const makeL2Block = (blockNumber = 1, slotNumber?: number) =>
    L2Block.random(BlockNumber(blockNumber), {
      txsPerBlock: 4,
      txOptions: {
        numPublicCallsPerTx: 3,
        numPublicLogsPerCall: 1,
      },
      ...(slotNumber !== undefined ? { slotNumber: SlotNumber(slotNumber) } : {}),
    });

  const setNodeTxs = (node: MockProxy<TxSource>, txs: Tx[]) => {
    node.getTxsByHash.mockImplementation(async hashes => {
      await sleep(1);
      return {
        validTxs: hashes.map(h => txs.find(tx => tx.txHash.equals(h))).filter(tx => tx !== undefined),
        invalidTxHashes: [],
      };
    });
  };

  const blockTxsSourceFromL2Block = (b: L2Block): BlockTxsSource => ({
    txHashes: b.body.txEffects.map(e => e.txHash),
    archive: b.archive.root,
  });

  const blockTxsSourceMatches = (actual: BlockTxsSource, expected: BlockTxsSource) =>
    actual.txHashes.length === expected.txHashes.length &&
    expected.txHashes.every((h, i) => h.equals(actual.txHashes[i]!)) &&
    actual.archive.equals(expected.archive);

  const expectLastReqRespCollectorArgs = (getArgs: () => Parameters<IReqRespTxsCollector>) => {
    const args = getArgs();
    expect(args[1]).toBeDefined();
    expect(blockTxsSourceMatches(args[1], blockTxsSourceFromL2Block(block))).toBe(true);
    expect(args[2]).toBeUndefined();
  };

  const setReqRespResponse = (promise: Promise<Tx[]>) => {
    let lastArgs: Parameters<IReqRespTxsCollector> | undefined;
    txCollection.reqRespTxsCollector = jest.fn<IReqRespTxsCollector>().mockImplementation((...x) => {
      lastArgs = x;
      return promise;
    });
    return () => {
      expect(lastArgs).toBeDefined();
      return lastArgs!;
    };
  };

  const setReqRespTxs = (txs: Tx[]) => {
    return setReqRespResponse(Promise.resolve(txs));
  };

  const expectTxsMinedInPool = (txs: Tx[]) => {
    expect(txPool.addMinedTxs).toHaveBeenCalledWith(txs, block.header, { source: 'tx-collection' });
  };

  const sortByHash = (txs: Tx[]) => txs.sort((a, b) => a.txHash.toString().localeCompare(b.txHash.toString()));

  beforeEach(async () => {
    nodes = [makeNode('node1'), makeNode('node2')];

    txPool = mock<TxPoolV2>();
    txPool.getTxsByHash.mockResolvedValue([]);

    dateProvider = new TestDateProvider();

    constants = {
      ...EmptyL1RollupConstants,
      l1GenesisTime: BigInt(dateProvider.nowInSeconds()),
      slotDuration: 12,
      epochDuration: 4,
    };

    config = {
      ...getDefaultConfig(txCollectionConfigMappings),
      txCollectionNodeRpcMaxBatchSize: 5,
      txCollectionFastMaxParallelRequestsPerNode: 2,
      txCollectionFastNodeIntervalMs: 100,
      txCollectionFileStoreFastDelayMs: 100,
    };

    txs = await Promise.all([makeTx(), makeTx(), makeTx()]);
    txHashes = txs.map(tx => tx.txHash);
    block = await makeL2Block();
    deadline = new Date(dateProvider.now() + 60 * 60 * 1000);

    txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);
    setReqRespTxs([]);
  });

  afterEach(() => {
    txCollection.stop();
  });

  describe('fast tx collection', () => {
    it('collects txs from nodes only', async () => {
      setNodeTxs(nodes[0], txs);
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(txCollection.reqRespTxsCollector).not.toHaveBeenCalled();
      expectTxsMinedInPool(txs);
      expect(collected).toEqual(txs);
    });

    it('collects from nodes distributing batches', async () => {
      txs = await Promise.all(times(20, () => makeTx()));
      txHashes = txs.map(tx => tx.txHash);
      setNodeTxs(nodes[0], txs);
      setNodeTxs(nodes[1], txs.slice(15, 20));

      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes.slice(0, 5));
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes.slice(5, 10));
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes.slice(10, 15));
      expect(nodes[0].getTxsByHash).toHaveBeenCalledTimes(3);

      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes.slice(10, 15));
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes.slice(15, 20));

      expectTxsMinedInPool(txs.slice(0, 5));
      expectTxsMinedInPool(txs.slice(5, 10));
      expectTxsMinedInPool(txs.slice(10, 15));
      expectTxsMinedInPool(txs.slice(15, 20));

      expect(sortByHash(collected)).toEqual(sortByHash(txs));
    });

    it('collects leftover txs from reqresp', async () => {
      setNodeTxs(nodes[0], [txs[0]]);
      setNodeTxs(nodes[1], [txs[1]]);
      const argsGetter = setReqRespTxs([txs[2]]);
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(txCollection.reqRespTxsCollector).toHaveBeenCalledTimes(1);
      expectLastReqRespCollectorArgs(argsGetter);
      expectTxsMinedInPool([txs[0]]);
      expectTxsMinedInPool([txs[1]]);
      expectTxsMinedInPool([txs[2]]);
      expect(collected).toEqual(txs);
    });

    it('collects via reqresp if no nodes are configured', async () => {
      txCollection = new TestTxCollection(mockP2PService, [], constants, txPool, config, [], dateProvider);
      const argsGetter = setReqRespTxs(txs);
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(txCollection.reqRespTxsCollector).toHaveBeenCalledTimes(1);
      expectLastReqRespCollectorArgs(argsGetter);
      expectTxsMinedInPool(txs);
      expect(collected).toEqual(txs);
    });

    it('starts reqresp immediately when no nodes are configured', async () => {
      // Large initial wait — if reqresp were gated by it, the collection would take ~10s.
      config = { ...config, txCollectionFastNodesTimeoutBeforeReqRespMs: 10_000 };
      txCollection = new TestTxCollection(mockP2PService, [], constants, txPool, config, [], dateProvider);
      setReqRespTxs(txs);

      const startTime = dateProvider.now();
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });

      expect(txCollection.reqRespTxsCollector).toHaveBeenCalledTimes(1);
      expect(dateProvider.now() - startTime).toBeLessThan(1000);
      expect(collected).toEqual(txs);
    });

    it('keeps retrying txs not found until deadline', async () => {
      deadline = new Date(dateProvider.now() + 2000);
      setNodeTxs(nodes[0], [txs[0]]);
      const argsGetter = setReqRespTxs([txs[1]]);

      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      // Allow 5ms tolerance: setTimeout in RequestTracker can fire slightly before dateProvider.now() catches up
      expect(dateProvider.now()).toBeGreaterThanOrEqual(+deadline - 5);
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[2]]);
      expect(txCollection.reqRespTxsCollector).toHaveBeenCalledTimes(1);
      expectLastReqRespCollectorArgs(argsGetter);
      expectTxsMinedInPool([txs[0]]);
      expectTxsMinedInPool([txs[1]]);
      expect(collected).toEqual([txs[0], txs[1]]);
    });

    it('stops collecting a tx from nodes when found', async () => {
      deadline = new Date(dateProvider.now() + 4000);
      txs = await Promise.all(times(4, () => makeTx()));
      txHashes = txs.map(tx => tx.txHash);

      const collectorPromise = promiseWithResolvers<Tx[]>();
      setReqRespResponse(collectorPromise.promise);
      const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

      await sleep(1000);
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);

      // Simulate a tx found in a node, another one via reqresp, and a third one added to the pool via gossipsub
      setNodeTxs(nodes[0], [txs[0]]);
      collectorPromise.resolve([txs[1]]);
      txCollection.handleTxsAddedToPool({ txs: [txs[2]], source: 'test' });
      jest.clearAllMocks();

      const collected = await collectionPromise;
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[3]]);
      expect(nodes[0].getTxsByHash).not.toHaveBeenCalledWith(txHashes);

      expect(dateProvider.now()).toBeGreaterThanOrEqual(+deadline);
      expect(sortByHash(collected)).toEqual(sortByHash([txs[0], txs[1], txs[2]]));
    });

    it('returns if last txs are retrieved from the pool via gossipsub', async () => {
      deadline = new Date(dateProvider.now() + 2000);
      setNodeTxs(nodes[0], [txs[0]]);
      setReqRespTxs([txs[1]]);

      const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });
      await sleep(1000);
      txCollection.handleTxsAddedToPool({ txs: [txs[2]], source: 'test' });
      const collected = await collectionPromise;

      expect(dateProvider.now()).toBeLessThan(+deadline);
      expectTxsMinedInPool([txs[0]]);
      expectTxsMinedInPool([txs[1]]);
      expect(collected).toEqual([txs[0], txs[1], txs[2]]);
    });

    it('refuses to collect if deadline is in the past', async () => {
      deadline = new Date(dateProvider.now() - 1000);
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(collected).toEqual([]);
      expect(nodes[0].getTxsByHash).not.toHaveBeenCalled();
      expect(txCollection.reqRespTxsCollector).not.toHaveBeenCalled();
    });

    describe('cancellation signals', () => {
      /** Captures the FastCollectionRequest during collectFast, before it's removed in finally. */
      const captureRequest = () => {
        let captured: FastCollectionRequest | undefined;
        const origCollectFast = txCollection.collectFast.bind(txCollection);
        jest.spyOn(txCollection, 'collectFast').mockImplementation((request, opts) => {
          captured = request;
          return origCollectFast(request, opts);
        });
        return () => captured!;
      };

      // Step 1: notFinished() respects requestTracker.checkCancelled()
      it('stops node collection loop when tracker is externally cancelled', async () => {
        deadline = new Date(dateProvider.now() + 10_000);
        const collectorPromise = promiseWithResolvers<Tx[]>();
        setReqRespResponse(collectorPromise.promise);

        const getRequest = captureRequest();
        const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

        await sleep(200);
        const request = getRequest();
        expect(request).toBeDefined();

        request.requestTracker.cancel();
        collectorPromise.resolve([]);

        const collected = await collectionPromise;
        expect(dateProvider.now()).toBeLessThan(+deadline);
        expect(collected).toEqual([]);
      });

      // Step 18: skips reqresp when all txs found during initial wait
      it('skips reqresp when all txs are found during initial node wait', async () => {
        config = { ...config, txCollectionFastNodesTimeoutBeforeReqRespMs: 10_000 };
        txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);

        setNodeTxs(nodes[0], txs);
        setReqRespTxs([]);
        const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });

        expect(txCollection.reqRespTxsCollector).not.toHaveBeenCalled();
        expect(collected).toEqual(txs);
      });

      // Step 18: skips reqresp when deadline expires during initial wait
      it('skips reqresp when deadline expires during initial node wait', async () => {
        deadline = new Date(dateProvider.now() + 200);
        config = { ...config, txCollectionFastNodesTimeoutBeforeReqRespMs: 10_000 };
        txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);
        setReqRespTxs([]);

        const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });

        expect(txCollection.reqRespTxsCollector).not.toHaveBeenCalled();
        expect(dateProvider.now()).toBeGreaterThanOrEqual(+deadline - 5);
        expect(collected).toEqual([]);
      });

      // Node loop sleep between retries is interruptible by cancellation
      it('cancellation wakes node loop sleep immediately', async () => {
        deadline = new Date(dateProvider.now() + 30_000);
        config = {
          ...config,
          txCollectionFastNodesTimeoutBeforeReqRespMs: 30_000,
          txCollectionFastNodeIntervalMs: 30_000,
        };
        txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);
        setReqRespTxs([]);

        // Nodes return nothing, so node loops will sleep for 30s between retries
        const getRequest = captureRequest();
        const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

        // Wait for first node RPC call to complete, then node loop enters 30s sleep
        await sleep(200);
        expect(nodes[0].getTxsByHash).toHaveBeenCalled();

        const startTime = dateProvider.now();
        getRequest().requestTracker.cancel();
        await collectionPromise;

        // Should return almost immediately, not after 30s
        expect(dateProvider.now() - startTime).toBeLessThan(1000);
      });

      // Step 2: cancellationToken in initial wait race (L124)
      it('exits initial wait when tracker is cancelled before reqresp starts', async () => {
        deadline = new Date(dateProvider.now() + 10_000);
        config = {
          ...config,
          txCollectionFastNodesTimeoutBeforeReqRespMs: 10_000,
          txCollectionFastNodeIntervalMs: 5_000,
        };
        txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);
        setReqRespTxs([]);

        const getRequest = captureRequest();
        const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

        await sleep(50);
        const request = getRequest();
        expect(request).toBeDefined();
        // Reqresp should not have started yet — we're still in the initial wait
        expect(txCollection.reqRespTxsCollector).not.toHaveBeenCalled();

        request.requestTracker.cancel();
        await collectionPromise;

        // Should have exited without ever starting reqresp
        expect(txCollection.reqRespTxsCollector).not.toHaveBeenCalled();
        expect(dateProvider.now()).toBeLessThan(+deadline);
      });

      // Step 3: cancellationToken in main wait race (L135)
      it('exits main wait when tracker is cancelled during reqresp', async () => {
        deadline = new Date(dateProvider.now() + 10_000);
        config = { ...config, txCollectionFastNodesTimeoutBeforeReqRespMs: 1 };
        txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);
        setReqRespTxs([]);

        const collectorPromise = promiseWithResolvers<Tx[]>();
        setReqRespResponse(collectorPromise.promise);

        const getRequest = captureRequest();
        const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

        await sleep(200);
        expect(txCollection.reqRespTxsCollector).toHaveBeenCalled();

        getRequest().requestTracker.cancel();
        collectorPromise.resolve([]);

        await collectionPromise;
        expect(dateProvider.now()).toBeLessThan(+deadline);
      });

      // Step 4: requestTracker.cancel() in finally block
      it('tracker is cancelled after collectFast exits normally', async () => {
        setNodeTxs(nodes[0], txs);
        const getRequest = captureRequest();

        await txCollection.collectFastForBlock(block, txHashes, { deadline });

        expect(getRequest().requestTracker.checkCancelled()).toBe(true);
      });

      // Step 5: requestTracker.cancel() in stop()
      it('stop() cancels all request trackers', async () => {
        deadline = new Date(dateProvider.now() + 10_000);
        const collectorPromise = promiseWithResolvers<Tx[]>();
        setReqRespResponse(collectorPromise.promise);

        const getRequest = captureRequest();
        const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

        await sleep(100);
        const request = getRequest();
        expect(request).toBeDefined();
        expect(request.requestTracker.checkCancelled()).toBe(false);

        txCollection.stop();

        expect(request.requestTracker.checkCancelled()).toBe(true);
        collectorPromise.resolve([]);
        await collectionPromise;
      });

      // Step 8: stopCollectingForBlocksUpTo cancels in-flight fast collection
      it('stopCollectingForBlocksUpTo cancels in-flight fast collection', async () => {
        deadline = new Date(dateProvider.now() + 10_000);
        const collectorPromise = promiseWithResolvers<Tx[]>();
        setReqRespResponse(collectorPromise.promise);

        const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

        await sleep(100);
        txCollection.stopCollectingForBlocksUpTo(block.number);
        collectorPromise.resolve([]);

        const collected = await collectionPromise;
        expect(dateProvider.now()).toBeLessThan(+deadline);
        expect(collected).toEqual([]);
      });

      // Step 9: stopCollectingForBlocksAfter cancels in-flight fast collection
      it('stopCollectingForBlocksAfter cancels in-flight fast collection', async () => {
        deadline = new Date(dateProvider.now() + 10_000);
        const collectorPromise = promiseWithResolvers<Tx[]>();
        setReqRespResponse(collectorPromise.promise);

        const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

        await sleep(100);
        txCollection.stopCollectingForBlocksAfter(BlockNumber(block.number - 1));
        collectorPromise.resolve([]);

        const collected = await collectionPromise;
        expect(dateProvider.now()).toBeLessThan(+deadline);
        expect(collected).toEqual([]);
      });

      // Step 17: request is cleaned up by finally block (not by stopCollectingForBlocks)
      it('request is cleaned up by finally block after stopCollectingForBlocksUpTo', async () => {
        deadline = new Date(dateProvider.now() + 10_000);
        const collectorPromise = promiseWithResolvers<Tx[]>();
        setReqRespResponse(collectorPromise.promise);

        const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

        await sleep(100);
        expect(txCollection.requests.size).toBe(1);

        txCollection.stopCollectingForBlocksUpTo(block.number);
        collectorPromise.resolve([]);
        await collectionPromise;

        expect(txCollection.requests.size).toBe(0);
      });
    });
  });

  describe('file store collection', () => {
    let fileStoreSources: MockProxy<FileStoreTxSource>[];

    const setFileStoreTxs = (source: MockProxy<FileStoreTxSource>, txsToReturn: Tx[]) => {
      source.getTxsByHash.mockImplementation(hashes => {
        return Promise.resolve({
          validTxs: hashes.map(h => txsToReturn.find(tx => tx.txHash.equals(h))).filter(tx => tx !== undefined),
          invalidTxHashes: [],
        });
      });
    };

    beforeEach(() => {
      fileStoreSources = [makeFileStoreSource('store1')];
      txCollection = new TestTxCollection(
        mockP2PService,
        nodes,
        constants,
        txPool,
        config,
        fileStoreSources,
        dateProvider,
      );
      setReqRespTxs([]);
    });

    it('collects txs from file store after configured delay', async () => {
      setFileStoreTxs(fileStoreSources[0], txs);

      // Long deadline so the collection ends when file store finds the txs (not when deadline fires)
      deadline = new Date(dateProvider.now() + 5000);
      const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

      // File store should not have been called yet (delays haven't elapsed)
      expect(fileStoreSources[0].getTxsByHash).not.toHaveBeenCalled();

      // Wait for: node wait (200ms default) + file store delay (100ms) + worker processing
      await sleep(500);
      await collectionPromise;

      // File store should now have been called for each tx
      expect(fileStoreSources[0].getTxsByHash).toHaveBeenCalled();
    });

    it('does not download txs from file store if found via P2P before delay expires', async () => {
      setFileStoreTxs(fileStoreSources[0], txs);

      // Long deadline so the collection ends when all txs are found (not when deadline fires)
      deadline = new Date(dateProvider.now() + 5000);
      const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

      // Simulate all txs found via P2P before delay expires — this cancels the tracker immediately
      txCollection.handleTxsAddedToPool({ txs, source: 'test' });

      await sleep(100);
      await collectionPromise;

      // File store should not have downloaded any txs because they were all found before the delay
      const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
      expect(allCalls.length).toBe(0);
    });
  });
});

class TestTxCollection extends TxCollection {
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  declare requests: Set<FastCollectionRequest>;
  declare fileStoreFastCollection: TxCollection['fileStoreFastCollection'];
  declare handleTxsAddedToPool: TxPoolV2Events['txs-added'];
  declare collectFast: (request: FastCollectionRequest, opts: { pinnedPeer?: PeerId }) => Promise<void>;
  declare reqRespTxsCollector?: IReqRespTxsCollector;
}
