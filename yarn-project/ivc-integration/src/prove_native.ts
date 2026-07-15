import { BBJsFactory, type UltraHonkFlavor, constructRecursiveProofFromBuffers } from '@aztec/bb-prover';
import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS,
  CHONK_PROOF_LENGTH,
  HIDING_KERNEL_IO_PUBLIC_INPUTS_SIZE,
  NESTED_RECURSIVE_PROOF_LENGTH,
  RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import type { AvmCircuitInputs, AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { makeProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';
import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';
import { Proof, RecursiveProof } from '@aztec/stdlib/proofs';
import { VerificationKeyAsFields, VerificationKeyData } from '@aztec/stdlib/vks';

import { ungzip } from 'pako';
import * as path from 'path';

export async function proofBytesToRecursiveProof(
  proofAsFields: Uint8Array[],
  vkBytes: Uint8Array,
): Promise<RecursiveProof<typeof CHONK_PROOF_LENGTH>> {
  const vk = await VerificationKeyAsFields.fromFrBuffer(Buffer.from(vkBytes));
  const numCustomPublicInputs = vk.numPublicInputs - HIDING_KERNEL_IO_PUBLIC_INPUTS_SIZE;
  // Convert Uint8Array fields to Fr instances
  const fields = proofAsFields.map(f => Fr.fromBuffer(Buffer.from(f)));

  // Slice off custom public inputs from the beginning.
  const fieldsWithoutPublicInputs = fields.slice(numCustomPublicInputs);

  // Convert fields to binary buffer
  const proofBuffer = Buffer.concat(proofAsFields.slice(numCustomPublicInputs));

  // Create Proof directly (not using fromBuffer which expects different format)
  const proof = new Proof(proofBuffer, numCustomPublicInputs);
  return new RecursiveProof(fieldsWithoutPublicInputs, proof, true, CHONK_PROOF_LENGTH);
}

async function proveRollupCircuit<T extends UltraHonkFlavor, ProofLength extends number>(
  name: string,
  pathToBB: string,
  _workingDirectory: string,
  circuit: NoirCompiledCircuit,
  witness: Uint8Array,
  logger: Logger,
  flavor: T,
  proofLength: ProofLength,
) {
  const factory = new BBJsFactory(pathToBB, { logger });
  try {
    // Decompress witness and bytecode for bb.js
    const decompressedWitness = ungzip(witness);
    const bytecode = ungzip(Buffer.from(circuit.bytecode, 'base64'));
    const vkBuffer = Buffer.from(circuit.verificationKey.bytes, 'hex');

    // Generate proof via bb.js
    await using proveInstance = await factory.getInstance();
    const proofResult = await proveInstance.generateProof(name, bytecode, vkBuffer, decompressedWitness, flavor);

    const vk = await VerificationKeyData.fromFrBuffer(vkBuffer);

    // Construct proof from in-memory buffers
    const proof = constructRecursiveProofFromBuffers(
      proofResult.proofFields,
      proofResult.publicInputFields,
      vk,
      proofLength,
    );

    // Verify the proof via bb.js
    await using verifyInstance = await factory.getInstance();
    const { verified } = await verifyInstance.verifyProof(
      proofResult.proofFields,
      vk.keyAsBytes,
      proofResult.publicInputFields,
      flavor,
    );

    if (!verified) {
      throw new Error(`Failed to verify proof from key!`);
    }
    logger.info(`Successfully verified proof from key`);

    return makeProofAndVerificationKey(proof, vk);
  } finally {
    await factory.destroy();
  }
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

/** Generate and verify an AVM proof via bb.js. */
export async function proveAvm(
  avmCircuitInputs: AvmCircuitInputs,
  _workingDirectory: string,
  logger: Logger,
): Promise<{
  proof: Fr[];
  publicInputs: AvmCircuitPublicInputs;
}> {
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb-avm');
  const factory = new BBJsFactory(bbPath, { logger });
  try {
    const inputsBuffer = avmCircuitInputs.serializeWithMessagePack();
    let proofFields: Uint8Array[];
    {
      await using instance = await factory.getInstance();
      ({ proof: proofFields } = await instance.generateAvmProof(inputsBuffer));
    }

    // Convert Uint8Array field elements → Fr[]
    const proof: Fr[] = proofFields.map(f => Fr.fromBuffer(Buffer.from(f)));

    if (proof.length !== AVM_V2_PROOF_LENGTH_IN_FIELDS) {
      throw new Error(`AVM V2 proof has ${proof.length} fields, expected exactly ${AVM_V2_PROOF_LENGTH_IN_FIELDS}.`);
    }

    // Explicit verify pass against the serialized public inputs (matches the legacy binary flow).
    const piBuffer = avmCircuitInputs.publicInputs.serializeWithMessagePack();
    await using verifyInstance = await factory.getInstance();
    const { verified: reVerified } = await verifyInstance.verifyAvmProof(proofFields, piBuffer);
    if (!reVerified) {
      throw new Error('AVM V2 proof verification failed');
    }

    return {
      proof,
      publicInputs: avmCircuitInputs.publicInputs,
    };
  } finally {
    await factory.destroy();
  }
}
