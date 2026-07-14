import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { MembershipWitness } from '@aztec/foundation/trees';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { PublicDataWitness } from '@aztec/stdlib/trees';
import { MinedTxReceipt, TxEffect, TxExecutionResult, TxHash, TxStatus } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { AztecNodeReadCache } from './aztec_node_read_cache.js';

describe('AztecNodeReadCache', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let cache: AztecNodeReadCache;

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
    cache = new AztecNodeReadCache(aztecNode);
  });

  it('shares concurrent tx receipt reads', async () => {
    const txHash = TxHash.random();
    const deferred = promiseWithResolvers<MinedTxReceipt<{ includeTxEffect: true }>>();
    aztecNode.getTxReceipt.mockReturnValue(deferred.promise);

    const first = cache.getTxReceiptWithEffect(txHash);
    const second = cache.getTxReceiptWithEffect(txHash);
    const receipt = makeMinedReceipt(txHash);
    deferred.resolve(receipt);

    await expect(Promise.all([first, second])).resolves.toEqual([receipt, receipt]);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
  });

  it('evicts rejected reads so callers can retry', async () => {
    const txHash = TxHash.random();
    const receipt = makeMinedReceipt(txHash);
    aztecNode.getTxReceipt.mockRejectedValueOnce(new Error('temporary failure'));
    aztecNode.getTxReceipt.mockResolvedValueOnce(receipt);

    await expect(cache.getTxReceiptWithEffect(txHash)).rejects.toThrow('temporary failure');
    await expect(cache.getTxReceiptWithEffect(txHash)).resolves.toBe(receipt);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
  });

  it('keeps cache entries separate by method and arguments', async () => {
    const blockHash = BlockHash.random();
    const leafSlot = Fr.random();
    const blockWitness = MembershipWitness.empty(ARCHIVE_HEIGHT);
    const publicDataWitness = PublicDataWitness.random();
    aztecNode.getBlockHashMembershipWitness.mockResolvedValue(blockWitness);
    aztecNode.getPublicDataWitness.mockResolvedValue(publicDataWitness);

    await expect(cache.getBlockHashMembershipWitness(blockHash, blockHash)).resolves.toBe(blockWitness);
    await expect(cache.getPublicDataWitness(blockHash, leafSlot)).resolves.toBe(publicDataWitness);

    expect(aztecNode.getBlockHashMembershipWitness).toHaveBeenCalledTimes(1);
    expect(aztecNode.getPublicDataWitness).toHaveBeenCalledTimes(1);
  });

  it('caches successful undefined results', async () => {
    const referenceBlockHash = BlockHash.random();
    const blockHash = BlockHash.random();
    aztecNode.getBlockHashMembershipWitness.mockResolvedValue(undefined);

    await expect(cache.getBlockHashMembershipWitness(referenceBlockHash, blockHash)).resolves.toBeUndefined();
    await expect(cache.getBlockHashMembershipWitness(referenceBlockHash, blockHash)).resolves.toBeUndefined();

    expect(aztecNode.getBlockHashMembershipWitness).toHaveBeenCalledTimes(1);
  });

  it('reuses cached slots across overlapping public storage ranges', async () => {
    const blockHash = BlockHash.random();
    const contractAddress = await AztecAddress.random();
    const startStorageSlot = new Fr(100);
    aztecNode.getPublicStorageAt.mockImplementation((_block, _contract, slot) =>
      Promise.resolve(new Fr(slot.value + 1n)),
    );

    await expect(cache.getPublicStorageRange(blockHash, contractAddress, startStorageSlot, 2)).resolves.toEqual([
      new Fr(101),
      new Fr(102),
    ]);
    await expect(cache.getPublicStorageRange(blockHash, contractAddress, new Fr(101), 2)).resolves.toEqual([
      new Fr(102),
      new Fr(103),
    ]);

    expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(3);
  });
});
