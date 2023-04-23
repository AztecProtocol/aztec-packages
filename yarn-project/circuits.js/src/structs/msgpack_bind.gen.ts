import { decode, encode } from '@msgpack/msgpack';
import { AztecAddress, CircuitsWasm } from '../index.js';
import { Address, Field } from './msgpack_bind_mapping.js';

// Written in little-endian as WASM native
function readPtr32(wasm: CircuitsWasm, ptr32: number) {
  const dataView = new DataView(wasm.getMemorySlice(ptr32, ptr32 + 4).buffer);
  return dataView.getUint32(0, /*little endian*/ true);
}
function getCbindSchema(wasm: CircuitsWasm, cbind: string): any {
  const outputSizePtr = wasm.call('bbmalloc', 4);
  const outputMsgpackPtr = wasm.call('bbmalloc', 4);
  wasm.call(cbind + '__schema', outputMsgpackPtr, outputSizePtr);
  const jsonSchema = wasm.getMemoryAsString(readPtr32(wasm, outputMsgpackPtr));
  wasm.call('bbfree', outputSizePtr);
  wasm.call('bbfree', outputMsgpackPtr);
  return JSON.parse(jsonSchema);
}

// Standard call format
async function callCbind(wasm: CircuitsWasm, cbind: string, input: any[]): Promise<any> {
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
  wasm.call('bbfree', inputPtr);
  wasm.call('bbfree', outputSizePtr);
  wasm.call('bbfree', outputMsgpackPtr);
  return result;
}

export async function abisComputeContractAddress(
  wasm: CircuitsWasm,
  address: Address,
  field1: Field,
  field2: Field,
  field3: Field,
) {
  const addressBuf = await callCbind(wasm, 'abis__compute_contract_address', [
    address.toBuffer(),
    field1.toBuffer(),
    field2.toBuffer(),
    field3.toBuffer(),
  ]);
  return AztecAddress.fromBuffer(Buffer.from(addressBuf));
}
export async function privateKernelDummyPreviousKernel(wasm: CircuitsWasm) {
  console.log(JSON.stringify(getCbindSchema(wasm, 'private_kernel__dummy_previous_kernel'), null, 2));
  //   return await callCbind(wasm, 'private_kernel__dummy_previous_kernel', []);
  return await ([] as any);
}
