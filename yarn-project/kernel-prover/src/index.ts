import { ExecutionResult } from '@aztec/acir-simulator';
import {
  CONTRACT_TREE_HEIGHT,
  CircuitsWasm,
  EcdsaSignature,
  FUNCTION_TREE_HEIGHT,
  MembershipWitness,
  PRIVATE_CALL_STACK_LENGTH,
  PreviousKernelData,
  PrivateCallData,
  PrivateCallStackItem,
  PrivateKernelPublicInputs,
  SignedTxRequest,
  TxRequest,
  UInt8Vector,
  VK_TREE_HEIGHT,
  VerificationKey,
  makeEmptyProof,
  privateKernelSim,
} from '@aztec/circuits.js';
import { AztecAddress, createDebugLogger } from '@aztec/foundation';

export interface ProvingDataOracle {
  getVkMembershipWitness(vk: VerificationKey): Promise<MembershipWitness<typeof VK_TREE_HEIGHT>>;
  getContractMembershipWitness(contractAddress: AztecAddress): Promise<MembershipWitness<typeof CONTRACT_TREE_HEIGHT>>;
  getFunctionMembershipWitness(
    contractAddress: AztecAddress,
    functionSelector: Buffer,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT>>;
}

export interface KernelProverOutput {
  publicInputs: PrivateKernelPublicInputs;
  proof: UInt8Vector;
}

export class KernelProver {
  constructor(private log = createDebugLogger('aztec:kernel_prover')) {}

  async prove(
    txRequest: TxRequest,
    txSignature: EcdsaSignature,
    executionResult: ExecutionResult,
    oracle: ProvingDataOracle,
  ): Promise<KernelProverOutput> {
    const signedTxRequest = new SignedTxRequest(txRequest, txSignature);
    const executionStack = [executionResult];
    let preVerificationKey: VerificationKey | undefined;
    let output = {
      publicInputs: PrivateKernelPublicInputs.makeEmpty(),
      proof: makeEmptyProof(),
    };
    while (executionStack.length) {
      const vkMembershipWitness = preVerificationKey
        ? await oracle.getVkMembershipWitness(preVerificationKey)
        : MembershipWitness.random(VK_TREE_HEIGHT);
      const previousKernelData = new PreviousKernelData(
        output.publicInputs,
        output.proof,
        preVerificationKey || VerificationKey.makeFake(),
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

      output = await this.createProof(
        signedTxRequest,
        previousKernelData,
        callStackItem,
        privateCallStackPreimages,
        verificationKey,
        oracle,
      );
      preVerificationKey = verificationKey;
    }

    return output;
  }

  private async createProof(
    signedTxRequest: SignedTxRequest,
    previousKernelData: PreviousKernelData,
    callStackItem: PrivateCallStackItem,
    privateCallStackPreimages: PrivateCallStackItem[],
    vk: VerificationKey,
    oracle: ProvingDataOracle,
  ) {
    const { storageContractAddress: contractAddress, portalContractAddress } = callStackItem.publicInputs.callContext;
    const functionLeafMembershipWitness = await oracle.getFunctionMembershipWitness(
      contractAddress,
      callStackItem.functionData.functionSelector,
    );

    const contractLeafMembershipWitness = callStackItem.functionData.isConstructor
      ? MembershipWitness.random(CONTRACT_TREE_HEIGHT)
      : await oracle.getContractMembershipWitness(contractAddress);

    const privateCallData = new PrivateCallData(
      callStackItem,
      privateCallStackPreimages,
      new UInt8Vector(Buffer.alloc(42)),
      vk,
      functionLeafMembershipWitness,
      contractLeafMembershipWitness,
      portalContractAddress,
    );

    const wasm = await CircuitsWasm.get();
    this.log(`Executing private kernel simulation...`);
    const publicInputs = await privateKernelSim(wasm, signedTxRequest, previousKernelData, privateCallData);
    this.log(`Skipping private kernel proving...`);
    // const proof = await privateKernelProve(wasm, signedTxRequest, previousKernelData, privateCallData);
    const proof = makeEmptyProof();
    this.log('Kernel Prover Completed!');

    return {
      publicInputs,
      proof,
    };
  }
}
