/**
 * Poseidon2 hash operations - delegates to barretenberg/ts.
 * This wrapper maintains Fr return types for backward compatibility.
 */
import {
  type Fieldable as FieldableBb,
  poseidon2HashAccumulate as poseidon2HashAccumulateImpl,
  poseidon2HashBytes as poseidon2HashBytesImpl,
  poseidon2Hash as poseidon2HashImpl,
  poseidon2HashWithSeparator as poseidon2HashWithSeparatorImpl,
  poseidon2Permutation as poseidon2PermutationImpl,
} from '@aztec/bb.js/crypto/poseidon';
import { Bn254Fr } from '@aztec/bb.js/types/fields';

import { Fr } from '../../fields/fields.js';
import { type Fieldable, serializeToFields } from '../../serialize/serialize.js';

/**
 * Create a poseidon hash (field) from an array of input fields.
 * @param input - The input fields to hash.
 * @returns The poseidon hash.
 */
export async function poseidon2Hash(input: Fieldable[]): Promise<Fr> {
  const inputFields = serializeToFields(input);
  // Convert Fr to Bn254Fr for barretenberg
  const bbFields = inputFields.map(f => Bn254Fr.fromBuffer(f.toBuffer())) as FieldableBb[];
  const result = await poseidon2HashImpl(bbFields);
  return Fr.fromBuffer(Buffer.from(result.toBuffer()));
}

/**
 * Create a poseidon hash (field) from an array of input fields and a domain separator.
 * @param input - The input fields to hash.
 * @param separator - The domain separator.
 * @returns The poseidon hash.
 */
export async function poseidon2HashWithSeparator(input: Fieldable[], separator: number): Promise<Fr> {
  const inputFields = serializeToFields(input);
  const bbFields = inputFields.map(f => Bn254Fr.fromBuffer(f.toBuffer())) as FieldableBb[];
  const result = await poseidon2HashWithSeparatorImpl(bbFields, separator);
  return Fr.fromBuffer(Buffer.from(result.toBuffer()));
}

/**
 * Create a poseidon2 hash accumulate from an array of input fields.
 * @param input - The input fields to hash.
 * @returns The poseidon2 hash.
 */
export async function poseidon2HashAccumulate(input: Fieldable[]): Promise<Fr> {
  const inputFields = serializeToFields(input);
  const bbFields = inputFields.map(f => Bn254Fr.fromBuffer(f.toBuffer())) as FieldableBb[];
  const result = await poseidon2HashAccumulateImpl(bbFields);
  return Fr.fromBuffer(Buffer.from(result.toBuffer()));
}

/**
 * Runs a Poseidon2 permutation.
 * @param input the input state. Expected to be of size 4.
 * @returns the output state, size 4.
 */
export async function poseidon2Permutation(input: Fieldable[]): Promise<Fr[]> {
  const inputFields = serializeToFields(input);
  const bbFields = inputFields.map(f => Bn254Fr.fromBuffer(f.toBuffer())) as FieldableBb[];
  const results = await poseidon2PermutationImpl(bbFields);
  return results.map(o => Fr.fromBuffer(Buffer.from(o.toBuffer())));
}

/**
 * Create a poseidon2 hash from a byte buffer.
 * @param input - The input bytes to hash.
 * @returns The poseidon2 hash.
 */
export async function poseidon2HashBytes(input: Buffer): Promise<Fr> {
  const result = await poseidon2HashBytesImpl(input);
  return Fr.fromBuffer(Buffer.from(result.toBuffer()));
}
