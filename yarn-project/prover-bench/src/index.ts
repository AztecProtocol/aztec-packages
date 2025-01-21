/* eslint-disable camelcase */
import { type ForeignCallOutput, Noir } from '@noir-lang/noir_js';
import { type InputValue } from '@noir-lang/noirc_abi';
import createDebug from 'debug';

import Circuit1 from '../artifacts/circuit_1.json' assert { type: 'json' };
import Circuit2 from '../artifacts/circuit_2.json' assert { type: 'json' };
import type { FixedLengthArray } from './types/index.js';

export const logger = createDebug('aztec:bb-bench');

export const MOCK_MAX_COMMITMENTS_PER_TX = 4;

function foreignCallHandler(): Promise<ForeignCallOutput[]> {
  throw new Error('Unexpected foreign call');
}

export type u8 = string;

export async function generateCircuit1(): Promise<[string, Uint8Array, InputValue]> {
  const program = new Noir(Circuit1);
  const { witness, returnValue } = await program.execute(
    {
      x: '0x1',
      y: '0x10',
      z: '0x100',
    },
    foreignCallHandler,
  );
  logger('generated circuit 1');
  return [Circuit1.bytecode, witness, returnValue];
}

export async function generateCircuit2(
  proverOutput: ProverOutputForRecursion,
  previousVk: string[],
): Promise<[string, Uint8Array, InputValue]> {
  const program = new Noir(Circuit2);
  const { witness, returnValue } = await program.execute(
    {
      public_inputs: proverOutput.public_inputs,
      key_hash: '0x0',
      proof: proverOutput.proof,
      verification_key: previousVk as FixedLengthArray<string, 128>,
    },
    foreignCallHandler,
  );
  logger('generated circuit 2');
  return [Circuit2.bytecode, witness, returnValue];
}

export type ProverOutputForRecursion = {
  proof: FixedLengthArray<string, 459>;
  public_inputs: FixedLengthArray<string, 2>;
};

export async function proveCircuit1(
  bytecode: string,
  witness: Uint8Array,
  threads?: number,
): Promise<ProverOutputForRecursion> {
  const { UltraHonkBackend } = await import('@aztec/bb.js');
  const backend = new UltraHonkBackend(bytecode, { threads: threads }, { recursive: true });
  try {
    logger(`proving...`);
    const proverOutput = await backend.generateProofForRecursiveAggregation(witness);
    logger(`done generating recursive proof artifacts.`);
    return {
      proof: proverOutput.proof as FixedLengthArray<string, 459>,
      public_inputs: proverOutput.publicInputs as FixedLengthArray<string, 2>,
    };
  } finally {
    await backend.destroy();
  }
}

export async function proveThenVerifyCircuit2(
  bytecode: string,
  witness: Uint8Array,
  vk: Uint8Array,
  threads?: number,
): Promise<boolean> {
  const { UltraHonkBackend, BarretenbergVerifier } = await import('@aztec/bb.js');
  const backend = new UltraHonkBackend(bytecode, { threads: threads });
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
