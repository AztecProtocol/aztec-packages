import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { DroppedTxReceipt, MinedTxReceipt, TxEffect, TxExecutionResult, TxHash, TxStatus } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { ResolvedTx } from '@aztec/stdlib/tx';
import { TxResolverService } from './tx_resolver_service.js';

describe('TxResolverService', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let service: TxResolverService;
  const anchorBlockNumber = 100;

  /**
   * Builds a {@link MinedTxReceipt} whose attached {@link TxEffect} carries the given tx hash, note hashes, and
   * nullifiers, mirroring what the node returns for `getTxReceipt(h, { includeTxEffect: true })`.
   */
  const minedReceipt = async (opts: {
    txHash: TxHash;
    noteHashes: Fr[];
    nullifiers: Fr[];
    blockNumber: number;
    blockHash?: BlockHash;
    txIndexInBlock?: number;
  }): Promise<MinedTxReceipt> => {
    const txEffect = TxEffect.from({
      ...(await TxEffect.random()),
      txHash: opts.txHash,
      noteHashes: opts.noteHashes,
      nullifiers: opts.nullifiers,
    });
    return new MinedTxReceipt(
      opts.txHash,
      TxStatus.PROPOSED,
      TxExecutionResult.SUCCESS,
      0n,
      opts.blockHash ?? BlockHash.random(),
      BlockNumber(opts.blockNumber),
      SlotNumber(opts.blockNumber),
      opts.txIndexInBlock ?? 0,
      EpochNumber(1),
      txEffect,
    );
  };

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
    service = new TxResolverService(aztecNode);
  });

  it('returns null for zero tx hash', async () => {
    const results = await service.resolveTxs([Fr.ZERO], anchorBlockNumber);

    expect(results).toEqual([null]);
    expect(aztecNode.getTxReceipt).not.toHaveBeenCalled();
  });

  it('returns null when tx effect is not found', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValueOnce(new DroppedTxReceipt(txHash));

    const results = await service.resolveTxs([txHash.hash], anchorBlockNumber);

    expect(results).toEqual([null]);
  });

  it('returns null when tx effect is beyond anchor block', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValueOnce(
      await minedReceipt({
        txHash,
        noteHashes: [Fr.random()],
        nullifiers: [Fr.random()],
        blockNumber: anchorBlockNumber + 1,
      }),
    );

    const results = await service.resolveTxs([txHash.hash], anchorBlockNumber);

    expect(results).toEqual([null]);
  });

  it('throws when tx effect has no nullifiers', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValueOnce(
      await minedReceipt({
        txHash,
        noteHashes: [Fr.random()],
        nullifiers: [],
        blockNumber: anchorBlockNumber - 1,
      }),
    );

    await expect(service.resolveTxs([txHash.hash], anchorBlockNumber)).rejects.toThrow(
      `Tx effect for ${txHash} has no nullifiers`,
    );
  });

  it('resolves a valid tx hash into a ResolvedTx', async () => {
    const txHash = TxHash.random();
    const noteHashes = [Fr.random(), Fr.random()];
    const firstNullifier = Fr.random();
    const blockHash = BlockHash.random();
    const blockNumber = anchorBlockNumber - 1;

    aztecNode.getTxReceipt.mockResolvedValueOnce(
      await minedReceipt({
        txHash,
        noteHashes,
        nullifiers: [firstNullifier, Fr.random()],
        blockNumber,
        blockHash,
      }),
    );

    const results = await service.resolveTxs([txHash.hash], anchorBlockNumber);

    expect(results).toEqual([new ResolvedTx(txHash, noteHashes, firstNullifier, blockNumber, blockHash.toFr())]);
  });

  it('resolves tx hashes in different situations', async () => {
    const validTxHash = TxHash.random();
    const validNoteHashes = [Fr.random()];
    const validNullifier = Fr.random();
    const validBlockHash = BlockHash.random();

    const notFoundTxHash = TxHash.random();
    const futureTxHash = TxHash.random();

    const validReceipt = await minedReceipt({
      txHash: validTxHash,
      noteHashes: validNoteHashes,
      nullifiers: [validNullifier],
      blockNumber: anchorBlockNumber,
      blockHash: validBlockHash,
    });
    const futureReceipt = await minedReceipt({
      txHash: futureTxHash,
      noteHashes: [],
      nullifiers: [Fr.random()],
      blockNumber: anchorBlockNumber + 5,
    });

    aztecNode.getTxReceipt.mockImplementation((hash: TxHash) => {
      if (hash.equals(validTxHash)) {
        return Promise.resolve(validReceipt);
      }
      if (hash.equals(futureTxHash)) {
        return Promise.resolve(futureReceipt);
      }
      return Promise.resolve(new DroppedTxReceipt(hash)); // notFoundTxHash
    });

    const results = await service.resolveTxs(
      [
        Fr.ZERO, // zero → null
        validTxHash.hash, // valid → ResolvedTx
        notFoundTxHash.hash, // not found → null
        futureTxHash.hash, // beyond anchor → null
      ],
      anchorBlockNumber,
    );

    expect(results).toEqual([
      null,
      new ResolvedTx(validTxHash, validNoteHashes, validNullifier, anchorBlockNumber, validBlockHash.toFr()),
      null,
      null,
    ]);

    // Zero hash should not trigger getTxReceipt
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(3);
  });

  it('deduplicates repeated tx hashes so each is fetched only once', async () => {
    const txEffect = TxEffect.from({
      ...(await TxEffect.random({ numNoteHashes: 1, numNullifiers: 1 })),
    });
    const blockHash = BlockHash.random();
    const blockNumber = anchorBlockNumber - 1;

    aztecNode.getTxReceipt.mockResolvedValue(
      new MinedTxReceipt(
        txEffect.txHash,
        TxStatus.PROPOSED,
        TxExecutionResult.SUCCESS,
        0n,
        blockHash,
        BlockNumber(blockNumber),
        SlotNumber(anchorBlockNumber - 1),
        0,
        EpochNumber(1),
        txEffect,
      ),
    );

    const results = await service.resolveTxs(
      [txEffect.txHash.hash, txEffect.txHash.hash, txEffect.txHash.hash],
      anchorBlockNumber,
    );

    const expected = new ResolvedTx(
      txEffect.txHash,
      txEffect.noteHashes,
      txEffect.nullifiers[0],
      blockNumber,
      blockHash.toFr(),
    );
    expect(results).toEqual([expected, expected, expected]);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
  });
});
