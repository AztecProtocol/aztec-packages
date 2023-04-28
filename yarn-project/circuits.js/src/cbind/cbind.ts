import { CircuitsWasm } from '../wasm/index.js';
import { decode, encode } from '@msgpack/msgpack';

/**
 * Recursively converts Uint8Arrays to Buffers in the input data structure.
 * The function traverses through the given data, and if it encounters a Uint8Array,
 * it replaces it with a Buffer. It supports nested arrays and objects.
 *
 * @param data - The input data structure that may contain Uint8Arrays.
 * @returns A new data structure with all instances of Uint8Array replaced by Buffer.
 */
function recursiveFixDecoded(data: any): any {
  if (Array.isArray(data)) {
    return data.map(recursiveFixDecoded);
  } else if (data instanceof Uint8Array) {
    return Buffer.from(data);
  } else if (data && typeof data === 'object') {
    const fixed: any = {};

    for (const key in data) {
      fixed[key] = recursiveFixDecoded(data[key]);
    }

    return fixed;
  } else {
    return data;
  }
}

/**
 * Read a 32-bit pointer value from the WebAssembly memory space.
 * The function reads 4 bytes at the specified 'ptr32' address in little-endian order
 * and returns the corresponding unsigned 32-bit integer value.
 *
 * @param wasm - The CircuitsWasm instance containing the WebAssembly module and its memory.
 * @param ptr32 - The address in the WebAssembly memory where the 32-bit pointer value is located.
 * @returns The unsigned 32-bit integer value read from the WebAssembly memory at the given address.
 */
function readPtr32(wasm: CircuitsWasm, ptr32: number) {
  // Written in little-endian as WASM native
  const dataView = new DataView(wasm.getMemorySlice(ptr32, ptr32 + 4).buffer);
  return dataView.getUint32(0, /*little endian*/ true);
}

/**
 * Retrieves the JSON schema of a given C binding function from the WebAssembly module.
 * The function calls the '__schema' method corresponding to the provided 'cbind' name
 * and returns the parsed JSON schema obtained from the WebAssembly memory.
 *
 * @param wasm - The CircuitsWasm instance containing the WebAssembly module and its memory.
 * @param cbind - The name of the C binding function for which the schema is requested.
 * @returns A JSON object representing the schema of the specified C binding function.
 */
export function getCbindSchema(wasm: CircuitsWasm, cbind: string): any {
  const outputSizePtr = wasm.call('bbmalloc', 4);
  const outputMsgpackPtr = wasm.call('bbmalloc', 4);
  wasm.call(cbind + '__schema', outputMsgpackPtr, outputSizePtr);
  const jsonSchema = wasm.getMemoryAsString(readPtr32(wasm, outputMsgpackPtr));
  wasm.call('bbfree', outputSizePtr);
  wasm.call('bbfree', outputMsgpackPtr);
  return JSON.parse(jsonSchema);
}

/**
 * Calls a C binding function in the WebAssembly module with the provided input arguments.
 * The function encodes the input arguments using MessagePack, writes them to the
 * WebAssembly memory, and calls the specified 'cbind' function. Once the call is completed,
 * the result is read from the WebAssembly memory, decoded using MessagePack, and returned.
 *
 * @param wasm - The CircuitsWasm instance containing the WebAssembly module and its memory.
 * @param cbind - The name of the C binding function to be called in the WebAssembly module.
 * @param input - An array of input arguments that will be passed to the C binding function.
 * @returns A promise that resolves to the decoded result of the C binding function call.
 */
export async function callCbind(wasm: CircuitsWasm, cbind: string, input: any[]): Promise<any> {
  const outputSizePtr = wasm.call('bbmalloc', 4);
  const outputMsgpackPtr = wasm.call('bbmalloc', 4);
  const inputBuffer = encode(input);
  const inputPtr = wasm.call('bbmalloc', inputBuffer.length);
  wasm.writeMemory(inputPtr, inputBuffer);
  await wasm.asyncCall(cbind, inputPtr, inputBuffer.length, outputMsgpackPtr, outputSizePtr);
  const encodedResult = wasm.getMemorySlice(
    readPtr32(wasm, outputMsgpackPtr),
    readPtr32(wasm, outputMsgpackPtr) + readPtr32(wasm, outputSizePtr),
  );
  const result = recursiveFixDecoded(decode(encodedResult));
  wasm.call('bbfree', inputPtr);
  wasm.call('bbfree', outputSizePtr);
  wasm.call('bbfree', outputMsgpackPtr);
  return result;
}
