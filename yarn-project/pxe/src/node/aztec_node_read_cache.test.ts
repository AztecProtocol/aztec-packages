import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { MembershipWitness } from '@aztec/foundation/trees';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type BlockParameter, randomInBlock } from '@aztec/stdlib/block';
import type { BlockResponse } from '@aztec/stdlib/interfaces/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { SiloedTag } from '@aztec/stdlib/logs';
import { AppendOnlyTreeSnapshot, MerkleTreeId, PublicDataWitness } from '@aztec/stdlib/trees';
import { BlockHeader, DroppedTxReceipt, MinedTxReceipt, PendingTxReceipt, TxHash, TxStatus } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { AztecNodeReadCache, withReadCache } from './aztec_node_read_cache.js';

describe('AztecNodeReadCache', () => {
  let cache: AztecNodeReadCache;

  beforeEach(() => {
    cache = new AztecNodeReadCache();
  });

  it('shares one in-flight read per key', async () => {
    const deferred = promiseWithResolvers<string>();
    let reads = 0;
    const read = () => {
      reads++;
      return deferred.promise;
    };

    const first = cache.fetch('key', read);
    const second = cache.fetch('key', read);
    deferred.resolve('value');

    await expect(Promise.all([first, second])).resolves.toEqual(['value', 'value']);
    expect(reads).toBe(1);
  });

  it('shares an in-flight read whose value is then turned away', async () => {
    const deferred = promiseWithResolvers<number>();
    let reads = 0;
    const read = () => {
      reads++;
      return deferred.promise;
    };

    const first = cache.fetch('key', read, { shouldCache: () => false });
    const second = cache.fetch('key', read, { shouldCache: () => false });
    deferred.resolve(1);

    await expect(Promise.all([first, second])).resolves.toEqual([1, 1]);
    expect(reads).toBe(1);
  });

  it('evicts rejected reads so callers can retry', async () => {
    let reads = 0;
    const read = () => (++reads === 1 ? Promise.reject(new Error('temporary failure')) : Promise.resolve('value'));

    await expect(cache.fetch('key', read)).rejects.toThrow('temporary failure');
    await expect(cache.fetch('key', read)).resolves.toBe('value');
    await expect(cache.fetch('key', read)).resolves.toBe('value');

    expect(reads).toBe(2);
  });

  it('keeps undefined values by default', async () => {
    let reads = 0;
    const read = () => {
      reads++;
      return Promise.resolve(undefined);
    };

    await expect(cache.fetch('key', read)).resolves.toBeUndefined();
    await expect(cache.fetch('key', read)).resolves.toBeUndefined();

    expect(reads).toBe(1);
  });

  it('evicts settled values that shouldCache turns away', async () => {
    let reads = 0;
    const read = () => Promise.resolve(++reads);

    await expect(cache.fetch('key', read, { shouldCache: value => value > 1 })).resolves.toBe(1);
    await expect(cache.fetch('key', read, { shouldCache: value => value > 1 })).resolves.toBe(2);
    await expect(cache.fetch('key', read, { shouldCache: value => value > 1 })).resolves.toBe(2);

    expect(reads).toBe(2);
  });

  it('wipe clears cached entries', async () => {
    let reads = 0;
    const read = () => Promise.resolve(++reads);

    await expect(cache.fetch('key', read)).resolves.toBe(1);
    cache.wipe();
    await expect(cache.fetch('key', read)).resolves.toBe(2);
  });

  it('a wiped read that fails does not evict the entry of a newer read under the same key', async () => {
    const wiped = promiseWithResolvers<string>();

    const wipedRead = cache.fetch('key', () => wiped.promise);
    cache.wipe();
    await expect(cache.fetch('key', () => Promise.resolve('fresh'))).resolves.toBe('fresh');

    wiped.reject(new Error('temporary failure'));
    await expect(wipedRead).rejects.toThrow('temporary failure');

    await expect(cache.fetch('key', () => Promise.resolve('unexpected'))).resolves.toBe('fresh');
  });
});

describe('withReadCache', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let cache: AztecNodeReadCache;
  let cachedNode: AztecNode;

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
    cache = new AztecNodeReadCache();
    cachedNode = withReadCache(aztecNode, cache);
  });

  it('keeps cache entries separate by method and arguments', async () => {
    const blockHash = BlockHash.random();
    const leafSlot = Fr.random();
    const blockWitness = MembershipWitness.empty(ARCHIVE_HEIGHT);
    const publicDataWitness = PublicDataWitness.random();
    aztecNode.getBlockHashMembershipWitness.mockResolvedValue(blockWitness);
    aztecNode.getPublicDataWitness.mockResolvedValue(publicDataWitness);

    await expect(cachedNode.getBlockHashMembershipWitness(blockHash, blockHash)).resolves.toBe(blockWitness);
    await expect(cachedNode.getPublicDataWitness(blockHash, leafSlot)).resolves.toBe(publicDataWitness);

    expect(aztecNode.getBlockHashMembershipWitness).toHaveBeenCalledTimes(1);
    expect(aztecNode.getPublicDataWitness).toHaveBeenCalledTimes(1);
  });

  it('shares one cache across multiple wrapped nodes', async () => {
    const otherWrapper = withReadCache(aztecNode, cache);
    const blockHash = BlockHash.random();
    const contractAddress = await AztecAddress.random();
    aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));

    await cachedNode.getPublicStorageAt(blockHash, contractAddress, new Fr(100));
    await otherWrapper.getPublicStorageAt(blockHash, contractAddress, new Fr(100));

    expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(1);
  });

  describe('getBlock', () => {
    it('shares repeated reads of a block', async () => {
      const blockNumber = BlockNumber(1);
      const block = makeBlockResponse(blockNumber);
      aztecNode.getBlock.mockResolvedValue(block);

      await expect(cachedNode.getBlock(blockNumber)).resolves.toBe(block);
      await expect(cachedNode.getBlock(blockNumber)).resolves.toBe(block);

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(1);
    });

    it('keys reads by their options', async () => {
      const blockNumber = BlockNumber(1);
      aztecNode.getBlock.mockResolvedValue(makeBlockResponse(blockNumber));

      await cachedNode.getBlock(blockNumber);
      await cachedNode.getBlock(blockNumber, { includeTransactions: true });

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(2);
    });

    it('passes tag-referenced reads through to the node uncached', async () => {
      aztecNode.getBlock.mockResolvedValue(makeBlockResponse(BlockNumber(1)));

      await cachedNode.getBlock('latest');
      await cachedNode.getBlock('latest');

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(2);
    });

    it('evicts undefined results so callers can retry', async () => {
      const blockNumber = BlockNumber(1);
      const block = makeBlockResponse(blockNumber);
      aztecNode.getBlock.mockResolvedValueOnce(undefined);
      aztecNode.getBlock.mockResolvedValueOnce(block);

      await expect(cachedNode.getBlock(blockNumber)).resolves.toBeUndefined();
      await expect(cachedNode.getBlock(blockNumber)).resolves.toBe(block);

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTxReceipt', () => {
    it('serves a plain read from a cached with-effect receipt', async () => {
      const txHash = TxHash.random();
      const mined = MinedTxReceipt.random({ txHash });
      aztecNode.getTxReceipt.mockResolvedValue(mined);

      await expect(cachedNode.getTxReceipt(txHash, { includeTxEffect: true })).resolves.toBe(mined);
      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(mined);

      expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
    });

    it('shares a plain read with an in-flight with-effect read', async () => {
      const txHash = TxHash.random();
      const deferred = promiseWithResolvers<MinedTxReceipt<{ includeTxEffect: true }>>();
      aztecNode.getTxReceipt.mockReturnValue(deferred.promise);

      const withEffect = cachedNode.getTxReceipt(txHash, { includeTxEffect: true });
      const plain = cachedNode.getTxReceipt(txHash);
      const receipt = MinedTxReceipt.random({ txHash });
      deferred.resolve(receipt);

      await expect(Promise.all([withEffect, plain])).resolves.toEqual([receipt, receipt]);
      expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
    });

    it('serves a plain read from its own entry rather than an in-flight with-effect read', async () => {
      const txHash = TxHash.random();
      const mined = MinedTxReceipt.random({ txHash });
      const failing = promiseWithResolvers<MinedTxReceipt<{ includeTxEffect: true }>>();
      aztecNode.getTxReceipt.mockResolvedValueOnce(mined);
      aztecNode.getTxReceipt.mockReturnValueOnce(failing.promise);

      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(mined);
      const withEffect = cachedNode.getTxReceipt(txHash, { includeTxEffect: true });
      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(mined);

      failing.reject(new Error('temporary failure'));
      await expect(withEffect).rejects.toThrow('temporary failure');
      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(mined);

      expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
    });

    it('does not serve a with-effect read from a receipt cached without it', async () => {
      const txHash = TxHash.random();
      aztecNode.getTxReceipt.mockResolvedValue(MinedTxReceipt.random({ txHash }));

      await cachedNode.getTxReceipt(txHash);
      await cachedNode.getTxReceipt(txHash, { includeTxEffect: true });

      expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
    });

    it('passes pending-tx payload requests through to the node uncached', async () => {
      const txHash = TxHash.random();
      aztecNode.getTxReceipt.mockResolvedValue(new PendingTxReceipt(txHash, undefined));

      await cachedNode.getTxReceipt(txHash, { includePendingTx: true });
      await cachedNode.getTxReceipt(txHash, { includePendingTx: true, includeProof: true });

      expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
    });

    it('refetches until the tx is finalized', async () => {
      const txHash = TxHash.random();
      const pending = new PendingTxReceipt(txHash, undefined);
      const dropped = new DroppedTxReceipt(txHash);
      const proven = MinedTxReceipt.random({ txHash, status: TxStatus.PROVEN });
      const finalized = MinedTxReceipt.random({ txHash });
      aztecNode.getTxReceipt.mockResolvedValueOnce(pending);
      aztecNode.getTxReceipt.mockResolvedValueOnce(dropped);
      aztecNode.getTxReceipt.mockResolvedValueOnce(proven);
      aztecNode.getTxReceipt.mockResolvedValueOnce(finalized);

      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(pending);
      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(dropped);
      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(proven);
      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(finalized);
      await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(finalized);

      expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(4);
    });
  });

  buildPinnedWitnessReadTests({
    method: 'getBlockHashMembershipWitness',
    setup: () => {
      const blockHash = BlockHash.random();
      aztecNode.getBlockHashMembershipWitness.mockResolvedValue(undefined);
      return {
        node: aztecNode.getBlockHashMembershipWitness,
        read: block => cachedNode.getBlockHashMembershipWitness(block, blockHash),
      };
    },
  });

  buildPinnedWitnessReadTests({
    method: 'getPublicDataWitness',
    setup: () => {
      const leafSlot = Fr.random();
      aztecNode.getPublicDataWitness.mockResolvedValue(undefined);
      return {
        node: aztecNode.getPublicDataWitness,
        read: block => cachedNode.getPublicDataWitness(block, leafSlot),
      };
    },
  });

  buildPinnedWitnessReadTests({
    method: 'getNoteHashMembershipWitness',
    setup: () => {
      const noteHash = Fr.random();
      aztecNode.getNoteHashMembershipWitness.mockResolvedValue(undefined);
      return {
        node: aztecNode.getNoteHashMembershipWitness,
        read: block => cachedNode.getNoteHashMembershipWitness(block, noteHash),
      };
    },
  });

  buildPinnedWitnessReadTests({
    method: 'getNullifierMembershipWitness',
    setup: () => {
      const nullifier = Fr.random();
      aztecNode.getNullifierMembershipWitness.mockResolvedValue(undefined);
      return {
        node: aztecNode.getNullifierMembershipWitness,
        read: block => cachedNode.getNullifierMembershipWitness(block, nullifier),
      };
    },
  });

  buildPinnedWitnessReadTests({
    method: 'getLowNullifierMembershipWitness',
    setup: () => {
      const nullifier = Fr.random();
      aztecNode.getLowNullifierMembershipWitness.mockResolvedValue(undefined);
      return {
        node: aztecNode.getLowNullifierMembershipWitness,
        read: block => cachedNode.getLowNullifierMembershipWitness(block, nullifier),
      };
    },
  });

  buildPinnedWitnessReadTests({
    method: 'getL1ToL2MessageMembershipWitness',
    setup: () => {
      const messageHash = Fr.random();
      aztecNode.getL1ToL2MessageMembershipWitness.mockResolvedValue(undefined);
      return {
        node: aztecNode.getL1ToL2MessageMembershipWitness,
        read: block => cachedNode.getL1ToL2MessageMembershipWitness(block, messageHash),
      };
    },
  });

  describe('getPublicStorageAt', () => {
    it('caches each slot independently', async () => {
      const blockHash = BlockHash.random();
      const contractAddress = await AztecAddress.random();
      aztecNode.getPublicStorageAt.mockImplementation((_block, _contract, slot) =>
        Promise.resolve(new Fr(slot.toBigInt() + 1n)),
      );

      await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, new Fr(100))).resolves.toEqual(
        new Fr(101),
      );
      await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, new Fr(100))).resolves.toEqual(
        new Fr(101),
      );
      await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, new Fr(101))).resolves.toEqual(
        new Fr(102),
      );

      expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(2);
    });

    it('passes tag-referenced reads through to the node uncached', async () => {
      const contractAddress = await AztecAddress.random();
      const storageSlot = new Fr(100);
      aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));

      await cachedNode.getPublicStorageAt('latest', contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt('latest', contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt({ tag: 'proven' }, contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt({ tag: 'proven' }, contractAddress, storageSlot);

      expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(4);
    });
  });

  describe('findLeavesIndexes', () => {
    it('caches leaf index reads per leaf and only fetches the misses of a batch', async () => {
      const blockHash = BlockHash.random();
      const leafA = Fr.random();
      const leafB = Fr.random();
      const indexA = { data: 7n, ...randomInBlock() };
      const indexB = { data: 8n, ...randomInBlock() };
      aztecNode.findLeavesIndexes.mockResolvedValueOnce([indexA]);
      aztecNode.findLeavesIndexes.mockResolvedValueOnce([indexB]);

      await expect(cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA])).resolves.toEqual([
        indexA,
      ]);
      // leafA is served from the cache: the node only receives the missing leafB.
      await expect(
        cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB]),
      ).resolves.toEqual([indexA, indexB]);

      expect(aztecNode.findLeavesIndexes).toHaveBeenCalledTimes(2);
      expect(aztecNode.findLeavesIndexes).toHaveBeenLastCalledWith(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafB]);
    });

    it('caches undefined reads as non-membership answers', async () => {
      const blockHash = BlockHash.random();
      const leafA = Fr.random();
      const leafB = Fr.random();
      const indexB = { data: 8n, ...randomInBlock() };
      aztecNode.findLeavesIndexes.mockResolvedValueOnce([undefined]);
      aztecNode.findLeavesIndexes.mockResolvedValueOnce([indexB]);

      await expect(cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA])).resolves.toEqual([
        undefined,
      ]);
      await expect(
        cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB]),
      ).resolves.toEqual([undefined, indexB]);

      expect(aztecNode.findLeavesIndexes).toHaveBeenCalledTimes(2);
      expect(aztecNode.findLeavesIndexes).toHaveBeenLastCalledWith(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafB]);
    });

    it('passes tag-referenced reads through to the node uncached', async () => {
      const leaf = Fr.random();
      const index = { data: 7n, ...randomInBlock() };
      aztecNode.findLeavesIndexes.mockResolvedValue([index]);

      await expect(cachedNode.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, [leaf])).resolves.toEqual([
        index,
      ]);
      await expect(cachedNode.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, [leaf])).resolves.toEqual([
        index,
      ]);

      expect(aztecNode.findLeavesIndexes).toHaveBeenCalledTimes(2);
    });
  });

  describe('uncached methods', () => {
    it('passes repeated reads through to the node', async () => {
      aztecNode.getBlockNumber.mockResolvedValue(BlockNumber(42));

      await expect(cachedNode.getBlockNumber()).resolves.toBe(42);
      await expect(cachedNode.getBlockNumber()).resolves.toBe(42);

      expect(aztecNode.getBlockNumber).toHaveBeenCalledTimes(2);
    });

    it('passes tag-addressed log queries through to the node', async () => {
      const query = { tags: [new SiloedTag(Fr.random())] };
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

      await expect(cachedNode.getPrivateLogsByTags(query)).resolves.toEqual([[]]);
      await expect(cachedNode.getPrivateLogsByTags(query)).resolves.toEqual([[]]);

      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
    });

    it('binds passthrough methods to the node', async () => {
      aztecNode.getBlockNumber.mockImplementation(function (this: unknown) {
        return this === aztecNode ? Promise.resolve(BlockNumber(42)) : Promise.reject(new Error('unbound call'));
      });

      const { getBlockNumber } = cachedNode;
      await expect(getBlockNumber()).resolves.toBe(42);
    });
  });
});

function makeBlockResponse(blockNumber: BlockNumber): BlockResponse {
  return {
    header: BlockHeader.empty(),
    archive: AppendOnlyTreeSnapshot.empty(),
    hash: BlockHash.random(),
    checkpointNumber: CheckpointNumber.fromBlockNumber(blockNumber),
    indexWithinCheckpoint: IndexWithinCheckpoint.ZERO,
    number: blockNumber,
  };
}

// The pinned witness reads share one signature, so this registers the same two per-method contracts for each: an
// undefined answer is cached as a non-membership fact, and tag references bypass the cache. `setup` runs inside each
// test (after `beforeEach` rebuilds the node), serves undefined, and returns the method's mock plus a read pinned to a
// fixed query argument.
function buildPinnedWitnessReadTests(opts: {
  method: string;
  setup: () => { node: jest.Mock; read: (block: BlockParameter) => Promise<unknown> };
}) {
  describe(opts.method, () => {
    it('caches undefined reads as non-membership answers', async () => {
      const { node, read } = opts.setup();
      const referenceBlockHash = BlockHash.random();

      await expect(read(referenceBlockHash)).resolves.toBeUndefined();
      await expect(read(referenceBlockHash)).resolves.toBeUndefined();

      expect(node).toHaveBeenCalledTimes(1);
    });

    it('passes tag-referenced reads through to the node uncached', async () => {
      const { node, read } = opts.setup();

      await read('latest');
      await read('latest');

      expect(node).toHaveBeenCalledTimes(2);
    });
  });
}
