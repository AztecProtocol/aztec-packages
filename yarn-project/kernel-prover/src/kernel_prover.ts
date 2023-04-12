import { ExecutionResult } from '@aztec/acir-simulator';
import {
  CONTRACT_TREE_HEIGHT,
  EcdsaSignature,
  MembershipWitness,
  PRIVATE_CALL_STACK_LENGTH,
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
  constructor(private oracle: ProvingDataOracle, private proofCreator: ProofCreator = new KernelProofCreator()) {}

  async prove(
    txRequest: TxRequest,
    txSignature: EcdsaSignature,
    executionResult: ExecutionResult,
  ): Promise<ProofOutput> {
    const signedTxRequest = new SignedTxRequest(txRequest, txSignature);
    const executionStack = [executionResult];
    let firstIteration = true;
    let output: ProofOutput = {
      publicInputs: PrivateKernelPublicInputs.makeEmpty(),
      proof: makeEmptyProof(),
      vk: VerificationKey.makeFake(),
    };
    while (executionStack.length) {
      const previousVkMembershipWitness = firstIteration
        ? MembershipWitness.random(VK_TREE_HEIGHT)
        : await this.oracle.getVkMembershipWitness(output.vk);

      const { callStackItem, vk, nestedExecutions } = executionStack.pop()!;
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

      const { storageContractAddress: contractAddress } = callStackItem.publicInputs.callContext;
      const contractLeafMembershipWitness = callStackItem.functionData.isConstructor
        ? MembershipWitness.random(CONTRACT_TREE_HEIGHT)
        : await this.oracle.getContractMembershipWitness(contractAddress);

      const functionLeafMembershipWitness = await this.oracle.getFunctionMembershipWitness(
        contractAddress,
        callStackItem.functionData.functionSelector,
      );

      output = await this.proofCreator.createProof(
        signedTxRequest,
        output,
        previousVkMembershipWitness,
        firstIteration,
        callStackItem,
        privateCallStackPreimages,
        VerificationKey.fromBuffer(vk),
        contractLeafMembershipWitness,
        functionLeafMembershipWitness,
      );
      firstIteration = false;
    }

    return output;
  }
}
