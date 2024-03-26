import { CircuitSimulationStats } from '@aztec/circuit-types/stats';
import {
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  MergeRollupInputs,
  ParityPublicInputs,
  Proof,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  makeEmptyProof,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import {
  BaseParityArtifact,
  MergeRollupArtifact,
  RootParityArtifact,
  RootRollupArtifact,
  SimulatedBaseRollupArtifact,
  convertBaseParityInputsToWitnessMap,
  convertBaseParityOutputsFromWitnessMap,
  convertBaseRollupInputsToWitnessMap,
  convertBaseRollupOutputsFromWitnessMap,
  convertMergeRollupInputsToWitnessMap,
  convertMergeRollupOutputsFromWitnessMap,
  convertRootParityInputsToWitnessMap,
  convertRootParityOutputsFromWitnessMap,
  convertRootRollupInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types';
import { SimulationProvider, WASMSimulator } from '@aztec/simulator';

import { CircuitProver } from './interface.js';

/**
 * A class for use in testing situations (e2e, unit test etc)
 * Simulates circuits using the most efficient method and performs no proving
 */
export class TestCircuitProver implements CircuitProver {
  private wasmSimulator = new WASMSimulator();

  constructor(
    private simulationProvider: SimulationProvider,
    private logger = createDebugLogger('aztec:test-prover'),
  ) {}

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getBaseParityProof(inputs: BaseParityInputs): Promise<[Proof, ParityPublicInputs]> {
    const witnessMap = convertBaseParityInputsToWitnessMap(inputs);

    const witness = await this.simulationProvider.simulateCircuit(witnessMap, BaseParityArtifact);

    const result = convertBaseParityOutputsFromWitnessMap(witness);

    return Promise.resolve([makeEmptyProof(), result]);
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  public async getRootParityProof(inputs: RootParityInputs): Promise<[Proof, ParityPublicInputs]> {
    const witnessMap = convertRootParityInputsToWitnessMap(inputs);

    const witness = await this.simulationProvider.simulateCircuit(witnessMap, RootParityArtifact);

    const result = convertRootParityOutputsFromWitnessMap(witness);

    return Promise.resolve([makeEmptyProof(), result]);
  }

  /**
   * Simulates the base rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getBaseRollupProof(input: BaseRollupInputs): Promise<[Proof, BaseOrMergeRollupPublicInputs]> {
    const witnessMap = convertBaseRollupInputsToWitnessMap(input);

    const witness = await this.simulationProvider.simulateCircuit(witnessMap, SimulatedBaseRollupArtifact);

    const result = convertBaseRollupOutputsFromWitnessMap(witness);

    return Promise.resolve([makeEmptyProof(), result]);
  }
  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getMergeRollupProof(input: MergeRollupInputs): Promise<[Proof, BaseOrMergeRollupPublicInputs]> {
    const witnessMap = convertMergeRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(witnessMap, MergeRollupArtifact);

    const result = convertMergeRollupOutputsFromWitnessMap(witness);

    return Promise.resolve([makeEmptyProof(), result]);
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async getRootRollupProof(input: RootRollupInputs): Promise<[Proof, RootRollupPublicInputs]> {
    const witnessMap = convertRootRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const [duration, witness] = await elapsed(() => this.wasmSimulator.simulateCircuit(witnessMap, RootRollupArtifact));

    const result = convertRootRollupOutputsFromWitnessMap(witness);

    this.logger(`Simulated root rollup circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'root-rollup',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return Promise.resolve([makeEmptyProof(), result]);
  }
}
