import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { MessageContext } from '@aztec/stdlib/logs';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { MessageContextService } from './message_context_service.js';

describe('MessageContextService', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let service: MessageContextService;
  const anchorBlockNumber = 100;

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
    service = new MessageContextService(aztecNode);
  });

  it('returns null for zero tx hash', async () => {
    const results = await service.getMessageContextsByTxHash([Fr.ZERO], anchorBlockNumber);

    expect(results).toEqual([null]);
    expect(aztecNode.getTxEffect).not.toHaveBeenCalled();
  });

  it('returns null when tx effect is not found', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxEffect.mockResolvedValueOnce(undefined);

    const results = await service.getMessageContextsByTxHash([txHash.hash], anchorBlockNumber);

    expect(results).toEqual([null]);
  });

  it('returns null when tx effect is beyond anchor block', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxEffect.mockResolvedValueOnce({
      l2BlockNumber: BlockNumber(anchorBlockNumber + 1),
      l2BlockHash: BlockHash.random(),
      txIndexInBlock: 0,
      data: { txHash, noteHashes: [Fr.random()], nullifiers: [Fr.random()] },
    } as any);

    const results = await service.getMessageContextsByTxHash([txHash.hash], anchorBlockNumber);

    expect(results).toEqual([null]);
  });

  it('throws when tx effect has no nullifiers', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxEffect.mockResolvedValueOnce({
      l2BlockNumber: BlockNumber(anchorBlockNumber - 1),
      l2BlockHash: BlockHash.random(),
      txIndexInBlock: 0,
      data: { txHash, noteHashes: [Fr.random()], nullifiers: [] },
    } as any);

    await expect(service.getMessageContextsByTxHash([txHash.hash], anchorBlockNumber)).rejects.toThrow(
      `Tx effect for ${txHash} has no nullifiers`,
    );
  });

  it('resolves a valid tx hash into a MessageContext', async () => {
    const txHash = TxHash.random();
    const noteHashes = [Fr.random(), Fr.random()];
    const firstNullifier = Fr.random();
    const blockNumber = BlockNumber(anchorBlockNumber - 1);
    const blockHash = BlockHash.random();

    aztecNode.getTxEffect.mockResolvedValueOnce({
      l2BlockNumber: blockNumber,
      l2BlockHash: blockHash,
      txIndexInBlock: 0,
      data: { txHash, noteHashes, nullifiers: [firstNullifier, Fr.random()] },
    } as any);

    const results = await service.getMessageContextsByTxHash([txHash.hash], anchorBlockNumber);

    expect(results).toEqual([new MessageContext(txHash, noteHashes, firstNullifier, blockNumber, blockHash.toFr())]);
  });

  it('resolves tx hashes in different situations', async () => {
    const validTxHash = TxHash.random();
    const validNoteHashes = [Fr.random()];
    const validNullifier = Fr.random();
    const validBlockNumber = BlockNumber(anchorBlockNumber);
    const validBlockHash = BlockHash.random();

    const notFoundTxHash = TxHash.random();
    const futureTxHash = TxHash.random();

    aztecNode.getTxEffect.mockImplementation((hash: TxHash) => {
      if (hash.equals(validTxHash)) {
        return {
          l2BlockNumber: validBlockNumber,
          l2BlockHash: validBlockHash,
          txIndexInBlock: 0,
          data: { txHash: validTxHash, noteHashes: validNoteHashes, nullifiers: [validNullifier] },
        } as any;
      }
      if (hash.equals(futureTxHash)) {
        return {
          l2BlockNumber: BlockNumber(anchorBlockNumber + 5),
          l2BlockHash: BlockHash.random(),
          txIndexInBlock: 0,
          data: { txHash: futureTxHash, noteHashes: [], nullifiers: [Fr.random()] },
        } as any;
      }
      return undefined; // notFoundTxHash
    });

    const results = await service.getMessageContextsByTxHash(
      [
        Fr.ZERO, // zero → null
        validTxHash.hash, // valid → MessageContext
        notFoundTxHash.hash, // not found → null
        futureTxHash.hash, // beyond anchor → null
      ],
      anchorBlockNumber,
    );

    expect(results).toEqual([
      null,
      new MessageContext(validTxHash, validNoteHashes, validNullifier, validBlockNumber, validBlockHash.toFr()),
      null,
      null,
    ]);

    // Zero hash should not trigger getTxEffect
    expect(aztecNode.getTxEffect).toHaveBeenCalledTimes(3);
  });

  it('deduplicates repeated tx hashes so each is fetched only once', async () => {
    const txEffect = TxEffect.from({
      ...(await TxEffect.random({ numNoteHashes: 1, numNullifiers: 1 })),
    });
    const dedupBlockNumber = BlockNumber(anchorBlockNumber - 1);
    const dedupBlockHash = BlockHash.random();

    aztecNode.getTxEffect.mockResolvedValue({
      l2BlockNumber: dedupBlockNumber,
      l2BlockHash: dedupBlockHash,
      txIndexInBlock: 0,
      data: txEffect,
    });

    const results = await service.getMessageContextsByTxHash(
      [txEffect.txHash.hash, txEffect.txHash.hash, txEffect.txHash.hash],
      anchorBlockNumber,
    );

    const expected = new MessageContext(
      txEffect.txHash,
      txEffect.noteHashes,
      txEffect.nullifiers[0],
      dedupBlockNumber,
      dedupBlockHash.toFr(),
    );
    expect(results).toEqual([expected, expected, expected]);
    expect(aztecNode.getTxEffect).toHaveBeenCalledTimes(1);
  });
});
