import {
  AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH,
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  MEGA_VK_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { applyStringFormatting, createLogger } from '@aztec/foundation/log';
import { type ForeignCallInput, type ForeignCallOutput, Noir } from '@aztec/noir-noir_js';
import type { AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import type { RecursiveProof } from '@aztec/stdlib/proofs';
import { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import { strict as assert } from 'assert';

import MockAppCreatorCircuit from '../artifacts/app_creator.json' with { type: 'json' };
import MockAppReaderCircuit from '../artifacts/app_reader.json' with { type: 'json' };
import MockHidingCircuit from '../artifacts/mock_hiding.json' with { type: 'json' };
import MockPrivateKernelInitCircuit from '../artifacts/mock_private_kernel_init.json' with { type: 'json' };
import MockPrivateKernelInnerCircuit from '../artifacts/mock_private_kernel_inner.json' with { type: 'json' };
import MockPrivateKernelResetCircuit from '../artifacts/mock_private_kernel_reset.json' with { type: 'json' };
import MockPrivateKernelTailCircuit from '../artifacts/mock_private_kernel_tail.json' with { type: 'json' };
import MockRollupRootCircuit from '../artifacts/mock_rollup_root.json' with { type: 'json' };
import MockRollupTxBasePrivateCircuit from '../artifacts/mock_rollup_tx_base_private.json' with { type: 'json' };
import MockRollupTxBasePublicCircuit from '../artifacts/mock_rollup_tx_base_public.json' with { type: 'json' };
import MockRollupTxMergeCircuit from '../artifacts/mock_rollup_tx_merge.json' with { type: 'json' };
import type {
  AppCreatorInputType,
  AppPublicInputs,
  AppReaderInputType,
  FixedLengthArray,
  KernelPublicInputs,
  MockHidingInputType,
  MockPrivateKernelInitInputType,
  MockPrivateKernelInnerInputType,
  MockPrivateKernelResetInputType,
  MockPrivateKernelTailInputType,
  MockRollupRootInputType,
  MockRollupTxBasePrivateInputType,
  MockRollupTxBasePublicInputType,
  MockRollupTxMergeInputType,
  PrivateKernelPublicInputs,
  RollupPublicInputs,
  VerificationKey,
} from './types/index.js';

// Helper to extract VK from circuit artifact
function extractVkFromCircuit(circuit: any) {
  return {
    keyAsBytes: circuit.verificationKey.bytes,
    keyAsFields: circuit.verificationKey.fields,
  };
}

// Extract VKs from circuit artifacts
const MockAppCreatorVk = extractVkFromCircuit(MockAppCreatorCircuit);
const MockAppReaderVk = extractVkFromCircuit(MockAppReaderCircuit);
const MockPrivateKernelInitVk = extractVkFromCircuit(MockPrivateKernelInitCircuit);
const MockPrivateKernelInnerVk = extractVkFromCircuit(MockPrivateKernelInnerCircuit);
const MockPrivateKernelResetVk = extractVkFromCircuit(MockPrivateKernelResetCircuit);
const MockPrivateKernelTailVk = extractVkFromCircuit(MockPrivateKernelTailCircuit);
const MockHidingVk = extractVkFromCircuit(MockHidingCircuit);
const MockRollupTxBasePrivateVk = extractVkFromCircuit(MockRollupTxBasePrivateCircuit);
const MockRollupTxBasePublicVk = extractVkFromCircuit(MockRollupTxBasePublicCircuit);
const MockRollupTxMergeVk = extractVkFromCircuit(MockRollupTxMergeCircuit);
const MockRollupRootVk = extractVkFromCircuit(MockRollupRootCircuit);

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
  MockHidingCircuit,
  MockPrivateKernelTailVk,
  MockRollupTxBasePrivateCircuit,
  MockRollupTxBasePrivateVk,
  MockRollupTxBasePublicCircuit,
  MockRollupTxBasePublicVk,
  MockRollupTxMergeCircuit,
  MockRollupTxMergeVk,
  MockRollupRootCircuit,
  MockRollupRootVk,
};

/* eslint-disable camelcase */

const log = createLogger('aztec:ivc-test');

export async function getVkAsFields({
  keyAsFields,
}: {
  keyAsFields: string[];
}): Promise<VerificationKey<typeof MEGA_VK_LENGTH_IN_FIELDS>> {
  const key = keyAsFields.map(f => Fr.fromString(f));
  const vk = await VerificationKeyAsFields.fromKey(key);
  return mapVerificationKeyToNoir(vk, MEGA_VK_LENGTH_IN_FIELDS);
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

export async function witnessGenMockHidingCircuit(
  args: MockHidingInputType,
): Promise<WitnessGenResult<KernelPublicInputs>> {
  const program = new Noir(MockHidingCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as KernelPublicInputs,
  };
}

export async function witnessGenMockPublicBaseCircuit(
  args: MockRollupTxBasePublicInputType,
): Promise<WitnessGenResult<RollupPublicInputs>> {
  const program = new Noir(MockRollupTxBasePublicCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as RollupPublicInputs,
  };
}

export async function witnessGenMockRollupTxBasePrivateCircuit(
  args: MockRollupTxBasePrivateInputType,
): Promise<WitnessGenResult<RollupPublicInputs>> {
  const program = new Noir(MockRollupTxBasePrivateCircuit);
  const { witness, returnValue } = await program.execute(args, foreignCallHandler);
  return {
    witness,
    publicInputs: returnValue as RollupPublicInputs,
  };
}

export async function witnessGenMockRollupTxMergeCircuit(
  args: MockRollupTxMergeInputType,
): Promise<WitnessGenResult<RollupPublicInputs>> {
  const program = new Noir(MockRollupTxMergeCircuit);
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

export async function generateTestingIVCStack(
  // A call to the creator app creates 1 commitment. A tx can have at most 2 commitments.
  numCreatorAppCalls: number,
  // A call to the reader app creates 1 read request. A reset kernel will be run if there are 2 read requests in the
  // public inputs. All read requests must be cleared before running the tail kernel.
  numReaderAppCalls: number,
): Promise<[string[], Uint8Array[], KernelPublicInputs, string[]]> {
  if (numCreatorAppCalls > 2) {
    throw new Error('The creator app can only be called at most twice.');
  }

  const tx = {
    number_of_calls: `0x${(numCreatorAppCalls + numReaderAppCalls).toString(16)}`,
  };

  const witnessStack: Uint8Array[] = [];
  const bytecodes: string[] = [];
  const vks: string[] = [];
  let previousKernel: {
    publicInputs: PrivateKernelPublicInputs;
    keyAsFields: string[];
  };

  const createInit = async (appResult: WitnessGenResult<AppPublicInputs>, appVkAsFields: string[]) => {
    const result = await witnessGenMockPrivateKernelInitCircuit({
      app_inputs: appResult.publicInputs,
      tx,
      app_vk: await getVkAsFields({ keyAsFields: appVkAsFields }),
    });
    witnessStack.push(result.witness);
    bytecodes.push(MockPrivateKernelInitCircuit.bytecode);
    vks.push(MockPrivateKernelInitVk.keyAsBytes);
    previousKernel = {
      publicInputs: result.publicInputs,
      keyAsFields: MockPrivateKernelInitVk.keyAsFields,
    };
  };

  const createInner = async (appResult: WitnessGenResult<AppPublicInputs>, appVkAsFields: string[]) => {
    const result = await witnessGenMockPrivateKernelInnerCircuit({
      prev_kernel_public_inputs: previousKernel.publicInputs,
      kernel_vk: await getVkAsFields(previousKernel),
      app_inputs: appResult.publicInputs,
      app_vk: await getVkAsFields({ keyAsFields: appVkAsFields }),
    });
    witnessStack.push(result.witness);
    bytecodes.push(MockPrivateKernelInnerCircuit.bytecode);
    vks.push(MockPrivateKernelInnerVk.keyAsBytes);
    previousKernel = {
      publicInputs: result.publicInputs,
      keyAsFields: MockPrivateKernelInnerVk.keyAsFields,
    };
  };

  const createReset = async (commitmentToReset: string[]) => {
    const result = await witnessGenMockPrivateKernelResetCircuit({
      prev_kernel_public_inputs: previousKernel.publicInputs,
      kernel_vk: await getVkAsFields(previousKernel),
      commitment_read_hints: padArrayEnd(
        commitmentToReset.map(r => commitments.findIndex(c => c === r)!.toString(16)),
        MOCK_MAX_COMMITMENTS_PER_TX.toString(),
        4,
      ),
    });
    witnessStack.push(result.witness);
    bytecodes.push(MockPrivateKernelResetCircuit.bytecode);
    vks.push(MockPrivateKernelResetVk.keyAsBytes);
    previousKernel = {
      publicInputs: result.publicInputs,
      keyAsFields: MockPrivateKernelResetVk.keyAsFields,
    };
  };

  const commitments = ['0x1', '0x2'];
  for (let i = 0; i < numCreatorAppCalls; i++) {
    const result = await witnessGenCreatorAppMockCircuit({ commitments_to_create: [commitments[i], '0x0'] });
    witnessStack.push(result.witness);
    bytecodes.push(MockAppCreatorCircuit.bytecode);
    vks.push(MockAppCreatorVk.keyAsBytes);

    if (i === 0) {
      await createInit(result, MockAppCreatorVk.keyAsFields);
    } else {
      await createInner(result, MockAppCreatorVk.keyAsFields);
    }
  }

  let commitmentToReset: string[] = [];
  for (let i = 0; i < numReaderAppCalls; i++) {
    const commitmentToRead = commitments[Math.min(i, numCreatorAppCalls) % 2];
    const result = await witnessGenReaderAppMockCircuit({ commitments_to_read: [commitmentToRead, '0x0'] });
    witnessStack.push(result.witness);
    bytecodes.push(MockAppReaderCircuit.bytecode);
    vks.push(MockAppReaderVk.keyAsBytes);
    commitmentToReset.push(commitmentToRead);

    if (i === 0 && !numCreatorAppCalls) {
      await createInit(result, MockAppReaderVk.keyAsFields);
    } else {
      await createInner(result, MockAppReaderVk.keyAsFields);
    }
    if (i % 2 === 0 || i === numReaderAppCalls - 1) {
      await createReset(commitmentToReset);
      commitmentToReset = [];
    }
  }

  const tailWitnessGenResult = await witnessGenMockPrivateKernelTailCircuit({
    prev_kernel_public_inputs: previousKernel!.publicInputs,
    kernel_vk: await getVkAsFields(previousKernel!),
  });
  witnessStack.push(tailWitnessGenResult.witness);
  bytecodes.push(MockPrivateKernelTailCircuit.bytecode);
  vks.push(MockPrivateKernelTailVk.keyAsBytes);

  const hidingWitnessGenResult = await witnessGenMockHidingCircuit({
    prev_kernel_public_inputs: tailWitnessGenResult.publicInputs,
    kernel_vk: await getVkAsFields(MockPrivateKernelTailVk),
  });
  witnessStack.push(hidingWitnessGenResult.witness);
  bytecodes.push(MockHidingCircuit.bytecode);
  vks.push(MockHidingVk.keyAsBytes);

  return [bytecodes, witnessStack, hidingWitnessGenResult.publicInputs, vks];
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
    throw new Error(`Verification key length ${len} does not match expected length ${vk.key.length}`);
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
