import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_V2_PUBLIC_INPUTS_FLATTENED_SIZE,
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { type ForeignCallOutput, Noir } from '@aztec/noir-noir_js';
import type { AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import type { RecursiveProof } from '@aztec/stdlib/proofs';
import type { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import createDebug from 'debug';

import MockAppCreatorCircuit from '../artifacts/app_creator.json' assert { type: 'json' };
import MockAppReaderCircuit from '../artifacts/app_reader.json' assert { type: 'json' };
import MockAppCreatorVk from '../artifacts/keys/app_creator.vk.data.json' assert { type: 'json' };
import MockAppReaderVk from '../artifacts/keys/app_reader.vk.data.json' assert { type: 'json' };
import MockPrivateKernelInitVk from '../artifacts/keys/mock_private_kernel_init.vk.data.json' assert { type: 'json' };
import MockPrivateKernelInnerVk from '../artifacts/keys/mock_private_kernel_inner.vk.data.json' assert { type: 'json' };
import MockPrivateKernelResetVk from '../artifacts/keys/mock_private_kernel_reset.vk.data.json' assert { type: 'json' };
import MockPrivateKernelTailVk from '../artifacts/keys/mock_private_kernel_tail.vk.data.json' assert { type: 'json' };
import MockRollupBasePrivateVk from '../artifacts/keys/mock_rollup_base_private.vk.data.json' assert { type: 'json' };
import MockRollupBasePublicVk from '../artifacts/keys/mock_rollup_base_public.vk.data.json' assert { type: 'json' };
import MockRollupMergeVk from '../artifacts/keys/mock_rollup_merge.vk.data.json' assert { type: 'json' };
import MockRollupRootVk from '../artifacts/keys/mock_rollup_root.vk.data.json' assert { type: 'json' };
import MockPrivateKernelInitCircuit from '../artifacts/mock_private_kernel_init.json' assert { type: 'json' };
import MockPrivateKernelInnerCircuit from '../artifacts/mock_private_kernel_inner.json' assert { type: 'json' };
import MockPrivateKernelResetCircuit from '../artifacts/mock_private_kernel_reset.json' assert { type: 'json' };
import MockPrivateKernelTailCircuit from '../artifacts/mock_private_kernel_tail.json' assert { type: 'json' };
import MockRollupBasePrivateCircuit from '../artifacts/mock_rollup_base_private.json' assert { type: 'json' };
import MockRollupBasePublicCircuit from '../artifacts/mock_rollup_base_public.json' assert { type: 'json' };
import MockRollupMergeCircuit from '../artifacts/mock_rollup_merge.json' assert { type: 'json' };
import MockRollupRootCircuit from '../artifacts/mock_rollup_root.json' assert { type: 'json' };
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
  MockRollupBasePrivateInputType,
  MockRollupBasePublicInputType,
  MockRollupMergeInputType,
  MockRollupRootInputType,
  PrivateKernelPublicInputs,
  RollupPublicInputs,
} from './types/index.js';

// Re export the circuit jsons
export {
  MockAppCreatorCircuit,
  MockAppReaderCircuit,
  MockPrivateKernelInitCircuit,
  MockPrivateKernelInnerCircuit,
  MockPrivateKernelResetCircuit,
  MockPrivateKernelTailCircuit,
  MockRollupBasePublicCircuit,
  MockRollupBasePrivateCircuit,
  MockRollupMergeCircuit,
  MockRollupRootCircuit,
  MockAppCreatorVk,
  MockAppReaderVk,
  MockPrivateKernelInitVk,
  MockPrivateKernelInnerVk,
  MockPrivateKernelResetVk,
  MockPrivateKernelTailVk,
  MockRollupBasePublicVk,
  MockRollupBasePrivateVk,
  MockRollupMergeVk,
  MockRollupRootVk,
};

/* eslint-disable camelcase */

const logger = createDebug('aztec:ivc-test');

export function getVkAsFields(vk: {
  keyAsBytes: string;
  keyAsFields: string[];
}): FixedLengthArray<string, typeof CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS> {
  return vk.keyAsFields as FixedLengthArray<string, typeof CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
}

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

export async function witnessGenMockPublicBaseCircuit(
  args: MockRollupBasePublicInputType,
): Promise<WitnessGenResult<RollupPublicInputs>> {
  const program = new Noir(MockRollupBasePublicCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as RollupPublicInputs,
  };
}

export async function witnessGenMockRollupBasePrivateCircuit(
  args: MockRollupBasePrivateInputType,
): Promise<WitnessGenResult<RollupPublicInputs>> {
  const program = new Noir(MockRollupBasePrivateCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as RollupPublicInputs,
  };
}

export async function witnessGenMockRollupMergeCircuit(
  args: MockRollupMergeInputType,
): Promise<WitnessGenResult<RollupPublicInputs>> {
  const program = new Noir(MockRollupMergeCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as RollupPublicInputs,
  };
}

export async function witnessGenMockRollupRootCircuit(
  args: MockRollupRootInputType,
): Promise<WitnessGenResult<RollupPublicInputs>> {
  const program = new Noir(MockRollupRootCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as RollupPublicInputs,
  };
}

export async function generate3FunctionTestingIVCStack(): Promise<[string[], Uint8Array[], KernelPublicInputs]> {
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

  return [bytecodes, witnessStack, tailWitnessGenResult.publicInputs];
}

export async function generate6FunctionTestingIVCStack(): Promise<[string[], Uint8Array[], KernelPublicInputs]> {
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

  return [bytecodes, witnessStack, tailWitnessGenResult.publicInputs];
}

export function mapRecursiveProofToNoir<N extends number>(proof: RecursiveProof<N>): FixedLengthArray<string, N> {
  return proof.proof.map(field => field.toString()) as FixedLengthArray<string, N>;
}

export function mapAvmProofToNoir(proof: Fr[]): FixedLengthArray<string, typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED> {
  if (proof.length != AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED) {
    throw new Error('Invalid number of AVM proof fields');
  }
  return proof.map(field => field.toString()) as FixedLengthArray<string, typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>;
}

export function mapVerificationKeyToNoir<N extends number>(
  vk: VerificationKeyAsFields,
  len: N,
): {
  key: FixedLengthArray<string, N>;
  hash: string;
} {
  if (len !== vk.key.length) {
    throw new Error('Verification key length does not match expected length');
  }
  return {
    key: vk.key.map(field => field.toString()) as FixedLengthArray<string, N>,
    hash: vk.hash.toString(),
  };
}

export function mapAvmVerificationKeyToNoir(
  vk: Fr[],
): FixedLengthArray<string, typeof AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED> {
  if (vk.length != AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED) {
    throw new Error('Invalid number of AVM verification key fields');
  }
  return vk.map(field => field.toString()) as FixedLengthArray<
    string,
    typeof AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED
  >;
}

export function mapAvmPublicInputsToNoir(
  publicInputs: AvmCircuitPublicInputs,
): FixedLengthArray<string, typeof AVM_V2_PUBLIC_INPUTS_FLATTENED_SIZE> {
  // TODO: Currently the recursive verifier only expects a single public input, the reverted field.
  const serialized = [new Fr(publicInputs.reverted)];
  if (serialized.length != AVM_V2_PUBLIC_INPUTS_FLATTENED_SIZE) {
    throw new Error('Invalid number of AVM public inputs');
  }
  return serialized.map(x => x.toString()) as FixedLengthArray<string, typeof AVM_V2_PUBLIC_INPUTS_FLATTENED_SIZE>;
}
