import { type ForeignCallOutput, Noir } from '@noir-lang/noir_js';
import createDebug from 'debug';

import FirstCircuit from '../artifacts/first.json' assert { type: 'json' };
import SecondCircuit from '../artifacts/second.json' assert { type: 'json' };
import type { FirstInputType, FixedLengthArray, SecondInputType } from './types/index.js';

export const logger = createDebug('aztec:bb-bench');

/* eslint-disable camelcase */

export const MOCK_MAX_COMMITMENTS_PER_TX = 4;

function foreignCallHandler(): Promise<ForeignCallOutput[]> {
  throw new Error('Unexpected foreign call');
}

export interface WitnessGenResult<PublicInputsType> {
  witness: Uint8Array;
  publicInputs: PublicInputsType;
}

export type u8 = string;

export async function witnessGenFirstCircuit(args: FirstInputType): Promise<WitnessGenResult<u8>> {
  const program = new Noir(FirstCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as u8,
  };
}

export async function witnessGenSecondCircuit(args: SecondInputType): Promise<WitnessGenResult<u8>> {
  const program = new Noir(SecondCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as u8,
  };
}

export async function generateFirstCircuit(): Promise<[string, Uint8Array]> {
  const witnessGenResult = await witnessGenFirstCircuit({
    x: '0x1',
    y: '0x2',
  });
  logger('generated first circuit');

  const bytecode = FirstCircuit.bytecode;
  const witness = witnessGenResult.witness;

  return [bytecode, witness];
}

export async function generateSecondCircuit(
  proverOutput: ProverOutputForRecursion,
  previousVk: string[],
): Promise<[string, Uint8Array]> {
  const witnessGenResult = await witnessGenSecondCircuit({
    public_inputs: proverOutput.public_inputs,
    // public_inputs: proverOutput.public_inputs.slice(0, -16) as FixedLengthArray<string, 1>,
    key_hash: '0x0',
    proof: proverOutput.proof,
    verification_key: previousVk as FixedLengthArray<string, 128>,
  });
  logger('generated second circuit');

  const bytecode = SecondCircuit.bytecode;
  const witness = witnessGenResult.witness;

  return [bytecode, witness];
}

export type ProverOutputForRecursion = {
  proof: FixedLengthArray<string, 459>;
  public_inputs: FixedLengthArray<string, 1>;
  // public_inputs: FixedLengthArray<string, 17>;
};

export async function proveUltraHonk(
  bytecode: string,
  witness: Uint8Array,
  threads?: number,
): Promise<ProverOutputForRecursion> {
  const { UltraHonkBackend } = await import('@aztec/bb.js');
  const backend = new UltraHonkBackend(bytecode, { threads: threads }, { recursive: true });
  try {
    logger(`proving...`);
    const proverOutput = await backend.generateProof(witness);
    logger(`done proving. generating recursive proof artifacts...`);
    const artifacts = await backend.generateRecursiveProofArtifacts(proverOutput.proof);
    logger(`done generating recursive proof artifacts.`);
    return {
      proof: artifacts.proofAsFields as FixedLengthArray<string, 459>,
      public_inputs: proverOutput.publicInputs as FixedLengthArray<string, 1>,
      // public_inputs: proverOutput.publicInputs as FixedLengthArray<string, 17>,
    };
  } finally {
    await backend.destroy();
  }
}

export async function proveThenVerifyUltraHonk(
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
    logger(`done verifying. verified: ${verified}`);
    await verifier.destroy();
    return verified;
  } finally {
    await backend.destroy();
  }
}
