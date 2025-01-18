/* eslint-disable camelcase */
import { type ForeignCallOutput, Noir } from '@noir-lang/noir_js';
import createDebug from 'debug';

import Circuit1 from '../artifacts/circuit_1.json' assert { type: 'json' };
import Circuit2 from '../artifacts/circuit_2.json' assert { type: 'json' };
import type { Circuit_1InputType, Circuit_2InputType, FixedLengthArray } from './types/index.js';

export const logger = createDebug('aztec:bb-bench');

export const MOCK_MAX_COMMITMENTS_PER_TX = 4;

function foreignCallHandler(): Promise<ForeignCallOutput[]> {
  throw new Error('Unexpected foreign call');
}

export interface WitnessGenResult<PublicInputsType> {
  witness: Uint8Array;
  publicInputs: PublicInputsType;
}

export type u8 = string;

export async function witnessGenCircuit1(args: Circuit_1InputType): Promise<WitnessGenResult<u8>> {
  const program = new Noir(Circuit1);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as u8,
  };
}

export async function witnessGenCircuit2(args: Circuit_2InputType): Promise<WitnessGenResult<u8>> {
  const program = new Noir(Circuit2);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as u8,
  };
}

export async function generateCircuit1(): Promise<[string, Uint8Array]> {
  const witnessGenResult = await witnessGenCircuit1({
    x: '0x1',
    y: '0x10',
    z: '0x100',
  });
  logger('generated circuit 1');

  const bytecode = Circuit1.bytecode;
  const witness = witnessGenResult.witness;

  return [bytecode, witness];
}

export async function generateCircuit2(
  proverOutput: ProverOutputForRecursion,
  previousVk: string[],
): Promise<[string, Uint8Array]> {
  const witnessGenResult = await witnessGenCircuit2({
    public_inputs: proverOutput.public_inputs,
    key_hash: '0x0',
    proof: proverOutput.proof,
    verification_key: previousVk as FixedLengthArray<string, 128>,
  });
  logger('generated circuit 2');

  const bytecode = Circuit2.bytecode;
  const witness = witnessGenResult.witness;

  return [bytecode, witness];
}

// TODO: comptime lengths here restrict the prove function, because of need to cast below, because of generating the input types.
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
