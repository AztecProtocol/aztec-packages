import {
  BlockNumber,
  BlockNumberSchema,
  EpochNumber,
  EpochNumberSchema,
  SlotNumber,
  SlotNumberSchema,
} from '@aztec/foundation/branded-types';
import type { DefineIfFlag, FieldsOf, PickDefined } from '@aztec/foundation/types';

import { z } from 'zod';

import { RevertCode } from '../avm/revert_code.js';
import { BlockHash } from '../block/block_hash.js';
import { DebugLog } from '../logs/debug_log.js';
import { type ZodFor, schemas } from '../schemas/schemas.js';
import { Tx } from './tx.js';
import { TxEffect } from './tx_effect.js';
import { TxHash } from './tx_hash.js';

/** Block inclusion/finalization status. */
export enum TxStatus {
  DROPPED = 'dropped',
  PENDING = 'pending',
  PROPOSED = 'proposed',
  CHECKPOINTED = 'checkpointed',
  PROVEN = 'proven',
  FINALIZED = 'finalized',
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

/** The four statuses a mined transaction can hold, ordered by finalization progress. */
export const MinedTxStatuses = [TxStatus.PROPOSED, TxStatus.CHECKPOINTED, TxStatus.PROVEN, TxStatus.FINALIZED] as const;

/** Block finalization status of a mined transaction. */
export type MinedTxStatus = (typeof MinedTxStatuses)[number];

/** Execution result - only set when tx is in a block. */
export enum TxExecutionResult {
  SUCCESS = 'success',
  REVERTED = 'reverted',
}

/** Returned from a `getTxReceipt` call to the node RPC API. */
export interface TxReceiptInterface {
  /** The transaction's block finalization status. */
  status: TxStatus;
  /** The execution result of the transaction, only set when the tx is in a block. */
  executionResult?: TxExecutionResult;
  /** Description of the transaction error, if any. */
  error?: string;
  /** The transaction fee paid for the transaction. */
  transactionFee?: bigint;
  /** The hash of the block containing the transaction. */
  blockHash?: BlockHash;
  /** The block number in which the transaction was included. */
  blockNumber?: BlockNumber;
  /** The slot number in which the transaction's block was built. */
  slotNumber?: SlotNumber;
  /** The epoch number in which the transaction was included. */
  epochNumber?: EpochNumber;
  /** The index of the transaction within its block. */
  txIndexInBlock?: number;
  /** The full transaction effect, attached when requested via `includeTxEffect`. */
  txEffect?: TxEffect;
  /** The pending transaction, attached when requested via `includePendingTx`. */
  tx?: Tx;
  /**
   * Debug logs collected during public function execution. Served only when the node is in test mode and placed on
   * the receipt only because it's a convenient place for it (the logs are printed out by the wallet when a mined
   * tx receipt is obtained).
   */
  debugLogs?: DebugLog[];

  /** Returns true (and narrows) if the transaction has been included in a block. */
  isMined(): this is MinedTxReceipt;

  /** Returns true (and narrows) if the transaction is pending. */
  isPending(): this is PendingTxReceipt;

  /** Returns true (and narrows) if the transaction was dropped. */
  isDropped(): this is DroppedTxReceipt;

  /** Returns true if the transaction was executed successfully. */
  hasExecutionSucceeded(): boolean;

  /** Returns true if the transaction execution reverted. */
  hasExecutionReverted(): boolean;
}

/**
 * Common surface shared by every transaction receipt variant ({@link PendingTxReceipt}, {@link DroppedTxReceipt},
 * {@link MinedTxReceipt}).
 *
 * Every cross-variant field is declared once here, optional except for `txHash` (always present) and `status`
 * (abstract, narrowed by each subclass). Declaring the fields optional on the base lets callers read a bare
 * {@link TxReceipt} union (without first narrowing) and keep compiling. Use the `is*` guards to narrow to the strong
 * variant type and gain access to its required fields.
 */
abstract class TxReceiptBase {
  /** The transaction's block finalization status. */
  public abstract readonly status: TxStatus;
  /** Description of the transaction error, if any. */
  public readonly error?: string;

  constructor(
    /** A unique identifier for a transaction. */
    public readonly txHash: TxHash,
  ) {}

  /** Returns true (and narrows) if the transaction has been included in a block. */
  public isMined(): this is MinedTxReceipt {
    return this instanceof MinedTxReceipt;
  }

  /** Returns true (and narrows) if the transaction is pending. */
  public isPending(): this is PendingTxReceipt {
    return this instanceof PendingTxReceipt;
  }

  /** Returns true (and narrows) if the transaction was dropped. */
  public isDropped(): this is DroppedTxReceipt {
    return this instanceof DroppedTxReceipt;
  }

  /** Returns true if the transaction was executed successfully. */
  public hasExecutionSucceeded(): boolean {
    return false;
  }

  /** Returns true if the transaction execution reverted. */
  public hasExecutionReverted(): boolean {
    return false;
  }
}

abstract class UnminedTxReceipt extends TxReceiptBase {
  public readonly executionResult: undefined = undefined;
  public readonly transactionFee: undefined = undefined;
  public readonly blockHash: undefined = undefined;
  public readonly blockNumber: undefined = undefined;
  public readonly slotNumber: undefined = undefined;
  public readonly txIndexInBlock: undefined = undefined;
  public readonly epochNumber: undefined = undefined;
  public readonly txEffect: undefined = undefined;
}

/**
 * Receipt for a transaction that is in the mempool but not yet included in a block.
 */
export class PendingTxReceipt<Opts extends GetTxReceiptOptions = GetTxReceiptOptions>
  extends UnminedTxReceipt
  implements TxReceiptInterface
{
  public override readonly status = TxStatus.PENDING;

  constructor(
    txHash: TxHash,
    /** The pending transaction, attached when requested via `includePendingTx`. */
    public readonly tx: DefineIfFlag<Opts, 'includePendingTx', Tx>,
  ) {
    super(txHash);
  }

  static empty(): PendingTxReceipt {
    return new PendingTxReceipt(TxHash.zero(), undefined);
  }

  static from(fields: PickDefined<FieldsOf<PendingTxReceipt>>): PendingTxReceipt {
    return new PendingTxReceipt(fields.txHash, fields.tx);
  }

  static get schema(): ZodFor<PendingTxReceipt> {
    return z
      .object({
        txHash: TxHash.schema,
        status: z.literal(TxStatus.PENDING),
        tx: Tx.schema.optional(),
      })
      .transform(fields => PendingTxReceipt.from({ tx: undefined, ...fields }));
  }
}

/**
 * Receipt for a transaction that was dropped from the mempool without being mined.
 */
export class DroppedTxReceipt extends UnminedTxReceipt implements TxReceiptInterface {
  public override readonly status = TxStatus.DROPPED;

  public tx: undefined = undefined;

  constructor(
    txHash: TxHash,
    public override readonly error?: string,
  ) {
    super(txHash);
  }

  static empty(): DroppedTxReceipt {
    return new DroppedTxReceipt(TxHash.zero());
  }

  static from(fields: PickDefined<FieldsOf<DroppedTxReceipt>>): DroppedTxReceipt {
    return new DroppedTxReceipt(fields.txHash, fields.error);
  }

  static get schema(): ZodFor<DroppedTxReceipt> {
    return z
      .object({
        txHash: TxHash.schema,
        status: z.literal(TxStatus.DROPPED),
        error: z.string().optional(),
      })
      .transform(DroppedTxReceipt.from);
  }
}

/**
 * Receipt for a transaction that has been included in a block (proposed, checkpointed, proven, or finalized).
 * All block-related fields are required for this variant.
 */
export class MinedTxReceipt<Opts extends GetTxReceiptOptions = GetTxReceiptOptions>
  extends TxReceiptBase
  implements TxReceiptInterface
{
  public override readonly status: MinedTxStatus;

  public readonly tx = undefined;

  constructor(
    txHash: TxHash,
    status: MinedTxStatus,
    public readonly executionResult: TxExecutionResult,
    public readonly transactionFee: bigint,
    public readonly blockHash: BlockHash,
    public readonly blockNumber: BlockNumber,
    public readonly slotNumber: SlotNumber,
    public readonly txIndexInBlock: number,
    public readonly epochNumber: EpochNumber,
    public readonly txEffect: DefineIfFlag<Opts, 'includeTxEffect', TxEffect>,
    public debugLogs?: DebugLog[],
  ) {
    super(txHash);
    this.status = status;
  }

  public override hasExecutionSucceeded(): boolean {
    return this.executionResult === TxExecutionResult.SUCCESS;
  }

  public override hasExecutionReverted(): boolean {
    return this.executionResult !== TxExecutionResult.SUCCESS;
  }

  static from(fields: PickDefined<FieldsOf<MinedTxReceipt>>): MinedTxReceipt {
    return new MinedTxReceipt(
      fields.txHash,
      fields.status,
      fields.executionResult,
      fields.transactionFee,
      fields.blockHash,
      fields.blockNumber,
      fields.slotNumber,
      fields.txIndexInBlock,
      fields.epochNumber,
      fields.txEffect,
      fields.debugLogs,
    );
  }

  /** A successful receipt with a random tx hash and placeholder block coordinates, FINALIZED unless overridden. */
  static random(overrides: Partial<FieldsOf<MinedTxReceipt>> = {}): MinedTxReceipt {
    return MinedTxReceipt.from({
      txHash: TxHash.random(),
      status: TxStatus.FINALIZED,
      executionResult: TxExecutionResult.SUCCESS,
      transactionFee: 0n,
      blockHash: BlockHash.random(),
      blockNumber: BlockNumber(1),
      slotNumber: SlotNumber(1),
      txIndexInBlock: 0,
      epochNumber: EpochNumber(1),
      txEffect: TxEffect.empty(),
      ...overrides,
    });
  }

  static get schema(): ZodFor<MinedTxReceipt> {
    return z
      .object({
        txHash: TxHash.schema,
        status: z.enum([TxStatus.PROPOSED, TxStatus.CHECKPOINTED, TxStatus.PROVEN, TxStatus.FINALIZED]),
        executionResult: z.nativeEnum(TxExecutionResult),
        transactionFee: schemas.BigInt,
        blockHash: BlockHash.schema,
        blockNumber: BlockNumberSchema,
        slotNumber: SlotNumberSchema,
        txIndexInBlock: schemas.Integer,
        epochNumber: EpochNumberSchema,
        txEffect: TxEffect.schema.optional(),
        debugLogs: z.array(DebugLog.schema).optional(),
      })
      .transform(fields => MinedTxReceipt.from({ txEffect: undefined, ...fields }));
  }

  public static executionResultFromRevertCode(revertCode: RevertCode): TxExecutionResult {
    return revertCode.isOK() ? TxExecutionResult.SUCCESS : TxExecutionResult.REVERTED;
  }
}

/**
 * A transaction receipt summarizing the lifecycle of a transaction in the Aztec network. Discriminated over the
 * transaction's status: {@link PendingTxReceipt} while in the mempool, {@link DroppedTxReceipt} once dropped, and
 * {@link MinedTxReceipt} once included in a block.
 */
export type TxReceipt<Opts extends GetTxReceiptOptions = GetTxReceiptOptions> =
  | PendingTxReceipt<Opts>
  | DroppedTxReceipt
  | MinedTxReceipt<Opts>;

/**
 * Zod schema for {@link TxReceipt}. Each member constrains its `status` field so the union routes
 * unambiguously, giving a deterministic serialization round-trip.
 */
export const TxReceiptSchema: ZodFor<TxReceipt> = z.union([
  PendingTxReceipt.schema,
  DroppedTxReceipt.schema,
  MinedTxReceipt.schema,
]) as ZodFor<TxReceipt>;

/** Options controlling which optional data is attached to a {@link TxReceipt}. */
export type GetTxReceiptOptions = {
  /** Attach the full {@link TxEffect} (mined txs only). */
  includeTxEffect?: boolean;
  /** Attach the pending {@link Tx} (pending txs only). */
  includePendingTx?: boolean;
  /** Keep the proof on the attached pending {@link Tx}; only meaningful alongside `includePendingTx`. */
  includeProof?: boolean;
};

/** Zod schema for {@link GetTxReceiptOptions}. */
export const GetTxReceiptOptionsSchema: ZodFor<GetTxReceiptOptions> = z.object({
  includeTxEffect: z.boolean().optional(),
  includePendingTx: z.boolean().optional(),
  includeProof: z.boolean().optional(),
});
