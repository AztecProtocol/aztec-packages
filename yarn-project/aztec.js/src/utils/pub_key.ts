import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Point } from '../index.js';

/**
 * Converts a Point type to a public key represented by BigInt coordinates
 * @param point - The Point to convert.
 * @returns An object with x & y coordinates represented as bigints.
 */
export const pointToPublicKey = (point: Point) => {
  const x = point.buffer.subarray(0, 32);
  const y = point.buffer.subarray(32, 64);
  return {
    x: toBigIntBE(x),
    y: toBigIntBE(y),
  };
};
