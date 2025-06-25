/** Bounds the given value between the min and max provided (both inclusive) */
export function bound(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  } else if (value > max) {
    return max;
  } else {
    return value;
  }
}
