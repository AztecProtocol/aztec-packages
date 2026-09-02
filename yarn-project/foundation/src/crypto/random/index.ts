import { randomBytes as bbRandomBytes } from '@aztec/bb.js';

import { toBigIntBE } from '../../bigint-buffer/index.js';

/**
 * Generate a buffer of cryptographically secure random bytes.
 * @param len - The number of bytes to generate.
 */
export function randomBytes(len: number): Buffer<ArrayBuffer> {
  return Buffer.from(bbRandomBytes(len)) as Buffer<ArrayBuffer>;
}

/**
 * Generate a uniformly distributed random bigint in the range [0, max).
 * @param max - The exclusive upper bound, which must be positive.
 */
export function randomBigInt(max: bigint): bigint {
  if (max <= 0n) {
    throw new RangeError(`randomBigInt requires a positive max, got ${max}`);
  }
  if (max === 1n) {
    return 0n;
  }
  const bits = BigInt((max - 1n).toString(2).length);
  const mask = (1n << bits) - 1n;
  const bytes = Number((bits + 7n) / 8n);
  // Rejection sampling. Masking the draw down to ceil(log2(max)) bits keeps the acceptance
  // probability above 1/2, so this loops fewer than 2 times on average. Sampling a fixed width and
  // reducing modulo max would instead bias the low end of the range, and would silently cap the
  // result at the sample width for maxima wider than it.
  for (;;) {
    const candidate = toBigIntBE(randomBytes(bytes)) & mask;
    if (candidate < max) {
      return candidate;
    }
  }
}

/**
 * Generate a uniformly distributed random integer in the range [0, max).
 * @param max - The exclusive upper bound, which must be a positive safe integer.
 */
export function randomInt(max: number): number {
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new RangeError(`randomInt requires a positive safe integer max, got ${max}`);
  }
  return Number(randomBigInt(BigInt(max)));
}

/** Generate a random boolean value. */
export function randomBoolean(): boolean {
  return randomBytes(1)[0] % 2 === 0;
}
