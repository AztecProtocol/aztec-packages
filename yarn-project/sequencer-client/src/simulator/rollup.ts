import { CircuitSimulationStats } from '@aztec/circuit-types/stats';
import {
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  MergeRollupInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import {
  BaseRollupArtifact,
  MergeRollupArtifact,
  RootRollupArtifact,
  convertBaseRollupInputs,
  convertBaseRollupOutputs,
  convertMergeRollupInputs,
  convertMergeRollupOutputs,
  convertRootRollupInputs,
  convertRootRollupOutputs,
} from '@aztec/noir-protocol-circuits-types';

import { RollupSimulator } from './index.js';
import { SimulationProvider } from './simulation_provider.js';

/**
 * Implements the rollup circuit simulator.
 */
export class RealRollupCircuitSimulator implements RollupSimulator {
  private log = createDebugLogger('aztec:rollup-simulator');

  constructor(private simulationProvider: SimulationProvider) {}

  /**
   * Simulates the base rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async baseRollupCircuit(input: BaseRollupInputs): Promise<BaseOrMergeRollupPublicInputs> {
    const witnessMap = convertBaseRollupInputs(input);

    const [duration, witness] = await elapsed(
      async () => await this.simulationProvider.simulateCircuit(witnessMap, BaseRollupArtifact),
    );

    const result = convertBaseRollupOutputs(witness);

    this.log(`Simulated base rollup circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'base-rollup',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);

    return Promise.resolve(result);
  }
  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async mergeRollupCircuit(input: MergeRollupInputs): Promise<BaseOrMergeRollupPublicInputs> {
    const witnessMap = convertMergeRollupInputs(input);

    const [duration, witness] = await elapsed(
      async () => await this.simulationProvider.simulateCircuit(witnessMap, MergeRollupArtifact),
    );

    const result = convertMergeRollupOutputs(witness);

    this.log(`Simulated merge rollup circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'merge-rollup',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);

    return result;
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async rootRollupCircuit(input: RootRollupInputs): Promise<RootRollupPublicInputs> {
    const witnessMap = convertRootRollupInputs(input);

    const [duration, witness] = await elapsed(
      async () => await this.simulationProvider.simulateCircuit(witnessMap, RootRollupArtifact),
    );

    const result = convertRootRollupOutputs(witness);

    this.log(`Simulated root rollup circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'root-rollup',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);

    return result;
  }
}
