import { ExecutionResult } from '@aztec/acir-simulator';
import {
  EcdsaSignature,
  MembershipWitness,
  PRIVATE_CALL_STACK_LENGTH,
  PreviousKernelData,
  PrivateCallStackItem,
  PrivateKernelPublicInputs,
  SignedTxRequest,
  TxRequest,
  VK_TREE_HEIGHT,
  VerificationKey,
  makeEmptyProof,
} from '@aztec/circuits.js';
import { KernelProofCreator, ProofCreator, ProofOutput } from './proof_creator.js';
import { ProvingDataOracle } from './proving_data_oracle.js';

export class KernelProver {
  async prove(
    txRequest: TxRequest,
    txSignature: EcdsaSignature,
    executionResult: ExecutionResult,
    oracle: ProvingDataOracle,
    proofCreator: ProofCreator = new KernelProofCreator(oracle),
  ): Promise<ProofOutput> {
    const signedTxRequest = new SignedTxRequest(txRequest, txSignature);
    const executionStack = [executionResult];
    let firstIteration = true;
    let preVerificationKey = VerificationKey.makeFake();
    let output: ProofOutput = {
      publicInputs: PrivateKernelPublicInputs.makeEmpty(),
      proof: makeEmptyProof(),
    };
    while (executionStack.length) {
      const vkMembershipWitness = firstIteration
        ? MembershipWitness.random(VK_TREE_HEIGHT)
        : await oracle.getVkMembershipWitness(preVerificationKey);
      const previousKernelData = new PreviousKernelData(
        output.publicInputs,
        output.proof,
        preVerificationKey,
        vkMembershipWitness.leafIndex,
        vkMembershipWitness.siblingPath,
      );

      const { callStackItem, vk, nestedExecutions } = executionStack.pop()!;
      const verificationKey = VerificationKey.fromBuffer(vk);
      executionStack.push(...nestedExecutions);

      const privateCallStackPreimages = executionStack.map(result => result.callStackItem);
      if (privateCallStackPreimages.length > PRIVATE_CALL_STACK_LENGTH) {
        throw new Error(
          `Too many items in the call stack. Maximum amount is ${PRIVATE_CALL_STACK_LENGTH}. Got ${privateCallStackPreimages.length}.`,
        );
      }
      privateCallStackPreimages.push(
        ...Array(PRIVATE_CALL_STACK_LENGTH - privateCallStackPreimages.length)
          .fill(0)
          .map(() => PrivateCallStackItem.empty()),
      );

      output = await proofCreator.createProof(
        signedTxRequest,
        previousKernelData,
        callStackItem,
        privateCallStackPreimages,
        verificationKey,
        firstIteration,
      );
      preVerificationKey = verificationKey;
      firstIteration = false;
    }

    return output;
  }
}
