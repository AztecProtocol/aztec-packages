import {
  IPA_CLAIM_SIZE,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  PAIRING_POINTS_SIZE,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { ClientIvcProof, Proof, RecursiveProof } from '@aztec/stdlib/proofs';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import assert from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';

import {
  CLIENT_IVC_PROOF_FILE_NAME,
  PROOF_FIELDS_FILENAME,
  PROOF_FILENAME,
  PUBLIC_INPUTS_FILENAME,
} from '../bb/execute.js';

/**
 * Create a ClientIvcProof proof file.
 *
 * @param directory the directory to read the proof from.
 * @returns the encapsulated client ivc proof
 */
export async function readClientIVCProofFromOutputDirectory(directory: string) {
  const clientIvcProofBuffer = await fs.readFile(path.join(directory, CLIENT_IVC_PROOF_FILE_NAME));
  return new ClientIvcProof(clientIvcProofBuffer);
}

/**
 * Serialize a ClientIvcProof to a proof file.
 *
 * @param proof the ClientIvcProof from object
 * @param directory the directory to write in
 */
export async function writeClientIVCProofToOutputDirectory(clientIvcProof: ClientIvcProof, directory: string) {
  const { clientIvcProofBuffer } = clientIvcProof;
  await fs.writeFile(path.join(directory, CLIENT_IVC_PROOF_FILE_NAME), clientIvcProofBuffer);
}

export async function readProofAsFields<PROOF_LENGTH extends number>(
  filePath: string,
  vkData: VerificationKeyData,
  proofLength: PROOF_LENGTH,
  logger: Logger,
): Promise<RecursiveProof<PROOF_LENGTH>> {
  const publicInputsFilename = path.join(filePath, PUBLIC_INPUTS_FILENAME);
  const proofFilename = path.join(filePath, PROOF_FILENAME);
  const proofFieldsFilename = path.join(filePath, PROOF_FIELDS_FILENAME);

  const [binaryPublicInputs, binaryProof, proofString] = await Promise.all([
    fs.readFile(publicInputsFilename),
    fs.readFile(proofFilename),
    fs.readFile(proofFieldsFilename, { encoding: 'utf-8' }),
  ]);

  const json = JSON.parse(proofString);

  let numPublicInputs = vkData.numPublicInputs - PAIRING_POINTS_SIZE;
  assert(
    proofLength == NESTED_RECURSIVE_PROOF_LENGTH || proofLength == NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    `Proof length must be one of the expected proof lengths, received ${proofLength}`,
  );
  if (proofLength == NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH) {
    numPublicInputs -= IPA_CLAIM_SIZE;
  }

  assert(json.length == proofLength, `Proof length mismatch: ${json.length} != ${proofLength}`);

  const fieldsWithoutPublicInputs = json.map(Fr.fromHexString);

  // Concat binary public inputs and binary proof
  // This buffer will have the form: [binary public inputs, binary proof]
  const binaryProofWithPublicInputs = Buffer.concat([binaryPublicInputs, binaryProof]);
  logger.debug(
    `Circuit path: ${filePath}, complete proof length: ${json.length}, num public inputs: ${numPublicInputs}, circuit size: ${vkData.circuitSize}, is recursive: ${vkData.isRecursive}, raw length: ${binaryProofWithPublicInputs.length}`,
  );
  assert(
    binaryProofWithPublicInputs.length == numPublicInputs * 32 + proofLength * 32,
    `Proof length mismatch: ${binaryProofWithPublicInputs.length} != ${numPublicInputs * 32 + proofLength * 32}`,
  );
  return new RecursiveProof(
    fieldsWithoutPublicInputs,
    new Proof(binaryProofWithPublicInputs, numPublicInputs),
    true,
    proofLength,
  );
}
