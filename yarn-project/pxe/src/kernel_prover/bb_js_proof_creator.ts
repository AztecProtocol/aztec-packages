import { BarretenbergProverVerifier } from '@aztec/bb.js';
import {
  type PrivateCircuitPublicInputs,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  Proof,
} from '@aztec/circuits.js';
import { siloNoteHash } from '@aztec/circuits.js/hash';
import {
  ClientCircuitArtifacts,
  type ClientProtocolArtifact,
  convertPrivateKernelInitInputsToWitnessMap,
  convertPrivateKernelInitOutputsFromWitnessMap,
  convertPrivateKernelInnerInputsToWitnessMap,
  convertPrivateKernelInnerOutputsFromWitnessMap,
  convertPrivateKernelTailForPublicOutputsFromWitnessMap,
  convertPrivateKernelTailInputsToWitnessMap,
  convertPrivateKernelTailOutputsFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types';
import { WASMSimulator } from '@aztec/simulator';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { type WitnessMap } from '@noir-lang/acvm_js';
import { serializeWitness } from '@noir-lang/noirc_abi';

import { type ProofCreator, type ProofOutput } from './interface/proof_creator.js';

export type PrivateKernelProvingOps = {
  convertOutputs: (outputs: WitnessMap) => PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs;
};

export const KernelArtifactMapping: Record<ClientProtocolArtifact, PrivateKernelProvingOps> = {
  PrivateKernelInitArtifact: {
    convertOutputs: convertPrivateKernelInitOutputsFromWitnessMap,
  },
  PrivateKernelInnerArtifact: {
    convertOutputs: convertPrivateKernelInnerOutputsFromWitnessMap,
  },
  PrivateKernelTailArtifact: {
    convertOutputs: convertPrivateKernelTailOutputsFromWitnessMap,
  },
  PrivateKernelTailToPublicArtifact: {
    convertOutputs: convertPrivateKernelTailForPublicOutputsFromWitnessMap,
  },
};

/**
 * The BBProofCreator class is responsible for generating siloed commitments and zero-knowledge proofs
 * for private kernel circuit. It leverages Barretenberg to perform cryptographic operations and proof creation.
 * The class provides methods to compute commitments based on the given public inputs and to generate proofs based on
 * signed transaction requests, previous kernel data, private call data, and a flag indicating whether it's the first
 * iteration or not.
 */
export class BBJSProofCreator implements ProofCreator {
  private simulator = new WASMSimulator();
  private provers = new Map<ClientProtocolArtifact, Promise<BarretenbergProverVerifier>>();

  public getSiloedCommitments(publicInputs: PrivateCircuitPublicInputs) {
    const contractAddress = publicInputs.callContext.storageContractAddress;

    return Promise.resolve(
      publicInputs.newNoteHashes.map(commitment => siloNoteHash(contractAddress, commitment.value)),
    );
  }

  public async createProofInit(
    inputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<ProofOutput<PrivateKernelCircuitPublicInputs>> {
    const witnessMap = convertPrivateKernelInitInputsToWitnessMap(inputs);
    return await this.createProof(witnessMap, 'PrivateKernelInitArtifact');
  }

  public async createProofInner(
    inputs: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<ProofOutput<PrivateKernelCircuitPublicInputs>> {
    const witnessMap = convertPrivateKernelInnerInputsToWitnessMap(inputs);
    return await this.createProof(witnessMap, 'PrivateKernelInnerArtifact');
  }
  public async createProofTail(
    inputs: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<ProofOutput<PrivateKernelTailCircuitPublicInputs>> {
    const witnessMap = convertPrivateKernelTailInputsToWitnessMap(inputs);
    return await this.createProof(witnessMap, 'PrivateKernelTailArtifact');
  }

  private async createProof<T>(inputs: WitnessMap, circuitType: ClientProtocolArtifact): Promise<ProofOutput<T>> {
    const compiledCircuit: NoirCompiledCircuit = ClientCircuitArtifacts[circuitType];

    const outputWitness = await this.simulator.simulateCircuit(inputs, compiledCircuit);

    const publicInputs = KernelArtifactMapping[circuitType].convertOutputs(outputWitness) as T;
    const bincodedWitness = serializeWitness(outputWitness);

    const bb = await this.createProver(circuitType);
    const proofData = await bb.generateProof(bincodedWitness);

    const proofOutput: ProofOutput<T> = {
      publicInputs,
      proof: new Proof(Buffer.from(proofData.proof)),
    };
    return proofOutput;
  }

  private createProver(circuitType: ClientProtocolArtifact): Promise<BarretenbergProverVerifier> {
    let proverPromise = this.provers.get(circuitType);
    if (!proverPromise) {
      const compiledCircuit: NoirCompiledCircuit = ClientCircuitArtifacts[circuitType];
      const createProver = async () => {
        const bb = new BarretenbergProverVerifier(Buffer.from(compiledCircuit.bytecode, 'base64'), {});
        await bb.instantiate();
        return bb;
      };
      proverPromise = createProver();
      this.provers.set(circuitType, proverPromise);
    }
    return proverPromise;
  }
}
