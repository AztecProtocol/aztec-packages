import { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { TxEffect, TxExecutionResult, TxHash, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { resolvePendingTxs } from './resolve_pending_txs.js';
import { minedIn, minedReceipt, pendingTx, txsInLogs } from './test_utils.js';

const FINALIZED_TIP = BlockNumber(15);

describe('resolvePendingTxs', () => {
  let aztecNode: MockProxy<AztecNode>;

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
  });

  it('resolves a window from the logs alone without querying the node', async () => {
    const txHash = TxHash.random();

    const result = await resolvePendingTxs(
      [pendingTx(txHash, 4)],
      txsInLogs([txHash, minedIn(14, [4])]),
      FINALIZED_TIP,
      aztecNode,
    );

    expect(result.txHashesFinalizedFromLogs).toEqual([txHash]);
    expect(result.receiptsWithExecutionReverted).toEqual([]);
    expect(result.txHashesDropped).toEqual([]);
    expect(aztecNode.getTxReceipt).not.toHaveBeenCalled();
  });

  it('fetches the tx effect for a tx whose highest tracked index is not onchain', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValue(
      minedReceipt(txHash, TxStatus.FINALIZED, 14, {
        executionResult: TxExecutionResult.REVERTED,
        txEffect: TxEffect.empty(),
      }),
    );

    const result = await resolvePendingTxs(
      [pendingTx(txHash, 6)],
      txsInLogs([txHash, minedIn(14, [4])]),
      FINALIZED_TIP,
      aztecNode,
    );

    expect(result.receiptsWithExecutionReverted).toHaveLength(1);
    expect(result.receiptsWithExecutionReverted[0].txEffect).toBeDefined();
    expect(result.txHashesFinalizedFromLogs).toEqual([]);
  });

  it('leaves out a missing-index tx whose receipt disagrees that it is finalized', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValue(minedReceipt(txHash, TxStatus.PROVEN, 14, { txEffect: TxEffect.empty() }));

    const result = await resolvePendingTxs(
      [pendingTx(txHash, 6)],
      txsInLogs([txHash, minedIn(14, [4])]),
      FINALIZED_TIP,
      aztecNode,
    );

    expect(result.receiptsWithExecutionReverted).toEqual([]);
  });

  it('re-fetches with the tx effect once a receipt reveals an absent tx reverted', async () => {
    const txHash = TxHash.random();
    // The first pass asks for a bare receipt, so only the follow-up carries an effect.
    aztecNode.getTxReceipt.mockImplementation((hash: TxHash, options?: { includeTxEffect?: boolean }) =>
      Promise.resolve(
        minedReceipt(hash, TxStatus.FINALIZED, 14, {
          executionResult: TxExecutionResult.REVERTED,
          txEffect: options?.includeTxEffect ? TxEffect.empty() : undefined,
        }),
      ),
    );

    const result = await resolvePendingTxs([pendingTx(txHash, 4)], new Map(), FINALIZED_TIP, aztecNode);

    expect(result.receiptsWithExecutionReverted).toHaveLength(1);
    expect(result.receiptsWithExecutionReverted[0].txEffect).toBeDefined();
  });

  it('groups a reverted tx together whether the logs or its receipt revealed the revert', async () => {
    const survivorInWindowTxHash = TxHash.random();
    const absentTxHash = TxHash.random();
    aztecNode.getTxReceipt.mockImplementation((hash: TxHash, options?: { includeTxEffect?: boolean }) =>
      Promise.resolve(
        minedReceipt(hash, TxStatus.FINALIZED, 14, {
          executionResult: TxExecutionResult.REVERTED,
          txEffect: options?.includeTxEffect ? TxEffect.empty() : undefined,
        }),
      ),
    );

    const result = await resolvePendingTxs(
      [pendingTx(survivorInWindowTxHash, 6), pendingTx(absentTxHash, 7)],
      txsInLogs([survivorInWindowTxHash, minedIn(14, [4])]),
      FINALIZED_TIP,
      aztecNode,
    );

    expect(result.receiptsWithExecutionReverted.map(receipt => receipt.txHash)).toEqual([
      survivorInWindowTxHash,
      absentTxHash,
    ]);
  });

  it('reports an absent tx whose receipt is not yet finalized as still pending', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValue(minedReceipt(txHash, TxStatus.PROVEN, 14));

    const result = await resolvePendingTxs([pendingTx(txHash, 4)], new Map(), FINALIZED_TIP, aztecNode);

    expect(result.txHashesFinalizedFromReceipts).toEqual([]);
    expect(result.txHashesDropped).toEqual([]);
    expect(result.receiptsWithExecutionReverted).toEqual([]);
  });

  it('finalizes an absent tx whose receipt reports it finalized and successful', async () => {
    const txHash = TxHash.random();
    aztecNode.getTxReceipt.mockResolvedValue(minedReceipt(txHash, TxStatus.FINALIZED, 14));

    const result = await resolvePendingTxs([pendingTx(txHash, 4)], new Map(), FINALIZED_TIP, aztecNode);

    expect(result.txHashesFinalizedFromReceipts).toEqual([txHash]);
    expect(result.txHashesDropped).toEqual([]);
    expect(result.receiptsWithExecutionReverted).toEqual([]);
  });
});
