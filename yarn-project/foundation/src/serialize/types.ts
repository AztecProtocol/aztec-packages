/**
 * Branded type for Noir's u32 (32-bit unsigned integer).
 * This ensures type safety at compile time and prevents mixing u32 with other integer types.
 */
export type U32 = number & { readonly __brand: 'U32' };

/**
 * Branded type for Noir's u64 (64-bit unsigned integer).
 * This ensures type safety at compile time and prevents mixing u64 with other integer types.
 */
export type U64 = bigint & { readonly __brand: 'U64' };

/**
 * Branded type for Noir's u128 (128-bit unsigned integer).
 * This ensures type safety at compile time and prevents mixing u128 with other integer types.
 */
export type U128 = bigint & { readonly __brand: 'U128' };

/**
 * Creates a U32 branded type from a number.
 * Validates that the value is within the u32 range (0 to 2^32 - 1).
 * @param value - The number value to convert to U32.
 * @returns The value as U32.
 * @throws Error if the value is out of range.
 */
export function toU32(value: number): U32 {
  if (value < 0 || value >= 2 ** 32 || !Number.isInteger(value)) {
    throw new Error(`Value ${value} is not a valid u32.`);
  }
  return value as U32;
}

/**
 * Creates a U64 branded type from a bigint.
 * Validates that the value is within the u64 range (0 to 2^64 - 1).
 * @param value - The bigint value to convert to U64.
 * @returns The value as U64.
 * @throws Error if the value is out of range.
 */
export function toU64(value: bigint): U64 {
  if (value < 0n || value >= 1n << 64n) {
    throw new Error(`Value ${value} is not a valid u64.`);
  }
  return value as U64;
}

/**
 * Creates a U128 branded type from a bigint.
 * Validates that the value is within the u128 range (0 to 2^128 - 1).
 * @param value - The bigint value to convert to U128.
 * @returns The value as U128.
 * @throws Error if the value is out of range.
 */
export function toU128(value: bigint): U128 {
  if (value < 0n || value >= 1n << 128n) {
    throw new Error(`Value ${value} is not a valid u128.`);
  }
  return value as U128;
}

/**
 * Represents a fixed-length array.
 */
export type Tuple<T, N extends number> = N extends N ? (number extends N ? T[] : _Tuple<T, N, []>) : never;
/**
 * Recursive type helper for constructing a fixed-length tuple of a given type.
 * This is utilized internally by Tuple to create the final fixed-length tuple.
 */
type _Tuple<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _Tuple<T, N, [T, ...R]>;

/**
 * Check an array size, and cast it to a tuple.
 * @param array - The array.
 * @param n - The size.
 * @returns The case tuple, or throws Error.
 */
export function assertLength<T, N extends number>(array: T[], n: N): Tuple<T, N> {
  if (array.length !== n) {
    throw new Error(`Wrong 'fixed array' size. Expected ${n}, got ${array.length}.`);
  }
  return array as Tuple<T, N>;
}
/**
 * Annoying, mapping a tuple does not preserve length.
 * This is a helper to preserve length during a map operation.
 * @typeparam T - The original array type.
 */
type MapTuple<T extends any[], F extends (item: any) => any> = {
  [K in keyof T]: T[K] extends infer U ? (F extends (item: U) => infer V ? V : never) : never;
};

/**
 * Annoyingly, mapping a tuple does not preserve length.
 * This is a helper to preserve length during a map operation.
 * @see https://github.com/microsoft/TypeScript/issues/29841.
 * @param array - A tuple array.
 */
export function mapTuple<T extends any[], F extends (item: T[number]) => any>(tuple: T, fn: F): MapTuple<T, F> {
  return tuple.map(fn) as MapTuple<T, F>;
}
