/* eslint-disable camelcase */
import { createLogger } from '@aztec/foundation/log';
import { type ForeignCallOutput, Noir } from '@aztec/noir-noir_js';
import type { InputValue } from '@aztec/noir-noirc_abi';

// these files are generated
import Circuit1 from '../artifacts/circuit_1.json' with { type: 'json' };
import Circuit2 from '../artifacts/circuit_2.json' with { type: 'json' };
import Vk1 from '../artifacts/keys/circuit_1.vk.data.json' with { type: 'json' };
import Vk2 from '../artifacts/keys/circuit_2.vk.data.json' with { type: 'json' };
import type { FixedLengthArray } from './types/index.js';

export const logger = createLogger('aztec:bb-bench');

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
    },
    foreignCallHandler,
  );
  logger.info('generated circuit 1');
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
      z: '0xd00d',
    },
    foreignCallHandler,
  );
  logger.info('generated circuit 2');
  return [Circuit2.bytecode, witness, returnValue];
}

export type ProverOutputForRecursion = {
  proof: Uint8Array;
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
    logger.info(`proving...`);
    const proverOutput = await backend.generateProof(witness);
    logger.info(`done generating recursive proof artifacts.`);
    return {
      proof: proverOutput.proof,
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
    logger.debug(`proving...`);
    const proof = await backend.generateProof(witness);
    logger.debug(`done proving. verifying...`);
    const verifier = new BarretenbergVerifier({ threads });
    const verified = await verifier.verifyUltraHonkProof(proof, vk);
    logger.debug(`done verifying.`);
    await verifier.destroy();
    return verified;
  } finally {
    await backend.destroy();
  }
}

function hexStringToUint8Array(hex: string): Uint8Array {
  const length = hex.length / 2;
  const uint8Array = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    const byte = hex.substr(i * 2, 2);
    uint8Array[i] = parseInt(byte, 16);
  }

  return uint8Array;
}

export async function proveThenVerifyStack(): Promise<boolean> {
  logger.debug(`generating circuit and witness...`);
  const [bytecode1, witness1] = await generateCircuit1();
  logger.debug(`done generating circuit and witness. proving...`);
  const proverOutput = await proveCircuit1(bytecode1, witness1);
  logger.debug(`done proving. generating circuit 2 and witness...`);
  const [bytecode2, witness2] = await generateCircuit2(proverOutput, Vk1.keyAsFields);
  logger.debug(`done. generating circuit and witness. proving then verifying...`);
  const verified = await proveThenVerifyCircuit2(bytecode2, witness2, hexStringToUint8Array(Vk2.keyAsBytes));
  logger.debug(`verified? ${verified}`);
  return verified;
}
