import { BarretenbergSync } from '../../barretenberg/index.js';
import { Fr } from '../../types/fields.js';
import { BufferReader } from '../../serialize/index.js';

/**
 * Fieldable type - can be converted to Fr field elements
 */
export type Fieldable = Fr | Buffer | number | bigint | boolean;

/**
 * Serialize a value to Fr fields
 */
function serializeToField(value: Fieldable): Fr {
  if (value instanceof Fr) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return Fr.fromBuffer(value);
  }
  // Convert number/boolean to bigint before passing to Fr constructor
  const bigintValue = typeof value === 'bigint' ? value : BigInt(value);
  return new Fr(bigintValue);
}

/**
 * Serialize an array of values to Fr fields
 */
function serializeToFields(values: Fieldable[]): Fr[] {
  return values.map(serializeToField);
}

/**
 * Create a poseidon2 hash (field) from an array of input fields.
 * @param input - The input fields to hash.
 * @returns The poseidon2 hash.
 */
export async function poseidon2Hash(input: Fieldable[]): Promise<Fr> {
  const inputFields = serializeToFields(input);
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2Hash({
    inputs: inputFields.map(i => i.toBuffer()),
  });
  return Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Create a poseidon2 hash (field) from an array of input fields and a domain separator.
 * @param input - The input fields to hash.
 * @param separator - The domain separator.
 * @returns The poseidon2 hash.
 */
export async function poseidon2HashWithSeparator(input: Fieldable[], separator: number): Promise<Fr> {
  const inputFields = serializeToFields(input);
  inputFields.unshift(new Fr(BigInt(separator)));
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2Hash({
    inputs: inputFields.map(i => i.toBuffer()),
  });
  return Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Create a poseidon2 hash accumulate from an array of input fields.
 * @param input - The input fields to hash.
 * @returns The poseidon2 hash.
 */
export async function poseidon2HashAccumulate(input: Fieldable[]): Promise<Fr> {
  const inputFields = serializeToFields(input);
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2HashAccumulate({
    inputs: inputFields.map(i => i.toBuffer()),
  });
  return Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Runs a Poseidon2 permutation.
 * @param input the input state. Expected to be of size 4.
 * @returns the output state, size 4.
 */
export async function poseidon2Permutation(input: Fieldable[]): Promise<Fr[]> {
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
  return response.outputs.map(o => Fr.fromBuffer(Buffer.from(o)));
}

/**
 * Create a poseidon2 hash from a byte buffer.
 * @param input - The input bytes to hash.
 * @returns The poseidon2 hash.
 */
export async function poseidon2HashBytes(input: Buffer): Promise<Fr> {
  const inputFields = [];
  for (let i = 0; i < input.length; i += 31) {
    const fieldBytes = Buffer.alloc(32, 0);
    input.slice(i, i + 31).copy(fieldBytes);

    // Noir builds the bytes as little-endian, so we need to reverse them.
    fieldBytes.reverse();
    inputFields.push(Fr.fromBuffer(fieldBytes));
  }

  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.poseidon2Hash({
    inputs: inputFields.map(i => i.toBuffer()),
  });

  return Fr.fromBuffer(Buffer.from(response.hash));
}
