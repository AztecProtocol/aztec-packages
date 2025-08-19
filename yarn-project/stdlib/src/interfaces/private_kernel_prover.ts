import type {
  HidingKernelToPublicPrivateInputs,
  HidingKernelToRollupPrivateInputs,
  PrivateExecutionStep,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelResetCircuitPrivateInputs,
  PrivateKernelSimulateOutput,
  PrivateKernelTailCircuitPrivateInputs,
  PrivateKernelTailCircuitPublicInputs,
} from '../kernel/index.js';
import type { ClientIvcProof } from '../proofs/client_ivc_proof.js';

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

  generateHidingToRollupOutput(
    inputs: HidingKernelToRollupPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>>;

  generateHidingToPublicOutput(
    inputs: HidingKernelToPublicPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>>;

  /**
   * Based of a program stack, create a folding proof.
   * @param acirs The program bytecode.
   * @param witnessStack The witnessses for each program bytecode.
   */
  createClientIvcProof(executionSteps: PrivateExecutionStep[]): Promise<ClientIvcProof>;

  /**
   * Compute the gate count for a given circuit.
   * @param bytecode - The circuit bytecode in gzipped bincode format
   * @param circuitName - The name of the circuit
   * @returns A Promise resolving to the gate count
   */
  computeGateCountForCircuit(bytecode: Buffer, circuitName: string): Promise<number>;
}
