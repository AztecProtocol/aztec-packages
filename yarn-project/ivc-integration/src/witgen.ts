import {
  AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH,
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  MEGA_HONK_VK_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { applyStringFormatting, createLogger } from '@aztec/foundation/log';
import { type ForeignCallInput, type ForeignCallOutput, Noir } from '@aztec/noir-noir_js';
import type { AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import type { RecursiveProof } from '@aztec/stdlib/proofs';
import { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import { strict as assert } from 'assert';

import MockAppCreatorCircuit from '../artifacts/app_creator.json' with { type: 'json' };
import MockAppReaderCircuit from '../artifacts/app_reader.json' with { type: 'json' };
import MockAppCreatorVk from '../artifacts/keys/app_creator.vk.data.json' with { type: 'json' };
import MockAppReaderVk from '../artifacts/keys/app_reader.vk.data.json' with { type: 'json' };
import MockPrivateKernelInitVk from '../artifacts/keys/mock_private_kernel_init.vk.data.json' with { type: 'json' };
import MockPrivateKernelInnerVk from '../artifacts/keys/mock_private_kernel_inner.vk.data.json' with { type: 'json' };
import MockPrivateKernelResetVk from '../artifacts/keys/mock_private_kernel_reset.vk.data.json' with { type: 'json' };
import MockPrivateKernelTailVk from '../artifacts/keys/mock_private_kernel_tail.vk.data.json' with { type: 'json' };
import MockRollupBasePrivateVk from '../artifacts/keys/mock_rollup_base_private.vk.data.json' with { type: 'json' };
import MockRollupBasePublicVk from '../artifacts/keys/mock_rollup_base_public.vk.data.json' with { type: 'json' };
import MockRollupMergeVk from '../artifacts/keys/mock_rollup_merge.vk.data.json' with { type: 'json' };
import MockRollupRootVk from '../artifacts/keys/mock_rollup_root.vk.data.json' with { type: 'json' };
import MockPrivateKernelInitCircuit from '../artifacts/mock_private_kernel_init.json' with { type: 'json' };
import MockPrivateKernelInnerCircuit from '../artifacts/mock_private_kernel_inner.json' with { type: 'json' };
import MockPrivateKernelResetCircuit from '../artifacts/mock_private_kernel_reset.json' with { type: 'json' };
import MockPrivateKernelTailCircuit from '../artifacts/mock_private_kernel_tail.json' with { type: 'json' };
import MockRollupBasePrivateCircuit from '../artifacts/mock_rollup_base_private.json' with { type: 'json' };
import MockRollupBasePublicCircuit from '../artifacts/mock_rollup_base_public.json' with { type: 'json' };
import MockRollupMergeCircuit from '../artifacts/mock_rollup_merge.json' with { type: 'json' };
import MockRollupRootCircuit from '../artifacts/mock_rollup_root.json' with { type: 'json' };
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
  VerificationKey,
} from './types/index.js';

// Re export the circuit jsons
export {
  MockAppCreatorCircuit,
  MockAppCreatorVk,
  MockAppReaderCircuit,
  MockAppReaderVk,
  MockPrivateKernelInitCircuit,
  MockPrivateKernelInitVk,
  MockPrivateKernelInnerCircuit,
  MockPrivateKernelInnerVk,
  MockPrivateKernelResetCircuit,
  MockPrivateKernelResetVk,
  MockPrivateKernelTailCircuit,
  MockPrivateKernelTailVk,
  MockRollupBasePrivateCircuit,
  MockRollupBasePrivateVk,
  MockRollupBasePublicCircuit,
  MockRollupBasePublicVk,
  MockRollupMergeCircuit,
  MockRollupMergeVk,
  MockRollupRootCircuit,
  MockRollupRootVk,
};

/* eslint-disable camelcase */

const log = createLogger('aztec:ivc-test');

export async function getVkAsFields({
  keyAsFields,
}: {
  keyAsFields: string[];
}): Promise<VerificationKey<typeof MEGA_HONK_VK_LENGTH_IN_FIELDS>> {
  const key = keyAsFields.map(f => Fr.fromString(f));
  const vk = await VerificationKeyAsFields.fromKey(key);
  return mapVerificationKeyToNoir(vk, MEGA_HONK_VK_LENGTH_IN_FIELDS);
}

export const MOCK_MAX_COMMITMENTS_PER_TX = 4;

function foreignCallHandler(name: string, args: ForeignCallInput[]): Promise<ForeignCallOutput[]> {
  if (name === 'debugLog') {
    assert(args.length === 3, 'expected 3 arguments for debugLog: msg, fields_length, fields');
    const [msgRaw, _ignoredFieldsSize, fields] = args;
    const msg: string = msgRaw.map(acvmField => String.fromCharCode(Fr.fromString(acvmField).toNumber())).join('');
    const fieldsFr: Fr[] = fields.map((field: string) => Fr.fromString(field));
    log.verbose('debug_log ' + applyStringFormatting(msg, fieldsFr));
  } else {
    throw new Error('Unexpected foreign call');
  }
  return Promise.resolve([]);
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

export async function generate3FunctionTestingIVCStack(): Promise<
  [string[], Uint8Array[], KernelPublicInputs, string[]]
> {
  const tx = {
    number_of_calls: '0x1',
  };

  // Witness gen app and kernels
  const appWitnessGenResult = await witnessGenCreatorAppMockCircuit({ commitments_to_create: ['0x1', '0x2'] });
  log.debug('generated app mock circuit witness');

  const initWitnessGenResult = await witnessGenMockPrivateKernelInitCircuit({
    app_inputs: appWitnessGenResult.publicInputs,
    tx,
    app_vk: await getVkAsFields(MockAppCreatorVk),
  });
  log.debug('generated mock private kernel init witness');

  const tailWitnessGenResult = await witnessGenMockPrivateKernelTailCircuit({
    prev_kernel_public_inputs: initWitnessGenResult.publicInputs,
    kernel_vk: await getVkAsFields(MockPrivateKernelInitVk),
  });
  log.debug('generated mock private kernel tail witness');

  // Create client IVC proof
  const bytecodes = [
    MockAppCreatorCircuit.bytecode,
    MockPrivateKernelInitCircuit.bytecode,
    MockPrivateKernelTailCircuit.bytecode,
  ];
  const witnessStack = [appWitnessGenResult.witness, initWitnessGenResult.witness, tailWitnessGenResult.witness];

  const precomputedVks = [
    MockAppCreatorVk.keyAsBytes,
    MockPrivateKernelInitVk.keyAsBytes,
    MockPrivateKernelTailVk.keyAsBytes,
  ];

  return [bytecodes, witnessStack, tailWitnessGenResult.publicInputs, precomputedVks];
}

export async function generate6FunctionTestingIVCStack(): Promise<
  [string[], Uint8Array[], KernelPublicInputs, string[]]
> {
  const tx = {
    number_of_calls: '0x2',
  };
  // Witness gen app and kernels
  const creatorAppWitnessGenResult = await witnessGenCreatorAppMockCircuit({ commitments_to_create: ['0x1', '0x2'] });
  const readerAppWitnessGenResult = await witnessGenReaderAppMockCircuit({ commitments_to_read: ['0x2', '0x0'] });

  const initWitnessGenResult = await witnessGenMockPrivateKernelInitCircuit({
    app_inputs: creatorAppWitnessGenResult.publicInputs,
    tx,
    app_vk: await getVkAsFields(MockAppCreatorVk),
  });
  const innerWitnessGenResult = await witnessGenMockPrivateKernelInnerCircuit({
    prev_kernel_public_inputs: initWitnessGenResult.publicInputs,
    app_inputs: readerAppWitnessGenResult.publicInputs,
    app_vk: await getVkAsFields(MockAppReaderVk),
    kernel_vk: await getVkAsFields(MockPrivateKernelInitVk),
  });

  const resetWitnessGenResult = await witnessGenMockPrivateKernelResetCircuit({
    prev_kernel_public_inputs: innerWitnessGenResult.publicInputs,
    commitment_read_hints: [
      '0x1', // Reader reads commitment 0x2, which is at index 1 of the created commitments
      MOCK_MAX_COMMITMENTS_PER_TX.toString(), // Pad with no-ops
      MOCK_MAX_COMMITMENTS_PER_TX.toString(),
      MOCK_MAX_COMMITMENTS_PER_TX.toString(),
    ],
    kernel_vk: await getVkAsFields(MockPrivateKernelInnerVk),
  });

  const tailWitnessGenResult = await witnessGenMockPrivateKernelTailCircuit({
    prev_kernel_public_inputs: resetWitnessGenResult.publicInputs,
    kernel_vk: await getVkAsFields(MockPrivateKernelResetVk),
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

  const precomputedVks = [
    MockAppCreatorVk.keyAsBytes,
    MockPrivateKernelInitVk.keyAsBytes,
    MockAppReaderVk.keyAsBytes,
    MockPrivateKernelInnerVk.keyAsBytes,
    MockPrivateKernelResetVk.keyAsBytes,
    MockPrivateKernelTailVk.keyAsBytes,
  ];

  return [bytecodes, witnessStack, tailWitnessGenResult.publicInputs, precomputedVks];
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

export function mapAvmPublicInputsToNoir(
  publicInputs: AvmCircuitPublicInputs,
): FixedLengthArray<string, typeof AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH> {
  const serialized = publicInputs.toFields();
  if (serialized.length != AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH) {
    throw new Error('Invalid number of AVM public inputs');
  }
  return serialized.map(x => x.toString()) as FixedLengthArray<string, typeof AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH>;
}
