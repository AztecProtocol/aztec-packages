// @aztec-foundation/noir-noirc_abi in a React Native app: noirc_abi_wasm's API over the ACVM service's native
// library (./acvm.js), which withAztec resolves the package to, since Hermes has no WebAssembly. Values cross as
// the JSON noirc_abi_wasm's bindings move them through serde_json.
import { acvmSync, bytes, stackFromWire, witnessFromWire, witnessToWire } from './acvm.js';

/** wasm-bindgen's module initialiser: nothing to load here. */
export default async function init() {}

export function initSync() {}

export function abiEncode(abi, inputs, returnValue) {
  return witnessFromWire(
    acvmSync().abiEncode({
      abiJson: JSON.stringify(abi),
      inputsJson: JSON.stringify(inputs),
      returnValueJson: returnValue === undefined || returnValue === null ? null : JSON.stringify(returnValue),
    }).witness,
  );
}

export function abiDecode(abi, witness) {
  return JSON.parse(acvmSync().abiDecode({ abiJson: JSON.stringify(abi), witness: witnessToWire(witness) }).json);
}

export function abiDecodeError(abi, rawError) {
  return JSON.parse(
    acvmSync().decodeAssertionPayload({
      abiJson: JSON.stringify(abi),
      payload: { selector: String(rawError.selector), data: rawError.data },
    }).json,
  );
}

export function serializeWitness(witness) {
  return acvmSync().compressWitnessStack({ stack: [{ index: 0, witness: witnessToWire(witness) }] }).bytes;
}

export function deserializeWitness(compressed) {
  const { stack } = acvmSync().decompressWitnessStack({ bytes: bytes(compressed) });
  return witnessFromWire(stack[stack.length - 1].witness);
}

export function deserializeWitnessStack(compressed) {
  return stackFromWire(acvmSync().decompressWitnessStack({ bytes: bytes(compressed) }).stack);
}
