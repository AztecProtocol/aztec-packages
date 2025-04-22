/* eslint-disable camelcase */
import { Noir } from '@aztec/noir-noir_js';
import type { InputValue } from '@aztec/noir-noirc_abi';

import createDebug from 'debug';

// these files are generated
import Circuit1 from '../artifacts/circuit_1.json' assert { type: 'json' };
import Circuit2 from '../artifacts/circuit_2.json' assert { type: 'json' };
import type { FixedLengthArray } from './types/index.js';

export const logger = createDebug('aztec:bb-bench');

export const MOCK_MAX_COMMITMENTS_PER_TX = 4;

export type u8 = string;

export async function generateCircuit1(): Promise<[string, Uint8Array, InputValue]> {
  const program = new Noir(Circuit1);
  const { witness, returnValue } = await program.execute({
    x: '0x1',
    y: '0x10',
  });
  logger('generated circuit 1');
  return [Circuit1.bytecode, witness, returnValue];
}

export async function generateCircuit2(
  proof: FixedLengthArray<string, 459>,
  public_inputs: FixedLengthArray<string, 2>,
  vk: FixedLengthArray<string, 128>,
): Promise<[string, Uint8Array, InputValue]> {
  const program = new Noir(Circuit2);
  const { witness, returnValue } = await program.execute({
    public_inputs: public_inputs,
    proof: proof,
    verification_key: vk,
    key_hash: '0x0',
    z: '0xd00d',
  });
  logger('generated circuit 2');
  return [Circuit2.bytecode, witness, returnValue];
}

export async function proveCircuit1(bytecode: string, witness: Uint8Array, threads?: number) {
  const { UltraHonkBackend } = await import('@aztec/bb.js');
  const backend = new UltraHonkBackend(bytecode, { threads: threads }, { recursive: true });
  try {
    logger(`proving...`);
    const proverOutput = await backend.generateProof(witness);
    const { proofAsFields, vkAsFields, publicInputs } = await backend.generateRecursiveProofArtifacts(
      proverOutput.proof,
      proverOutput.publicInputs,
    );
    logger(`done generating recursive proof artifacts.`);
    return {
      proof: proofAsFields as FixedLengthArray<string, 459>,
      public_inputs: publicInputs as FixedLengthArray<string, 2>,
      vk: vkAsFields as FixedLengthArray<string, 128>,
    };
  } finally {
    await backend.destroy();
  }
}

export async function proveThenVerifyCircuit2(
  bytecode: string,
  witness: Uint8Array,
  threads?: number,
): Promise<boolean> {
  const { UltraHonkBackend, BarretenbergVerifier } = await import('@aztec/bb.js');
  const backend = new UltraHonkBackend(bytecode, { threads: threads });
  const vk = await backend.getVerificationKey();

  try {
    logger(`proving...`);
    const proof = await backend.generateProof(witness);
    logger(`done proving. verifying...`);
    const verifier = new BarretenbergVerifier({ threads });
    const verified = await verifier.verifyUltraHonkProof(proof, vk);
    logger(`done verifying.`);
    await verifier.destroy();
    return verified;
  } finally {
    await backend.destroy();
  }
}

export async function proveThenVerifyStack(): Promise<boolean> {
  logger(`generating circuit and witness...`);
  const [bytecode1, witness1] = await generateCircuit1();
  logger(`done generating circuit and witness. proving...`);
  const proverOutput = await proveCircuit1(bytecode1, witness1);
  logger(`done proving. generating circuit 2 and witness...`);
  const [bytecode2, witness2] = await generateCircuit2(proverOutput.proof, proverOutput.public_inputs, proverOutput.vk);
  logger(`done. generating circuit and witness. proving then verifying...`);
  const verified = await proveThenVerifyCircuit2(bytecode2, witness2);
  logger(`verified? ${verified}`);
  return verified;
}
