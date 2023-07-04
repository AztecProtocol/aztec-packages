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
