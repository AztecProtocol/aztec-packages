import {
  CONTRACT_TREE_HEIGHT,
  CircuitsWasm,
  MembershipWitness,
  PreviousKernelData,
  PrivateCallData,
  PrivateCallStackItem,
  PrivateKernelPublicInputs,
  SignedTxRequest,
  UInt8Vector,
  VerificationKey,
  makeEmptyProof,
  privateKernelSim,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { ProvingDataOracle } from './proving_data_oracle.js';

export interface ProofOutput {
  publicInputs: PrivateKernelPublicInputs;
  proof: UInt8Vector;
}

export interface ProofCreator {
  createProof(
    signedTxRequest: SignedTxRequest,
    previousKernelData: PreviousKernelData,
    callStackItem: PrivateCallStackItem,
    privateCallStackPreimages: PrivateCallStackItem[],
    vk: VerificationKey,
  ): Promise<ProofOutput>;
}

export class KernelProofCreator {
  constructor(private oracle: ProvingDataOracle, private log = createDebugLogger('aztec:kernel_proof_creator')) {}

  public async createProof(
    signedTxRequest: SignedTxRequest,
    previousKernelData: PreviousKernelData,
    callStackItem: PrivateCallStackItem,
    privateCallStackPreimages: PrivateCallStackItem[],
    vk: VerificationKey,
  ): Promise<ProofOutput> {
    const { storageContractAddress: contractAddress, portalContractAddress } = callStackItem.publicInputs.callContext;
    const functionLeafMembershipWitness = await this.oracle.getFunctionMembershipWitness(
      contractAddress,
      callStackItem.functionData.functionSelector,
    );

    const contractLeafMembershipWitness = callStackItem.functionData.isConstructor
      ? MembershipWitness.random(CONTRACT_TREE_HEIGHT)
      : await this.oracle.getContractMembershipWitness(contractAddress);

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
    // TODO
    // const proof = await privateKernelProve(wasm, signedTxRequest, previousKernelData, privateCallData);
    const proof = makeEmptyProof();
    this.log('Kernel Prover Completed!');

    return {
      publicInputs,
      proof,
    };
  }
}
