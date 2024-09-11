import { ProvingRequestType, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { type BaseOrMergeRollupPublicInputs, MergeRollupInputs, PreviousRollupData } from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { memoize } from '@aztec/foundation/decorators';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { mapTuple } from '@aztec/foundation/serialize';
import { getVKMembershipWitness } from '@aztec/noir-protocol-circuits-types';

import { type OrchestratorContext , type Circuit } from '../types.js';

export class MergeRollupCircuit implements Circuit<ProvingRequestType.MERGE_ROLLUP> {
  private readonly simulationInputs = makeTuple(2, () => promiseWithResolvers<BaseOrMergeRollupPublicInputs>());
  private readonly provingInputs = makeTuple(2, () =>
    promiseWithResolvers<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>>(),
  );

  constructor(public readonly level: number, public readonly index: number, private context: OrchestratorContext) {}

  public setNestedSimulation(simulation: BaseOrMergeRollupPublicInputs, index: number) {
    this.checkIndex(index);
    this.simulationInputs[index].resolve(simulation);
  }

  public setNestedProof(proof: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>, index: number) {
    this.checkIndex(index);
    this.provingInputs[index].resolve(proof);
  }

  private checkIndex(index: number) {
    if (index > 1) {
      throw new Error('Invalid child merge index.');
    }
  }

  private async getSimulationInputs(): Promise<MergeRollupInputs> {
    const inputs = await Promise.all(mapTuple(this.simulationInputs, ({ promise }) => promise));
    return new MergeRollupInputs(mapTuple(inputs, input => PreviousRollupData.withEmptyProof(input)));
  }

  private async getProvingInputs(): Promise<MergeRollupInputs> {
    const inputs = await Promise.all(mapTuple(this.provingInputs, ({ promise }) => promise));

    return new MergeRollupInputs(
      mapTuple(
        inputs,
        ({ inputs, proof, verificationKey }) =>
          new PreviousRollupData(inputs, proof, verificationKey.keyAsFields, getVKMembershipWitness(verificationKey)),
      ),
    );
  }

  @memoize
  public async simulate(): Promise<BaseOrMergeRollupPublicInputs> {
    const inputs = await this.getSimulationInputs();
    return this.context.simulator.simulate({ type: ProvingRequestType.MERGE_ROLLUP, inputs });
  }

  @memoize
  public async prove(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    const inputs = await this.getProvingInputs();
    const result = await this.context.prover.prove({ type: ProvingRequestType.MERGE_ROLLUP, inputs });

    if (this.context.options.checkSimulationMatchesProof && !result.inputs.equals(await this.simulate())) {
      throw new Error(`Simulation output and proof public inputs do not match`);
    }
    return result;
  }
}
