/** Returns minimum value across a list of bigints. */
export function minBigint(...values: bigint[]): bigint {
  if (values.length === 0) {
    throw new Error('Cannot get min of empty array');
  }
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

/** Returns maximim value across a list of bigints. */
export function maxBigint(...values: bigint[]): bigint {
  if (values.length === 0) {
    throw new Error('Cannot get max of empty array');
  }
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}
