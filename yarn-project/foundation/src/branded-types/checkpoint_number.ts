import { z } from 'zod';

import type { BlockNumber } from './block_number.js';
import type { Branded } from './types.js';

/**
 * A branded type representing an checkpoint number.
 * Checkpoints are used in the Aztec protocol to group L2 blocks.
 *
 * This is a nominal type backed by a number, but TypeScript will treat it as
 * incompatible with plain numbers and other branded numeric types (like Slot, BlockNumber, etc.).
 *
 * @example
 * ```ts
 * const checkpoint = CheckpointNumber(5);
 * const plainNumber: number = checkpoint; // OK - CheckpointNumber is assignable to number
 * const checkpointFromNumber: CheckpointNumber = 5;  // ERROR - number is not assignable to CheckpointNumber
 * ```
 */
export type CheckpointNumber = Branded<number, 'CheckpointNumber'>;

/**
 * Creates an CheckpointNumber from a number.
 * @param value - The checkpoint number (must be a non-negative integer)
 * @returns The branded CheckpointNumber value
 * @throws If the value is negative or not an integer
 */
export function CheckpointNumber(value: number): CheckpointNumber {
  if (!Number.isInteger(value)) {
    throw new Error(`CheckpointNumber must be an integer, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`CheckpointNumber must be non-negative, got ${value}`);
  }
  return value as CheckpointNumber;
}

/**
 * @param value - The block number
 * @returns The branded CheckpointNumber value
 *
 * @deprecated Checkpoint number and block number should no longer convert to each other once we support multiple blocks
 * per checkpoint everywhere.
 */
CheckpointNumber.fromBlockNumber = function (value: BlockNumber): CheckpointNumber {
  return CheckpointNumber(value);
};

/**
 * Creates an CheckpointNumber from a bigint.
 * @param value - The checkpoint number as bigint (must be a non-negative integer within safe integer range)
 * @returns The branded CheckpointNumber value
 * @throws If the value is negative or exceeds Number.MAX_SAFE_INTEGER
 */
CheckpointNumber.fromBigInt = function (value: bigint): CheckpointNumber {
  if (value < 0n) {
    throw new Error(`CheckpointNumber must be non-negative, got ${value}`);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`CheckpointNumber ${value} exceeds MAX_SAFE_INTEGER`);
  }
  return Number(value) as CheckpointNumber;
};

/**
 * Creates an CheckpointNumber from a string.
 * @param value - The checkpoint number as a string
 * @returns The branded CheckpointNumber value
 * @throws If the string cannot be parsed as a valid checkpoint
 */
CheckpointNumber.fromString = function (value: string): CheckpointNumber {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Cannot parse CheckpointNumber from string: ${value}`);
  }
  return CheckpointNumber(parsed);
};

/**
 * Type guard to check if a value is a valid CheckpointNumber.
 * Note: At runtime, an CheckpointNumber is just a number, so this checks if the value
 * is a non-negative integer.
 */
CheckpointNumber.isValid = function (value: unknown): value is CheckpointNumber {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
};

/** The zero checkpoint value. */
CheckpointNumber.ZERO = CheckpointNumber(0);

/** Initial checkpoint. */
CheckpointNumber.INITIAL = CheckpointNumber(1);

/**
 * Zod schema for parsing and validating CheckpointNumber values.
 * Accepts numbers, bigints, or strings and coerces them to CheckpointNumber.
 */
function makeCheckpointNumberSchema(minValue: number) {
  return z
    .union([z.number(), z.bigint(), z.string()])
    .pipe(z.coerce.number().int().min(minValue))
    .transform(value => CheckpointNumber(value));
}

/**
 * Zod schema for parsing and validating Checkpoint values.
 * Accepts numbers, bigints, or strings and coerces them to CheckpointNumber.
 */
export const CheckpointNumberSchema = makeCheckpointNumberSchema(0);

/**
 * Zod schema for parsing and validating CheckpointNumber values that are strictly positive.
 * Accepts numbers, bigints, or strings and coerces them to CheckpointNumber.
 */
export const CheckpointNumberPositiveSchema = makeCheckpointNumberSchema(1);
