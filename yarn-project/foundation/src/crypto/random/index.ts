import { randomBytes as bbRandomBytes } from '@aztec/bb.js';

import { RandomnessSingleton } from './randomness_singleton.js';

export const randomBytes = (len: number) => {
  const singleton = RandomnessSingleton.getInstance();

  if (singleton.isDeterministic()) {
    return singleton.getBytes(len);
  }
  return Buffer.from(bbRandomBytes(len)) as Buffer<ArrayBuffer>;
};

/**
 * Generate a random integer less than max.
 * @param max - The maximum value.
 * @returns A random integer.
 *
 * TODO(#3949): This is insecure as it's modulo biased. Nuke or safeguard before mainnet.
 */
export const randomInt = (max: number) => {
  const randomBuffer = randomBytes(6); // Generate a buffer of 6 random bytes.
  const randomInt = parseInt(randomBuffer.toString('hex'), 16); // Convert buffer to a large integer.
  return randomInt % max; // Use modulo to ensure the result is less than max.
};

/**
 * Generate a random bigint less than max.
 * @param max - The maximum value.
 * @returns A random bigint.
 *
 * TODO(#3949): This is insecure as it's modulo biased. Nuke or safeguard before mainnet.
 */
export const randomBigInt = (max: bigint) => {
  const randomBuffer = randomBytes(8); // Generate a buffer of 8 random bytes.
  const randomBigInt = BigInt(`0x${randomBuffer.toString('hex')}`); // Convert buffer to a large integer.
  return randomBigInt % max; // Use modulo to ensure the result is less than max.
};

/**
 * Generate a random boolean value.
 * @returns A random boolean value.
 */
export const randomBoolean = () => {
  const randomByte = randomBytes(1)[0]; // Generate a single random byte.
  return randomByte % 2 === 0; // Use modulo to determine if the byte is even or odd.
};
