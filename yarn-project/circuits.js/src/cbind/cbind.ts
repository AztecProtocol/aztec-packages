import { decode, encode } from '../cbind/msgpack.js';
import { CircuitsWasm } from '../wasm/index.js';

function readPtr32(wasm: CircuitsWasm, ptr32: number) {
  // Written in little-endian as WASM native
  const dataView = new DataView(wasm.getMemorySlice(ptr32, ptr32 + 4).buffer);
  return dataView.getUint32(0, /*little endian*/ true);
}
export function getCbindSchema(wasm: CircuitsWasm, cbind: string): any {
  const outputSizePtr = wasm.call('bbmalloc', 4);
  const outputMsgpackPtr = wasm.call('bbmalloc', 4);
  wasm.call(cbind + '__schema', outputMsgpackPtr, outputSizePtr);
  const jsonSchema = wasm.getMemoryAsString(readPtr32(wasm, outputMsgpackPtr));
  wasm.call('bbfree', outputSizePtr);
  wasm.call('bbfree', outputMsgpackPtr);
  return JSON.parse(jsonSchema);
}

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
  const result = decode(encodedResult);
  console.log({ result });
  wasm.call('bbfree', inputPtr);
  wasm.call('bbfree', outputSizePtr);
  wasm.call('bbfree', outputMsgpackPtr);
  return result;
}
