import { ExecutionResult } from '@aztec/acir-simulator';
import {
  CONTRACT_TREE_HEIGHT,
  EcdsaSignature,
  Fr,
  MembershipWitness,
  PRIVATE_CALL_STACK_LENGTH,
  PreviousKernelData,
  PrivateCallData,
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
    let previousVerificationKey = VerificationKey.makeFake();
    let output: ProofOutput = {
      publicInputs: PrivateKernelPublicInputs.makeEmpty(),
      proof: makeEmptyProof(),
    };
    while (executionStack.length) {
      const previousVkMembershipWitness = firstIteration
        ? MembershipWitness.random(VK_TREE_HEIGHT)
        : await this.oracle.getVkMembershipWitness(previousVerificationKey);
      const previousKernelData = new PreviousKernelData(
        output.publicInputs,
        output.proof,
        previousVerificationKey,
        previousVkMembershipWitness.leafIndex,
        previousVkMembershipWitness.siblingPath,
      );

      const currentExecution = executionStack.pop()!;
      executionStack.push(...currentExecution.nestedExecutions);
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

      const privateCallData = await this.createPrivateCallData(currentExecution, privateCallStackPreimages);

      output = await this.proofCreator.createProof(
        signedTxRequest,
        previousKernelData,
        privateCallData,
        firstIteration,
      );
      firstIteration = false;
      previousVerificationKey = privateCallData.vk;
    }

    return output;
  }

  private async createPrivateCallData(
    { callStackItem, vk }: ExecutionResult,
    privateCallStackPreimages: PrivateCallStackItem[],
  ) {
    const { storageContractAddress: contractAddress, portalContractAddress } = callStackItem.publicInputs.callContext;
    const contractLeafMembershipWitness = callStackItem.functionData.isConstructor
      ? MembershipWitness.random(CONTRACT_TREE_HEIGHT)
      : await this.oracle.getContractMembershipWitness(contractAddress);

    const functionLeafMembershipWitness = await this.oracle.getFunctionMembershipWitness(
      contractAddress,
      callStackItem.functionData.functionSelector,
    );

    // TODO
    // const acirHash = keccak(Buffer.from(bytecode, 'hex'));
    const acirHash = Fr.fromBuffer(Buffer.alloc(32, 0)); //acirHash, // FIXME: https://github.com/AztecProtocol/aztec3-packages/issues/262

    // TODO
    const proof = makeEmptyProof();

    return new PrivateCallData(
      callStackItem,
      privateCallStackPreimages,
      proof,
      VerificationKey.fromBuffer(vk),
      functionLeafMembershipWitness,
      contractLeafMembershipWitness,
      portalContractAddress,
      acirHash,
    );
  }
}
