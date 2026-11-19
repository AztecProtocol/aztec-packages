// @aztec-foundation/noir-acvm_js in a React Native app: acvm_js's API over the ACVM service's native library
// (./acvm.js), which withAztec resolves the package to, since Hermes has no WebAssembly.
import { acvmSync, bytes, fieldFromHex, fieldToHex, stackFromWire, stackToWire, withExecution, witnessFromWire, witnessToWire } from './acvm.js';

/** wasm-bindgen's module initialiser: nothing to load here. */
export default async function init() {}

export function initSync() {}

export function initLogLevel() {}

export function buildInfo() {
  return { gitHash: 'native', version: 'native', dirty: 'false' };
}

/** acvm_js's ExecutionError: an Error carrying the failure's details. */
function executionError(failure) {
  const error = new Error(failure.message);
  error.callStack = failure.callStack ?? undefined;
  error.rawAssertionPayload = failure.rawAssertionPayload ?? undefined;
  error.acirFunctionId = failure.acirFunctionId ?? undefined;
  error.brilligFunctionId = failure.brilligFunctionId ?? undefined;
  return error;
}

async function execute(program, initialWitness, handler, { witness, witnessStack }) {
  // A handler's own error is what the caller wants (acvm_js wraps it as the cause of its own); the service only
  // sees that the foreign call failed.
  let handlerError;
  const foreignCall = async ({ name, inputs }) => {
    let pending;
    try {
      pending = handler(
        name,
        inputs.map(({ values }) => values.map(fieldToHex)),
      );
    } catch (error) {
      handlerError = { kind: 'calling', error };
      throw error;
    }
    let outputs;
    try {
      outputs = await pending;
    } catch (error) {
      handlerError = { kind: 'awaiting', error };
      throw error;
    }
    if (!Array.isArray(outputs)) {
      throw new Error('Expected `foreign_call_handler` to return an array');
    }
    return {
      outputs: outputs.map(output =>
        Array.isArray(output)
          ? { values: output.map(fieldFromHex), array: true }
          : { values: [fieldFromHex(output)], array: false },
      ),
    };
  };
  let result;
  try {
    result = await withExecution(foreignCall, (acvm, executionId) =>
      acvm.executeProgram({
        executionId,
        bytecode: bytes(program),
        initialWitness: witnessToWire(initialWitness),
        returnWitnessMap: witness,
        returnWitnessStack: witnessStack,
      }),
    );
  } catch (error) {
    if (handlerError) {
      const wrapped = new Error(
        handlerError.kind === 'calling' ? 'Error calling `foreign_call_callback`' : 'Error awaiting `foreign_call_handler`',
      );
      wrapped.cause = handlerError.error;
      throw wrapped;
    }
    throw error;
  }
  if (result.failure) {
    throw executionError(result.failure);
  }
  return result;
}

export async function executeCircuit(program, initialWitness, foreignCallHandler) {
  const { witness } = await execute(program, initialWitness, foreignCallHandler, { witness: true, witnessStack: false });
  return witnessFromWire(witness);
}

export async function executeCircuitWithReturnWitness(program, initialWitness, foreignCallHandler) {
  const { witness, returnWitness } = await execute(program, initialWitness, foreignCallHandler, {
    witness: true,
    witnessStack: false,
  });
  return { solvedWitness: witnessFromWire(witness), returnWitness: witnessFromWire(returnWitness) };
}

export function compressWitness(witness) {
  return acvmSync().compressWitnessStack({ stack: [{ index: 0, witness: witnessToWire(witness) }] }).bytes;
}

export function decompressWitness(compressed) {
  const { stack } = acvmSync().decompressWitnessStack({ bytes: bytes(compressed) });
  return witnessFromWire(stack[stack.length - 1].witness);
}

export function compressWitnessStack(stack) {
  return acvmSync().compressWitnessStack({ stack: stackToWire(stack) }).bytes;
}

export function decompressWitnessStack(compressed) {
  return stackFromWire(acvmSync().decompressWitnessStack({ bytes: bytes(compressed) }).stack);
}

function unsupported(name) {
  return () => {
    throw new Error(`${name} is not available in React Native's acvm_js`);
  };
}

export const executeProgram = unsupported('executeProgram');
export const getReturnWitness = unsupported('getReturnWitness');
export const getPublicParametersWitness = unsupported('getPublicParametersWitness');
export const getPublicWitness = unsupported('getPublicWitness');
export const and = unsupported('and');
export const xor = unsupported('xor');
export const sha256_compression = unsupported('sha256_compression');
export const blake2s256 = unsupported('blake2s256');
export const ecdsa_secp256k1_verify = unsupported('ecdsa_secp256k1_verify');
export const ecdsa_secp256r1_verify = unsupported('ecdsa_secp256r1_verify');
