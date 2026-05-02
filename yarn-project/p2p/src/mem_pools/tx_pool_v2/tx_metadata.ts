import { minBigint } from '@aztec/foundation/bigint';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { BlockHash, type L2BlockId } from '@aztec/stdlib/block';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import { getFeePayerBalanceDelta } from '../../msg_validators/tx_validator/fee_payer_balance.js';
import { type PreAddResult, TxPoolRejectionCode } from './eviction/interfaces.js';

/** Validator-compatible data interface, mirroring the subset of PrivateKernelTailCircuitPublicInputs used by validators. */
export type TxMetaValidationData = {
  getNonEmptyNullifiers(): Fr[];
  expirationTimestamp: bigint;
  /** Whether the tx has public calls. Used to select the correct L2 gas minimum. */
  forPublic?: unknown;
  constants: {
    anchorBlockHeader: {
      hash(): Promise<BlockHash>;
      globalVariables: {
        blockNumber: BlockNumber;
      };
    };
    txContext: {
      gasSettings: { gasLimits: Gas; maxFeesPerGas: GasFees };
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

  /** The transaction hash as bigint (for efficient Fr conversion in comparisons) */
  readonly txHashBigInt: bigint;

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
  readonly expirationTimestamp: bigint;

  /** Whether the tx's setup-phase calls pass the allow list check. Computed at receipt time. */
  readonly allowedSetupCalls: boolean;

  /** Validator-compatible data, providing the same access patterns as Tx.data */
  readonly data: TxMetaValidationData;

  /** Timestamp (ms) when the tx was received into the pool. 0 for hydrated txs (always eligible). */
  receivedAt: number;

  /** Estimated memory footprint of this metadata object in bytes */
  readonly estimatedSizeBytes: number;
};

/** Transaction state derived from TxMetaData fields and pool protection status */
export type TxState = 'pending' | 'protected' | 'mined' | 'deleted';

/**
 * Builds TxMetaData from a full Tx object.
 * Extracts all relevant fields for efficient in-memory storage and querying.
 * Fr values are captured in closures for zero-cost re-validation.
 *
 * @param allowedSetupCalls - Whether the tx's setup-phase calls pass the allow list.
 *   For gossip/RPC txs this is always `true` (already validated by PhasesTxValidator).
 *   For req/resp txs this should be computed by the caller using the phases validator.
 */
export async function buildTxMetaData(tx: Tx, allowedSetupCalls: boolean = true): Promise<TxMetaData> {
  const txHashObj = tx.getTxHash();
  const txHash = txHashObj.toString();
  const txHashBigInt = txHashObj.toBigInt();
  const nullifierFrs = tx.data.getNonEmptyNullifiers();
  const nullifiers = nullifierFrs.map(n => n.toString());
  const anchorBlockHeaderHashFr = await tx.data.constants.anchorBlockHeader.hash();
  const anchorBlockHeaderHash = anchorBlockHeaderHashFr.toString();
  const expirationTimestamp = tx.data.expirationTimestamp;
  const anchorBlockNumber = tx.data.constants.anchorBlockHeader.globalVariables.blockNumber;
  const priorityFee = getTxPriorityFee(tx);
  const feePayer = tx.data.feePayer.toString();

  const { feeLimit, claimAmount } = await getFeePayerBalanceDelta(tx, ProtocolContractAddress.FeeJuice);

  const estimatedSizeBytes = estimateTxMetaDataSize(nullifiers.length);

  return {
    txHash,
    txHashBigInt,
    anchorBlockHeaderHash,
    priorityFee,
    feePayer,
    claimAmount,
    feeLimit,
    nullifiers,
    expirationTimestamp,
    allowedSetupCalls,
    receivedAt: 0,
    estimatedSizeBytes,
    data: {
      getNonEmptyNullifiers: () => nullifierFrs,
      expirationTimestamp,
      forPublic: !!tx.data.forPublic,
      constants: {
        anchorBlockHeader: {
          hash: () => Promise.resolve(anchorBlockHeaderHashFr),
          globalVariables: { blockNumber: anchorBlockNumber },
        },
        txContext: {
          gasSettings: {
            gasLimits: tx.data.constants.txContext.gasSettings.gasLimits,
            maxFeesPerGas: tx.data.constants.txContext.gasSettings.maxFeesPerGas,
          },
        },
      },
    },
  };
}

// V8 JS object overhead (~64 bytes for a plain object with hidden class).
// String overhead: ~32 bytes header + 1 byte per ASCII char (V8 one-byte strings).
// Hex string (0x + 64 hex chars = 66 chars): ~98 bytes per string.
// bigint: ~32 bytes. number: 8 bytes. Fr: ~80 bytes (32 data + object overhead).
const OBJECT_OVERHEAD = 64;
const HEX_STRING_BYTES = 98;
const BIGINT_BYTES = 32;
const FR_BYTES = 80;
// Fixed cost: object shell + txHash + anchorBlockHeaderHash + feePayer (3 hex strings)
// + txHashBigInt + priorityFee + claimAmount + feeLimit + includeByTimestamp (5 bigints)
// + receivedAt (number, 8 bytes) + estimatedSizeBytes (number, 8 bytes)
// + data closure object (~OBJECT_OVERHEAD + anchorBlockHeaderHashFr Fr + anchorBlockNumber number)
const FIXED_METADATA_BYTES =
  OBJECT_OVERHEAD + 3 * HEX_STRING_BYTES + 5 * BIGINT_BYTES + 8 + 8 + OBJECT_OVERHEAD + FR_BYTES + 8;

/** Estimates the in-memory size of a TxMetaData object based on the number of nullifiers. */
function estimateTxMetaDataSize(nullifierCount: number): number {
  // Per nullifier: one hex string in nullifiers[] + one Fr in the captured nullifierFrs[]
  return FIXED_METADATA_BYTES + nullifierCount * (HEX_STRING_BYTES + FR_BYTES);
}

/** Converts a txHash bigint back to the canonical 0x-prefixed 64-char hex string. */
export function txHashFromBigInt(value: bigint): string {
  return TxHash.fromBigInt(value).toString();
}

/** Minimal fields required for priority comparison. */
export type PriorityComparable = Pick<TxMetaData, 'txHash' | 'txHashBigInt' | 'priorityFee'>;

/**
 * Compares two priority fees in ascending order.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareFee(a: bigint, b: bigint): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compares two tx hashes in ascending order.
 * Uses field element comparison for deterministic ordering.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareTxHash(a: bigint, b: bigint): -1 | 0 | 1 {
  return Fr.cmpAsBigInt(a, b);
}

/**
 * Compares two transactions by priority fee, with txHash as tiebreaker.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Use with sort() for ascending order, or negate/reverse for descending.
 */
export function comparePriority(a: PriorityComparable, b: PriorityComparable): -1 | 0 | 1 {
  const feeComparison = compareFee(a.priorityFee, b.priorityFee);
  if (feeComparison !== 0) {
    return feeComparison;
  }
  return compareTxHash(a.txHashBigInt, b.txHashBigInt);
}

/**
 * Returns the minimum fee required to replace an existing tx with the given price bump percentage.
 * Uses integer arithmetic: `existingFee + existingFee * priceBumpPercentage / 100`.
 */
export function getMinimumPriceBumpFee(existingFee: bigint, priceBumpPercentage: bigint): bigint {
  const bump = (existingFee * priceBumpPercentage) / 100n;
  // Ensure the minimum bump is at least 1, so that replacement always requires
  // paying strictly more — even with 0% bump or zero existing fee.
  const effectiveBump = bump > 0n ? bump : 1n;
  return existingFee + effectiveBump;
}

/**
 * Checks for nullifier conflicts between an incoming transaction and existing pool state.
 *
 * When the incoming tx shares nullifiers with existing pending txs:
 * - If the incoming tx meets or exceeds the required priority, mark conflicting txs for eviction
 * - Otherwise, ignore the incoming tx
 *
 * When `priceBumpPercentage` is provided (RPC path), uses fee-only comparison with the
 * percentage bump instead of `comparePriority`.
 *
 * @param incomingMeta - Metadata for the incoming transaction
 * @param getTxHashByNullifier - Accessor to find which tx uses a nullifier
 * @param getMetadata - Accessor to get metadata for a tx hash
 * @param priceBumpPercentage - Optional percentage bump required for fee-based replacement
 */
export function checkNullifierConflict(
  incomingMeta: TxMetaData,
  getTxHashByNullifier: (nullifier: string) => string | undefined,
  getMetadata: (txHash: string) => TxMetaData | undefined,
  priceBumpPercentage?: bigint,
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

    // When price bump is set (RPC path), require the incoming fee to meet the bumped threshold.
    // Otherwise (P2P path), use full comparePriority with tx hash tiebreaker.
    const isHigherPriority =
      priceBumpPercentage !== undefined
        ? incomingMeta.priorityFee >= getMinimumPriceBumpFee(conflictingMeta.priorityFee, priceBumpPercentage)
        : comparePriority(incomingMeta, conflictingMeta) > 0;

    if (isHigherPriority) {
      txHashesToEvict.push(conflictingHashStr);
    } else {
      const minimumFee =
        priceBumpPercentage !== undefined
          ? getMinimumPriceBumpFee(conflictingMeta.priorityFee, priceBumpPercentage)
          : undefined;
      return {
        shouldIgnore: true,
        txHashesToEvict: [],
        reason: {
          code: TxPoolRejectionCode.NULLIFIER_CONFLICT,
          message:
            minimumFee !== undefined
              ? `Nullifier conflict with existing tx ${conflictingHashStr}. Minimum required fee: ${minimumFee}, got: ${incomingMeta.priorityFee}`
              : `Nullifier conflict with existing tx ${conflictingHashStr}`,
          conflictingTxHash: conflictingHashStr,
          minimumPriceBumpFee: minimumFee,
          txPriorityFee: minimumFee !== undefined ? incomingMeta.priorityFee : undefined,
        },
      };
    }
  }

  return { shouldIgnore: false, txHashesToEvict };
}

/** Creates a stub TxMetaValidationData for tests that don't exercise validators. */
export function stubTxMetaValidationData(
  overrides: { expirationTimestamp?: bigint; maxFeesPerGas?: GasFees } = {},
): TxMetaValidationData {
  return {
    getNonEmptyNullifiers: () => [],
    expirationTimestamp: overrides.expirationTimestamp ?? 0n,
    constants: {
      anchorBlockHeader: {
        hash: () => Promise.resolve(BlockHash.ZERO),
        globalVariables: { blockNumber: BlockNumber(0) },
      },
      txContext: {
        gasSettings: { gasLimits: Gas.empty(), maxFeesPerGas: overrides.maxFeesPerGas ?? GasFees.empty() },
      },
    },
  };
}

/** Creates a stub TxMetaData for tests. All fields have sensible defaults and can be overridden. */
export function stubTxMetaData(
  txHash: string,
  overrides: {
    priorityFee?: bigint;
    feePayer?: string;
    claimAmount?: bigint;
    feeLimit?: bigint;
    nullifiers?: string[];
    expirationTimestamp?: bigint;
    anchorBlockHeaderHash?: string;
    allowedSetupCalls?: boolean;
    maxFeesPerGas?: GasFees;
  } = {},
): TxMetaData {
  const txHashBigInt = Fr.fromHexString(txHash).toBigInt();
  // Normalize to canonical zero-padded hex so txHashFromBigInt(txHashBigInt) === normalizedTxHash
  const normalizedTxHash = txHashFromBigInt(txHashBigInt);
  const expirationTimestamp = overrides.expirationTimestamp ?? 0n;
  return {
    txHash: normalizedTxHash,
    txHashBigInt,
    anchorBlockHeaderHash: overrides.anchorBlockHeaderHash ?? '0x1234',
    priorityFee: overrides.priorityFee ?? 100n,
    feePayer: overrides.feePayer ?? '0xfeepayer',
    claimAmount: overrides.claimAmount ?? 0n,
    feeLimit: overrides.feeLimit ?? 100n,
    nullifiers: overrides.nullifiers ?? [`0x${normalizedTxHash.slice(2)}null1`],
    expirationTimestamp,
    allowedSetupCalls: overrides.allowedSetupCalls ?? true,
    receivedAt: 0,
    estimatedSizeBytes: 0,
    data: stubTxMetaValidationData({ expirationTimestamp, maxFeesPerGas: overrides.maxFeesPerGas }),
  };
}

/** Returns the priority fee for a tx, based on the L2 priority fee capped by the max fee per gas. */
function getTxPriorityFee(tx: Tx): bigint {
  const { maxPriorityFeesPerGas: priorityFees, maxFeesPerGas } = tx.getGasSettings();
  return minBigint(maxFeesPerGas.feePerL2Gas, priorityFees.feePerL2Gas);
}
