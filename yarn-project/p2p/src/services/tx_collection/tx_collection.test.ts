import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { getDefaultConfig } from '@aztec/foundation/config';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { L2Block } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { Tx, TxArray, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxPool } from '../../mem_pools/index.js';
import type { TxPoolEvents } from '../../mem_pools/tx_pool/tx_pool.js';
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import type { ConnectionSampler } from '../reqresp/connection-sampler/connection_sampler.js';
import { type ReqRespInterface, ReqRespSubProtocol } from '../reqresp/interface.js';
import { chunkTxHashesRequest } from '../reqresp/protocols/tx.js';
import { ReqRespStatus } from '../reqresp/status.js';
import { type TxCollectionConfig, txCollectionConfigMappings } from './config.js';
import { FastTxCollection } from './fast_tx_collection.js';
import type { FileStoreTxSource } from './file_store_tx_source.js';
import type { SlowTxCollection } from './slow_tx_collection.js';
import { type FastCollectionRequest, TxCollection } from './tx_collection.js';
import type { TxSource } from './tx_source.js';

describe('TxCollection', () => {
  let txCollection: TestTxCollection;

  let reqResp: MockProxy<Pick<ReqRespInterface, 'sendBatchRequest' | 'sendRequestToPeer'>>;
  const connectionSampler = mock<ConnectionSampler>();
  const mockP2PService = mock<BatchTxRequesterLibP2PService>({ connectionSampler });
  let nodes: MockProxy<TxSource>[];
  let txPool: MockProxy<TxPool>;
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
    node.getTxsByHash.mockResolvedValue([]);
    return node;
  };

  const makeFileStoreSource = (name: string) => {
    const source = mock<FileStoreTxSource>();
    source.getInfo.mockReturnValue(name);
    source.getTxsByHash.mockResolvedValue([]);
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
      return hashes.map(h => txs.find(tx => tx.txHash.equals(h)));
    });
  };

  const setReqRespTxs = (txs: Tx[]) => {
    reqResp.sendBatchRequest.mockImplementation(async (_subProtocol, hashes) => {
      await sleep(1);

      //NOTE: The type of hashes is Array<TxHashArray>
      //Hashes is array of arrays
      return hashes
        .flat()
        .map(h => {
          return txs.find(tx => {
            return tx.txHash.equals(h as TxHash);
          });
        })
        .filter(tx => tx !== undefined) as any[];
    });
  };

  const expectReqRespToHaveBeenCalledWith = (txHashes: TxHash[], opts: { pinnedPeer?: PeerId } = {}) => {
    expect(reqResp.sendBatchRequest).toHaveBeenCalledWith(
      ReqRespSubProtocol.TX,
      chunkTxHashesRequest(txHashes),
      opts.pinnedPeer,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  };

  const expectTxsAddedToPool = (txs: Tx[]) => {
    expect(txPool.addTxs).toHaveBeenCalledWith(txs, { source: 'tx-collection' });
  };

  const sortByHash = (txs: Tx[]) => txs.sort((a, b) => a.txHash.toString().localeCompare(b.txHash.toString()));

  beforeEach(async () => {
    reqResp = mock<Pick<ReqRespInterface, 'sendBatchRequest' | 'sendRequestToPeer'>>();
    reqResp.sendBatchRequest.mockResolvedValue([]);
    reqResp.sendRequestToPeer.mockResolvedValue({ status: ReqRespStatus.SUCCESS, data: Buffer.alloc(0) });

    nodes = [makeNode('node1'), makeNode('node2')];

    txPool = mock<TxPool>();
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
      txCollectionMissingTxsCollectorType: 'old',
      txCollectionFileStoreSlowDelayMs: 100,
      txCollectionFileStoreFastDelayMs: 100,
    };

    txs = await Promise.all([makeTx(), makeTx(), makeTx()]);
    txHashes = txs.map(tx => tx.txHash);
    block = await makeL2Block();
    deadline = new Date(dateProvider.now() + 60 * 60 * 1000);

    mockP2PService.reqResp = reqResp;
    txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);
  });

  afterEach(async () => {
    await txCollection.stop();
    dateProvider.clearPendingTimeouts();
  });

  describe('slow collection', () => {
    it('collects missing txs from node', async () => {
      txCollection.startCollecting(block, txHashes);

      setNodeTxs(nodes[0], txs);
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expectTxsAddedToPool(txs);

      jest.clearAllMocks();
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).not.toHaveBeenCalled();
      expect(nodes[1].getTxsByHash).not.toHaveBeenCalled();
    });

    it('collects missing txs from multiple nodes', async () => {
      txCollection.startCollecting(block, txHashes);

      setNodeTxs(nodes[0], [txs[0]]);
      setNodeTxs(nodes[1], [txs[1]]);
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expectTxsAddedToPool([txs[0]]);
      expectTxsAddedToPool([txs[1]]);

      jest.clearAllMocks();
      setNodeTxs(nodes[0], [txs[0], txs[2]]);
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[2]]);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith([txHashes[2]]);
      expectTxsAddedToPool([txs[2]]);

      jest.clearAllMocks();
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).not.toHaveBeenCalled();
      expect(nodes[1].getTxsByHash).not.toHaveBeenCalled();
    });

    it('collects tx from nodes in batches', async () => {
      txs = await Promise.all(times(8, () => makeTx()));
      txHashes = txs.map(tx => tx.txHash);
      txCollection.startCollecting(block, txHashes);

      setNodeTxs(nodes[0], txs);
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes.slice(0, 5));
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes.slice(5, 10));
      expectTxsAddedToPool(txs.slice(0, 5));
      expectTxsAddedToPool(txs.slice(5, 10));

      jest.clearAllMocks();
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).not.toHaveBeenCalled();
      expect(nodes[1].getTxsByHash).not.toHaveBeenCalled();
    });

    it('collects missing txs via reqresp after having been requested once from nodes', async () => {
      txCollection.startCollecting(block, txHashes);

      setNodeTxs(nodes[0], [txs[0]]);
      setNodeTxs(nodes[1], [txs[1]]);
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(reqResp.sendBatchRequest).not.toHaveBeenCalled();
      expectTxsAddedToPool([txs[0]]);
      expectTxsAddedToPool([txs[1]]);

      jest.clearAllMocks();
      setReqRespTxs([txs[2]]);
      await txCollection.trigger();
      expectReqRespToHaveBeenCalledWith([txHashes[2]]);
      expectTxsAddedToPool([txs[2]]);

      jest.clearAllMocks();
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).not.toHaveBeenCalled();
      expect(nodes[1].getTxsByHash).not.toHaveBeenCalled();
    });

    it('collects missing txs directly via reqresp if there are no nodes configured', async () => {
      txCollection = new TestTxCollection(mockP2PService, [], constants, txPool, config, [], dateProvider);
      txCollection.startCollecting(block, txHashes);

      setReqRespTxs([txs[0]]);
      await txCollection.trigger();
      expectReqRespToHaveBeenCalledWith(txHashes);
      expectTxsAddedToPool([txs[0]]);

      jest.clearAllMocks();
      setReqRespTxs([txs[1]]);
      await txCollection.trigger();
      expectReqRespToHaveBeenCalledWith([txHashes[1], txHashes[2]]);
      expectTxsAddedToPool([txs[1]]);
    });

    it('rejects expired txs', async () => {
      const block1 = await makeL2Block(1, 1);
      const block2 = await makeL2Block(100, 100);

      txCollection.startCollecting(block1, [txHashes[0]]);
      txCollection.startCollecting(block2, [txHashes[1]]);
      const newTime = (Number(constants.l1GenesisTime) + constants.epochDuration * constants.slotDuration * 2) * 1000;
      dateProvider.setTime(newTime);

      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[1]]);
    });

    it('does not request missing txs being collected via fast collection', async () => {
      config = { ...config, txCollectionDisableSlowDuringFastRequests: false };
      txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);

      const innerCollectFastPromise = promiseWithResolvers<void>();
      jest.spyOn(txCollection.fastCollection, 'collectFast').mockImplementation(async request => {
        txCollection.fastCollection.requests.add(request);
        await innerCollectFastPromise.promise;
        txCollection.fastCollection.requests.delete(request);
      });

      txCollection.startCollecting(block, txHashes);
      void txCollection.collectFastForBlock(block, [txHashes[0]], { deadline });

      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[1], txHashes[2]]);

      innerCollectFastPromise.resolve();
    });

    it('pauses slow collection if fast collection is ongoing', async () => {
      config = { ...config, txCollectionDisableSlowDuringFastRequests: true };
      txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);

      const innerCollectFastPromise = promiseWithResolvers<void>();
      jest.spyOn(txCollection.fastCollection, 'collectFast').mockImplementation(async request => {
        txCollection.fastCollection.requests.add(request);
        await innerCollectFastPromise.promise;
        txCollection.fastCollection.requests.delete(request);
      });

      txCollection.startCollecting(block, txHashes);
      void txCollection.collectFastForBlock(block, [txHashes[0]], { deadline });

      jest.clearAllMocks();
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).not.toHaveBeenCalled();

      innerCollectFastPromise.resolve();
    });

    it('stops collecting a tx when found via fast collection', async () => {
      config = { ...config, txCollectionDisableSlowDuringFastRequests: true };
      txCollection = new TestTxCollection(mockP2PService, nodes, constants, txPool, config, [], dateProvider);

      setNodeTxs(nodes[0], txs);
      txCollection.startCollecting(block, txHashes);

      await txCollection.collectFastForBlock(block, [txHashes[0]], { deadline });
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[0]]);
      expectTxsAddedToPool([txs[0]]);

      jest.clearAllMocks();
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[1], txHashes[2]]);
      expectTxsAddedToPool([txs[1], txs[2]]);
    });

    it('stops collecting a tx when reported as found from the pool', async () => {
      txCollection.startCollecting(block, txHashes);

      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);

      await txCollection.handleTxsAddedToPool({ txs: [txs[0]], source: 'test' });

      jest.clearAllMocks();
      setNodeTxs(nodes[0], [txs[1]]);
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[1], txHashes[2]]);
      expectTxsAddedToPool([txs[1]]);
    });

    it('stops collecting txs based on block number', async () => {
      const blocks = await Promise.all(times(3, i => makeL2Block(i + 1)));
      txCollection.startCollecting(blocks[0], [txHashes[0]]);
      txCollection.startCollecting(blocks[1], [txHashes[1]]);
      txCollection.startCollecting(blocks[2], [txHashes[2]]);

      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);

      jest.clearAllMocks();
      txCollection.stopCollectingForBlocksUpTo(BlockNumber(1));
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[1], txHashes[2]]);

      jest.clearAllMocks();
      txCollection.stopCollectingForBlocksAfter(BlockNumber(2));
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[1]]);
    });

    it('reconciles found transactions with the tx pool if not advertised via events', async () => {
      txCollection.startCollecting(block, txHashes);

      setNodeTxs(nodes[0], [txs[0]]);
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expectTxsAddedToPool([txs[0]]);

      jest.clearAllMocks();
      txPool.getTxsByHash.mockResolvedValue([txs[1]]);
      await txCollection.trigger();

      jest.clearAllMocks();
      await txCollection.trigger();
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[2]]);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith([txHashes[2]]);
    });
  });

  describe('fast collection', () => {
    it('collects txs from nodes only', async () => {
      setNodeTxs(nodes[0], txs);
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(reqResp.sendBatchRequest).not.toHaveBeenCalled();
      expectTxsAddedToPool(txs);
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

      expectTxsAddedToPool(txs.slice(0, 5));
      expectTxsAddedToPool(txs.slice(5, 10));
      expectTxsAddedToPool(txs.slice(10, 15));
      expectTxsAddedToPool(txs.slice(15, 20));

      expect(sortByHash(collected)).toEqual(sortByHash(txs));
    });

    it('collects leftover txs from reqresp', async () => {
      setNodeTxs(nodes[0], [txs[0]]);
      setNodeTxs(nodes[1], [txs[1]]);
      setReqRespTxs([txs[2]]);
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expectReqRespToHaveBeenCalledWith([txHashes[2]]);
      expectTxsAddedToPool([txs[0]]);
      expectTxsAddedToPool([txs[1]]);
      expectTxsAddedToPool([txs[2]]);
      expect(collected).toEqual(txs);
    });

    it('collects via reqresp if no nodes are configured', async () => {
      txCollection = new TestTxCollection(mockP2PService, [], constants, txPool, config, [], dateProvider);
      setReqRespTxs(txs);
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expectReqRespToHaveBeenCalledWith(txHashes);
      expectTxsAddedToPool(txs);
      expect(collected).toEqual(txs);
    });

    it('keeps retrying txs not found until deadline', async () => {
      deadline = new Date(dateProvider.now() + 2000);
      setNodeTxs(nodes[0], [txs[0]]);
      setReqRespTxs([txs[1]]);

      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(dateProvider.now()).toBeGreaterThanOrEqual(+deadline);
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith([txHashes[2]]);
      expectReqRespToHaveBeenCalledWith([txHashes[1], txHashes[2]]);
      expectTxsAddedToPool([txs[0]]);
      expectTxsAddedToPool([txs[1]]);
      expect(collected).toEqual([txs[0], txs[1]]);
    });

    it('stops collecting a tx from nodes when found', async () => {
      deadline = new Date(dateProvider.now() + 4000);
      txs = await Promise.all(times(4, () => makeTx()));
      txHashes = txs.map(tx => tx.txHash);

      const reqRespPromise = promiseWithResolvers<TxArray[]>();
      reqResp.sendBatchRequest.mockReturnValue(reqRespPromise.promise);
      const collectionPromise = txCollection.collectFastForBlock(block, txHashes, { deadline });

      await sleep(1000);
      expect(nodes[0].getTxsByHash).toHaveBeenCalledWith(txHashes);
      expect(nodes[1].getTxsByHash).toHaveBeenCalledWith(txHashes);

      txPool.addTxs.mockImplementation(txs => {
        jest.clearAllMocks();
        return Promise.resolve(txs.length);
      });

      // Simulate a tx found in a node, another one via reqresp, and a third one added to the pool via gossipsub
      setNodeTxs(nodes[0], [txs[0]]);
      reqRespPromise.resolve([new TxArray(...[txs[1]])]);
      await txCollection.handleTxsAddedToPool({ txs: [txs[2]], source: 'test' });
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
      await txCollection.handleTxsAddedToPool({ txs: [txs[2]], source: 'test' });
      const collected = await collectionPromise;

      expect(dateProvider.now()).toBeLessThan(+deadline);
      expectTxsAddedToPool([txs[0]]);
      expectTxsAddedToPool([txs[1]]);
      expect(collected).toEqual([txs[0], txs[1], txs[2]]);
    });

    it('refuses to collect if deadline is in the past', async () => {
      deadline = new Date(dateProvider.now() - 1000);
      const collected = await txCollection.collectFastForBlock(block, txHashes, { deadline });
      expect(collected).toEqual([]);
      expect(nodes[0].getTxsByHash).not.toHaveBeenCalled();
      expect(reqResp.sendBatchRequest).not.toHaveBeenCalled();
    });
  });

  describe('file store collection', () => {
    let fileStoreSources: MockProxy<FileStoreTxSource>[];

    const setFileStoreTxs = (source: MockProxy<FileStoreTxSource>, txsToReturn: Tx[]) => {
      source.getTxsByHash.mockImplementation(async hashes => {
        return hashes.map(h => txsToReturn.find(tx => tx.txHash.equals(h)));
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
    });

    it('collects txs from file store after slow delay', async () => {
      setFileStoreTxs(fileStoreSources[0], txs);
      txPool.addTxs.mockImplementation(async addedTxs => addedTxs.length);
      txPool.hasTx.mockResolvedValue(false);

      await txCollection.start();
      txCollection.startCollecting(block, txHashes);

      // File store should not have been called yet (delay hasn't elapsed)
      expect(fileStoreSources[0].getTxsByHash).not.toHaveBeenCalled();

      // Advance time past the 4s slow delay
      dateProvider.setTime(dateProvider.now() + 200);
      // Allow the async sleep resolution and worker processing to complete
      await sleep(100);

      // File store should now have been called for each tx
      expect(fileStoreSources[0].getTxsByHash).toHaveBeenCalled();
    });

    it('does not download txs from file store if found via P2P before delay expires', async () => {
      setFileStoreTxs(fileStoreSources[0], txs);
      txPool.addTxs.mockImplementation(async addedTxs => addedTxs.length);
      txPool.hasTx.mockResolvedValue(false);

      await txCollection.start();
      txCollection.startCollecting(block, txHashes);

      // Simulate all txs found via P2P before delay expires
      await txCollection.handleTxsAddedToPool({ txs, source: 'test' });

      // Now advance time past the delay
      dateProvider.setTime(dateProvider.now() + 200);
      await sleep(100);

      // File store should not have downloaded any txs because they were all found
      const allCalls = fileStoreSources.flatMap(s => s.getTxsByHash.mock.calls);
      expect(allCalls.length).toBe(0);
    });
  });
});

class TestFastTxCollection extends FastTxCollection {
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  declare requests: Set<FastCollectionRequest>;
  declare collectFast: (
    request: FastCollectionRequest,
    opts: { proposal?: BlockProposal; deadline: Date; pinnedPeer?: PeerId },
  ) => Promise<void>;
}

class TestTxCollection extends TxCollection {
  declare slowCollection: SlowTxCollection;
  declare fastCollection: TestFastTxCollection;
  declare fileStoreCollection: TxCollection['fileStoreCollection'];
  declare handleTxsAddedToPool: TxPoolEvents['txs-added'];
}
