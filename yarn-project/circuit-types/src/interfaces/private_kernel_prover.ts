import {
  type ClientIvcProof,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  type VerificationKeyAsFields,
} from '@aztec/circuits.js';

import { type WitnessMap } from '@noir-lang/acvm_js';
import { z } from 'zod';

export const PrivateKernelProverProfileResultSchema = z.object({
  gateCounts: z.array(z.object({ circuitName: z.string(), gateCount: z.number() })),
});

export type PrivateKernelProverProfileResult = z.infer<typeof PrivateKernelProverProfileResultSchema>;

/**
 * Represents the output of the proof creation process for init and inner private kernel circuit.
 * Contains the public inputs required for the init and inner private kernel circuit and the generated proof.
 */
export type PrivateKernelSimulateOutput<
  PublicInputsType extends PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs,
> = {
  /** The public inputs required for the proof generation process. */
  publicInputs: PublicInputsType;

  clientIvcProof?: ClientIvcProof;

  verificationKey: VerificationKeyAsFields;

  outputWitness: WitnessMap;

  bytecode: Buffer;

  profileResult?: PrivateKernelProverProfileResult;
};

/**
 * Represents the output of the circuit simulation process for init and inner private kernel circuit.
 */
export type AppCircuitSimulateOutput = {
  verificationKey: VerificationKeyAsFields;
};

/**
 * PrivateKernelProver provides functionality to simulate and validate circuits, and retrieve
 * siloed commitments necessary for maintaining transaction privacy and security on the network.
 */
export interface PrivateKernelProver {
  /**
   * Creates a proof output for a given signed transaction request and private call data for the first iteration.
   *
   * @param privateKernelInputsInit - The private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInitOutput(
    privateKernelInputsInit: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the first kernel iteration without generating a proof.
   *
   * @param privateKernelInputsInit - The private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInit(
    privateKernelInputsInit: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output for a given previous kernel data and private call data for an inner iteration.
   *
   * @param privateKernelInputsInner - The private input data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInnerOutput(
    privateKernelInputsInner: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes an inner kernel iteration without generating a proof.
   *
   * @param privateKernelInputsInit - The private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInner(
    privateKernelInputsInner: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output by resetting the arrays using the reset circuit.
   *
   * @param privateKernelInputsTail - The private input data structure for the reset circuit.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateResetOutput(
    privateKernelInputsReset: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the reset circuit without generating a proof
   *
   * @param privateKernelInputsTail - The private input data structure for the reset circuit.
   * @returns A Promise resolving to a ProofOutput object containing public inputs an empty kernel proof.
   */
  simulateReset(
    privateKernelInputsReset: PrivateKernelResetCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output based on the last inner kernel iteration kernel data for the final ordering iteration.
   *
   * @param privateKernelInputsTail - The private input data structure for the final ordering iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateTailOutput(
    privateKernelInputsTail: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>>;

  /**
   * Executes the final ordering iteration circuit.
   *
   * @param privateKernelInputsTail - The private input data structure for the final ordering iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs an empty kernel proof.
   */
  simulateTail(
    privateKernelInputsTail: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>>;

  /**
   * Based of a program stack, create a folding proof.
   * @param acirs The program bytecode.
   * @param witnessStack The witnessses for each program bytecode.
   */
  createClientIvcProof(acirs: Buffer[], witnessStack: WitnessMap[]): Promise<ClientIvcProof>;

  /**
   * Compute the gate count for a given circuit.
   * @param bytecode - The circuit bytecode in gzipped bincode format
   * @param circuitName - The name of the circuit
   * @returns A Promise resolving to the gate count
   */
  computeGateCountForCircuit(bytecode: Buffer, circuitName: string): Promise<number>;
}
