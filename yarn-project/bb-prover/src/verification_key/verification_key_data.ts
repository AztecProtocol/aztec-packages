import { AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';
import { VerificationKeyAsFields, VerificationKeyData } from '@aztec/stdlib/vks';

import { strict as assert } from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';

import { VK_FILENAME } from '../bb/execute.js';

/**
 * Reads the verification key data stored at the specified location and parses into a VerificationKeyData
 * @param vkDirectoryPath - The directory containing the verification key data files
 * @returns The verification key data
 */
export async function extractVkData(vkDirectoryPath: string): Promise<VerificationKeyData> {
  const rawBinary = await fs.readFile(path.join(vkDirectoryPath, VK_FILENAME));

  // Convert binary to field elements (32 bytes per field)
  const numFields = rawBinary.length / Fr.SIZE_IN_BYTES;
  const reader = BufferReader.asReader(rawBinary);
  const fields = reader.readArray(numFields, Fr);

  const vkAsFields = await VerificationKeyAsFields.fromKey(fields);
  return new VerificationKeyData(vkAsFields, rawBinary);
}

/**
 * Reads the verification key data stored in a binary file at the specified directory location and parses into a VerificationKeyData.
 * We do not assume any JSON file available but only the binary version, contrary to the above extractVkData() method.
 * @param vkDirectoryPath - The directory containing the verification key binary data file.
 * @returns The verification key data
 */
export async function extractAvmVkData(vkDirectoryPath: string): Promise<VerificationKeyData> {
  const rawBinary = await fs.readFile(path.join(vkDirectoryPath, VK_FILENAME));

  const numFields = rawBinary.length / Fr.SIZE_IN_BYTES;
  assert(numFields <= AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED, 'Invalid AVM verification key length');
  const reader = BufferReader.asReader(rawBinary);
  const fieldsArray = reader.readArray(numFields, Fr);

  const fieldsArrayPadded = fieldsArray.concat(
    Array(AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED - fieldsArray.length).fill(new Fr(0)),
  );
  const vkAsFields = await VerificationKeyAsFields.fromKey(fieldsArrayPadded);
  // TODO(#16644): We should have a different type for AVM verification keys since we don't have circuit size or num public inputs in AVM VKs.
  const vk = new VerificationKeyData(vkAsFields, rawBinary);
  return vk;
}
