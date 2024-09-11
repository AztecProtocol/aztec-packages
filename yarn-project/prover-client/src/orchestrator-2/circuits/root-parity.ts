import { ProvingRequestType } from '@aztec/circuit-types';
import {
  NESTED_RECURSIVE_PROOF_LENGTH,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type ParityPublicInputs,
  type RECURSIVE_PROOF_LENGTH,
  RootParityInput,
  RootParityInputs,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { memoize } from '@aztec/foundation/decorators';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { awaitTuple, mapTuple } from '@aztec/foundation/serialize';

import { type OrchestratorContext , type Circuit } from '../types.js';

export class RootParityCircuit implements Circuit<typeof ProvingRequestType.ROOT_PARITY> {
  private readonly simulationInputs = makeTuple(NUM_BASE_PARITY_PER_ROOT_PARITY, () =>
    promiseWithResolvers<ParityPublicInputs>(),
  );
  private readonly provingInputs = makeTuple(NUM_BASE_PARITY_PER_ROOT_PARITY, () =>
    promiseWithResolvers<RootParityInput<typeof RECURSIVE_PROOF_LENGTH>>(),
  );

  constructor(private context: OrchestratorContext) {}

  public setNestedSimulation(input: ParityPublicInputs, index: number) {
    this.checkIndex(index);
    this.simulationInputs[index].resolve(input);
  }

  public setNestedProof(input: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>, index: number) {
    this.checkIndex(index);
    this.provingInputs[index].resolve(input);
  }

  private checkIndex(index: number) {
    if (index >= NUM_BASE_PARITY_PER_ROOT_PARITY) {
      throw new Error('Invalid child parity index.');
    }
  }

  private async getSimulationInputs() {
    const inputs = await awaitTuple(
      mapTuple(this.simulationInputs, input =>
        input.promise.then(child => RootParityInput.withEmptyProof(child, NESTED_RECURSIVE_PROOF_LENGTH)),
      ),
    );
    return new RootParityInputs(inputs);
  }

  private async getProvingInputs() {
    const inputs = await Promise.all(mapTuple(this.provingInputs, input => input.promise));
    return new RootParityInputs(inputs);
  }

  @memoize
  public async simulate(): Promise<ParityPublicInputs> {
    return this.context.simulator.simulate({
      type: ProvingRequestType.ROOT_PARITY,
      inputs: await this.getSimulationInputs(),
    });
  }

  @memoize
  public async prove(): Promise<RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    const result = await this.context.prover.prove({
      type: ProvingRequestType.ROOT_PARITY,
      inputs: await this.getProvingInputs(),
    });

    if (this.context.options.checkSimulationMatchesProof && !result.publicInputs.equals(await this.simulate())) {
      throw new Error(`Simulation output and proof public inputs do not match`);
    }

    return result;
  }
}
