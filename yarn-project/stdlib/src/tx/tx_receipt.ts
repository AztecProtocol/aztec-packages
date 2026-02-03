import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import { RevertCode } from '../avm/revert_code.js';
import { BlockHash } from '../block/block_hash.js';
import { type ZodFor, schemas } from '../schemas/schemas.js';
import { TxHash } from './tx_hash.js';

/** Block inclusion/finalization status. */
export enum TxStatus {
  DROPPED = 'dropped',
  PENDING = 'pending',
  PROPOSED = 'proposed',
  CHECKPOINTED = 'checkpointed',
  PROVEN = 'proven',
  FINALIZED = 'finalized', // TODO(#13569): Implement finalized status properly
}

/** Tx status sorted by finalization progress. */
export const SortedTxStatuses: TxStatus[] = [
  TxStatus.DROPPED,
  TxStatus.PENDING,
  TxStatus.PROPOSED,
  TxStatus.CHECKPOINTED,
  TxStatus.PROVEN,
  TxStatus.FINALIZED,
];

/** Execution result - only set when tx is in a block. */
export enum TxExecutionResult {
  SUCCESS = 'success',
  APP_LOGIC_REVERTED = 'app_logic_reverted',
  TEARDOWN_REVERTED = 'teardown_reverted',
  BOTH_REVERTED = 'both_reverted',
}

/**
 * Represents a transaction receipt in the Aztec network.
 * Contains essential information about the transaction including its status, origin, and associated addresses.
 * REFACTOR: TxReceipt should be returned only once the tx is mined, and all its fields should be required.
 * We should not be using a TxReceipt to answer a query for a pending or dropped tx.
 */
export class TxReceipt {
  constructor(
    /** A unique identifier for a transaction. */
    public txHash: TxHash,
    /** The transaction's block finalization status. */
    public status: TxStatus,
    /** The execution result of the transaction, only set when tx is in a block. */
    public executionResult: TxExecutionResult | undefined,
    /** Description of transaction error, if any. */
    public error: string | undefined,
    /** The transaction fee paid for the transaction. */
    public transactionFee?: bigint,
    /** The hash of the block containing the transaction. */
    public blockHash?: BlockHash,
    /** The block number in which the transaction was included. */
    public blockNumber?: BlockNumber,
  ) {}

  /** Returns true if the transaction was executed successfully. */
  hasExecutionSucceeded(): boolean {
    return this.executionResult === TxExecutionResult.SUCCESS;
  }

  /** Returns true if the transaction execution reverted. */
  hasExecutionReverted(): boolean {
    return this.executionResult !== undefined && this.executionResult !== TxExecutionResult.SUCCESS;
  }

  /** Returns true if the transaction has been included in a block (proposed, checkpointed, proven, or finalized). */
  isMined(): boolean {
    return (
      this.status === TxStatus.PROPOSED ||
      this.status === TxStatus.CHECKPOINTED ||
      this.status === TxStatus.PROVEN ||
      this.status === TxStatus.FINALIZED
    );
  }

  /** Returns true if the transaction is pending. */
  isPending(): boolean {
    return this.status === TxStatus.PENDING;
  }

  /** Returns true if the transaction was dropped. */
  isDropped(): boolean {
    return this.status === TxStatus.DROPPED;
  }

  static empty() {
    return new TxReceipt(TxHash.zero(), TxStatus.DROPPED, undefined, undefined);
  }

  static get schema(): ZodFor<TxReceipt> {
    return z
      .object({
        txHash: TxHash.schema,
        status: z.nativeEnum(TxStatus),
        executionResult: z.nativeEnum(TxExecutionResult).optional(),
        error: z.string().optional(),
        blockHash: BlockHash.schema.optional(),
        blockNumber: BlockNumberSchema.optional(),
        transactionFee: schemas.BigInt.optional(),
      })
      .transform(fields => TxReceipt.from(fields));
  }

  static from(fields: {
    txHash: TxHash;
    status: TxStatus;
    executionResult?: TxExecutionResult;
    error?: string;
    transactionFee?: bigint;
    blockHash?: BlockHash;
    blockNumber?: BlockNumber;
  }) {
    return new TxReceipt(
      fields.txHash,
      fields.status,
      fields.executionResult,
      fields.error,
      fields.transactionFee,
      fields.blockHash,
      fields.blockNumber,
    );
  }

  public static executionResultFromRevertCode(revertCode: RevertCode): TxExecutionResult {
    if (revertCode.equals(RevertCode.OK)) {
      return TxExecutionResult.SUCCESS;
    } else if (revertCode.equals(RevertCode.APP_LOGIC_REVERTED)) {
      return TxExecutionResult.APP_LOGIC_REVERTED;
    } else if (revertCode.equals(RevertCode.TEARDOWN_REVERTED)) {
      return TxExecutionResult.TEARDOWN_REVERTED;
    } else if (revertCode.equals(RevertCode.BOTH_REVERTED)) {
      return TxExecutionResult.BOTH_REVERTED;
    } else {
      throw new Error(`Unknown revert code: ${revertCode.getCode()}`);
    }
  }
}
