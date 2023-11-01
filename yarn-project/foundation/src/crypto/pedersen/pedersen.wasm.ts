import { Pedersen } from '@aztec/bb.js';

const pedersen = await Pedersen.new();

/**
 * Create a pedersen commitment (point) from an array of input fields.
 */
export function pedersenCommit(input: Buffer[], generatorOffset = 0) {
  if (!pedersen) {
    throw new Error('Need to call await pedersenInit() first.');
  }
  const [x, y] = pedersen.pedersenCommit(input, generatorOffset);
  return [Buffer.from(x), Buffer.from(y)];
}

/**
 * Create a pedersen hash (field) from an array of input fields.
 */
export function pedersenHash(input: Buffer[], index = 0) {
  if (!pedersen) {
    throw new Error('Need to call await pedersenInit() first.');
  }
  return Buffer.from(pedersen.pedersenHash(input, index));
}
