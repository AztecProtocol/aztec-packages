import { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { TxExecutionResult, TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { getStatusChangeOfPending } from './get_status_change_of_pending.js';

describe('getStatusChangeOfPending', () => {
  let aztecNode: MockProxy<AztecNode>;

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
  });

  it('handles mixed scenarios with multiple transaction hashes', async () => {
    const finalizedTxHash = TxHash.random();
    const droppedTxHash = TxHash.random();
    const pendingTxHash = TxHash.random();
    const appLogicRevertedTxHash = TxHash.random();
    const teardownRevertedTxHash = TxHash.random();
    const bothRevertedTxHash = TxHash.random();

    aztecNode.getTxReceipt.mockImplementation((hash: TxHash) => {
      if (hash.equals(finalizedTxHash)) {
        // Finalized and successful
        return Promise.resolve(
          new TxReceipt(
            hash,
            TxStatus.FINALIZED,
            TxExecutionResult.SUCCESS,
            undefined,
            undefined,
            undefined,
            BlockNumber(9),
          ),
        );
      } else if (hash.equals(droppedTxHash)) {
        return Promise.resolve(new TxReceipt(hash, TxStatus.DROPPED, undefined, 'Tx dropped'));
      } else if (hash.equals(pendingTxHash)) {
        // Mined but not finalized yet
        return Promise.resolve(
          new TxReceipt(
            hash,
            TxStatus.PROPOSED,
            TxExecutionResult.SUCCESS,
            undefined,
            undefined,
            undefined,
            BlockNumber(11),
          ),
        );
      } else if (hash.equals(appLogicRevertedTxHash)) {
        return Promise.resolve(
          new TxReceipt(
            hash,
            TxStatus.FINALIZED,
            TxExecutionResult.REVERTED,
            undefined,
            undefined,
            undefined,
            BlockNumber(10),
          ),
        );
      } else if (hash.equals(teardownRevertedTxHash)) {
        return Promise.resolve(
          new TxReceipt(
            hash,
            TxStatus.FINALIZED,
            TxExecutionResult.REVERTED,
            undefined,
            undefined,
            undefined,
            BlockNumber(10),
          ),
        );
      } else if (hash.equals(bothRevertedTxHash)) {
        return Promise.resolve(
          new TxReceipt(
            hash,
            TxStatus.FINALIZED,
            TxExecutionResult.REVERTED,
            undefined,
            undefined,
            undefined,
            BlockNumber(10),
          ),
        );
      } else {
        throw new Error(`Unexpected tx hash: ${hash.toString()}`);
      }
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
    expect(result.txHashesToDrop).toEqual([droppedTxHash]);
    expect(result.txHashesWithExecutionReverted).toEqual([
      appLogicRevertedTxHash,
      teardownRevertedTxHash,
      bothRevertedTxHash,
    ]);
  });

  it('returns txHash in txHashesToFinalize when status is finalized and successful', async () => {
    const txHash = TxHash.random();

    aztecNode.getTxReceipt.mockResolvedValue(
      new TxReceipt(
        txHash,
        TxStatus.FINALIZED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(10),
      ),
    );

    const result = await getStatusChangeOfPending([txHash], aztecNode);

    expect(result.txHashesToFinalize).toEqual([txHash]);
    expect(result.txHashesToDrop).toEqual([]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
  });

  it('does not finalize tx that is only proven', async () => {
    const txHash = TxHash.random();

    aztecNode.getTxReceipt.mockResolvedValue(
      new TxReceipt(
        txHash,
        TxStatus.PROVEN,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(10),
      ),
    );

    const result = await getStatusChangeOfPending([txHash], aztecNode);

    // Not finalized yet, so stays pending
    expect(result.txHashesToFinalize).toEqual([]);
    expect(result.txHashesToDrop).toEqual([]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
  });
});
