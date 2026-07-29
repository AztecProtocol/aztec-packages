import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { BlockHash } from '@aztec/stdlib/block';
import type { MinedTxStatus, TxEffect, TxHash } from '@aztec/stdlib/tx';
import { MinedTxReceipt, TxExecutionResult } from '@aztec/stdlib/tx';

import type { PendingTx } from '../../../storage/tagging_store/sender_tagging_store.js';
import type { TxInLogs } from './load_and_store_new_tagging_indexes.js';

/** A tx the store holds as pending, tracked up to the given index. */
export function pendingTx(txHash: TxHash, highestIndex: number): PendingTx {
  return { txHash: txHash.toString(), highestIndex };
}

/** One tx as a window's logs show it: the block it was mined in and the tagging indexes its logs carried. */
export function minedIn(blockNumber: number, taggingIndexes: number[]): TxInLogs {
  return { blockNumber: BlockNumber(blockNumber), taggingIndexes };
}

/** Builds the tx-hash-keyed map a window's logs would produce. */
export function txsInLogs(...entries: [TxHash, TxInLogs][]): Map<string, TxInLogs> {
  return new Map(entries.map(([txHash, txInLogs]) => [txHash.toString(), txInLogs]));
}

/** The receipt of a mined tx, successful and without a tx effect unless stated otherwise. */
export function minedReceipt(
  txHash: TxHash,
  status: MinedTxStatus,
  blockNumber: number,
  {
    executionResult = TxExecutionResult.SUCCESS,
    txEffect,
  }: { executionResult?: TxExecutionResult; txEffect?: TxEffect } = {},
): MinedTxReceipt {
  return new MinedTxReceipt(
    txHash,
    status,
    executionResult,
    1n,
    BlockHash.random(),
    BlockNumber(blockNumber),
    SlotNumber(Number(blockNumber)),
    0,
    EpochNumber(1),
    txEffect,
  );
}
