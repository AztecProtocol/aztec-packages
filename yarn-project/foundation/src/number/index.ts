/** Returns the number of bits set in the given number.  */
export function countSetBits(num: number): number {
  let count = 0;
  while (num !== 0) {
    count += num & 1;
    num >>= 1;
  }
  return count;
}
