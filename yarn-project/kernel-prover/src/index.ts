import { ExecutionResult } from '@aztec/acir-simulator';
import {
  AccumulatedData,
  AffineElement,
  AggregationObject,
  AztecAddress,
  ConstantData,
  EMITTED_EVENTS_LENGTH,
  EthAddress,
  Fq,
  Fr,
  FunctionData,
  KERNEL_L1_MSG_STACK_LENGTH,
  KERNEL_NEW_COMMITMENTS_LENGTH,
  KERNEL_NEW_CONTRACTS_LENGTH,
  KERNEL_NEW_NULLIFIERS_LENGTH,
  KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH,
  KERNEL_PRIVATE_CALL_STACK_LENGTH,
  KERNEL_PUBLIC_CALL_STACK_LENGTH,
  NewContractData,
  OldTreeRoots,
  OptionallyRevealedData,
  PrivateKernelPublicInputs,
  TxRequest,
  CircuitsWasm,
  SignedTxRequest,
  PrivateCallData,
  PRIVATE_CALL_STACK_LENGTH,
  PrivateCallStackItem,
  PreviousKernelData,
  UInt8Vector,
  EcdsaSignature,
  MembershipWitness,
  CONTRACT_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { randomBytes } from 'crypto';

export class KernelProver {
  prove(
    txRequest: TxRequest,
    txSignature: EcdsaSignature,
    executionResult: ExecutionResult,
    oldRoots: OldTreeRoots,
    wasm: CircuitsWasm,
    getContractSiblingPath: (committment: Buffer) => Promise<MembershipWitness<typeof CONTRACT_TREE_HEIGHT>>,
  ): Promise<{ publicInputs: PrivateKernelPublicInputs; proof: Buffer }> {
    // TODO: implement this
    const signedTxRequest: SignedTxRequest = {
      txRequest,
      signature: txSignature,
    };

    const privateCallData: PrivateCallData = {
      callStackItem: executionResult.callStackItem,
      privateCallStackPreimages: Array(PRIVATE_CALL_STACK_LENGTH).fill(0).map(() => PrivateCallStackItem.empty()),
      proof: new UInt8Vector(Buffer.alloc(256)),
      vk: executionResult.vk,
      functionLeafMembershipWitness: // get from wasm
      contractLeafMembershipWitness: //grab sibling paths from aztec node
      portalContractAddress: txRequest.txContext.contractDeploymentData.portalContractAddress,    
    };

    


    return Promise.resolve({
      publicInputs,
      proof: Buffer.alloc(0),
    });
  }
}
