import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { RevertCode } from '../avm/revert_code.js';
import { L2BlockHash } from '../block/block_hash.js';
import { type ZodFor, schemas } from '../schemas/schemas.js';
import { TxHash } from './tx_hash.js';

/**
 * Possible status of a transaction.
 */
export enum TxStatus {
  DROPPED = 'dropped',
  PENDING = 'pending',
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
    /** The transaction's status. */
    public status: TxStatus,
    /** Description of transaction error, if any. */
    public error: string,
    /** The transaction fee paid for the transaction. */
    public transactionFee?: bigint,
    /** The hash of the block containing the transaction. */
    public blockHash?: L2BlockHash,
    /** The block number in which the transaction was included. */
    public blockNumber?: number,
  ) {}

  static empty() {
    return new TxReceipt(TxHash.zero(), TxStatus.DROPPED, '');
  }

  static get schema(): ZodFor<TxReceipt> {
    return z
      .object({
        txHash: TxHash.schema,
        status: z.nativeEnum(TxStatus),
        error: z.string(),
        blockHash: L2BlockHash.schema.optional(),
        blockNumber: z.number().int().nonnegative().optional(),
        transactionFee: schemas.BigInt.optional(),
      })
      .transform(TxReceipt.from);
  }

  static from(fields: FieldsOf<TxReceipt>) {
    return new TxReceipt(
      fields.txHash,
      fields.status,
      fields.error,
      fields.transactionFee,
      fields.blockHash,
      fields.blockNumber,
    );
  }

  public static statusFromRevertCode(revertCode: RevertCode) {
    if (revertCode.equals(RevertCode.OK)) {
      return TxStatus.SUCCESS;
    } else if (revertCode.equals(RevertCode.APP_LOGIC_REVERTED)) {
      return TxStatus.APP_LOGIC_REVERTED;
    } else if (revertCode.equals(RevertCode.TEARDOWN_REVERTED)) {
      return TxStatus.TEARDOWN_REVERTED;
    } else if (revertCode.equals(RevertCode.BOTH_REVERTED)) {
      return TxStatus.BOTH_REVERTED;
    } else {
      throw new Error(`Unknown revert code: ${revertCode.getCode()}`);
    }
  }
}
