import {
  BB_RESULT,
  PROOF_FILENAME,
  PUBLIC_INPUTS_FILENAME,
  type UltraHonkFlavor,
  VK_FILENAME,
  executeBbClientIvcProof,
  extractVkData,
  generateAvmProofV2,
  generateProof,
  generateTubeProof,
  readClientIVCProofFromOutputDirectory,
  readProofAsFields,
  verifyAvmProofV2,
  verifyProof,
} from '@aztec/bb-prover';
import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  NESTED_RECURSIVE_PROOF_LENGTH,
  RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  TUBE_PROOF_LENGTH,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import type { AvmCircuitInputs, AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { makeProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';
import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';
import type { ClientIvcProof, Proof } from '@aztec/stdlib/proofs';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import * as fs from 'fs/promises';
import { Encoder } from 'msgpackr';
import * as path from 'path';

export async function proveClientIVC(
  bbBinaryPath: string,
  bbWorkingDirectory: string,
  witnessStack: Uint8Array[],
  bytecodes: string[],
  vks: string[],
  logger: Logger,
): Promise<ClientIvcProof> {
  const stepToStruct = (bytecode: string, index: number) => {
    return {
      bytecode: Buffer.from(bytecode, 'base64'),
      witness: witnessStack[index],
      vk: Buffer.from(vks[index], 'hex'),
      functionName: `unknown_${index}`,
    };
  };
  const encoded = new Encoder({ useRecords: false }).pack(bytecodes.map(stepToStruct));
  const ivcInputsPath = path.join(bbWorkingDirectory, 'ivc-inputs.msgpack');
  await fs.writeFile(ivcInputsPath, encoded);

  const provingResult = await executeBbClientIvcProof(
    bbBinaryPath,
    bbWorkingDirectory,
    ivcInputsPath,
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

export async function proveAvm(
  avmCircuitInputs: AvmCircuitInputs,
  workingDirectory: string,
  logger: Logger,
): Promise<{
  vk: Fr[];
  proof: Fr[];
  publicInputs: AvmCircuitPublicInputs;
}> {
  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');

  // Then we prove.
  const proofRes = await generateAvmProofV2(bbPath, workingDirectory, avmCircuitInputs, logger);
  if (proofRes.status === BB_RESULT.FAILURE) {
    throw new Error(`AVM V2 proof generation failed: ${proofRes.reason}`);
  } else if (proofRes.status === BB_RESULT.ALREADY_PRESENT) {
    throw new Error(`AVM V2 proof already exists`);
  }

  const avmProofPath = proofRes.proofPath;
  const avmVkPath = proofRes.vkPath;
  expect(avmProofPath).toBeDefined();
  expect(avmVkPath).toBeDefined();

  // Read the binary proof
  const avmProofBuffer = await fs.readFile(avmProofPath!);
  const reader = BufferReader.asReader(avmProofBuffer);

  const proof: Fr[] = [];
  while (!reader.isEmpty()) {
    proof.push(Fr.fromBuffer(reader));
  }

  // We extend to a fixed-size padded proof as during development any new AVM circuit column changes the
  // proof length and we do not have a mechanism to feedback a cpp constant to noir/TS.
  // TODO(#13390): Revive a non-padded AVM proof
  while (proof.length < AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED) {
    proof.push(new Fr(0));
  }

  // Read the key
  const vkBuffer = await fs.readFile(avmVkPath!);
  const vkReader = BufferReader.asReader(vkBuffer);
  const vk: Fr[] = [];
  while (!vkReader.isEmpty()) {
    vk.push(Fr.fromBuffer(vkReader));
  }
  // We extend to a fixed-size padded vk as during development any new AVM circuit precomputed
  // column changes the vk length and we do not have a mechanism to feedback a cpp constant to noir/TS.
  // TODO(#13390): Revive a non-padded vk proof
  while (vk.length < AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED) {
    vk.push(new Fr(0));
  }

  const verificationResult = await verifyAvmProofV2(
    bbPath,
    workingDirectory,
    proofRes.proofPath!,
    avmCircuitInputs.publicInputs,
    proofRes.vkPath!,
    logger,
  );

  if (verificationResult.status === BB_RESULT.FAILURE) {
    throw new Error(`AVM V2 proof verification failed: ${verificationResult.reason}`);
  }
  return {
    proof,
    vk,
    publicInputs: avmCircuitInputs.publicInputs,
  };
}
