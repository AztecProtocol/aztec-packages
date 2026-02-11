import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { BlockHash, type L2BlockId } from '@aztec/stdlib/block';
import type { Tx } from '@aztec/stdlib/tx';

import { getFeePayerBalanceDelta } from '../../msg_validators/tx_validator/fee_payer_balance.js';
import { getTxPriorityFee } from '../tx_pool/priority.js';
import type { PreAddResult } from './eviction/interfaces.js';

/** Validator-compatible data interface, mirroring the subset of PrivateKernelTailCircuitPublicInputs used by validators. */
export type TxMetaValidationData = {
  getNonEmptyNullifiers(): Fr[];
  includeByTimestamp: bigint;
  constants: {
    anchorBlockHeader: {
      hash(): Promise<BlockHash>;
      globalVariables: {
        blockNumber: BlockNumber;
      };
    };
  };
};

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

  /** Timestamp by which the transaction must be included (for expiration checks) */
  readonly includeByTimestamp: bigint;

  /** Validator-compatible data, providing the same access patterns as Tx.data */
  readonly data: TxMetaValidationData;

  /** Timestamp (ms) when the tx was received into the pool. 0 for hydrated txs (always eligible). */
  receivedAt: number;
};

/** Transaction state derived from TxMetaData fields and pool protection status */
export type TxState = 'pending' | 'protected' | 'mined' | 'deleted';

/**
 * Builds TxMetaData from a full Tx object.
 * Extracts all relevant fields for efficient in-memory storage and querying.
 * Fr values are captured in closures for zero-cost re-validation.
 */
export async function buildTxMetaData(tx: Tx): Promise<TxMetaData> {
  const txHash = tx.getTxHash().toString();
  const nullifierFrs = tx.data.getNonEmptyNullifiers();
  const nullifiers = nullifierFrs.map(n => n.toString());
  const anchorBlockHeaderHashFr = await tx.data.constants.anchorBlockHeader.hash();
  const anchorBlockHeaderHash = anchorBlockHeaderHashFr.toString();
  const includeByTimestamp = tx.data.includeByTimestamp;
  const anchorBlockNumber = tx.data.constants.anchorBlockHeader.globalVariables.blockNumber;
  const priorityFee = getTxPriorityFee(tx);
  const feePayer = tx.data.feePayer.toString();

  const { feeLimit, claimAmount } = await getFeePayerBalanceDelta(tx, ProtocolContractAddress.FeeJuice);

  return {
    txHash,
    anchorBlockHeaderHash,
    priorityFee,
    feePayer,
    claimAmount,
    feeLimit,
    nullifiers,
    includeByTimestamp,
    receivedAt: 0,
    data: {
      getNonEmptyNullifiers: () => nullifierFrs,
      includeByTimestamp,
      constants: {
        anchorBlockHeader: {
          hash: () => Promise.resolve(anchorBlockHeaderHashFr),
          globalVariables: { blockNumber: anchorBlockNumber },
        },
      },
    },
  };
}

/** Minimal fields required for priority comparison. */
type PriorityComparable = Pick<TxMetaData, 'txHash' | 'priorityFee'>;

/**
 * Compares two priority fees in ascending order.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareFee(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compares two tx hashes in ascending order.
 * Uses field element comparison for deterministic ordering.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareTxHash(a: string, b: string): number {
  const fieldA = Fr.fromHexString(a);
  const fieldB = Fr.fromHexString(b);
  return fieldA.cmp(fieldB);
}

/**
 * Compares two transactions by priority fee, with txHash as tiebreaker.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Use with sort() for ascending order, or negate/reverse for descending.
 */
export function comparePriority(a: PriorityComparable, b: PriorityComparable): number {
  const feeComparison = compareFee(a.priorityFee, b.priorityFee);
  if (feeComparison !== 0) {
    return feeComparison;
  }
  return compareTxHash(a.txHash, b.txHash);
}

/**
 * Checks for nullifier conflicts between an incoming transaction and existing pool state.
 *
 * When the incoming tx shares nullifiers with existing pending txs:
 * - If the incoming tx has strictly higher priority, mark conflicting txs for eviction
 * - If any conflicting tx has equal or higher priority, ignore the incoming tx
 *
 * @param incomingMeta - Metadata for the incoming transaction
 * @param getTxHashByNullifier - Accessor to find which tx uses a nullifier
 * @param getMetadata - Accessor to get metadata for a tx hash
 */
export function checkNullifierConflict(
  incomingMeta: TxMetaData,
  getTxHashByNullifier: (nullifier: string) => string | undefined,
  getMetadata: (txHash: string) => TxMetaData | undefined,
): PreAddResult {
  const txHashesToEvict: string[] = [];

  for (const nullifier of incomingMeta.nullifiers) {
    const conflictingHashStr = getTxHashByNullifier(nullifier);

    if (!conflictingHashStr || conflictingHashStr === incomingMeta.txHash) {
      continue;
    }

    // Skip if already marked for eviction
    if (txHashesToEvict.includes(conflictingHashStr)) {
      continue;
    }

    const conflictingMeta = getMetadata(conflictingHashStr);
    if (!conflictingMeta) {
      continue;
    }

    // If incoming tx has strictly higher priority, mark for eviction
    // Otherwise, ignore incoming tx (ties go to existing tx)
    // Use comparePriority for deterministic ordering (includes txHash as tiebreaker)
    if (comparePriority(incomingMeta, conflictingMeta) > 0) {
      txHashesToEvict.push(conflictingHashStr);
    } else {
      return {
        shouldIgnore: true,
        txHashesToEvict: [],
        reason: `nullifier conflict with ${conflictingHashStr}`,
      };
    }
  }

  return { shouldIgnore: false, txHashesToEvict };
}

/** Creates a stub TxMetaValidationData for tests that don't exercise validators. */
export function stubTxMetaValidationData(overrides: { includeByTimestamp?: bigint } = {}): TxMetaValidationData {
  return {
    getNonEmptyNullifiers: () => [],
    includeByTimestamp: overrides.includeByTimestamp ?? 0n,
    constants: {
      anchorBlockHeader: {
        hash: () => Promise.resolve(new BlockHash(Fr.ZERO)),
        globalVariables: { blockNumber: BlockNumber(0) },
      },
    },
  };
}
