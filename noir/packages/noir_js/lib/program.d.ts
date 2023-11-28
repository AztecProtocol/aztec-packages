import { Backend, CompiledCircuit, ProofData } from '@noir-lang/types';
import { InputMap, InputValue } from '@noir-lang/noirc_abi';
import { ForeignCallHandler } from '@noir-lang/acvm_js';
export declare class Noir {
    private circuit;
    private backend?;
    constructor(circuit: CompiledCircuit, backend?: Backend | undefined);
    /** @ignore */
    init(): Promise<void>;
    /**
     *
     * @description
     * Destroys the underlying backend instance.
     *
     * @example
     * ```typescript
     * await noir.destroy();
     * ```
     *
     */
    destroy(): Promise<void>;
    private getBackend;
    /**
     * @description
     * Allows to execute a circuit to get its witness and return value.
     *
     * @example
     * ```typescript
     * async execute(inputs)
     * ```
     */
    execute(inputs: InputMap, foreignCallHandler?: ForeignCallHandler): Promise<{
        witness: Uint8Array;
        returnValue: InputValue;
    }>;
    /**
     *
     * @description
     * Generates a witness and a proof given an object as input.
     *
     * @example
     * ```typescript
     * async generateFinalproof(input)
     * ```
     *
     */
    generateFinalProof(inputs: InputMap): Promise<ProofData>;
    /**
     *
     * @description
     * Instantiates the verification key and verifies a proof.
     *
     *
     * @example
     * ```typescript
     * async verifyFinalProof(proof)
     * ```
     *
     */
    verifyFinalProof(proofData: ProofData): Promise<boolean>;
}
