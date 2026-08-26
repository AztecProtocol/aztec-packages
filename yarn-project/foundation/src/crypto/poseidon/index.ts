import { Barretenberg, BarretenbergSync } from '@aztec/bb.js';

import { Fr } from '../../curves/bn254/field.js';
import { type Fieldable, serializeToFields } from '../../serialize/serialize.js';

const IS_BROWSER = typeof self !== 'undefined';

async function poseidon2HashFields(inputFields: Fr[]): Promise<Fr> {
  if (IS_BROWSER) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.poseidon2Hash({
      inputs: inputFields.map(i => i.toBuffer()),
    });
    return Fr.fromBuffer(Buffer.from(response.hash));
  } else {
    await Barretenberg.initSingleton();
    const api = Barretenberg.getSingleton();
    const response = await api.poseidon2Hash({
      inputs: inputFields.map(i => i.toBuffer()),
    });
    return Fr.fromBuffer(Buffer.from(response.hash));
  }
}

/**
 * Create a poseidon hash (field) from an array of input fields.
 * @param input - The input fields to hash.
 * @returns The poseidon hash.
 */
export function poseidon2Hash(input: Fieldable[]): Promise<Fr> {
  return poseidon2HashFields(serializeToFields(input));
}

/**
 * Create a poseidon hash (field) from an array of input fields and a domain separator.
 * @param input - The input fields to hash.
 * @param separator - The domain separator.
 * @returns The poseidon hash.
 */
export function poseidon2HashWithSeparator(input: Fieldable[], separator: number): Promise<Fr> {
  const inputFields = serializeToFields(input);
  inputFields.unshift(new Fr(separator));
  return poseidon2HashFields(inputFields);
}

/**
 * Runs a Poseidon2 permutation.
 * @param input the input state. Expected to be of size 4.
 * @returns the output state, size 4.
 */
export async function poseidon2Permutation(input: Fieldable[]): Promise<Fr[]> {
  const inputFields = serializeToFields(input);
  if (IS_BROWSER) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.poseidon2Permutation({
      inputs: inputFields.map(i => i.toBuffer()),
    });
    return response.outputs.map(o => Fr.fromBuffer(Buffer.from(o)));
  } else {
    await Barretenberg.initSingleton();
    const api = Barretenberg.getSingleton();
    const response = await api.poseidon2Permutation({
      inputs: inputFields.map(i => i.toBuffer()),
    });
    return response.outputs.map(o => Fr.fromBuffer(Buffer.from(o)));
  }
}

/**
 * Compute chain of Poseidon2 permutation rounds over chunks of 3-field blocks in a single API call.
 * @param state - The sponge state, size 4.
 * @param inputs - The fields to absorb; length must be a multiple of 3.
 * @returns the output state, size 4.
 */
export async function poseidon2AbsorbChain(state: Fr[], inputs: Fr[]): Promise<Fr[]> {
  // The fields travel as one flat 32-byte-per-field buffer
  const flat = Buffer.allocUnsafe(inputs.length * 32);
  for (let i = 0; i < inputs.length; i++) {
    flat.set(inputs[i].toBuffer(), i * 32);
  }
  const command = {
    state: state.map(s => s.toBuffer()),
    inputs: flat,
  };
  if (IS_BROWSER) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.poseidon2AbsorbChain(command);
    return response.state.map(o => Fr.fromBuffer(Buffer.from(o)));
  } else {
    await Barretenberg.initSingleton();
    const api = Barretenberg.getSingleton();
    const response = await api.poseidon2AbsorbChain(command);
    return response.state.map(o => Fr.fromBuffer(Buffer.from(o)));
  }
}

export function poseidon2HashBytes(input: Buffer): Promise<Fr> {
  const inputFields = [];
  for (let i = 0; i < input.length; i += 31) {
    const fieldBytes = Buffer.alloc(32, 0);
    input.slice(i, i + 31).copy(fieldBytes);

    // Noir builds the bytes as little-endian, so we need to reverse them.
    fieldBytes.reverse();
    inputFields.push(Fr.fromBuffer(fieldBytes));
  }

  return poseidon2HashFields(inputFields);
}
