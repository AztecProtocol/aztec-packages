/**
 * Represents a fixed-length array.
 */
export type TupleOf<T, N extends number> = N extends N ? (number extends N ? T[] : _TupleOf<T, N, []>) : never;
/**
 * Recursive type helper for constructing a fixed-length tuple of a given type.
 * This is utilized internally by TupleOf to create the final fixed-length tuple.
 */
type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleOf<T, N, [T, ...R]>;

/**
 * Check an array size, and cast it to a tuple.
 * @param array - The array.
 * @param n - The size.
 * @returns The case tuple, or throws Error.
 */
export function toTupleOf<T, N extends number>(array: T[], n: N): TupleOf<T, N> {
  if (array.length !== n) {
    throw new Error("Wrong 'fixed array' size");
  }
  return array as any;
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
 * Annoying, mapping a tuple does not preserve length.
 * This is a helper to preserve length during a map operation.
 * @see https://github.com/microsoft/TypeScript/issues/29841.
 * @param array - A tuple array.
 */
export function mapTuple<T extends any[], F extends (item: any) => any>(tuple: T, fn: F): MapTuple<T, F> {
  return tuple.map(fn) as MapTuple<T, F>;
}

/**
 * Type for a callback function used to transform values of an object. Maps each value to a new value based on the provided function.
 */
type MapCallback<T, U> = (value: T, key: string) => U;
/**
 * Transform the values of an object using a callback function.
 * Iterates through the key-value pairs of the object and applies the
 * provided callback on each value, returning a new object with the same keys
 * and transformed values. The callback receives the current value and key as arguments.
 *
 * @param obj - The input object whose values need to be transformed.
 * @param callback - The function to be called for each value in the object, which takes the current value and key and returns the transformed value.
 * @returns A new object with the same keys and transformed values.
 */
export function mapValues<T, U>(obj: Record<string, T>, callback: MapCallback<T, U>): Record<string, U> {
  return Object.entries(obj).reduce((acc: Record<string, U>, [key, value]: [string, T]) => {
    acc[key] = callback(value, key);
    return acc;
  }, {});
}
