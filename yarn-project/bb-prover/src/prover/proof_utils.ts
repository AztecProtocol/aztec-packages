import {
  CHONK_PROOF_LENGTH,
  HIDING_KERNEL_IO_PUBLIC_INPUTS_SIZE,
  IPA_CLAIM_SIZE,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  PAIRING_POINTS_SIZE,
  ULTRA_KECCAK_PROOF_LENGTH,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import { ChonkProofWithPublicInputs, Proof, RecursiveProof } from '@aztec/stdlib/proofs';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import assert from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';

import { PROOF_FILENAME, PUBLIC_INPUTS_FILENAME } from '../bb/execute.js';

/**
 * Create a ChonkProof proof file.
 *
 * @param directory the directory to read the proof from.
 * @returns the encapsulated chonk proof
 */
export async function readChonkProofFromOutputDirectory(directory: string) {
  const proofFilename = path.join(directory, PROOF_FILENAME);
  const binaryProof = await fs.readFile(proofFilename);
  const proofFields = splitBufferIntoFields(binaryProof);
  return new ChonkProofWithPublicInputs(proofFields);
}

/**
 * Serialize a ChonkProof to a proof file.
 *
 * @param proof the ChonkProof from object
 * @param directory the directory to write in
 */
export async function writeChonkProofToPath(chonkProof: ChonkProofWithPublicInputs, outputPath: string) {
  // NB: Don't use chonkProof.toBuffer here because it will include the proof length.
  const fieldsBuf = Buffer.concat(chonkProof.fieldsWithPublicInputs.map(field => field.toBuffer()));
  await fs.writeFile(outputPath, fieldsBuf);
}

function getNumCustomPublicInputs(proofLength: number, vkData: VerificationKeyData) {
  let numPublicInputs = vkData.numPublicInputs;
  if (proofLength == CHONK_PROOF_LENGTH) {
    numPublicInputs -= HIDING_KERNEL_IO_PUBLIC_INPUTS_SIZE;
  } else {
    numPublicInputs -= PAIRING_POINTS_SIZE;
    if (proofLength == NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH) {
      numPublicInputs -= IPA_CLAIM_SIZE;
    }
  }
  return numPublicInputs;
}

function splitBufferIntoFields(buffer: Buffer): Fr[] {
  const fields: Fr[] = [];
  for (let i = 0; i < buffer.length / Fr.SIZE_IN_BYTES; i++) {
    fields.push(Fr.fromBuffer(buffer.subarray(i * Fr.SIZE_IN_BYTES, (i + 1) * Fr.SIZE_IN_BYTES)));
  }
  return fields;
}

export async function readProofsFromOutputDirectory<PROOF_LENGTH extends number>(
  directory: string,
  vkData: VerificationKeyData,
  proofLength: PROOF_LENGTH,
  logger: Logger,
): Promise<RecursiveProof<PROOF_LENGTH>> {
  assert(
    proofLength == CHONK_PROOF_LENGTH ||
      proofLength == NESTED_RECURSIVE_PROOF_LENGTH ||
      proofLength == NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH ||
      proofLength == ULTRA_KECCAK_PROOF_LENGTH,
    `Proof length must be one of the expected proof lengths, received ${proofLength}`,
  );

  const publicInputsFilename = path.join(directory, PUBLIC_INPUTS_FILENAME);
  const proofFilename = path.join(directory, PROOF_FILENAME);

  // Handle CHONK separately because bb outputs the proof fields with public inputs for CHONK.
  const isChonk = proofLength == CHONK_PROOF_LENGTH;

  const [binaryPublicInputs, binaryProof] = await Promise.all([
    isChonk ? Buffer.alloc(0) : fs.readFile(publicInputsFilename),
    fs.readFile(proofFilename),
  ]);

  const numPublicInputs = getNumCustomPublicInputs(proofLength, vkData);
  let fieldsWithoutPublicInputs = splitBufferIntoFields(binaryProof);
  if (isChonk) {
    fieldsWithoutPublicInputs = fieldsWithoutPublicInputs.slice(numPublicInputs);
  }

  assert(
    fieldsWithoutPublicInputs.length == proofLength,
    `Proof fields length mismatch: ${fieldsWithoutPublicInputs.length} != ${proofLength}`,
  );

  // Concat binary public inputs and binary proof
  // This buffer will have the form: [binary public inputs, binary proof]
  const binaryProofWithPublicInputs = Buffer.concat([binaryPublicInputs, binaryProof]);
  logger.debug(
    `Circuit path: ${directory}, proof fields length: ${fieldsWithoutPublicInputs.length}, num public inputs: ${numPublicInputs}, circuit size: ${vkData.circuitSize}`,
  );
  return new RecursiveProof(
    fieldsWithoutPublicInputs,
    new Proof(binaryProofWithPublicInputs, numPublicInputs),
    true,
    proofLength,
  );
}
