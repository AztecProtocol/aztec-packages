import type { WindowBlockFees } from '@aztec/ethereum/l1-fee-analysis';
import type { FeeCaps } from '@aztec/ethereum/l1-tx-utils';
import type { Branded } from '@aztec/foundation/branded-types';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import type { Hex } from 'viem';
import { z } from 'zod';

/** URI pointing to a stored failed L1 transaction. */
export type FailedL1TxUri = Branded<string, 'FailedL1TxUri'>;

/**
 * A failed L1 transaction captured for debugging and replay. Serialized with jsonStringify (bigints
 * become decimal strings on disk) and parsed back via FailedL1TxSchema.
 */
export type FailedL1Tx = {
  /** Tx hash (for reverts) or keccak256(request.data) (for simulation/send failures). */
  id: Hex;
  /** Unix timestamp (ms) when failure occurred. */
  timestamp: number;
  /** How the failure occurred. */
  failureType: 'simulation' | 'revert' | 'send-error' | 'timeout';
  /** The actual L1 transaction for replay (multicall-encoded for bundled txs). */
  request: {
    to: Hex;
    data: Hex;
    value?: bigint;
  };
  /** Raw blob data as hex for replay. */
  blobData?: Hex[];
  /** L1 block number at time of failure (simulation target or receipt block). */
  l1BlockNumber: bigint;
  /** Receipt info (present only for on-chain reverts). */
  receipt?: {
    transactionHash: Hex;
    blockNumber: bigint;
    gasUsed: bigint;
    status: 'reverted';
  };
  /** Error information. */
  error: {
    message: string;
    /** Decoded error name (e.g., 'Rollup__InvalidProposer'). */
    name?: string;
  };
  /** Context metadata. */
  context: {
    /** Actions involved (e.g., ['propose', 'governance-signal']). */
    actions: string[];
    /** Individual request data for each action (metadata, not used for replay). */
    requests?: Array<{ action: string; to: Hex; data: Hex }>;
    checkpointNumber?: number;
    slot?: number;
    sender: Hex;
  };
  /** Gas pricing info at time of failure for underpricing diagnosis. */
  gasInfo?: {
    /**
     * Fee caps the tx was sent with (present for revert/send-error/timeout, not simulation). Records written before
     * this field was renamed spell it `sentGasPrice`, and parse back without it.
     */
    sentFeeCaps?: FeeCaps;
    /** Gas limit used or estimated. */
    gasLimit?: bigint;
    /** Nonce used for the sent tx. */
    nonce?: number;
    /**
     * For timeouts: the escalating fee caps used across the initial send and each speed-up retry, in order.
     * Compare against windowBlocks[].minIncludedPriorityFee to see if any attempt cleared the bar.
     */
    sentFeeCapsLadder?: FeeCaps[];
    /** Number of send attempts (initial send + speed-ups). */
    attempts?: number;
    /**
     * Per-block fee data for the L1 blocks the tx could have been included in (the target L2 slot's
     * inclusion window), in chronological order. Compare sentFeeCaps against these to see whether
     * the tx was underpriced for each block it competed for. May be a partial or empty list if the
     * window was not yet mined when the failure was recorded (e.g. an early send failure).
     */
    windowBlocks?: WindowBlockFees[];
  };
  /** Timing info relative to the L2 slot. */
  timing?: {
    /** The target L2 slot this tx was for. */
    targetL2Slot?: number;
    /** Unix timestamp (seconds) when the target slot ends. */
    slotDeadlineTimestampS?: bigint;
    /** Milliseconds remaining until the slot deadline. Negative = past deadline. */
    msUntilSlotDeadline?: number;
  };
};

const hexSchema = schemas.HexStringWith0x;

const feeCapsSchema = z.object({
  maxFeePerGas: schemas.BigInt,
  maxPriorityFeePerGas: schemas.BigInt,
  maxFeePerBlobGas: schemas.BigInt.optional(),
}) satisfies ZodFor<FeeCaps>;

const windowBlockFeesSchema = z.object({
  blockNumber: schemas.BigInt,
  timestamp: schemas.BigInt,
  baseFeePerGas: schemas.BigInt,
  p75PriorityFee: schemas.BigInt,
  minIncludedPriorityFee: schemas.BigInt,
  blockBlobsFull: z.boolean(),
  includedBlobCount: z.number(),
}) satisfies ZodFor<WindowBlockFees>;

/** Parses a stored failed-tx record, coercing the on-disk decimal strings back to bigints. */
export const FailedL1TxSchema: ZodFor<FailedL1Tx> = z.object({
  id: hexSchema,
  timestamp: z.number(),
  failureType: z.enum(['simulation', 'revert', 'send-error', 'timeout']),
  request: z.object({
    to: hexSchema,
    data: hexSchema,
    value: schemas.BigInt.optional(),
  }),
  blobData: z.array(hexSchema).optional(),
  l1BlockNumber: schemas.BigInt,
  receipt: z
    .object({
      transactionHash: hexSchema,
      blockNumber: schemas.BigInt,
      gasUsed: schemas.BigInt,
      status: z.literal('reverted'),
    })
    .optional(),
  error: z.object({
    message: z.string(),
    name: z.string().optional(),
  }),
  context: z.object({
    actions: z.array(z.string()),
    requests: z.array(z.object({ action: z.string(), to: hexSchema, data: hexSchema })).optional(),
    checkpointNumber: z.number().optional(),
    slot: z.number().optional(),
    sender: hexSchema,
  }),
  gasInfo: z
    .object({
      sentFeeCaps: feeCapsSchema.optional(),
      gasLimit: schemas.BigInt.optional(),
      nonce: z.number().optional(),
      sentFeeCapsLadder: z.array(feeCapsSchema).optional(),
      attempts: z.number().optional(),
      windowBlocks: z.array(windowBlockFeesSchema).optional(),
    })
    .optional(),
  timing: z
    .object({
      targetL2Slot: z.number().optional(),
      slotDeadlineTimestampS: schemas.BigInt.optional(),
      msUntilSlotDeadline: z.number().optional(),
    })
    .optional(),
});

/** Store for failed L1 transactions for debugging purposes. */
export interface L1TxFailedStore {
  /** Saves a failed transaction and returns its URI. */
  saveFailedTx(tx: FailedL1Tx): Promise<FailedL1TxUri>;
  /** Retrieves a failed transaction by its URI. */
  getFailedTx(uri: FailedL1TxUri): Promise<FailedL1Tx>;
}
