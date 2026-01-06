import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { TxHash, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { getStatusChangeOfPending } from './get_status_change_of_pending.js';

describe('getStatusChangeOfPending', () => {
  let aztecNode: MockProxy<AztecNode>;

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
  });

  it('handles mixed scenarios with multiple transaction hashes', async () => {
    const finalizedBlockNumber = 10;

    const finalizedTxHash = TxHash.random();
    const droppedTxHash = TxHash.random();
    const pendingTxHash = TxHash.random();
    const appLogicRevertedTxHash = TxHash.random();
    const teardownRevertedTxHash = TxHash.random();
    const bothRevertedTxHash = TxHash.random();

    aztecNode.getTxReceipt.mockImplementation((hash: TxHash) => {
      if (hash.equals(finalizedTxHash)) {
        return Promise.resolve({
          status: TxStatus.SUCCESS,
          blockNumber: BlockNumber(finalizedBlockNumber - 1),
        } as any);
      } else if (hash.equals(droppedTxHash)) {
        return Promise.resolve({
          status: TxStatus.DROPPED,
        } as any);
      } else if (hash.equals(pendingTxHash)) {
        return Promise.resolve({
          status: TxStatus.SUCCESS,
          blockNumber: BlockNumber(finalizedBlockNumber + 1),
        } as any);
      } else if (hash.equals(appLogicRevertedTxHash)) {
        return Promise.resolve({
          status: TxStatus.APP_LOGIC_REVERTED,
        } as any);
      } else if (hash.equals(teardownRevertedTxHash)) {
        return Promise.resolve({
          status: TxStatus.TEARDOWN_REVERTED,
        } as any);
      } else if (hash.equals(bothRevertedTxHash)) {
        return Promise.resolve({
          status: TxStatus.BOTH_REVERTED,
        } as any);
      } else {
        throw new Error(`Unexpected tx hash: ${hash.toString()}`);
      }
    });

    aztecNode.getL2Tips.mockResolvedValue({
      proposed: { number: BlockNumber(finalizedBlockNumber), hash: '' },
      checkpointed: {
        block: { number: BlockNumber(finalizedBlockNumber), hash: '' },
        checkpoint: { number: CheckpointNumber(0), hash: '' },
      },
      proven: {
        block: { number: BlockNumber(finalizedBlockNumber), hash: '' },
        checkpoint: { number: CheckpointNumber(0), hash: '' },
      },
      finalized: {
        block: { number: BlockNumber(finalizedBlockNumber), hash: '' },
        checkpoint: { number: CheckpointNumber(0), hash: '' },
      },
    });

    const result = await getStatusChangeOfPending(
      [
        finalizedTxHash,
        droppedTxHash,
        pendingTxHash,
        appLogicRevertedTxHash,
        teardownRevertedTxHash,
        bothRevertedTxHash,
      ],
      aztecNode,
    );

    expect(result.txHashesToFinalize).toEqual([finalizedTxHash]);
    expect(result.txHashesToDrop).toEqual([
      droppedTxHash,
      appLogicRevertedTxHash,
      teardownRevertedTxHash,
      bothRevertedTxHash,
    ]);
  });

  it('returns txHash in txHashesToFinalize when blockNumber equals finalized block number', async () => {
    const finalizedBlockNumber = 10;
    const txHash = TxHash.random();

    aztecNode.getTxReceipt.mockResolvedValue({
      status: TxStatus.SUCCESS,
      blockNumber: BlockNumber(finalizedBlockNumber),
    } as any);

    aztecNode.getL2Tips.mockResolvedValue({
      proposed: { number: BlockNumber(finalizedBlockNumber), hash: '' },
      checkpointed: {
        block: { number: BlockNumber(finalizedBlockNumber), hash: '' },
        checkpoint: { number: CheckpointNumber(0), hash: '' },
      },
      proven: {
        block: { number: BlockNumber(finalizedBlockNumber), hash: '' },
        checkpoint: { number: CheckpointNumber(0), hash: '' },
      },
      finalized: {
        block: { number: BlockNumber(finalizedBlockNumber), hash: '' },
        checkpoint: { number: CheckpointNumber(0), hash: '' },
      },
    });

    const result = await getStatusChangeOfPending([txHash], aztecNode);

    expect(result.txHashesToFinalize).toEqual([txHash]);
    expect(result.txHashesToDrop).toEqual([]);
  });
});
