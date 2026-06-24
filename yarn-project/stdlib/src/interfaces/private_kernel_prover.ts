import type {
  HidingKernelToPublicPrivateInputs,
  HidingKernelToRollupPrivateInputs,
  PrivateExecutionStep,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelInit2CircuitPrivateInputs,
  PrivateKernelInit3CircuitPrivateInputs,
  PrivateKernelInit4CircuitPrivateInputs,
  PrivateKernelInit5CircuitPrivateInputs,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInner2CircuitPrivateInputs,
  PrivateKernelInner3CircuitPrivateInputs,
  PrivateKernelInner4CircuitPrivateInputs,
  PrivateKernelInner5CircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelResetCircuitPrivateInputs,
  PrivateKernelResetTailCircuitPrivateInputs,
  PrivateKernelSimulateOutput,
  PrivateKernelTailCircuitPublicInputs,
} from '../kernel/index.js';
import type { ChonkProofWithPublicInputs } from '../proofs/chonk_proof.js';

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
   * Creates a proof output for a batched first iteration that processes two app calls in a single
   * private kernel circuit.
   *
   * @param privateKernelInputsInit2 - The batched private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInit2Output(
    privateKernelInputsInit2: PrivateKernelInit2CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the batched first kernel iteration (two app calls) without generating a proof.
   *
   * @param privateKernelInputsInit2 - The batched private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInit2(
    privateKernelInputsInit2: PrivateKernelInit2CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output for a batched first iteration that processes three app calls in a single
   * private kernel circuit.
   *
   * @param privateKernelInputsInit3 - The batched private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInit3Output(
    privateKernelInputsInit3: PrivateKernelInit3CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the batched first kernel iteration (three app calls) without generating a proof.
   *
   * @param privateKernelInputsInit3 - The batched private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInit3(
    privateKernelInputsInit3: PrivateKernelInit3CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output for a batched first iteration that processes four app calls in a single
   * private kernel circuit.
   *
   * @param privateKernelInputsInit4 - The batched private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInit4Output(
    privateKernelInputsInit4: PrivateKernelInit4CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the batched first kernel iteration (four app calls) without generating a proof.
   *
   * @param privateKernelInputsInit4 - The batched private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInit4(
    privateKernelInputsInit4: PrivateKernelInit4CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output for a batched first iteration that processes five app calls in a single
   * private kernel circuit.
   *
   * @param privateKernelInputsInit5 - The batched private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInit5Output(
    privateKernelInputsInit5: PrivateKernelInit5CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the batched first kernel iteration (five app calls) without generating a proof.
   *
   * @param privateKernelInputsInit5 - The batched private data structure for the initial iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInit5(
    privateKernelInputsInit5: PrivateKernelInit5CircuitPrivateInputs,
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
   * Creates a proof output for a batched inner iteration that processes two app calls in a single
   * private kernel circuit.
   *
   * @param privateKernelInputsInner2 - The batched private data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInner2Output(
    privateKernelInputsInner2: PrivateKernelInner2CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the batched inner kernel iteration (two app calls) without generating a proof.
   *
   * @param privateKernelInputsInner2 - The batched private data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInner2(
    privateKernelInputsInner2: PrivateKernelInner2CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output for a batched inner iteration that processes three app calls in a single
   * private kernel circuit.
   *
   * @param privateKernelInputsInner3 - The batched private data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInner3Output(
    privateKernelInputsInner3: PrivateKernelInner3CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the batched inner kernel iteration (three app calls) without generating a proof.
   *
   * @param privateKernelInputsInner3 - The batched private data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInner3(
    privateKernelInputsInner3: PrivateKernelInner3CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output for a batched inner iteration that processes four app calls in a single
   * private kernel circuit.
   *
   * @param privateKernelInputsInner4 - The batched private data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInner4Output(
    privateKernelInputsInner4: PrivateKernelInner4CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the batched inner kernel iteration (four app calls) without generating a proof.
   *
   * @param privateKernelInputsInner4 - The batched private data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInner4(
    privateKernelInputsInner4: PrivateKernelInner4CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Creates a proof output for a batched inner iteration that processes five app calls in a single
   * private kernel circuit.
   *
   * @param privateKernelInputsInner5 - The batched private data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and the kernel proof.
   */
  generateInner5Output(
    privateKernelInputsInner5: PrivateKernelInner5CircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>>;

  /**
   * Executes the batched inner kernel iteration (five app calls) without generating a proof.
   *
   * @param privateKernelInputsInner5 - The batched private data structure for the inner iteration.
   * @returns A Promise resolving to a ProofOutput object containing public inputs and an empty kernel proof.
   */
  simulateInner5(
    privateKernelInputsInner5: PrivateKernelInner5CircuitPrivateInputs,
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
   * Creates a proof output for the terminal reset+tail step. Dispatches to the rollup-bound or
   * public-bound family based on `inputs.isForPublic()`.
   *
   * @param privateKernelInputs - Reset hints, dimensions, and tail params.
   * @returns A Promise resolving to a ProofOutput containing the tail-shaped public inputs.
   */
  generateResetTailOutput(
    privateKernelInputs: PrivateKernelResetTailCircuitPrivateInputs,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>>;

  /**
   * Simulates the terminal reset+tail step without generating a proof.
   */
  simulateResetTail(
    privateKernelInputs: PrivateKernelResetTailCircuitPrivateInputs,
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
  createChonkProof(executionSteps: PrivateExecutionStep[]): Promise<ChonkProofWithPublicInputs>;

  /**
   * Compute the gate count for a given circuit.
   * @param bytecode - The circuit bytecode in gzipped bincode format
   * @param circuitName - The name of the circuit
   * @param circuitKind - The circuit kind expected by the Chonk backend
   * @returns A Promise resolving to the gate count
   */
  computeGateCountForCircuit(
    bytecode: Buffer,
    circuitName: string,
    circuitKind: PrivateExecutionStep['kind'],
  ): Promise<number>;
}
