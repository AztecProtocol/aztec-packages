import { generateWitness } from "./witness_generation.mjs";
import initAbi, { abiDecode } from '@noir-lang/noirc_abi';
import initACVM, { compressWitness } from '@noir-lang/acvm_js';
export class Noir {
    circuit;
    backend;
    constructor(circuit, backend) {
        this.circuit = circuit;
        this.backend = backend;
    }
    /** @ignore */
    async init() {
        // If these are available, then we are in the
        // web environment. For the node environment, this
        // is a no-op.
        if (typeof initAbi === 'function') {
            await Promise.all([initAbi(), initACVM()]);
        }
    }
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
    async destroy() {
        await this.backend?.destroy();
    }
    getBackend() {
        if (this.backend === undefined)
            throw new Error('Operation requires a backend but none was provided');
        return this.backend;
    }
    // Initial inputs to your program
    /**
     * @description
     * Allows to execute a circuit to get its witness and return value.
     *
     * @example
     * ```typescript
     * async execute(inputs)
     * ```
     */
    async execute(inputs, foreignCallHandler) {
        await this.init();
        const witness = await generateWitness(this.circuit, inputs, foreignCallHandler);
        const { return_value: returnValue } = abiDecode(this.circuit.abi, witness);
        return { witness: compressWitness(witness), returnValue };
    }
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
    async generateFinalProof(inputs) {
        const { witness } = await this.execute(inputs);
        return this.getBackend().generateFinalProof(witness);
    }
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
    async verifyFinalProof(proofData) {
        return this.getBackend().verifyFinalProof(proofData);
    }
}
