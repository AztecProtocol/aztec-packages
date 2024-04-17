import {
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  type MergeRollupInputs,
  type ParityPublicInputs,
  type Proof,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
} from '@aztec/circuits.js';

export enum ProvingRequestType {
  BASE_ROLLUP,
  MERGE_ROLLUP,
  ROOT_ROLLUP,

  BASE_PARITY,
  ROOT_PARITY,
}

//   PUBLIC_KERNEL,
// PUBLIC_VM,

export type ProvingRequest =
  | {
      type: ProvingRequestType.BASE_PARITY;
      inputs: BaseParityInputs;
    }
  | {
      type: ProvingRequestType.ROOT_PARITY;
      inputs: RootParityInputs;
    }
  | {
      type: ProvingRequestType.BASE_ROLLUP;
      inputs: BaseRollupInputs;
    }
  | {
      type: ProvingRequestType.MERGE_ROLLUP;
      inputs: MergeRollupInputs;
    }
  | {
      type: ProvingRequestType.ROOT_ROLLUP;
      inputs: RootRollupInputs;
    };

export type ProvingRequestPublicInputs = {
  [ProvingRequestType.BASE_PARITY]: ParityPublicInputs;
  [ProvingRequestType.ROOT_PARITY]: ParityPublicInputs;
  [ProvingRequestType.BASE_ROLLUP]: BaseOrMergeRollupPublicInputs;
  [ProvingRequestType.MERGE_ROLLUP]: BaseOrMergeRollupPublicInputs;
  [ProvingRequestType.ROOT_ROLLUP]: RootRollupPublicInputs;
};

export type ProvingRequestResult<T extends ProvingRequestType> = [ProvingRequestPublicInputs[T], Proof];
