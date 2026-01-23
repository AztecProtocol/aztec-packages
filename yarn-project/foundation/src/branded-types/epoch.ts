import { z } from 'zod';

import type { Branded } from './types.js';

/**
 * A branded type representing an epoch number.
 * Epochs are used in the Aztec protocol to group slots and manage validator committees.
 *
 * This is a nominal type backed by a number, but TypeScript will treat it as
 * incompatible with plain numbers and other branded numeric types (like Slot, BlockNumber, etc.).
 *
 * @example
 * ```ts
 * const epoch = EpochNumber(5);
 * const plainNumber: number = epoch; // OK - EpochNumber is assignable to number
 * const epochFromNumber: EpochNumber = 5;  // ERROR - number is not assignable to EpochNumber
 * ```
 */
export type EpochNumber = Branded<number, 'EpochNumber'>;

/**
 * Creates an EpochNumber from a number.
 * @param value - The epoch number (must be a non-negative integer)
 * @returns The branded EpochNumber value
 * @throws If the value is negative or not an integer
 */
export function EpochNumber(value: number): EpochNumber {
  if (!Number.isInteger(value)) {
    throw new Error(`EpochNumber must be an integer, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`EpochNumber must be non-negative, got ${value}`);
  }
  return value as EpochNumber;
}

/**
 * Creates an EpochNumber from a bigint.
 * @param value - The epoch number as bigint (must be a non-negative integer within safe integer range)
 * @returns The branded EpochNumber value
 * @throws If the value is negative or exceeds Number.MAX_SAFE_INTEGER
 */
EpochNumber.fromBigInt = function (value: bigint): EpochNumber {
  if (value < 0n) {
    throw new Error(`EpochNumber must be non-negative, got ${value}`);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`EpochNumber ${value} exceeds MAX_SAFE_INTEGER`);
  }
  return Number(value) as EpochNumber;
};

/**
 * Creates an EpochNumber from a string.
 * @param value - The epoch number as a string
 * @returns The branded EpochNumber value
 * @throws If the string cannot be parsed as a valid epoch
 */
EpochNumber.fromString = function (value: string): EpochNumber {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Cannot parse EpochNumber from string: ${value}`);
  }
  return EpochNumber(parsed);
};

/**
 * Type guard to check if a value is a valid EpochNumber.
 * Note: At runtime, an EpochNumber is just a number, so this checks if the value
 * is a non-negative integer.
 */
EpochNumber.isValid = function (value: unknown): value is EpochNumber {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
};

/**
 * The zero epoch value.
 */
EpochNumber.ZERO = EpochNumber(0);

/**
 * Zod schema for parsing and validating EpochNumber values.
 * Accepts numbers, bigints, or strings and coerces them to EpochNumber.
 */
export const EpochNumberSchema = z
  .union([z.number(), z.bigint(), z.string()])
  .pipe(z.coerce.number().int().min(0))
  .transform(value => EpochNumber(value));
