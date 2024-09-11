import { ProvingRequestType, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { BlockMergeRollupInputs, type BlockRootOrBlockMergePublicInputs, PreviousRollupBlockData } from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { memoize } from '@aztec/foundation/decorators';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { mapTuple } from '@aztec/foundation/serialize';
import { getVKMembershipWitness } from '@aztec/noir-protocol-circuits-types';

import { type OrchestratorContext , type Circuit } from '../types.js';

export class BlockMergeCircuit implements Circuit<ProvingRequestType.BLOCK_MERGE_ROLLUP> {
  private readonly simulationInputs = makeTuple(2, () => promiseWithResolvers<BlockRootOrBlockMergePublicInputs>());
  private readonly provingInputs = makeTuple(2, () =>
    promiseWithResolvers<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>>(),
  );

  constructor(
    public readonly level: number,
    public readonly index: number,
    private readonly context: OrchestratorContext,
  ) {}

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

  private async getSimulationInputs(): Promise<BlockMergeRollupInputs> {
    const inputs = await Promise.all(mapTuple(this.simulationInputs, ({ promise }) => promise));
    return new BlockMergeRollupInputs(mapTuple(inputs, merge => PreviousRollupBlockData.withEmptyProof(merge)));
  }

  private async getProvingInputs(): Promise<BlockMergeRollupInputs> {
    const inputs = await Promise.all(mapTuple(this.provingInputs, ({ promise }) => promise));

    return new BlockMergeRollupInputs(
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
    );
  }

  @memoize
  public async simulate(): Promise<BlockRootOrBlockMergePublicInputs> {
    const inputs = await this.getSimulationInputs();
    return this.context.simulator.simulate({ type: ProvingRequestType.BLOCK_MERGE_ROLLUP, inputs });
  }

  @memoize
  public async prove(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    const inputs = await this.getProvingInputs();
    const result = await this.context.prover.prove({ type: ProvingRequestType.BLOCK_MERGE_ROLLUP, inputs });

    if (this.context.options.checkSimulationMatchesProof && !result.inputs.equals(await this.simulate())) {
      throw new Error(`Simulation output and proof public inputs do not match`);
    }
    return result;
  }
}
