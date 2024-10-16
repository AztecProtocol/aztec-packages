import { type CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS } from '@aztec/circuits.js';

import { type ForeignCallOutput, Noir } from '@noir-lang/noir_js';

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
import MockPublicKernelCircuit from '../artifacts/mock_public_kernel.json' assert { type: 'json' };
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
  MockPublicKernelInputType,
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
  MockPublicKernelCircuit,
  MockAppCreatorVk,
  MockAppReaderVk,
  MockPrivateKernelInitVk,
  MockPrivateKernelInnerVk,
  MockPrivateKernelResetVk,
  MockPrivateKernelTailVk,
};

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

export async function witnessGenMockPublicKernelCircuit(
  args: MockPublicKernelInputType,
): Promise<WitnessGenResult<u8>> {
  const program = new Noir(MockPublicKernelCircuit);
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
