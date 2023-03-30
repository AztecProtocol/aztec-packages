import { Buffer } from 'buffer';
import { CircuitsWasm } from '../wasm/index.js';
import { boolToBuffer, uint8ArrayToNum } from '../utils/serialize.js';
import { PreviousKernelData, PrivateCallData, PrivateKernelPublicInputs, SignedTxRequest } from '../index.js';

export async function getDummyPreviousKernelData(wasm: CircuitsWasm) {
  const ptr = wasm.call('bbmalloc', 4);
  const data = await wasm.asyncCall('private_kernel__dummy_previous_kernel', ptr);
  const outputBufSize = uint8ArrayToNum(wasm.getMemorySlice(ptr, ptr + 4));
  wasm.call('bbfree', ptr);
  const result = Buffer.from(wasm.getMemorySlice(data, data + outputBufSize));
  return PreviousKernelData.fromBuffer(result);
}

export function privateKernelProve(
  wasm: CircuitsWasm,
  signedTxRequest: SignedTxRequest,
  previousKernel: PreviousKernelData,
  privateCallData: PrivateCallData,
) {
  const signedTxRequestBuffer = signedTxRequest.toBuffer();
  const previousKernelBuffer = previousKernel.toBuffer();
  const privateCallDataBuffer = privateCallData.toBuffer();
  const previousKernelBufferOffset = signedTxRequestBuffer.length;
  const privateCallDataOffset = previousKernelBufferOffset + previousKernelBuffer.length;
  const firstInterationOffset = privateCallDataOffset + privateCallDataBuffer.length;
  wasm.writeMemory(0, signedTxRequestBuffer);
  wasm.writeMemory(previousKernelBufferOffset, previousKernelBuffer);
  wasm.writeMemory(privateCallDataOffset, privateCallDataBuffer);
  wasm.writeMemory(firstInterationOffset, boolToBuffer(true));

  const proofOutputAddressPtr = wasm.call('bbmalloc', 4);
  const proofSize = wasm.call(
    'private_kernel__prove',
    0,
    previousKernelBufferOffset,
    privateCallDataOffset,
    firstInterationOffset,
    firstInterationOffset,
    proofOutputAddressPtr,
  );
  const address = uint8ArrayToNum(wasm.getMemorySlice(proofOutputAddressPtr, proofOutputAddressPtr + 4));
  wasm.call('bbfree', proofOutputAddressPtr);

  return Buffer.from(wasm.getMemorySlice(address, address + proofSize));
}

export function privateKernelSim(
  wasm: CircuitsWasm,
  signedTxRequest: SignedTxRequest,
  previousKernel: PreviousKernelData,
  privateCallData: PrivateCallData,
) {
  const signedTxRequestBuffer = signedTxRequest.toBuffer();
  const previousKernelBuffer = previousKernel.toBuffer();
  const privateCallDataBuffer = privateCallData.toBuffer();
  const previousKernelBufferOffset = signedTxRequestBuffer.length;
  const privateCallDataOffset = previousKernelBufferOffset + previousKernelBuffer.length;
  const firstInterationOffset = privateCallDataOffset + privateCallDataBuffer.length;
  wasm.writeMemory(0, signedTxRequestBuffer);
  wasm.writeMemory(previousKernelBufferOffset, previousKernelBuffer);
  wasm.writeMemory(privateCallDataOffset, privateCallDataBuffer);
  wasm.writeMemory(firstInterationOffset, boolToBuffer(true));

  const publicInputOutputAddressPtr = wasm.call('bbmalloc', 4);
  const outputSize = wasm.call(
    'private_kernel__sim',
    0,
    previousKernelBufferOffset,
    privateCallDataOffset,
    firstInterationOffset,
    publicInputOutputAddressPtr,
  );
  const address = uint8ArrayToNum(wasm.getMemorySlice(publicInputOutputAddressPtr, publicInputOutputAddressPtr + 4));
  wasm.call('bbfree', publicInputOutputAddressPtr);

  const publicInputBuffer = Buffer.from(wasm.getMemorySlice(address, address + outputSize));
  return PrivateKernelPublicInputs.fromBuffer(publicInputBuffer);
}
