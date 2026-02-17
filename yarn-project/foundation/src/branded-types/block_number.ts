import { z } from 'zod';

import type { CheckpointNumber } from './checkpoint_number.js';
import type { Branded } from './types.js';

/**
 * A branded type representing an Aztec (L2) block number.
 * Block numbers are sequential identifiers for blocks in the Aztec rollup chain.
 *
 * This is a nominal type backed by a number, but TypeScript will treat it as
 * incompatible with plain numbers and other branded numeric types (like EpochNumber, SlotNumber, etc.).
 *
 * Note: This type should ONLY be used for Aztec L2 block numbers, NOT for Ethereum L1 block numbers.
 *
 * @example
 * ```ts
 * const blockNumber = BlockNumber(100);
 * const plainNumber: number = blockNumber; // OK - BlockNumber is assignable to number
 * const blockFromNumber: BlockNumber = 100;  // ERROR - number is not assignable to BlockNumber
 * ```
 */
export type BlockNumber = Branded<number, 'BlockNumber'>;

/**
 * Creates a BlockNumber from a number.
 * @param value - The block number (must be a non-negative integer)
 * @returns The branded BlockNumber value
 * @throws If the value is negative or not an integer
 */
export function BlockNumber(value: number): BlockNumber {
  if (!Number.isInteger(value)) {
    throw new Error(`BlockNumber must be an integer, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`BlockNumber must be non-negative, got ${value}`);
  }
  return value as BlockNumber;
}

/**
 * Creates a BlockNumber from a bigint.
 * @param value - The block number as bigint (must be a non-negative integer within safe integer range)
 * @returns The branded BlockNumber value
 * @throws If the value is negative or exceeds Number.MAX_SAFE_INTEGER
 */
BlockNumber.fromBigInt = function (value: bigint): BlockNumber {
  if (value < 0n) {
    throw new Error(`BlockNumber must be non-negative, got ${value}`);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`BlockNumber ${value} exceeds MAX_SAFE_INTEGER`);
  }
  return Number(value) as BlockNumber;
};

/**
 * Creates a BlockNumber from a string.
 * @param value - The block number as a string
 * @returns The branded BlockNumber value
 * @throws If the string cannot be parsed as a valid block number
 */
BlockNumber.fromString = function (value: string): BlockNumber {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Cannot parse BlockNumber from string: ${value}`);
  }
  return BlockNumber(parsed);
};

/**
 * Converts a CheckpointNumber to a BlockNumber.
 * This is used in checkpoint-based systems where checkpoint numbers align with block numbers.
 * WARNING: This should only be used when you know the checkpoint number corresponds to a block number.
 * @param value - The checkpoint number to convert
 * @returns The corresponding BlockNumber
 */
BlockNumber.fromCheckpointNumber = function (value: CheckpointNumber): BlockNumber {
  return value as unknown as BlockNumber;
};

/**
 * Type guard to check if a value is a valid BlockNumber.
 * Note: At runtime, a BlockNumber is just a number, so this checks if the value
 * is a non-negative integer.
 */
BlockNumber.isValid = function (value: unknown): value is BlockNumber {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
};

/** Increments a BlockNumber by a given value. */
BlockNumber.add = function (bn: BlockNumber, increment: number): BlockNumber {
  return BlockNumber(bn + increment);
};

/**
 * The zero block value (genesis block).
 */
BlockNumber.ZERO = BlockNumber(0);

function makeBlockNumberSchema(minValue: number) {
  return z
    .union([z.number(), z.bigint(), z.string()])
    .pipe(z.coerce.number().int().min(minValue))
    .transform(value => BlockNumber(value));
}

/**
 * Zod schema for parsing and validating BlockNumber values.
 * Accepts numbers, bigints, or strings and coerces them to BlockNumber.
 */
export const BlockNumberSchema = makeBlockNumberSchema(0);

/**
 * Zod schema for parsing and validating BlockNumber values that are strictly positive.
 * Accepts numbers, bigints, or strings and coerces them to BlockNumber.
 */
export const BlockNumberPositiveSchema = makeBlockNumberSchema(1);
