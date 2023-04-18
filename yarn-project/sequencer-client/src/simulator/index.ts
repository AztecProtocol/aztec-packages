import {
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  MergeRollupInputs,
  PublicCircuitPublicInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  TxRequest,
} from '@aztec/circuits.js';

export interface Simulator {
  baseRollupCircuit(input: BaseRollupInputs): Promise<BaseOrMergeRollupPublicInputs>;
  mergeRollupCircuit(input: MergeRollupInputs): Promise<BaseOrMergeRollupPublicInputs>;
  rootRollupCircuit(input: RootRollupInputs): Promise<RootRollupPublicInputs>;
}

export interface PublicCircuitSimulator {
  publicCircuit(tx: TxRequest): Promise<PublicCircuitPublicInputs>;
}
