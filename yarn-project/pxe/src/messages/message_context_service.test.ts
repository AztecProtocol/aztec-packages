import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { MessageContext } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

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
    const results = await service.resolveMessageContexts([Fr.ZERO], anchorBlockNumber);

    expect(results).toEqual([null]);
    expect(aztecNode.getTxEffect).not.toHaveBeenCalled();
  });

  it('returns null when tx effect is not found', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxEffect.mockResolvedValueOnce(undefined);

    const results = await service.resolveMessageContexts([txHash.hash], anchorBlockNumber);

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

    const results = await service.resolveMessageContexts([txHash.hash], anchorBlockNumber);

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

    await expect(service.resolveMessageContexts([txHash.hash], anchorBlockNumber)).rejects.toThrow(
      `Tx effect for ${txHash} has no nullifiers`,
    );
  });

  it('resolves a valid tx hash into a MessageContext', async () => {
    const txHash = TxHash.random();
    const noteHashes = [Fr.random(), Fr.random()];
    const firstNullifier = Fr.random();

    aztecNode.getTxEffect.mockResolvedValueOnce({
      l2BlockNumber: BlockNumber(anchorBlockNumber - 1),
      l2BlockHash: BlockHash.random(),
      txIndexInBlock: 0,
      data: { txHash, noteHashes, nullifiers: [firstNullifier, Fr.random()] },
    } as any);

    const results = await service.resolveMessageContexts([txHash.hash], anchorBlockNumber);

    expect(results).toEqual([new MessageContext(txHash, noteHashes, firstNullifier)]);
  });

  it('resolves tx hashes in different situations', async () => {
    const validTxHash = TxHash.random();
    const validNoteHashes = [Fr.random()];
    const validNullifier = Fr.random();

    const notFoundTxHash = TxHash.random();
    const futureTxHash = TxHash.random();

    aztecNode.getTxEffect.mockImplementation((hash: TxHash) => {
      if (hash.equals(validTxHash)) {
        return {
          l2BlockNumber: BlockNumber(anchorBlockNumber),
          l2BlockHash: BlockHash.random(),
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

    const results = await service.resolveMessageContexts(
      [
        Fr.ZERO, // zero → null
        validTxHash.hash, // valid → MessageContext
        notFoundTxHash.hash, // not found → null
        futureTxHash.hash, // beyond anchor → null
      ],
      anchorBlockNumber,
    );

    expect(results).toEqual([null, new MessageContext(validTxHash, validNoteHashes, validNullifier), null, null]);

    // Zero hash should not trigger getTxEffect
    expect(aztecNode.getTxEffect).toHaveBeenCalledTimes(3);
  });
});
