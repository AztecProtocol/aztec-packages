/** Returns minimum value across a list of bigints. */
export function minBigint(...values: bigint[]): bigint {
  if (values.length === 0) {
    throw new Error('Cannot get min of empty array');
  }
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}
