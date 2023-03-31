import { ExecutionResult } from '@aztec/acir-simulator';
import {
  OldTreeRoots,
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
  privateKernelSim,
  privateKernelProve,
  FUNCTION_TREE_HEIGHT,
  VerificationKey,
  ComposerType,
  CommitmentMap,
} from '@aztec/circuits.js';

export interface FunctionTreeInfo {
  root: Buffer;
  membershipWitness: MembershipWitness<typeof FUNCTION_TREE_HEIGHT>;
}

export class KernelProver {
  async prove(
    txRequest: TxRequest,
    txSignature: EcdsaSignature,
    executionResult: ExecutionResult,
    oldRoots: OldTreeRoots,
    wasm: CircuitsWasm,
    getFunctionTreeInfo: (callStackItem: PrivateCallStackItem) => Promise<FunctionTreeInfo>,
    getContractSiblingPath: (committment: Buffer) => Promise<MembershipWitness<typeof CONTRACT_TREE_HEIGHT>>,
  ): Promise<{ publicInputs: PrivateKernelPublicInputs; proof: Buffer }> {
    // TODO: implement this
    const signedTxRequest = new SignedTxRequest(txRequest, txSignature);

    const functionTreeInfo = await getFunctionTreeInfo(executionResult.callStackItem);
    const contractLeafMembershipWitness = await getContractSiblingPath(functionTreeInfo.root);

    const privateCallData = new PrivateCallData(
      executionResult.callStackItem,
      Array(PRIVATE_CALL_STACK_LENGTH)
        .fill(0)
        .map(() => PrivateCallStackItem.empty()),
      new UInt8Vector(Buffer.alloc(42)),
      this.createDummyVk(),
      functionTreeInfo.membershipWitness,
      contractLeafMembershipWitness,
      txRequest.txContext.contractDeploymentData.portalContractAddress,
    );

    const previousKernelData: PreviousKernelData = PreviousKernelData.makeEmpty();
    const publicInputs = privateKernelSim(wasm, signedTxRequest, previousKernelData, privateCallData);
    const proof = privateKernelProve(wasm, signedTxRequest, previousKernelData, privateCallData);

    return Promise.resolve({
      publicInputs,
      proof,
    });
  }

  private createDummyVk() {
    return new VerificationKey(ComposerType.TURBO, 1, 1, new CommitmentMap({}), false, []);
  }
}
