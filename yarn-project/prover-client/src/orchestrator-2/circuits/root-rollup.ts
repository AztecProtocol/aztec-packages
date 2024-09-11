import { ProvingRequestType, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import {
  type BlockRootOrBlockMergePublicInputs,
  PreviousRollupBlockData,
  RootRollupInputs,
  type RootRollupPublicInputs,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { memoize } from '@aztec/foundation/decorators';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { mapTuple } from '@aztec/foundation/serialize';
import { getVKMembershipWitness } from '@aztec/noir-protocol-circuits-types';

import { type OrchestratorContext , type Circuit } from '../types.js';

export class RootRollupCircuit implements Circuit<ProvingRequestType.ROOT_ROLLUP> {
  private readonly simulationInputs = makeTuple(2, () => promiseWithResolvers<BlockRootOrBlockMergePublicInputs>());
  private readonly provingInputs = makeTuple(2, () =>
    promiseWithResolvers<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>>(),
  );

  constructor(private context: OrchestratorContext) {}

  public setNestedSimulation(simulation: BlockRootOrBlockMergePublicInputs, index: number) {
    this.checkIndex(index);
    this.simulationInputs[index].resolve(simulation);
  }

  public setNestedProof(proof: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>, index: number) {
    this.checkIndex(index);
    this.provingInputs[index].resolve(proof);
  }

  private checkIndex(index: number) {
    if (index > 1) {
      throw new Error('Invalid child merge index.');
    }
  }

  private async getSimulationInputs(): Promise<RootRollupInputs> {
    const inputs = await Promise.all(mapTuple(this.simulationInputs, ({ promise }) => promise));
    return new RootRollupInputs(
      mapTuple(inputs, input => PreviousRollupBlockData.withEmptyProof(input)),
      this.context.proverId,
    );
  }

  private async getProvingInputs(): Promise<RootRollupInputs> {
    const inputs = await Promise.all(mapTuple(this.provingInputs, ({ promise }) => promise));

    return new RootRollupInputs(
      mapTuple(
        inputs,
        ({ inputs, proof, verificationKey }) =>
          new PreviousRollupBlockData(
            inputs,
            proof,
            verificationKey.keyAsFields,
            getVKMembershipWitness(verificationKey),
          ),
      ),
      this.context.proverId,
    );
  }

  @memoize
  public async simulate(): Promise<RootRollupPublicInputs> {
    const inputs = await this.getSimulationInputs();
    return this.context.simulator.simulate({ type: ProvingRequestType.ROOT_ROLLUP, inputs });
  }

  @memoize
  public async prove(): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    const inputs = await this.getProvingInputs();
    const result = await this.context.prover.prove({ type: ProvingRequestType.ROOT_ROLLUP, inputs });

    if (this.context.options.checkSimulationMatchesProof && !result.inputs.equals(await this.simulate())) {
      throw new Error(`Simulation output and proof public inputs do not match`);
    }
    return result;
  }
}
