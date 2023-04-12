import {
  CONTRACT_TREE_HEIGHT,
  CircuitsWasm,
  FUNCTION_TREE_HEIGHT,
  MembershipWitness,
  PreviousKernelData,
  PrivateCallData,
  PrivateCallStackItem,
  PrivateKernelPublicInputs,
  SignedTxRequest,
  UInt8Vector,
  VK_TREE_HEIGHT,
  VerificationKey,
  makeEmptyProof,
  privateKernelSim,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

export interface ProofOutput {
  publicInputs: PrivateKernelPublicInputs;
  proof: UInt8Vector;
  vk: VerificationKey;
}

export interface ProofCreator {
  createProof(
    signedTxRequest: SignedTxRequest,
    previousProof: ProofOutput,
    vkMembershipWitness: MembershipWitness<typeof VK_TREE_HEIGHT>,
    firstIteration: boolean,
    callStackItem: PrivateCallStackItem,
    privateCallStackPreimages: PrivateCallStackItem[],
    vk: VerificationKey,
    contractLeafMembershipWitness: MembershipWitness<typeof CONTRACT_TREE_HEIGHT>,
    functionLeafMembershipWitness: MembershipWitness<typeof FUNCTION_TREE_HEIGHT>,
  ): Promise<ProofOutput>;
}

export class KernelProofCreator {
  constructor(private log = createDebugLogger('aztec:kernel_proof_creator')) {}

  public async createProof(
    signedTxRequest: SignedTxRequest,
    previousProof: ProofOutput,
    previousVkMembershipWitness: MembershipWitness<typeof VK_TREE_HEIGHT>,
    firstIteration: boolean,
    callStackItem: PrivateCallStackItem,
    privateCallStackPreimages: PrivateCallStackItem[],
    vk: VerificationKey,
    contractLeafMembershipWitness: MembershipWitness<typeof CONTRACT_TREE_HEIGHT>,
    functionLeafMembershipWitness: MembershipWitness<typeof FUNCTION_TREE_HEIGHT>,
  ): Promise<ProofOutput> {
    const previousKernelData = new PreviousKernelData(
      previousProof.publicInputs,
      previousProof.proof,
      previousProof.vk,
      previousVkMembershipWitness.leafIndex,
      previousVkMembershipWitness.siblingPath,
    );

    this.log('Skipping private kernel proving...');
    // TODO
    const proof = makeEmptyProof();

    const { portalContractAddress } = callStackItem.publicInputs.callContext;
    const privateCallData = new PrivateCallData(
      callStackItem,
      privateCallStackPreimages,
      proof,
      vk,
      functionLeafMembershipWitness,
      contractLeafMembershipWitness,
      portalContractAddress,
    );

    const wasm = await CircuitsWasm.get();
    this.log('Executing private kernel simulation...');
    const publicInputs = await privateKernelSim(
      wasm,
      signedTxRequest,
      previousKernelData,
      privateCallData,
      firstIteration,
    );
    this.log('Kernel Prover Completed!');

    return {
      publicInputs,
      proof,
      vk,
    };
  }
}
