"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Noir = void 0;
const witness_generation_js_1 = require("./witness_generation.cjs");
const noirc_abi_1 = __importStar(require("@noir-lang/noirc_abi"));
const acvm_js_1 = __importStar(require("@noir-lang/acvm_js"));
class Noir {
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
        if (typeof noirc_abi_1.default === 'function') {
            await Promise.all([(0, noirc_abi_1.default)(), (0, acvm_js_1.default)()]);
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
        const witness = await (0, witness_generation_js_1.generateWitness)(this.circuit, inputs, foreignCallHandler);
        const { return_value: returnValue } = (0, noirc_abi_1.abiDecode)(this.circuit.abi, witness);
        return { witness: (0, acvm_js_1.compressWitness)(witness), returnValue };
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
exports.Noir = Noir;
