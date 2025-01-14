import { type CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS } from '@aztec/circuits.js';

import { type ForeignCallOutput, Noir } from '@noir-lang/noir_js';
import createDebug from 'debug';
import { ungzip } from 'pako';

import MockAppCreatorCircuit from '../artifacts/app_creator.json' assert { type: 'json' };
import MockAppReaderCircuit from '../artifacts/app_reader.json' assert { type: 'json' };
import MockAppCreatorVk from '../artifacts/keys/app_creator.vk.data.json' assert { type: 'json' };
import MockAppReaderVk from '../artifacts/keys/app_reader.vk.data.json' assert { type: 'json' };
import MockPrivateKernelInitVk from '../artifacts/keys/mock_private_kernel_init.vk.data.json' assert { type: 'json' };
import MockPrivateKernelInnerVk from '../artifacts/keys/mock_private_kernel_inner.vk.data.json' assert { type: 'json' };
import MockPrivateKernelResetVk from '../artifacts/keys/mock_private_kernel_reset.vk.data.json' assert { type: 'json' };
import MockPrivateKernelTailVk from '../artifacts/keys/mock_private_kernel_tail.vk.data.json' assert { type: 'json' };
import MockPrivateKernelInitCircuit from '../artifacts/mock_private_kernel_init.json' assert { type: 'json' };
import MockPrivateKernelInnerCircuit from '../artifacts/mock_private_kernel_inner.json' assert { type: 'json' };
import MockPrivateKernelResetCircuit from '../artifacts/mock_private_kernel_reset.json' assert { type: 'json' };
import MockPrivateKernelTailCircuit from '../artifacts/mock_private_kernel_tail.json' assert { type: 'json' };
import MockPublicBaseCircuit from '../artifacts/mock_public_base.json' assert { type: 'json' };
import type {
  AppCreatorInputType,
  AppPublicInputs,
  FixedLengthArray,
  KernelPublicInputs,
  MockPrivateKernelInitInputType,
  MockPrivateKernelTailInputType,
  MockPublicBaseInputType,
  PrivateKernelPublicInputs,
  u8,
} from './types/index.js';

// Re export the circuit jsons
export {
  MockAppCreatorCircuit,
  MockAppReaderCircuit,
  MockPrivateKernelInitCircuit,
  MockPrivateKernelInnerCircuit,
  MockPrivateKernelResetCircuit,
  MockPrivateKernelTailCircuit,
  MockPublicBaseCircuit,
  MockAppCreatorVk,
  MockAppReaderVk,
  MockPrivateKernelInitVk,
  MockPrivateKernelInnerVk,
  MockPrivateKernelResetVk,
  MockPrivateKernelTailVk,
};

const logger = createDebug('aztec:bb-bench');

/* eslint-disable camelcase */

export const MOCK_MAX_COMMITMENTS_PER_TX = 4;

function foreignCallHandler(): Promise<ForeignCallOutput[]> {
  throw new Error('Unexpected foreign call');
}

export interface WitnessGenResult<PublicInputsType> {
  witness: Uint8Array;
  publicInputs: PublicInputsType;
}

export async function witnessGenCreatorAppMockCircuit(
  args: AppCreatorInputType,
): Promise<WitnessGenResult<AppPublicInputs>> {
  const program = new Noir(MockAppCreatorCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as AppPublicInputs,
  };
}

export async function witnessGenMockPrivateKernelInitCircuit(
  args: MockPrivateKernelInitInputType,
): Promise<WitnessGenResult<PrivateKernelPublicInputs>> {
  const program = new Noir(MockPrivateKernelInitCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as PrivateKernelPublicInputs,
  };
}

export async function witnessGenMockPrivateKernelTailCircuit(
  args: MockPrivateKernelTailInputType,
): Promise<WitnessGenResult<KernelPublicInputs>> {
  const program = new Noir(MockPrivateKernelTailCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as KernelPublicInputs,
  };
}

export async function witnessGenMockPublicBaseCircuit(args: MockPublicBaseInputType): Promise<WitnessGenResult<u8>> {
  const program = new Noir(MockPublicBaseCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as u8,
  };
}

export function getVkAsFields(vk: {
  keyAsBytes: string;
  keyAsFields: string[];
}): FixedLengthArray<string, typeof CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS> {
  return vk.keyAsFields as FixedLengthArray<string, typeof CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
}

export async function generateCircuit(): Promise<[string, Uint8Array]> {
  // Witness gen app and kernels
  const appWitnessGenResult = await witnessGenCreatorAppMockCircuit({ commitments_to_create: ['0x1', '0x2'] });
  logger('generated app mock circuit witness');

  // Create client IVC proof
  const bytecode = MockAppCreatorCircuit.bytecode;
  const witness = appWitnessGenResult.witness;

  return [bytecode, witness];
}

export async function generate3FunctionTestingIVCStack(): Promise<[string[], Uint8Array[]]> {
  const tx = {
    number_of_calls: '0x1',
  };

  // Witness gen app and kernels
  const appWitnessGenResult = await witnessGenCreatorAppMockCircuit({ commitments_to_create: ['0x1', '0x2'] });
  logger('generated app mock circuit witness');

  const initWitnessGenResult = await witnessGenMockPrivateKernelInitCircuit({
    app_inputs: appWitnessGenResult.publicInputs,
    tx,
    app_vk: getVkAsFields(MockAppCreatorVk),
  });
  logger('generated mock private kernel init witness');

  const tailWitnessGenResult = await witnessGenMockPrivateKernelTailCircuit({
    prev_kernel_public_inputs: initWitnessGenResult.publicInputs,
    kernel_vk: getVkAsFields(MockPrivateKernelResetVk),
  });
  logger('generated mock private kernel tail witness');

  // Create client IVC proof
  const bytecodes = [
    MockAppCreatorCircuit.bytecode,
    MockPrivateKernelInitCircuit.bytecode,
    MockPrivateKernelTailCircuit.bytecode,
  ];
  const witnessStack = [appWitnessGenResult.witness, initWitnessGenResult.witness, tailWitnessGenResult.witness];

  return [bytecodes, witnessStack];
}

function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export async function proveThenVerifyAztecClient(
  bytecodes: string[],
  witnessStack: Uint8Array[],
  threads?: number,
): Promise<boolean> {
  const { AztecClientBackend } = await import('@aztec/bb.js');
  const backend = new AztecClientBackend(
    bytecodes.map(base64ToUint8Array).map((arr: Uint8Array) => ungzip(arr)),
    { threads },
  );
  try {
    const [proof, vk] = await backend.prove(witnessStack.map((arr: Uint8Array) => ungzip(arr)));
    const verified = await backend.verify(proof, vk);
    return verified;
  } finally {
    await backend.destroy();
  }
}

export async function proveThenVerifyUltraHonk(
  bytecode: string,
  witness: Uint8Array,
  threads?: number,
): Promise<boolean> {
  const { UltraHonkBackend, BarretenbergVerifier } = await import('@aztec/bb.js');
  const backend = new UltraHonkBackend(bytecode, { threads });
  try {
    logger(`computing the verification key (could be precomputed)...`);
    const vk = await backend.getVerificationKey();
    logger(`proving...`);
    const proof = await backend.generateProof(witness);
    logger(`done proving. verifying...`);
    const verifier = new BarretenbergVerifier({ threads });
    const verified = await verifier.verifyUltraHonkProof(proof, vk);
    logger(`verified: ${verified}`);
    await verifier.destroy();
    return verified;
  } finally {
    await backend.destroy();
  }
}
