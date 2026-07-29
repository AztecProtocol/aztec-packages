import { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { DroppedTxReceipt, TxExecutionResult, TxHash, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { classifyPendingTxsFromLogs, classifyPendingTxsFromReceipts } from './classify_pending_txs.js';
import { minedIn, minedReceipt, pendingTx, txsInLogs } from './test_utils.js';

const FINALIZED_TIP = BlockNumber(15);

describe('classifyPendingTxsFromLogs', () => {
  it('finalizes a tx whose highest tracked index is onchain in a finalized block', () => {
    const txHash = TxHash.random();

    const result = classifyPendingTxsFromLogs(
      [pendingTx(txHash, 6)],
      txsInLogs([txHash, minedIn(14, [4, 5, 6])]),
      FINALIZED_TIP,
    );

    expect(result.txHashesFinalized).toEqual([txHash]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
    expect(result.txHashesAbsent).toEqual([]);
  });

  it('finalizes a tx mined exactly at the finalized tip', () => {
    const txHash = TxHash.random();

    const result = classifyPendingTxsFromLogs(
      [pendingTx(txHash, 4)],
      txsInLogs([txHash, minedIn(FINALIZED_TIP, [4])]),
      FINALIZED_TIP,
    );

    expect(result.txHashesFinalized).toEqual([txHash]);
  });

  it('finalizes on the highest tracked index alone, ignoring lower ones the window did not surface', () => {
    const txHash = TxHash.random();

    const result = classifyPendingTxsFromLogs(
      [pendingTx(txHash, 6)],
      txsInLogs([txHash, minedIn(14, [6])]),
      FINALIZED_TIP,
    );

    expect(result.txHashesFinalized).toEqual([txHash]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
  });

  it('puts a tx mined above the finalized tip in no group at all', () => {
    const txHash = TxHash.random();

    const result = classifyPendingTxsFromLogs(
      [pendingTx(txHash, 4)],
      txsInLogs([txHash, minedIn(16, [4])]),
      FINALIZED_TIP,
    );

    expect(result.txHashesFinalized).toEqual([]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
    expect(result.txHashesAbsent).toEqual([]);
  });

  it('needs a receipt for a finalized tx whose highest tracked index is not onchain', () => {
    const txHash = TxHash.random();

    const result = classifyPendingTxsFromLogs(
      [pendingTx(txHash, 6)],
      txsInLogs([txHash, minedIn(14, [4, 5])]),
      FINALIZED_TIP,
    );

    expect(result.txHashesWithExecutionReverted).toEqual([txHash]);
    expect(result.txHashesFinalized).toEqual([]);
  });

  it('needs a receipt for a tx the logs do not mention', () => {
    const txHash = TxHash.random();

    const result = classifyPendingTxsFromLogs([pendingTx(txHash, 4)], new Map(), FINALIZED_TIP);

    expect(result.txHashesAbsent).toEqual([txHash]);
    expect(result.txHashesFinalized).toEqual([]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
  });

  it('splits a mixed window across the three groups', () => {
    const finalizedTxHash = TxHash.random();
    const revertedTopTxHash = TxHash.random();
    const absentTxHash = TxHash.random();
    const unfinalizedTxHash = TxHash.random();

    const result = classifyPendingTxsFromLogs(
      [
        pendingTx(finalizedTxHash, 1),
        pendingTx(revertedTopTxHash, 3),
        pendingTx(absentTxHash, 4),
        pendingTx(unfinalizedTxHash, 5),
      ],
      txsInLogs(
        [finalizedTxHash, minedIn(14, [1])],
        [revertedTopTxHash, minedIn(14, [2])],
        [unfinalizedTxHash, minedIn(16, [5])],
      ),
      FINALIZED_TIP,
    );

    expect(result.txHashesFinalized).toEqual([finalizedTxHash]);
    expect(result.txHashesWithExecutionReverted).toEqual([revertedTopTxHash]);
    expect(result.txHashesAbsent).toEqual([absentTxHash]);
  });
});

describe('classifyPendingTxsFromReceipts', () => {
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
        return Promise.resolve(minedReceipt(hash, TxStatus.FINALIZED, 9));
      } else if (hash.equals(droppedTxHash)) {
        return Promise.resolve(new DroppedTxReceipt(hash, 'Tx dropped'));
      } else if (hash.equals(pendingTxHash)) {
        // Mined but not finalized yet
        return Promise.resolve(minedReceipt(hash, TxStatus.PROPOSED, 11));
      } else if (hash.equals(appLogicRevertedTxHash)) {
        return Promise.resolve(
          minedReceipt(hash, TxStatus.FINALIZED, 10, { executionResult: TxExecutionResult.REVERTED }),
        );
      } else if (hash.equals(teardownRevertedTxHash)) {
        return Promise.resolve(
          minedReceipt(hash, TxStatus.FINALIZED, 10, { executionResult: TxExecutionResult.REVERTED }),
        );
      } else if (hash.equals(bothRevertedTxHash)) {
        return Promise.resolve(
          minedReceipt(hash, TxStatus.FINALIZED, 10, { executionResult: TxExecutionResult.REVERTED }),
        );
      } else {
        throw new Error(`Unexpected tx hash: ${hash.toString()}`);
      }
    });

    const result = await classifyPendingTxsFromReceipts(
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

    expect(result.txHashesFinalized).toEqual([finalizedTxHash]);
    expect(result.txHashesDropped).toEqual([droppedTxHash]);
    expect(result.txHashesWithExecutionReverted).toEqual([
      appLogicRevertedTxHash,
      teardownRevertedTxHash,
      bothRevertedTxHash,
    ]);
  });

  it('returns txHash in txHashesFinalized when status is finalized and successful', async () => {
    const txHash = TxHash.random();

    aztecNode.getTxReceipt.mockResolvedValue(minedReceipt(txHash, TxStatus.FINALIZED, 10));

    const result = await classifyPendingTxsFromReceipts([txHash], aztecNode);

    expect(result.txHashesFinalized).toEqual([txHash]);
    expect(result.txHashesDropped).toEqual([]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
  });

  // Callers rely on this instead of guarding the empty case themselves.
  it('classifies an empty batch as empty without querying the node', async () => {
    const result = await classifyPendingTxsFromReceipts([], aztecNode);

    expect(result.txHashesFinalized).toEqual([]);
    expect(result.txHashesDropped).toEqual([]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
    expect(aztecNode.getTxReceipt).not.toHaveBeenCalled();
  });

  it('does not finalize tx that is only proven', async () => {
    const txHash = TxHash.random();

    aztecNode.getTxReceipt.mockResolvedValue(minedReceipt(txHash, TxStatus.PROVEN, 10));

    const result = await classifyPendingTxsFromReceipts([txHash], aztecNode);

    // Not finalized yet, so stays pending
    expect(result.txHashesFinalized).toEqual([]);
    expect(result.txHashesDropped).toEqual([]);
    expect(result.txHashesWithExecutionReverted).toEqual([]);
  });
});
