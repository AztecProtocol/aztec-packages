/** Bounds the given value between the min and max provided (both inclusive) */
export function boundInclusive(value: number, min: number, max: number): number {
  if (min > max) {
    throw new Error('Minimum bound cannot be greater than maximum bound');
  }

  if (value < min) {
    return min;
  } else if (value > max) {
    return max;
  } else {
    return value;
  }
}
