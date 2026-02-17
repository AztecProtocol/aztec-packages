import { z } from 'zod';

import type { Branded } from './types.js';

/**
 * A branded type representing the index of a block within a checkpoint.
 * The first block in a checkpoint has index 0, the second has index 1, etc.
 *
 * This is a nominal type backed by a number, but TypeScript will treat it as
 * incompatible with plain numbers and other branded numeric types.
 *
 * @example
 * ```ts
 * const index = IndexWithinCheckpoint(0);
 * const plainNumber: number = index; // OK - IndexWithinCheckpoint is assignable to number
 * const indexFromNumber: IndexWithinCheckpoint = 0;  // ERROR - number is not assignable to IndexWithinCheckpoint
 * ```
 */
export type IndexWithinCheckpoint = Branded<number, 'IndexWithinCheckpoint'>;

/**
 * Creates an IndexWithinCheckpoint from a number.
 * @param value - The index (must be a non-negative integer)
 * @returns The branded IndexWithinCheckpoint value
 * @throws If the value is negative or not an integer
 */
export function IndexWithinCheckpoint(value: number): IndexWithinCheckpoint {
  if (!Number.isInteger(value)) {
    throw new Error(`IndexWithinCheckpoint must be an integer, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`IndexWithinCheckpoint must be non-negative, got ${value}`);
  }
  return value as IndexWithinCheckpoint;
}

/**
 * Creates an IndexWithinCheckpoint from a bigint.
 * @param value - The index as bigint (must be a non-negative integer within safe integer range)
 * @returns The branded IndexWithinCheckpoint value
 * @throws If the value is negative or exceeds Number.MAX_SAFE_INTEGER
 */
IndexWithinCheckpoint.fromBigInt = function (value: bigint): IndexWithinCheckpoint {
  if (value < 0n) {
    throw new Error(`IndexWithinCheckpoint must be non-negative, got ${value}`);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`IndexWithinCheckpoint ${value} exceeds MAX_SAFE_INTEGER`);
  }
  return Number(value) as IndexWithinCheckpoint;
};

/**
 * Creates an IndexWithinCheckpoint from a string.
 * @param value - The index as a string
 * @returns The branded IndexWithinCheckpoint value
 * @throws If the string cannot be parsed as a valid index
 */
IndexWithinCheckpoint.fromString = function (value: string): IndexWithinCheckpoint {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Cannot parse IndexWithinCheckpoint from string: ${value}`);
  }
  return IndexWithinCheckpoint(parsed);
};

/**
 * Type guard to check if a value is a valid IndexWithinCheckpoint.
 * Note: At runtime, an IndexWithinCheckpoint is just a number, so this checks if the value
 * is a non-negative integer.
 */
IndexWithinCheckpoint.isValid = function (value: unknown): value is IndexWithinCheckpoint {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
};

/**
 * The zero index value (first block in checkpoint).
 */
IndexWithinCheckpoint.ZERO = IndexWithinCheckpoint(0);

/**
 * Zod schema for parsing and validating IndexWithinCheckpoint values.
 * Accepts numbers, bigints, or strings and coerces them to IndexWithinCheckpoint.
 */
export const IndexWithinCheckpointSchema = z
  .union([z.number(), z.bigint(), z.string()])
  .pipe(z.coerce.number().int().min(0))
  .transform(value => IndexWithinCheckpoint(value));
