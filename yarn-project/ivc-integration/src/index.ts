import { type CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS } from '@aztec/circuits.js';

import { type ForeignCallOutput, Noir } from '@noir-lang/noir_js';
import { ungzip } from 'pako';

import MockAppCreatorCircuit from '../artifacts/app_creator.json' with { type: 'json' };
import MockAppReaderCircuit from '../artifacts/app_reader.json' with { type: 'json' };
import MockAppCreatorVk from '../artifacts/keys/app_creator.vk.data.json' with { type: 'json' };
import MockAppReaderVk from '../artifacts/keys/app_reader.vk.data.json' with { type: 'json' };
import MockPrivateKernelInitVk from '../artifacts/keys/mock_private_kernel_init.vk.data.json' with { type: 'json' };
import MockPrivateKernelInnerVk from '../artifacts/keys/mock_private_kernel_inner.vk.data.json' with { type: 'json' };
import MockPrivateKernelResetVk from '../artifacts/keys/mock_private_kernel_reset.vk.data.json' with { type: 'json' };
import MockPrivateKernelTailVk from '../artifacts/keys/mock_private_kernel_tail.vk.data.json' with { type: 'json' };
import MockPrivateKernelInitCircuit from '../artifacts/mock_private_kernel_init.json' with { type: 'json' };
import MockPrivateKernelInnerCircuit from '../artifacts/mock_private_kernel_inner.json' with { type: 'json' };
import MockPrivateKernelResetCircuit from '../artifacts/mock_private_kernel_reset.json' with { type: 'json' };
import MockPrivateKernelTailCircuit from '../artifacts/mock_private_kernel_tail.json' with { type: 'json' };
import MockPublicBaseCircuit from '../artifacts/mock_public_base.json' with { type: 'json' };
import type {
  AppCreatorInputType,
  AppPublicInputs,
  AppReaderInputType,
  FixedLengthArray,
  KernelPublicInputs,
  MockPrivateKernelInitInputType,
  MockPrivateKernelInnerInputType,
  MockPrivateKernelResetInputType,
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

export const mockLogger = {
  debug: (msg: string, data: any) => console.log(msg, data),
  info: (msg: string, data: any) => console.log(msg, data),
  warn: (msg: string, data: any) => console.log(msg, data),
  error: (msg: string, data: any) => console.error(msg, data),
  silent: (msg: string, data: any) => console.log(msg, data),
  verbose: (msg: string, data: any) => console.log(msg, data),
};

const logger = mockLogger;

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

export async function witnessGenReaderAppMockCircuit(
  args: AppReaderInputType,
): Promise<WitnessGenResult<AppPublicInputs>> {
  const program = new Noir(MockAppReaderCircuit);
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

export async function witnessGenMockPrivateKernelInnerCircuit(
  args: MockPrivateKernelInnerInputType,
): Promise<WitnessGenResult<PrivateKernelPublicInputs>> {
  const program = new Noir(MockPrivateKernelInnerCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as PrivateKernelPublicInputs,
  };
}

export async function witnessGenMockPrivateKernelResetCircuit(
  args: MockPrivateKernelResetInputType,
): Promise<WitnessGenResult<PrivateKernelPublicInputs>> {
  const program = new Noir(MockPrivateKernelResetCircuit);
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

export async function generate3FunctionTestingIVCStack(): Promise<[string[], Uint8Array[]]> {
  const tx = {
    number_of_calls: '0x1',
  };

  // Witness gen app and kernels
  const appWitnessGenResult = await witnessGenCreatorAppMockCircuit({ commitments_to_create: ['0x1', '0x2'] });
  logger.debug('msg', 'generated app mock circuit witness');

  const initWitnessGenResult = await witnessGenMockPrivateKernelInitCircuit({
    app_inputs: appWitnessGenResult.publicInputs,
    tx,
    app_vk: getVkAsFields(MockAppCreatorVk),
  });
  logger.debug('msg', 'generated mock private kernel init witness');

  const tailWitnessGenResult = await witnessGenMockPrivateKernelTailCircuit({
    prev_kernel_public_inputs: initWitnessGenResult.publicInputs,
    kernel_vk: getVkAsFields(MockPrivateKernelResetVk),
  });
  logger.debug('msg', 'generated mock private kernel tail witness');

  // Create client IVC proof
  const bytecodes = [
    MockAppCreatorCircuit.bytecode,
    MockPrivateKernelInitCircuit.bytecode,
    MockPrivateKernelTailCircuit.bytecode,
  ];
  const witnessStack = [appWitnessGenResult.witness, initWitnessGenResult.witness, tailWitnessGenResult.witness];

  return [bytecodes, witnessStack];
}

export async function generate6FunctionTestingIVCStack(): Promise<[string[], Uint8Array[]]> {
  const tx = {
    number_of_calls: '0x2',
  };
  // Witness gen app and kernels
  const creatorAppWitnessGenResult = await witnessGenCreatorAppMockCircuit({ commitments_to_create: ['0x1', '0x2'] });
  const readerAppWitnessGenResult = await witnessGenReaderAppMockCircuit({ commitments_to_read: ['0x2', '0x0'] });

  const initWitnessGenResult = await witnessGenMockPrivateKernelInitCircuit({
    app_inputs: creatorAppWitnessGenResult.publicInputs,
    tx,
    app_vk: getVkAsFields(MockAppCreatorVk),
  });
  const innerWitnessGenResult = await witnessGenMockPrivateKernelInnerCircuit({
    prev_kernel_public_inputs: initWitnessGenResult.publicInputs,
    app_inputs: readerAppWitnessGenResult.publicInputs,
    app_vk: getVkAsFields(MockAppReaderVk),
    kernel_vk: getVkAsFields(MockPrivateKernelInitVk),
  });

  const resetWitnessGenResult = await witnessGenMockPrivateKernelResetCircuit({
    prev_kernel_public_inputs: innerWitnessGenResult.publicInputs,
    commitment_read_hints: [
      '0x1', // Reader reads commitment 0x2, which is at index 1 of the created commitments
      MOCK_MAX_COMMITMENTS_PER_TX.toString(), // Pad with no-ops
      MOCK_MAX_COMMITMENTS_PER_TX.toString(),
      MOCK_MAX_COMMITMENTS_PER_TX.toString(),
    ],
    kernel_vk: getVkAsFields(MockPrivateKernelInnerVk),
  });

  const tailWitnessGenResult = await witnessGenMockPrivateKernelTailCircuit({
    prev_kernel_public_inputs: resetWitnessGenResult.publicInputs,
    kernel_vk: getVkAsFields(MockPrivateKernelResetVk),
  });

  // Create client IVC proof
  const bytecodes = [
    MockAppCreatorCircuit.bytecode,
    MockPrivateKernelInitCircuit.bytecode,
    MockAppReaderCircuit.bytecode,
    MockPrivateKernelInnerCircuit.bytecode,
    MockPrivateKernelResetCircuit.bytecode,
    MockPrivateKernelTailCircuit.bytecode,
  ];
  const witnessStack = [
    creatorAppWitnessGenResult.witness,
    initWitnessGenResult.witness,
    readerAppWitnessGenResult.witness,
    innerWitnessGenResult.witness,
    resetWitnessGenResult.witness,
    tailWitnessGenResult.witness,
  ];

  return [bytecodes, witnessStack];
}

export function base64ToUint8Array(base64: string): Uint8Array {
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

  const [proof, vk] = await backend.prove(witnessStack.map((arr: Uint8Array) => ungzip(arr)));
  const verified = await backend.verify(proof, vk);
  await backend.destroy();
  return verified;
}
