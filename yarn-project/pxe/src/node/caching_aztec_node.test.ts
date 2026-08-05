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
import { BlockHeader, type NodeStats } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { type CachingAztecNode, withCache } from './caching_aztec_node.js';

describe('withCache', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let cachedNode: CachingAztecNode;

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
    cachedNode = withCache(aztecNode);
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

  it('gives each wrapper its own cache', async () => {
    const otherWrapper = withCache(aztecNode);
    const blockHash = BlockHash.random();
    const contractAddress = await AztecAddress.random();
    aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));

    await cachedNode.getPublicStorageAt(blockHash, contractAddress, new Fr(100));
    await otherWrapper.getPublicStorageAt(blockHash, contractAddress, new Fr(100));

    expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(2);
  });

  describe('cache semantics', () => {
    it('shares one in-flight read', async () => {
      const { blockHash, contractAddress, storageSlot } = await publicStorageRead();
      const deferred = promiseWithResolvers<Fr>();
      aztecNode.getPublicStorageAt.mockReturnValue(deferred.promise);

      const first = cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);
      const second = cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);
      deferred.resolve(new Fr(7));

      await expect(Promise.all([first, second])).resolves.toEqual([new Fr(7), new Fr(7)]);
      expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(1);
    });

    it('shares an in-flight read whose value is then turned away', async () => {
      const blockHash = BlockHash.random();
      const deferred = promiseWithResolvers<BlockResponse | undefined>();
      aztecNode.getBlock.mockReturnValue(deferred.promise);

      const first = cachedNode.getBlock(blockHash);
      const second = cachedNode.getBlock(blockHash);
      deferred.resolve(undefined);

      await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
      expect(aztecNode.getBlock).toHaveBeenCalledTimes(1);
    });

    it('evicts rejected reads so callers can retry', async () => {
      const { blockHash, contractAddress, storageSlot } = await publicStorageRead();
      aztecNode.getPublicStorageAt.mockRejectedValueOnce(new Error('temporary failure'));
      aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));

      await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot)).rejects.toThrow(
        'temporary failure',
      );
      await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot)).resolves.toEqual(new Fr(1));
      await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot)).resolves.toEqual(new Fr(1));

      expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(2);
    });

    it('a wiped read that fails does not evict the entry of a newer read', async () => {
      const { blockHash, contractAddress, storageSlot } = await publicStorageRead();
      const wiped = promiseWithResolvers<Fr>();
      aztecNode.getPublicStorageAt.mockReturnValueOnce(wiped.promise);
      aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(2));

      const wipedRead = cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);
      cachedNode.wipeCache();
      await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot)).resolves.toEqual(new Fr(2));

      wiped.reject(new Error('temporary failure'));
      await expect(wipedRead).rejects.toThrow('temporary failure');

      // The failed read belonged to a wiped entry, so it left the newer cached value in place.
      await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot)).resolves.toEqual(new Fr(2));
      expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(2);
    });
  });

  describe('getBlock', () => {
    it('shares repeated reads of a block pinned by hash', async () => {
      const blockHash = BlockHash.random();
      const block = makeBlockResponse(BlockNumber(1));
      aztecNode.getBlock.mockResolvedValue(block);

      await expect(cachedNode.getBlock(blockHash)).resolves.toBe(block);
      await expect(cachedNode.getBlock(blockHash)).resolves.toBe(block);

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(1);
    });

    it('keys reads by their options', async () => {
      const blockHash = BlockHash.random();
      aztecNode.getBlock.mockResolvedValue(makeBlockResponse(BlockNumber(1)));

      await cachedNode.getBlock(blockHash);
      await cachedNode.getBlock(blockHash, { includeTransactions: true });

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(2);
    });

    it('passes number-referenced reads through to the node uncached', async () => {
      aztecNode.getBlock.mockResolvedValue(makeBlockResponse(BlockNumber(1)));

      await cachedNode.getBlock(BlockNumber(1));
      await cachedNode.getBlock(BlockNumber(1));

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(2);
    });

    it('passes tag-referenced reads through to the node uncached', async () => {
      aztecNode.getBlock.mockResolvedValue(makeBlockResponse(BlockNumber(1)));

      await cachedNode.getBlock('latest');
      await cachedNode.getBlock('latest');

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(2);
    });

    it('passes archive-referenced reads through to the node uncached', async () => {
      const archive = Fr.random();
      aztecNode.getBlock.mockResolvedValue(makeBlockResponse(BlockNumber(1)));

      await cachedNode.getBlock({ archive });
      await cachedNode.getBlock({ archive });

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(2);
    });

    it('passes reads requesting attestations or L1 publish info through to the node uncached', async () => {
      const blockHash = BlockHash.random();
      aztecNode.getBlock.mockResolvedValue(makeBlockResponse(BlockNumber(1)));

      await cachedNode.getBlock(blockHash, { includeAttestations: true });
      await cachedNode.getBlock(blockHash, { includeAttestations: true });
      await cachedNode.getBlock(blockHash, { includeL1PublishInfo: true });
      await cachedNode.getBlock(blockHash, { includeL1PublishInfo: true });

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(4);
    });

    it('evicts undefined results so callers can retry', async () => {
      const blockHash = BlockHash.random();
      const block = makeBlockResponse(BlockNumber(1));
      aztecNode.getBlock.mockResolvedValueOnce(undefined);
      aztecNode.getBlock.mockResolvedValueOnce(block);

      await expect(cachedNode.getBlock(blockHash)).resolves.toBeUndefined();
      await expect(cachedNode.getBlock(blockHash)).resolves.toBe(block);

      expect(aztecNode.getBlock).toHaveBeenCalledTimes(2);
    });
  });

  buildPinnedReadTests({
    method: 'getContract',
    setup: () => {
      const address = AztecAddress.fromBigIntUnsafe(1n);
      aztecNode.getContract.mockResolvedValue(undefined);
      return {
        node: aztecNode.getContract,
        read: block => cachedNode.getContract(address, block),
      };
    },
    extraTests: () => {
      it('passes reads with no reference block through to the node uncached', async () => {
        const address = await AztecAddress.random();
        aztecNode.getContract.mockResolvedValue(undefined);

        await cachedNode.getContract(address);
        await cachedNode.getContract(address);

        expect(aztecNode.getContract).toHaveBeenCalledTimes(2);
      });
    },
  });

  buildPinnedReadTests({
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

  buildPinnedReadTests({
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

  buildPinnedReadTests({
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

  buildPinnedReadTests({
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

  buildPinnedReadTests({
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

  buildPinnedReadTests({
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

    it('passes number-, tag- and archive-referenced reads through to the node uncached', async () => {
      const contractAddress = await AztecAddress.random();
      const storageSlot = new Fr(100);
      const archive = Fr.random();
      aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));

      await cachedNode.getPublicStorageAt('latest', contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt('latest', contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt(BlockNumber(1), contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt(BlockNumber(1), contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt({ archive }, contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt({ archive }, contractAddress, storageSlot);

      expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(6);
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

    it('asks the node once for a leaf repeated within a batch', async () => {
      const blockHash = BlockHash.random();
      const leafA = Fr.random();
      const leafB = Fr.random();
      const indexA = { data: 7n, ...randomInBlock() };
      const indexB = { data: 8n, ...randomInBlock() };
      aztecNode.findLeavesIndexes.mockResolvedValueOnce([indexA, indexB]);

      await expect(
        cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB, leafA]),
      ).resolves.toEqual([indexA, indexB, indexA]);

      expect(aztecNode.findLeavesIndexes).toHaveBeenCalledWith(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB]);
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

    it('passes tag- and archive-referenced reads through to the node uncached', async () => {
      const leaf = Fr.random();
      const archive = Fr.random();
      const index = { data: 7n, ...randomInBlock() };
      aztecNode.findLeavesIndexes.mockResolvedValue([index]);

      await expect(cachedNode.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, [leaf])).resolves.toEqual([
        index,
      ]);
      await expect(cachedNode.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, [leaf])).resolves.toEqual([
        index,
      ]);
      await expect(cachedNode.findLeavesIndexes({ archive }, MerkleTreeId.NULLIFIER_TREE, [leaf])).resolves.toEqual([
        index,
      ]);
      await expect(cachedNode.findLeavesIndexes({ archive }, MerkleTreeId.NULLIFIER_TREE, [leaf])).resolves.toEqual([
        index,
      ]);

      expect(aztecNode.findLeavesIndexes).toHaveBeenCalledTimes(4);
    });

    it('rejects and evicts a batch whose response is shorter than the request', async () => {
      const blockHash = BlockHash.random();
      const leafA = Fr.random();
      const leafB = Fr.random();
      const indexA = { data: 7n, ...randomInBlock() };
      const indexB = { data: 8n, ...randomInBlock() };
      // One result for two requested leaves: a short response the wrapper must reject rather than cache as
      // non-membership for the missing leaf.
      aztecNode.findLeavesIndexes.mockResolvedValueOnce([indexA]);
      aztecNode.findLeavesIndexes.mockResolvedValueOnce([indexA, indexB]);

      await expect(
        cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB]),
      ).rejects.toThrow('returned 1 results for 2 requested leaves');

      // The rejected batch evicted its derived entries, so a retry re-fetches both leaves.
      await expect(
        cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB]),
      ).resolves.toEqual([indexA, indexB]);

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

    it('wipeCache clears the cache so the next read reaches the node', async () => {
      const blockHash = BlockHash.random();
      const contractAddress = await AztecAddress.random();
      const storageSlot = Fr.random();
      aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));

      await cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);
      cachedNode.wipeCache();
      await cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);

      expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(2);
    });
  });

  describe('startRecording', () => {
    it('records only the reads the node answered', async () => {
      const { blockHash, contractAddress, storageSlot } = await publicStorageRead();
      aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));

      const recording = cachedNode.startRecording();
      await cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);

      expect(callCounts(recording.stop())).toEqual({ getPublicStorageAt: 1 });
    });

    it('records a batched leaf read only when it fetches a missing leaf', async () => {
      const blockHash = BlockHash.random();
      const [leafA, leafB] = [Fr.random(), Fr.random()];
      const index = { data: 7n, ...randomInBlock() };
      aztecNode.findLeavesIndexes.mockResolvedValue([index]);

      const recording = cachedNode.startRecording();
      await cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA]);
      await cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA]);
      await cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB]);

      expect(callCounts(recording.stop())).toEqual({ findLeavesIndexes: 2 });
    });

    it('does not count a batch the cache serves in full as a round trip', async () => {
      const { blockHash, contractAddress, storageSlot } = await publicStorageRead();
      aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));

      const recording = cachedNode.startRecording();
      await cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);
      await cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);

      const { roundTrips } = recording.stop();
      expect(roundTrips.roundTrips).toBe(1);
      expect(roundTrips.roundTripMethods).toEqual([['getPublicStorageAt']]);
    });

    it('counts a batch that still reaches the node as a round trip, naming only the reads that did', async () => {
      const { blockHash, contractAddress, storageSlot } = await publicStorageRead();
      aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));
      aztecNode.getBlockNumber.mockResolvedValue(BlockNumber(42));

      const recording = cachedNode.startRecording();
      await cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot);
      await Promise.all([
        cachedNode.getPublicStorageAt(blockHash, contractAddress, storageSlot),
        cachedNode.getBlockNumber(),
      ]);

      const { roundTrips } = recording.stop();
      expect(roundTrips.roundTrips).toBe(2);
      // The second batch waited on `getBlockNumber` alone: its storage read was served without reaching the node.
      expect(roundTrips.roundTripMethods).toEqual([['getPublicStorageAt'], ['getBlockNumber']]);
    });
  });
});

/** How many reads of each method `stats` saw, dropping the timings. */
function callCounts(stats: NodeStats) {
  return Object.fromEntries(Object.entries(stats.perMethod).map(([method, { times }]) => [method, times.length]));
}

// A hash-pinned public storage read: the simplest cached read, used to exercise cache semantics that hold for all of
// them (in-flight sharing, eviction on rejection, wiping).
async function publicStorageRead() {
  return { blockHash: BlockHash.random(), contractAddress: await AztecAddress.random(), storageSlot: Fr.random() };
}

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

// The single-key pinned reads share one signature, so this registers the same two per-method contracts for each: an
// undefined answer is cached as a non-membership fact, and number and tag references bypass the cache. `setup` runs
// inside each test (after `beforeEach` rebuilds the node), serves undefined, and returns the method's mock plus a read
// pinned to a fixed query argument. `extraTests` adds the cases specific to one method, in that method's own group.
function buildPinnedReadTests(opts: {
  method: string;
  setup: () => { node: jest.Mock; read: (block: BlockParameter) => Promise<unknown> };
  extraTests?: () => void;
}) {
  describe(opts.method, () => {
    it('caches undefined reads as non-membership answers', async () => {
      const { node, read } = opts.setup();
      const referenceBlockHash = BlockHash.random();

      await expect(read(referenceBlockHash)).resolves.toBeUndefined();
      await expect(read(referenceBlockHash)).resolves.toBeUndefined();

      expect(node).toHaveBeenCalledTimes(1);
    });

    it('passes number-, tag- and archive-referenced reads through to the node uncached', async () => {
      const { node, read } = opts.setup();
      const archive = Fr.random();

      await read('latest');
      await read('latest');
      await read(BlockNumber(1));
      await read(BlockNumber(1));
      await read({ archive });
      await read({ archive });

      expect(node).toHaveBeenCalledTimes(6);
    });

    opts.extraTests?.();
  });
}
