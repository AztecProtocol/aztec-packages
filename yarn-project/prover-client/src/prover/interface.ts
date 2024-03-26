import {
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  MergeRollupInputs,
  ParityPublicInputs,
  Proof,
  PublicCircuitPublicInputs,
  PublicKernelCircuitPublicInputs,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
} from '@aztec/circuits.js';

/**
 * Generates proofs for parity and rollup circuits.
 */
export interface CircuitProver {
  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBaseParityProof(inputs: BaseParityInputs): Promise<[Proof, ParityPublicInputs]>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   * @param publicInputs - Public inputs of the circuit obtained via simulation, modified by this call.
   */
  getRootParityProof(inputs: RootParityInputs): Promise<[Proof, ParityPublicInputs]>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBaseRollupProof(input: BaseRollupInputs): Promise<[Proof, BaseOrMergeRollupPublicInputs]>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   * @param publicInputs - Public inputs of the circuit obtained via simulation, modified by this call.
   */
  getMergeRollupProof(input: MergeRollupInputs): Promise<[Proof, BaseOrMergeRollupPublicInputs]>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   * @param publicInputs - Public inputs of the circuit obtained via simulation, modified by this call.
   */
  getRootRollupProof(input: RootRollupInputs): Promise<[Proof, RootRollupPublicInputs]>;
}

/**
 * Generates proofs for the public and public kernel circuits.
 */
export interface PublicProver {
  /**
   * Creates a proof for the given input.
   * @param publicInputs - Public inputs obtained via simulation.
   */
  getPublicCircuitProof(publicInputs: PublicCircuitPublicInputs): Promise<Proof>;

  /**
   * Creates a proof for the given input.
   * @param publicInputs - Public inputs obtained via simulation.
   */
  getPublicKernelCircuitProof(publicInputs: PublicKernelCircuitPublicInputs): Promise<Proof>;
}
