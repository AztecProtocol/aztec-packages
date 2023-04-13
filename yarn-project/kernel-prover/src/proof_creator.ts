import {
  CircuitsWasm,
  PreviousKernelData,
  PrivateCallData,
  PrivateKernelPublicInputs,
  SignedTxRequest,
  UInt8Vector,
  makeEmptyProof,
  privateKernelSim,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

export interface ProofOutput {
  publicInputs: PrivateKernelPublicInputs;
  proof: UInt8Vector;
}

export interface ProofCreator {
  createProof(
    signedTxRequest: SignedTxRequest,
    previousKernelData: PreviousKernelData,
    privateCallData: PrivateCallData,
    firstIteration: boolean,
  ): Promise<ProofOutput>;
}

export class KernelProofCreator {
  constructor(private log = createDebugLogger('aztec:kernel_proof_creator')) {}

  public async createProof(
    signedTxRequest: SignedTxRequest,
    previousKernelData: PreviousKernelData,
    privateCallData: PrivateCallData,
    firstIteration: boolean,
  ): Promise<ProofOutput> {
    const wasm = await CircuitsWasm.get();
    this.log('Executing private kernel simulation...');
    const publicInputs = await privateKernelSim(
      wasm,
      signedTxRequest,
      previousKernelData,
      privateCallData,
      firstIteration,
    );
    this.log('Skipping private kernel proving...');
    // TODO
    const proof = makeEmptyProof();
    this.log('Kernel Prover Completed!');

    return {
      publicInputs,
      proof,
    };
  }
}
