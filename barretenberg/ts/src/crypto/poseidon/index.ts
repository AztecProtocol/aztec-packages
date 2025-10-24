import { BarretenbergSync } from '../../barretenberg/index.js';
import { Bn254Fr, GrumpkinFq } from '../../types/fields.js';
import { BufferReader } from '../../serialize/index.js';

// Alias for backward compatibility
const Fr = Bn254Fr;

/**
 * Fieldable type - can be converted to Fr field elements
 * Note: GrumpkinFq and Bn254Fr use the same underlying field modulus,
 * so they can be used interchangeably in poseidon hashing.
 */
export type Fieldable = Bn254Fr | GrumpkinFq | Buffer | number | bigint | boolean;

/**
 * Serialize a value to Fr fields
 */
function serializeToField(value: Fieldable): Bn254Fr {
  if (value instanceof Bn254Fr) {
    return value;
  }
  if (value instanceof GrumpkinFq) {
    // GrumpkinFq and Bn254Fr share the same modulus, trivial conversion
    return value.toBn254Fr();
  }
  if (Buffer.isBuffer(value)) {
    return Bn254Fr.fromBuffer(value);
  }
  // Convert number/boolean to bigint before passing to Fr constructor
  const bigintValue = typeof value === 'bigint' ? value : BigInt(value);
  return new Bn254Fr(bigintValue);
}

/**
 * Serialize an array of values to Fr fields
 */
function serializeToFields(values: Fieldable[]): Bn254Fr[] {
  return values.map(serializeToField);
}

/**
 * Create a poseidon2 hash (field) from an array of input fields.
 * @param input - The input fields to hash.
 * @returns The poseidon2 hash.
 */
export async function poseidon2Hash(input: Fieldable[]): Promise<Bn254Fr> {
  const inputFields = serializeToFields(input);
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2Hash({
    inputs: inputFields.map(i => i.toBuffer()),
  });
  return Bn254Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Create a poseidon2 hash (field) from an array of input fields and a domain separator.
 * @param input - The input fields to hash.
 * @param separator - The domain separator.
 * @returns The poseidon2 hash.
 */
export async function poseidon2HashWithSeparator(input: Fieldable[], separator: number): Promise<Bn254Fr> {
  const inputFields = serializeToFields(input);
  inputFields.unshift(new Bn254Fr(BigInt(separator)));
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2Hash({
    inputs: inputFields.map(i => i.toBuffer()),
  });
  return Bn254Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Create a poseidon2 hash accumulate from an array of input fields.
 * @param input - The input fields to hash.
 * @returns The poseidon2 hash.
 */
export async function poseidon2HashAccumulate(input: Fieldable[]): Promise<Bn254Fr> {
  const inputFields = serializeToFields(input);
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2HashAccumulate({
    inputs: inputFields.map(i => i.toBuffer()),
  });
  return Bn254Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Runs a Poseidon2 permutation.
 * @param input the input state. Expected to be of size 4.
 * @returns the output state, size 4.
 */
export async function poseidon2Permutation(input: Fieldable[]): Promise<Bn254Fr[]> {
  const inputFields = serializeToFields(input);
  if (inputFields.length !== 4) {
    throw new Error('Input state must be of size 4');
  }
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2Permutation({
    inputs: inputFields.map(i => i.toBuffer()),
  });
  if (response.outputs.length !== 4) {
    throw new Error('Output state must be of size 4');
  }
  return response.outputs.map(o => Bn254Fr.fromBuffer(Buffer.from(o)));
}

/**
 * Create a poseidon2 hash from a byte buffer.
 * @param input - The input bytes to hash.
 * @returns The poseidon2 hash.
 */
export async function poseidon2HashBytes(input: Buffer): Promise<Bn254Fr> {
  const inputFields = [];
  for (let i = 0; i < input.length; i += 31) {
    const fieldBytes = Buffer.alloc(32, 0);
    input.slice(i, i + 31).copy(fieldBytes);

    // Noir builds the bytes as little-endian, so we need to reverse them.
    fieldBytes.reverse();
    inputFields.push(Bn254Fr.fromBuffer(fieldBytes));
  }

  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2Hash({
    inputs: inputFields.map(i => i.toBuffer()),
  });

  return Bn254Fr.fromBuffer(Buffer.from(response.hash));
}
