import { Backend, CompiledCircuit, ProofData } from '@noir-lang/types';
import { BackendOptions } from './types.js';
export declare class BarretenbergBackend implements Backend {
    private options;
    private api;
    private acirComposer;
    private acirUncompressedBytecode;
    constructor(acirCircuit: CompiledCircuit, options?: BackendOptions);
    /** @ignore */
    instantiate(): Promise<void>;
    generateFinalProof(decompressedWitness: Uint8Array): Promise<ProofData>;
    /**
     *
     * @example
     * ```typescript
     * const intermediateProof = await backend.generateIntermediateProof(witness);
     * ```
     */
    generateIntermediateProof(witness: Uint8Array): Promise<ProofData>;
    /** @ignore */
    generateProof(compressedWitness: Uint8Array, makeEasyToVerifyInCircuit: boolean): Promise<ProofData>;
    /**
     *
     * @example
     * ```typescript
     * const artifacts = await backend.generateIntermediateProofArtifacts(proof, numOfPublicInputs);
     * ```
     */
    generateIntermediateProofArtifacts(proofData: ProofData, numOfPublicInputs?: number): Promise<{
        proofAsFields: string[];
        vkAsFields: string[];
        vkHash: string;
    }>;
    verifyFinalProof(proofData: ProofData): Promise<boolean>;
    /**
     *
     * @example
     * ```typescript
     * const isValidIntermediate = await backend.verifyIntermediateProof(proof);
     * ```
     */
    verifyIntermediateProof(proofData: ProofData): Promise<boolean>;
    /** @ignore */
    verifyProof(proof: Uint8Array, makeEasyToVerifyInCircuit: boolean): Promise<boolean>;
    destroy(): Promise<void>;
}
export { Backend, BackendOptions, CompiledCircuit, ProofData };
