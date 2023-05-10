// Type mappings for cbinds
// Can either export things directly or handle
// naming differences with the 'as' syntax
export {
  AggregationObject as NativeAggregationState,
  AztecAddress as Address,
  VerificationKey as VerificationKeyData,
  PrivateKernelPublicInputs as PublicInputs,
  Fr,
  Fq,
  G1AffineElement,
  NewContractData,
  FunctionData,
  OptionallyRevealedData,
  PublicDataRead,
  PublicDataUpdateRequest,
  CombinedAccumulatedData,
  PrivateHistoricTreeRoots,
  CombinedHistoricTreeRoots,
  ContractDeploymentData,
  TxContext,
  CombinedConstantData,
  KernelCircuitPublicInputs,
  Proof,
  PreviousKernelData,
} from '../structs/index.js';
