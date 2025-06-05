import { bufferSchema, mapSchema } from '@aztec/foundation/schemas';
import type { WitnessMap } from '@aztec/noir-acvm_js';
import { serializeWitness } from '@aztec/noir-noirc_abi';

import { Encoder } from 'msgpackr';
import { z } from 'zod';

import type { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import type { PrivateKernelCircuitPublicInputs } from './private_kernel_circuit_public_inputs.js';
import type { PrivateKernelTailCircuitPublicInputs } from './private_kernel_tail_circuit_public_inputs.js';

export const PrivateExecutionStepSchema = z.object({
  functionName: z.string(),
  gateCount: z.number().optional(),
  bytecode: bufferSchema,
  witness: mapSchema(z.number(), z.string()),
  vk: bufferSchema,
  timings: z.object({
    witgen: z.number(),
    gateCount: z.number().optional(),
  }),
});

/**
 *  Represents either a simulated private kernel circuit or one of our application function circuits.
 */
export interface PrivateExecutionStep {
  functionName: string;
  gateCount?: number;
  bytecode: Buffer;
  witness: WitnessMap;
  /* TODO(https://github.com/AztecProtocol/barretenberg/issues/1328) this should get its own proper class. */
  vk: Buffer;
  timings: {
    witgen: number;
    gateCount?: number;
    oracles?: Record<string, { times: number[] }>;
  };
}

/** Represents the output of proven PrivateKernelSimulateOutput.*/
export interface PrivateKernelExecutionProofOutput<
  PublicInputsType extends PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs,
> {
  /** The public inputs used by the proof generation process. */
  publicInputs: PublicInputsType;
  /** The private IVC proof optimized for user devices. It will be consumed by an Aztec prover,
   * which recursively verifies it through the "tube" circuit.*/
  clientIvcProof: ClientIvcProof;
  vk: Buffer;
  /**
   * The trace the clientIvcProof corresponds to.
   * A trace of app circuits interleaved with private kernel circuits.
   * If simulate is ran with profiling mode, also includes gate counts.
   */
  executionSteps: PrivateExecutionStep[];
  /** Performance metrics */
  timings?: { proving: number };
}

export function serializePrivateExecutionSteps(steps: PrivateExecutionStep[]) {
  const stepToStruct = (step: PrivateExecutionStep) => {
    return {
      bytecode: step.bytecode,
      witness: serializeWitness(step.witness),
      vk: step.vk,
      functionName: step.functionName,
    };
  };
  return new Encoder({ useRecords: false }).pack(steps.map(stepToStruct));
}
