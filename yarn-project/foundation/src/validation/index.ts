/** Utility function to throw an error if a required value is missing. */
export function required<T>(value: T | undefined, errMsg?: string): T {
  if (value === undefined) {
    throw new Error(errMsg || 'Value is required');
  }
  return value;
}

/**
 * Helper function to assert a condition is truthy
 * @param x - A boolean condition to assert.
 * @param err - Error message to throw if x isn't met.
 */
export function assert(x: any, err: string): asserts x {
  if (!x) {
    throw new Error(err);
  }
}
