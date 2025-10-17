import { BarretenbergSync, Fr as FrBarretenberg } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';
import { type Fieldable, serializeToFields } from '../../serialize/serialize.js';

/**
 * Creates a Pedersen commitment (elliptic curve point) from an array of input fields.
 *
 * Pedersen commitments are cryptographic commitments that allow committing to data
 * without revealing it, while later being able to prove the committed value. The commitment
 * is represented as a point on an elliptic curve (x, y coordinates).
 *
 * This function uses the Barretenberg backend for performing the Pedersen commitment operation.
 * All inputs are automatically left-padded to 32 bytes if they are shorter.
 *
 * @param input - Array of buffers to commit to. Each buffer must be at most 32 bytes.
 * @param offset - The generator index offset for the commitment. Defaults to 0.
 *                  Different offsets create domain separation for different use cases.
 * @returns A promise resolving to a tuple [x, y] where x and y are 32-byte buffers
 *          representing the coordinates of the commitment point on the curve.
 *
 * @throws {Error} If any input buffer exceeds 32 bytes.
 *
 * @example
 * ```typescript
 * // Commit to a single value
 * const value = Buffer.from('secret data');
 * const [x, y] = await pedersenCommit([value]);
 *
 * // Commit to multiple values with domain separation
 * const values = [Buffer.from([1, 2, 3]), Buffer.from([4, 5, 6])];
 * const [x, y] = await pedersenCommit(values, 1); // offset=1 for domain separation
 * ```
 *
 * @remarks
 * - Inputs shorter than 32 bytes are automatically left-padded with zeros
 * - The commitment is hiding: different offsets or inputs produce different commitments
 * - The commitment is binding: it's computationally infeasible to find two different inputs
 *   that produce the same commitment
 * - Returns curve point coordinates as separate x and y buffers
 * - Requires asynchronous initialization of the Barretenberg backend
 */
export async function pedersenCommit(input: Buffer[], offset = 0) {
  if (!input.every(i => i.length <= 32)) {
    throw new Error('All Pedersen Commit input buffers must be <= 32 bytes.');
  }
  input = input.map(i => (i.length < 32 ? Buffer.concat([Buffer.alloc(32 - i.length, 0), i]) : i));
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const point = api.pedersenCommit(
    input.map(i => new FrBarretenberg(i)),
    offset,
  );
  // toBuffer returns Uint8Arrays (browser/worker-boundary friendly).
  // TODO: rename toTypedArray()?
  return [Buffer.from(point.x.toBuffer()), Buffer.from(point.y.toBuffer())];
}

/**
 * Creates a Pedersen hash (field element) from an array of input fields.
 *
 * Pedersen hashing is a cryptographic hash function that operates on field elements
 * and produces a field element output. Unlike Pedersen commitments which return curve points,
 * this function returns a single field element, making it suitable for use in circuits
 * and as inputs to other cryptographic operations.
 *
 * This implementation uses the Barretenberg backend and supports domain separation via
 * the index parameter, allowing the same inputs to produce different hashes for different
 * use cases.
 *
 * @param input - Array of fieldable values to hash. Each value is serialized to a field element.
 * @param index - The separator index for domain separation. Defaults to 0.
 *                Different indices create distinct hash domains.
 * @returns A promise resolving to a field element (Fr) representing the hash.
 *
 * @example
 * ```typescript
 * import { Fr } from '@aztec/foundation/fields';
 * import { pedersenHash } from '@aztec/foundation/crypto';
 *
 * // Hash field elements
 * const fields = [new Fr(1), new Fr(2), new Fr(3)];
 * const hash = await pedersenHash(fields);
 *
 * // Domain separation with different indices
 * const hash1 = await pedersenHash(fields, 0); // Domain 0
 * const hash2 = await pedersenHash(fields, 1); // Domain 1 (different result)
 *
 * // Hash complex objects that implement Fieldable
 * const objects = [obj1, obj2]; // where objects implement toFields()
 * const objectHash = await pedersenHash(objects);
 * ```
 *
 * @remarks
 * - Inputs are automatically serialized to field elements using serializeToFields
 * - The index parameter provides domain separation without changing the input
 * - Commonly used in Aztec circuits for efficient hashing operations
 * - More efficient than standard SHA-256 in zero-knowledge circuits
 * - The output is always a single field element (Fr), not a buffer
 * - Requires asynchronous initialization of the Barretenberg backend
 */
export async function pedersenHash(input: Fieldable[], index = 0): Promise<Fr> {
  const inputFields = serializeToFields(input);
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const hash = api.pedersenHash(
    inputFields.map(i => new FrBarretenberg(i.toBuffer())), // TODO(#4189): remove this stupid conversion
    index,
  );
  return Fr.fromBuffer(Buffer.from(hash.toBuffer()));
}

/**
 * Creates a Pedersen hash from an arbitrary-length buffer.
 *
 * This function is a convenience wrapper that accepts raw buffer data of any length
 * and produces a Pedersen hash. Unlike pedersenHash which operates on field elements,
 * this function handles the conversion from buffer to fields internally.
 *
 * @param input - The buffer to hash. Can be of any length.
 * @param index - The separator index for domain separation. Defaults to 0.
 * @returns A promise resolving to a 32-byte buffer containing the hash.
 *
 * @example
 * ```typescript
 * // Hash arbitrary data
 * const data = Buffer.from('Hello, Aztec!');
 * const hash = await pedersenHashBuffer(data);
 *
 * // With domain separation
 * const hash1 = await pedersenHashBuffer(data, 0);
 * const hash2 = await pedersenHashBuffer(data, 1); // Different result
 * ```
 *
 * @remarks
 * - Accepts buffers of any length, unlike pedersenCommit which requires <= 32 bytes per input
 * - Returns a buffer rather than a field element
 * - Useful for hashing arbitrary binary data
 * - Internally chunks the buffer appropriately for the Pedersen hash function
 * - Requires asynchronous initialization of the Barretenberg backend
 */
export async function pedersenHashBuffer(input: Buffer, index = 0) {
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const result = api.pedersenHashBuffer(input, index);
  return Buffer.from(result.toBuffer());
}
