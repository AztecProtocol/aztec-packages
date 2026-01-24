import type { SlotNumber } from '@aztec/foundation/branded-types';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { L2BlockId } from '@aztec/stdlib/block';
import type { Tx } from '@aztec/stdlib/tx';

import { getFeePayerBalanceDelta } from '../../msg_validators/tx_validator/fee_payer_balance.js';
import { getTxPriorityFee } from '../tx_pool/priority.js';

/**
 * Lightweight in-memory representation of a transaction.
 * Stored for every tx in the pool to enable efficient queries and challenges
 * without deserializing full transaction data.
 *
 * Uses strings for txHash and nullifiers to enable fast Map/Set lookups
 * without repeated .toString() conversions.
 */
export type TxMetaData = {
  /** The transaction hash as hex string */
  readonly txHash: string;

  /** Block ID (number and hash) in which the transaction was mined (undefined if not mined) */
  minedL2BlockId?: L2BlockId;

  /** Hash of the block header the transaction uses as its anchor (hex string) */
  readonly anchorBlockHeaderHash: string;

  /** The total priority fee (used for ordering and challenges) */
  readonly priorityFee: bigint;

  /** The fee payer address as hex string */
  readonly feePayer: string;

  /** The claim amount for the fee payer */
  readonly claimAmount: bigint;

  /** The fee limit */
  readonly feeLimit: bigint;

  /** Non-empty nullifiers emitted by the transaction (hex strings) */
  readonly nullifiers: readonly string[];

  /** Slot number for which the transaction is protected (undefined if not protected) */
  protectedSlotNumber?: SlotNumber;
};

/** Transaction state derived from TxMetaData fields */
export type TxState = 'pending' | 'protected' | 'mined';

/**
 * Derives the transaction state from its metadata.
 * A transaction is:
 * - 'mined' if it has a minedL2BlockId
 * - 'protected' if it has a protectedSlotNumber (but not mined)
 * - 'pending' otherwise
 */
export function getTxState(meta: TxMetaData): TxState {
  if (meta.minedL2BlockId !== undefined) {
    return 'mined';
  } else if (meta.protectedSlotNumber !== undefined) {
    return 'protected';
  } else {
    return 'pending';
  }
}

/**
 * Builds TxMetaData from a full Tx object.
 * Extracts all relevant fields for efficient in-memory storage and querying.
 */
export async function buildTxMetaData(tx: Tx): Promise<TxMetaData> {
  const txHash = tx.getTxHash().toString();
  const anchorBlockHeaderHash = (await tx.data.constants.anchorBlockHeader.hash()).toString();
  const priorityFee = getTxPriorityFee(tx);
  const feePayer = tx.data.feePayer.toString();
  const nullifiers = tx.data.getNonEmptyNullifiers().map(n => n.toString());

  const { feeLimit, claimAmount } = await getFeePayerBalanceDelta(tx, ProtocolContractAddress.FeeJuice);

  return {
    txHash,
    anchorBlockHeaderHash,
    priorityFee,
    feePayer,
    claimAmount,
    feeLimit,
    nullifiers,
  };
}

/**
 * Creates a priority string from TxMetaData for sorting.
 * Higher values = higher priority.
 */
export function getMetadataPriority(meta: TxMetaData): string {
  return meta.priorityFee.toString(16).padStart(32, '0');
}

/**
 * Compares two TxMetaData by priority fee.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function comparePriority(a: TxMetaData, b: TxMetaData): number {
  if (a.priorityFee < b.priorityFee) {
    return -1;
  }
  if (a.priorityFee > b.priorityFee) {
    return 1;
  }
  return 0;
}
