"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWitness = void 0;
const noirc_abi_1 = require("@noir-lang/noirc_abi");
const base64_decode_js_1 = require("./base64_decode.cjs");
const acvm_js_1 = require("@noir-lang/acvm_js");
const defaultForeignCallHandler = (name, args) => {
    throw Error(`Unexpected oracle during execution: ${name}(${args.join(', ')})`);
};
// Generates the witnesses needed to feed into the chosen proving system
async function generateWitness(compiledProgram, inputs, foreignCallHandler = defaultForeignCallHandler) {
    // Throws on ABI encoding error
    const witnessMap = (0, noirc_abi_1.abiEncode)(compiledProgram.abi, inputs);
    // Execute the circuit to generate the rest of the witnesses and serialize
    // them into a Uint8Array.
    try {
        const solvedWitness = await (0, acvm_js_1.executeCircuit)((0, base64_decode_js_1.base64Decode)(compiledProgram.bytecode), witnessMap, foreignCallHandler);
        return solvedWitness;
    }
    catch (err) {
        throw new Error(`Circuit execution failed: ${err}`);
    }
}
exports.generateWitness = generateWitness;
