import {
  BB_RESULT,
  PROOF_FILENAME,
  PUBLIC_INPUTS_FILENAME,
  type UltraHonkFlavor,
  VK_FILENAME,
  executeBbClientIvcProof,
  extractVkData,
  generateProof,
  generateTubeProof,
  readClientIVCProofFromOutputDirectory,
  readProofAsFields,
  verifyProof,
} from '@aztec/bb-prover';
import { NESTED_RECURSIVE_PROOF_LENGTH, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, TUBE_PROOF_LENGTH } from '@aztec/constants';
import type { Logger } from '@aztec/foundation/log';
import { makeProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';
import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';
import type { ClientIvcProof, Proof } from '@aztec/stdlib/proofs';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import { encode } from '@msgpack/msgpack';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function proveClientIVC(
  bbBinaryPath: string,
  bbWorkingDirectory: string,
  witnessStack: Uint8Array[],
  bytecodes: string[],
  logger: Logger,
): Promise<ClientIvcProof> {
  await fs.writeFile(
    path.join(bbWorkingDirectory, 'acir.msgpack'),
    encode(bytecodes.map(bytecode => Buffer.from(bytecode, 'base64'))),
  );

  await fs.writeFile(path.join(bbWorkingDirectory, 'witnesses.msgpack'), encode(witnessStack));
  const provingResult = await executeBbClientIvcProof(
    bbBinaryPath,
    bbWorkingDirectory,
    path.join(bbWorkingDirectory, 'acir.msgpack'),
    path.join(bbWorkingDirectory, 'witnesses.msgpack'),
    logger.info,
    true,
  );

  if (provingResult.status === BB_RESULT.FAILURE) {
    throw new Error(provingResult.reason);
  }

  return readClientIVCProofFromOutputDirectory(bbWorkingDirectory);
}

async function verifyProofWithKey(
  pathToBB: string,
  workingDirectory: string,
  verificationKey: VerificationKeyData,
  proof: Proof,
  flavor: UltraHonkFlavor,
  logger: Logger,
) {
  const publicInputsFileName = path.join(workingDirectory, PUBLIC_INPUTS_FILENAME);
  const proofFileName = path.join(workingDirectory, PROOF_FILENAME);
  const verificationKeyPath = path.join(workingDirectory, VK_FILENAME);
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13189): Put this proof parsing logic in the proof class.
  await fs.writeFile(publicInputsFileName, proof.buffer.slice(0, proof.numPublicInputs * 32));
  await fs.writeFile(proofFileName, proof.buffer.slice(proof.numPublicInputs * 32));
  await fs.writeFile(verificationKeyPath, verificationKey.keyAsBytes);

  const result = await verifyProof(pathToBB, proofFileName, verificationKeyPath, flavor, logger);
  if (result.status === BB_RESULT.FAILURE) {
    throw new Error(`Failed to verify proof from key!`);
  }
  logger.info(`Successfully verified proof from key in ${result.durationMs} ms`);
}

export async function proveTube(pathToBB: string, workingDirectory: string, logger: Logger) {
  const tubeResult = await generateTubeProof(pathToBB, workingDirectory, workingDirectory.concat('/vk'), logger.info);

  if (tubeResult.status != BB_RESULT.SUCCESS) {
    throw new Error('Failed to prove tube');
  }

  const tubeVK = await extractVkData(tubeResult.vkPath!);
  const tubeProof = await readProofAsFields(tubeResult.proofPath!, tubeVK, TUBE_PROOF_LENGTH, logger);

  // Sanity check the tube proof
  await verifyProofWithKey(pathToBB, workingDirectory, tubeVK, tubeProof.binaryProof, 'ultra_rollup_honk', logger);

  return makeProofAndVerificationKey(tubeProof, tubeVK);
}

async function proveRollupCircuit<T extends UltraHonkFlavor, ProofLength extends number>(
  name: string,
  pathToBB: string,
  workingDirectory: string,
  circuit: NoirCompiledCircuit,
  witness: Uint8Array,
  logger: Logger,
  flavor: T,
  proofLength: ProofLength,
) {
  await fs.writeFile(path.join(workingDirectory, 'witness.gz'), witness);
  const proofResult = await generateProof(
    pathToBB,
    workingDirectory,
    name,
    Buffer.from(circuit.bytecode, 'base64'),
    true,
    path.join(workingDirectory, 'witness.gz'),
    flavor,
    logger.info,
  );

  if (proofResult.status != BB_RESULT.SUCCESS) {
    throw new Error(`Failed to generate proof for ${name} with flavor ${flavor}`);
  }

  const vk = await extractVkData(proofResult.vkPath!);
  const proof = await readProofAsFields(proofResult.proofPath!, vk, proofLength, logger);

  await verifyProofWithKey(pathToBB, workingDirectory, vk, proof.binaryProof, flavor, logger);

  return makeProofAndVerificationKey(proof, vk);
}

export function proveRollupHonk(
  name: string,
  pathToBB: string,
  workingDirectory: string,
  circuit: NoirCompiledCircuit,
  witness: Uint8Array,
  logger: Logger,
) {
  return proveRollupCircuit(
    name,
    pathToBB,
    workingDirectory,
    circuit,
    witness,
    logger,
    'ultra_rollup_honk',
    RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  );
}

export function proveKeccakHonk(
  name: string,
  pathToBB: string,
  workingDirectory: string,
  circuit: NoirCompiledCircuit,
  witness: Uint8Array,
  logger: Logger,
) {
  return proveRollupCircuit(
    name,
    pathToBB,
    workingDirectory,
    circuit,
    witness,
    logger,
    'ultra_keccak_honk',
    NESTED_RECURSIVE_PROOF_LENGTH,
  );
}
