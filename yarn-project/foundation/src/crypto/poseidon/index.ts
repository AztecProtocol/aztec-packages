import { BarretenbergSync, Fr as FrBarretenberg } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';
import { type Fieldable, serializeToFields } from '../../serialize/serialize.js';

/**
 * Creates a Poseidon2 hash (field element) from an array of input fields.
 *
 * Poseidon2 is a zero-knowledge-friendly hash function optimized for use in arithmetic circuits.
 * It's significantly more efficient than traditional hash functions like SHA-256 when used in
 * zero-knowledge proofs, as it requires fewer constraints.
 *
 * This is the standard Poseidon2 hash function used throughout the Aztec protocol for
 * circuit-friendly hashing operations.
 *
 * @param input - Array of fieldable values to hash. Values are automatically serialized to fields.
 * @returns A promise resolving to a field element (Fr) representing the hash.
 *
 * @example
 * ```typescript
 * import { Fr } from '@aztec/foundation/fields';
 * import { poseidon2Hash } from '@aztec/foundation/crypto';
 *
 * // Hash field elements
 * const fields = [new Fr(1), new Fr(2), new Fr(3)];
 * const hash = await poseidon2Hash(fields);
 *
 * // Hash a single value
 * const singleHash = await poseidon2Hash([new Fr(42)]);
 *
 * // Hash complex objects implementing Fieldable
 * const objects = [obj1, obj2]; // Objects with toFields() method
 * const objectHash = await poseidon2Hash(objects);
 * ```
 *
 * @remarks
 * - Poseidon2 is an improved version of Poseidon with better security and performance
 * - Extremely efficient in zero-knowledge circuits (SNARK-friendly)
 * - Operates natively on field elements, avoiding conversions
 * - Used extensively in Aztec for merkle trees, commitments, and other cryptographic operations
 * - The output is deterministic: same inputs always produce the same hash
 * - Requires asynchronous initialization of the Barretenberg backend
 * - For domain separation, use poseidon2HashWithSeparator instead
 */
export async function poseidon2Hash(input: Fieldable[]): Promise<Fr> {
  const inputFields = serializeToFields(input);
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const hash = api.poseidon2Hash(
    inputFields.map(i => new FrBarretenberg(i.toBuffer())), // TODO(#4189): remove this stupid conversion
  );
  return Fr.fromBuffer(Buffer.from(hash.toBuffer()));
}

/**
 * Creates a Poseidon2 hash with domain separation.
 *
 * This function is identical to poseidon2Hash but prepends a separator value to the input,
 * providing domain separation. Domain separation ensures that the same input values used in
 * different contexts (e.g., different data structures or protocol layers) produce different hashes.
 *
 * @param input - Array of fieldable values to hash.
 * @param separator - The domain separator value. Typically a constant identifying the use case.
 * @returns A promise resolving to a field element (Fr) representing the hash.
 *
 * @example
 * ```typescript
 * import { Fr } from '@aztec/foundation/fields';
 * import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
 *
 * // Define domain separators for different use cases
 * const NOTE_HASH_DOMAIN = 1;
 * const NULLIFIER_DOMAIN = 2;
 *
 * const data = [new Fr(123), new Fr(456)];
 *
 * // Same data, different domains, different hashes
 * const noteHash = await poseidon2HashWithSeparator(data, NOTE_HASH_DOMAIN);
 * const nullifierHash = await poseidon2HashWithSeparator(data, NULLIFIER_DOMAIN);
 * // noteHash !== nullifierHash
 *
 * // Compare with non-separated hash
 * const regularHash = await poseidon2Hash(data);
 * // regularHash !== noteHash (separator changes the result)
 * ```
 *
 * @remarks
 * - The separator is prepended to the input array before hashing
 * - Essential for preventing hash collisions between different protocol layers
 * - Common practice in cryptographic protocols to use unique separators per use case
 * - The separator should be a constant value, documented for the specific use case
 * - Requires asynchronous initialization of the Barretenberg backend
 */
export async function poseidon2HashWithSeparator(input: Fieldable[], separator: number): Promise<Fr> {
  const inputFields = serializeToFields(input);
  inputFields.unshift(new Fr(separator));
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);

  const hash = api.poseidon2Hash(
    inputFields.map(i => new FrBarretenberg(i.toBuffer())), // TODO(#4189): remove this stupid conversion
  );
  return Fr.fromBuffer(Buffer.from(hash.toBuffer()));
}

export async function poseidon2HashAccumulate(input: Fieldable[]): Promise<Fr> {
  const inputFields = serializeToFields(input);
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const result = api.poseidon2HashAccumulate(inputFields.map(i => new FrBarretenberg(i.toBuffer())));
  return Fr.fromBuffer(Buffer.from(result.toBuffer()));
}

/**
 * Runs a Poseidon2 permutation.
 * @param input the input state. Expected to be of size 4.
 * @returns the output state, size 4.
 */
export async function poseidon2Permutation(input: Fieldable[]): Promise<Fr[]> {
  const inputFields = serializeToFields(input);
  // We'd like this assertion but it's not possible to use it in the browser.
  // assert(input.length === 4, 'Input state must be of size 4');
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const res = api.poseidon2Permutation(inputFields.map(i => new FrBarretenberg(i.toBuffer())));
  // We'd like this assertion but it's not possible to use it in the browser.
  // assert(res.length === 4, 'Output state must be of size 4');
  return res.map(o => Fr.fromBuffer(Buffer.from(o.toBuffer())));
}

export async function poseidon2HashBytes(input: Buffer): Promise<Fr> {
  const inputFields = [];
  for (let i = 0; i < input.length; i += 31) {
    const fieldBytes = Buffer.alloc(32, 0);
    input.slice(i, i + 31).copy(fieldBytes);

    // Noir builds the bytes as little-endian, so we need to reverse them.
    fieldBytes.reverse();
    inputFields.push(Fr.fromBuffer(fieldBytes));
  }

  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const res = api.poseidon2Hash(
    inputFields.map(i => new FrBarretenberg(i.toBuffer())), // TODO(#4189): remove this stupid conversion
  );

  return Fr.fromBuffer(Buffer.from(res.toBuffer()));
}
