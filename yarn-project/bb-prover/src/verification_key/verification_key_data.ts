import { AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';
import { hashVK } from '@aztec/stdlib/hash';
import { VerificationKeyAsFields, VerificationKeyData } from '@aztec/stdlib/vks';

import { strict as assert } from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';

import { VK_FIELDS_FILENAME, VK_FILENAME } from '../bb/execute.js';

/**
 * Reads the verification key data stored at the specified location and parses into a VerificationKeyData
 * @param vkDirectoryPath - The directory containing the verification key data files
 * @returns The verification key data
 */
export async function extractVkData(vkDirectoryPath: string): Promise<VerificationKeyData> {
  const [rawFields, rawBinary] = await Promise.all([
    fs.readFile(path.join(vkDirectoryPath, VK_FIELDS_FILENAME), { encoding: 'utf-8' }),
    fs.readFile(path.join(vkDirectoryPath, VK_FILENAME)),
  ]);
  const fieldsJson = JSON.parse(rawFields);
  const fields = fieldsJson.map(Fr.fromHexString);
  // The hash is not included in the BB response
  const vkHash = await hashVK(fields);
  const vkAsFields = new VerificationKeyAsFields(fields, vkHash);
  return new VerificationKeyData(vkAsFields, rawBinary);
}

// TODO: This was adapted from the above function. A refactor might be needed.
export async function extractAvmVkData(vkDirectoryPath: string): Promise<VerificationKeyData> {
  const rawBinary = await fs.readFile(path.join(vkDirectoryPath, VK_FILENAME));

  const numFields = rawBinary.length / Fr.SIZE_IN_BYTES;
  assert(numFields <= AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED, 'Invalid AVM verification key length');
  const reader = BufferReader.asReader(rawBinary);
  const fieldsArray = reader.readArray(numFields, Fr);

  const fieldsArrayPadded = fieldsArray.concat(
    Array(AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED - fieldsArray.length).fill(new Fr(0)),
  );
  const vkHash = await hashVK(fieldsArrayPadded);
  const vkAsFields = new VerificationKeyAsFields(fieldsArrayPadded, vkHash);
  const vk = new VerificationKeyData(vkAsFields, rawBinary);
  return vk;
}
