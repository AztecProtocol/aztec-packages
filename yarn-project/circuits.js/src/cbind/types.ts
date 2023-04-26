// Type mappings for working with cbind naming differences
export {
  PrivateKernelInputs,
  PrivateKernelPublicInputs,
  AffineElement,
  AggregationObject as NativeAggregationState,
  NewContractData,
  FunctionData,
  OptionallyRevealedData,
  AccumulatedData,
  HistoricTreeRoots,
  ContractDeploymentData,
  TxContext,
  Fq,
  Fr,
  AztecAddress as Address,
  ConstantData,
  VerificationKey as VerificationKeyData,
  PublicKernelPublicInputs as PublicInputs,
  PreviousKernelData,
} from '../structs/index.js';

// TODO better way of aliasing proof to buffer
export class Proof {
  static fromBuffer(buffer: Buffer): Buffer {
    return buffer;
  }
}
// Utility types
export type FixedArray<T, L extends number> = [T, ...T[]] & { length: L };
