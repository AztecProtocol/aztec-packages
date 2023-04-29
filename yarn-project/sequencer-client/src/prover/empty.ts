/* eslint-disable require-await */
import {
  AggregationObject,
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  MergeRollupInputs,
  Proof,
  PublicCircuitPublicInputs,
  PublicKernelPublicInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
} from '@aztec/circuits.js';
import { PublicProver, RollupProver } from './index.js';

const EMPTY_PROOF_SIZE = 42;

// TODO: Silently modifying one of the inputs to inject the aggregation object is horrible.
// We should rethink these interfaces.
export class EmptyRollupProver implements RollupProver {
  async getBaseRollupProof(_input: BaseRollupInputs, publicInputs: BaseOrMergeRollupPublicInputs): Promise<Proof> {
    publicInputs.endAggregationObject = AggregationObject.makeFake();
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }
  async getMergeRollupProof(_input: MergeRollupInputs, publicInputs: BaseOrMergeRollupPublicInputs): Promise<Proof> {
    publicInputs.endAggregationObject = AggregationObject.makeFake();
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }
  async getRootRollupProof(_input: RootRollupInputs, publicInputs: RootRollupPublicInputs): Promise<Proof> {
    publicInputs.endAggregationObject = AggregationObject.makeFake();
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }
}

export class EmptyPublicProver implements PublicProver {
  async getPublicCircuitProof(_publicInputs: PublicCircuitPublicInputs): Promise<Proof> {
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }
  async getPublicKernelCircuitProof(_publicInputs: PublicKernelPublicInputs): Promise<Proof> {
    return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0));
  }
}
