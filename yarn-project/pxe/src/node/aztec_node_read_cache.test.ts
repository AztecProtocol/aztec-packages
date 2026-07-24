import { ARCHIVE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { MembershipWitness } from '@aztec/foundation/trees';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, randomInBlock } from '@aztec/stdlib/block';
import type { BlockResponse } from '@aztec/stdlib/interfaces/client';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  NullifierMembershipWitness,
  PublicDataWitness,
} from '@aztec/stdlib/trees';
import { BlockHeader, MinedTxReceipt, TxEffect, TxExecutionResult, TxHash, TxStatus } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { AztecNodeReadCache, withReadCache } from './aztec_node_read_cache.js';

describe('withReadCache', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let cache: AztecNodeReadCache;
  let cachedNode: AztecNode;

  const makeMinedReceipt = (txHash: TxHash) =>
    new MinedTxReceipt(
      txHash,
      TxStatus.FINALIZED,
      TxExecutionResult.SUCCESS,
      0n,
      BlockHash.random(),
      BlockNumber(1),
      SlotNumber(1),
      0,
      EpochNumber(1),
      TxEffect.empty(),
    );

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
    cache = new AztecNodeReadCache();
    cachedNode = withReadCache(aztecNode, cache);
  });

  it('shares concurrent tx receipt reads', async () => {
    const txHash = TxHash.random();
    const deferred = promiseWithResolvers<MinedTxReceipt<{ includeTxEffect: true }>>();
    aztecNode.getTxReceipt.mockReturnValue(deferred.promise);

    const first = cachedNode.getTxReceipt(txHash, { includeTxEffect: true });
    const second = cachedNode.getTxReceipt(txHash, { includeTxEffect: true });
    const receipt = makeMinedReceipt(txHash);
    deferred.resolve(receipt);

    await expect(Promise.all([first, second])).resolves.toEqual([receipt, receipt]);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
  });

  it('keys tx receipt reads by their options', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValue(makeMinedReceipt(txHash));

    await cachedNode.getTxReceipt(txHash);
    await cachedNode.getTxReceipt(txHash, { includeTxEffect: true });

    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
  });

  it('shares repeated block reads', async () => {
    const blockNumber = BlockNumber(1);
    const block: BlockResponse = {
      header: BlockHeader.empty(),
      archive: AppendOnlyTreeSnapshot.empty(),
      hash: BlockHash.random(),
      checkpointNumber: CheckpointNumber.fromBlockNumber(blockNumber),
      indexWithinCheckpoint: IndexWithinCheckpoint.ZERO,
      number: blockNumber,
    };
    aztecNode.getBlock.mockResolvedValue(block);

    await expect(cachedNode.getBlock(blockNumber)).resolves.toBe(block);
    await expect(cachedNode.getBlock(blockNumber)).resolves.toBe(block);

    expect(aztecNode.getBlock).toHaveBeenCalledTimes(1);
  });

  it('evicts rejected reads so callers can retry', async () => {
    const txHash = TxHash.random();
    const receipt = makeMinedReceipt(txHash);
    aztecNode.getTxReceipt.mockRejectedValueOnce(new Error('temporary failure'));
    aztecNode.getTxReceipt.mockResolvedValueOnce(receipt);

    await expect(cachedNode.getTxReceipt(txHash)).rejects.toThrow('temporary failure');
    await expect(cachedNode.getTxReceipt(txHash)).resolves.toBe(receipt);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
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

  it('evicts undefined results so callers can retry', async () => {
    const referenceBlockHash = BlockHash.random();
    const blockHash = BlockHash.random();
    const witness = MembershipWitness.empty(ARCHIVE_HEIGHT);
    aztecNode.getBlockHashMembershipWitness.mockResolvedValueOnce(undefined);
    aztecNode.getBlockHashMembershipWitness.mockResolvedValueOnce(witness);

    await expect(cachedNode.getBlockHashMembershipWitness(referenceBlockHash, blockHash)).resolves.toBeUndefined();
    await expect(cachedNode.getBlockHashMembershipWitness(referenceBlockHash, blockHash)).resolves.toBe(witness);

    expect(aztecNode.getBlockHashMembershipWitness).toHaveBeenCalledTimes(2);
  });

  it('caches undefined nullifier witness reads as non-membership answers', async () => {
    const blockHash = BlockHash.random();
    const nullifier = Fr.random();
    aztecNode.getNullifierMembershipWitness.mockResolvedValue(undefined);

    await expect(cachedNode.getNullifierMembershipWitness(blockHash, nullifier)).resolves.toBeUndefined();
    await expect(cachedNode.getNullifierMembershipWitness(blockHash, nullifier)).resolves.toBeUndefined();

    expect(aztecNode.getNullifierMembershipWitness).toHaveBeenCalledTimes(1);
  });

  it('caches undefined leaf index reads as non-membership answers', async () => {
    const blockHash = BlockHash.random();
    const leafA = Fr.random();
    const leafB = Fr.random();
    const indexB = { data: 8n, ...randomInBlock() };
    aztecNode.findLeavesIndexes.mockResolvedValueOnce([undefined]);
    aztecNode.findLeavesIndexes.mockResolvedValueOnce([indexB]);

    await expect(cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA])).resolves.toEqual([
      undefined,
    ]);
    await expect(cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB])).resolves.toEqual(
      [undefined, indexB],
    );

    expect(aztecNode.findLeavesIndexes).toHaveBeenCalledTimes(2);
    expect(aztecNode.findLeavesIndexes).toHaveBeenLastCalledWith(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafB]);
  });

  it('reuses cached slots across repeated public storage reads', async () => {
    const blockHash = BlockHash.random();
    const contractAddress = await AztecAddress.random();
    aztecNode.getPublicStorageAt.mockImplementation((_block, _contract, slot) =>
      Promise.resolve(new Fr(slot.toBigInt() + 1n)),
    );

    await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, new Fr(100))).resolves.toEqual(new Fr(101));
    await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, new Fr(100))).resolves.toEqual(new Fr(101));
    await expect(cachedNode.getPublicStorageAt(blockHash, contractAddress, new Fr(101))).resolves.toEqual(new Fr(102));

    expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(2);
  });

  it('shares repeated membership witness reads', async () => {
    const blockHash = BlockHash.random();
    const noteHash = Fr.random();
    const nullifier = Fr.random();
    const noteHashWitness = MembershipWitness.empty(NOTE_HASH_TREE_HEIGHT);
    const nullifierWitness = NullifierMembershipWitness.random();
    const lowNullifierWitness = NullifierMembershipWitness.random();
    aztecNode.getNoteHashMembershipWitness.mockResolvedValue(noteHashWitness);
    aztecNode.getNullifierMembershipWitness.mockResolvedValue(nullifierWitness);
    aztecNode.getLowNullifierMembershipWitness.mockResolvedValue(lowNullifierWitness);

    await expect(cachedNode.getNoteHashMembershipWitness(blockHash, noteHash)).resolves.toBe(noteHashWitness);
    await expect(cachedNode.getNoteHashMembershipWitness(blockHash, noteHash)).resolves.toBe(noteHashWitness);
    await expect(cachedNode.getNullifierMembershipWitness(blockHash, nullifier)).resolves.toBe(nullifierWitness);
    await expect(cachedNode.getNullifierMembershipWitness(blockHash, nullifier)).resolves.toBe(nullifierWitness);
    await expect(cachedNode.getLowNullifierMembershipWitness(blockHash, nullifier)).resolves.toBe(lowNullifierWitness);
    await expect(cachedNode.getLowNullifierMembershipWitness(blockHash, nullifier)).resolves.toBe(lowNullifierWitness);

    expect(aztecNode.getNoteHashMembershipWitness).toHaveBeenCalledTimes(1);
    expect(aztecNode.getNullifierMembershipWitness).toHaveBeenCalledTimes(1);
    expect(aztecNode.getLowNullifierMembershipWitness).toHaveBeenCalledTimes(1);
  });

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
    await expect(cachedNode.findLeavesIndexes(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafA, leafB])).resolves.toEqual(
      [indexA, indexB],
    );

    expect(aztecNode.findLeavesIndexes).toHaveBeenCalledTimes(2);
    expect(aztecNode.findLeavesIndexes).toHaveBeenLastCalledWith(blockHash, MerkleTreeId.NULLIFIER_TREE, [leafB]);
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

  it('passes tag-referenced leaf index reads through to the node uncached', async () => {
    const leaf = Fr.random();
    const index = { data: 7n, ...randomInBlock() };
    aztecNode.findLeavesIndexes.mockResolvedValue([index]);

    await expect(cachedNode.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, [leaf])).resolves.toEqual([index]);
    await expect(cachedNode.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, [leaf])).resolves.toEqual([index]);

    expect(aztecNode.findLeavesIndexes).toHaveBeenCalledTimes(2);
  });

  it('passes uncached methods through to the node', async () => {
    aztecNode.getBlockNumber.mockResolvedValue(BlockNumber(42));

    await expect(cachedNode.getBlockNumber()).resolves.toBe(42);
    await expect(cachedNode.getBlockNumber()).resolves.toBe(42);

    expect(aztecNode.getBlockNumber).toHaveBeenCalledTimes(2);
  });

  it('wipe clears cached entries', async () => {
    const txHash = TxHash.random();
    const receipt = makeMinedReceipt(txHash);
    aztecNode.getTxReceipt.mockResolvedValue(receipt);

    await cachedNode.getTxReceipt(txHash);
    cache.wipe();
    await cachedNode.getTxReceipt(txHash);

    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
  });

  it('shares one cache across multiple wrapped nodes', async () => {
    const otherWrapper = withReadCache(aztecNode, cache);
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValue(makeMinedReceipt(txHash));

    await cachedNode.getTxReceipt(txHash);
    await otherWrapper.getTxReceipt(txHash);

    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
  });
});
