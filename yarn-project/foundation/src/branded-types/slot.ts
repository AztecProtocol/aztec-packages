import { z } from 'zod';

import type { Branded } from './types.js';

/**
 * A branded type representing a slot number.
 * Slots are the fundamental time unit in the Aztec protocol, with multiple slots comprising an epoch.
 *
 * This is a nominal type backed by a number, but TypeScript will treat it as
 * incompatible with plain numbers and other branded numeric types (like EpochNumber, BlockNumber, etc.).
 *
 * @example
 * ```ts
 * const slot = SlotNumber(5);
 * const plainNumber: number = slot; // OK - SlotNumber is assignable to number
 * const slotFromNumber: SlotNumber = 5;  // ERROR - number is not assignable to SlotNumber
 * ```
 */
export type SlotNumber = Branded<number, 'SlotNumber'>;

/**
 * Creates a SlotNumber from a number.
 * @param value - The slot number (must be a non-negative integer)
 * @returns The branded SlotNumber value
 * @throws If the value is negative or not an integer
 */
export function SlotNumber(value: number): SlotNumber {
  if (!Number.isInteger(value)) {
    throw new Error(`SlotNumber must be an integer, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`SlotNumber must be non-negative, got ${value}`);
  }
  return value as SlotNumber;
}

/**
 * Creates a SlotNumber from a bigint.
 * @param value - The slot number as bigint (must be a non-negative integer within safe integer range)
 * @returns The branded SlotNumber value
 * @throws If the value is negative or exceeds Number.MAX_SAFE_INTEGER
 */
SlotNumber.fromBigInt = function (value: bigint): SlotNumber {
  if (value < 0n) {
    throw new Error(`SlotNumber must be non-negative, got ${value}`);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`SlotNumber ${value} exceeds MAX_SAFE_INTEGER`);
  }
  return Number(value) as SlotNumber;
};

/**
 * Creates a SlotNumber from a string.
 * @param value - The slot number as a string
 * @returns The branded SlotNumber value
 * @throws If the string cannot be parsed as a valid slot
 */
SlotNumber.fromString = function (value: string): SlotNumber {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Cannot parse SlotNumber from string: ${value}`);
  }
  return SlotNumber(parsed);
};

/**
 * Type guard to check if a value is a valid SlotNumber.
 * Note: At runtime, a SlotNumber is just a number, so this checks if the value
 * is a non-negative integer.
 */
SlotNumber.isValid = function (value: unknown): value is SlotNumber {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
};

/**
 * The zero slot value.
 */
SlotNumber.ZERO = SlotNumber(0);

/**
 * Zod schema for parsing and validating SlotNumber values.
 * Accepts numbers, bigints, or strings and coerces them to SlotNumber.
 */
export const SlotNumberSchema = z
  .union([z.number(), z.bigint(), z.string()])
  .pipe(z.coerce.number().int().min(0))
  .transform(value => SlotNumber(value));
