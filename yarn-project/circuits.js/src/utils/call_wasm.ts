import { CircuitError } from '../index.js';
import { AsyncWasmWrapper } from '@aztec/foundation/wasm';
import { uint8ArrayToNum } from './serialize.js';

export async function callAsyncWasm<T>(
  wasm: AsyncWasmWrapper,
  method: string,
  input: Buffer | { toBuffer: () => Buffer },
  outputType: { fromBuffer: (b: Buffer) => T },
): Promise<T> {
  const inputBuf: Buffer = input instanceof Buffer ? input : input.toBuffer();

  // Allocate memory for the input buffer and the pointer to the pointer to the output buffer
  const inputBufPtr = wasm.call('bbmalloc', inputBuf.length);
  wasm.writeMemory(inputBufPtr, inputBuf);
  const outputBufSizePtr = wasm.call('bbmalloc', 4);
  const outputBufPtrPtr = wasm.call('bbmalloc', 4);
  // Run and read outputs
  const circuitFailureBufPtr = await wasm.asyncCall(method, inputBufPtr, outputBufSizePtr, outputBufPtrPtr);

  // handle circuit failure but in either case, free the input buffer from memory.
  try {
    const output = handleCircuitFailure(wasm, outputBufSizePtr, outputBufPtrPtr, circuitFailureBufPtr, outputType);
    wasm.call('bbfree', inputBufPtr);
    return output;
  } catch (err) {
    wasm.call('bbfree', inputBufPtr);
    // do more appropriate error handling here:
    throw err;
  }
}

export function handleCircuitFailure<T>(
  wasm: AsyncWasmWrapper,
  outputBufSizePtr: number,
  outputBufPtrPtr: number,
  circuitFailureBufPtr: number,
  outputType: { fromBuffer: (b: Buffer) => T },
): T {
  if (circuitFailureBufPtr == 0) {
    // C++ returned a null pointer i.e. circuit didn't have an error
    const outputBufSize = uint8ArrayToNum(wasm.getMemorySlice(outputBufSizePtr, outputBufSizePtr + 4));
    const outputBufPtr = uint8ArrayToNum(wasm.getMemorySlice(outputBufPtrPtr, outputBufPtrPtr + 4));
    const outputBuf = Buffer.from(wasm.getMemorySlice(outputBufPtr, outputBufPtr + outputBufSize));
    const output = outputType.fromBuffer(outputBuf);

    // Free memory
    wasm.call('bbfree', circuitFailureBufPtr);
    wasm.call('bbfree', outputBufPtr);
    wasm.call('bbfree', outputBufPtrPtr);
    return output;
  } else {
    // CircuitError struct is structured as:
    // 1st 16 bits after the `circuitFailureBufPtr` - error code (enum uint16)
    // Next 32 bits - error message size
    // Next `error message size` bytes - error message.
    // So need to first extract the error message size so we know how much memory to read for the entire error struct.
    const errorMessageSizeBuffer = Buffer.from(
      wasm.getMemorySlice(circuitFailureBufPtr + 2, circuitFailureBufPtr + 2 + 4),
    );
    const errorMessageSize = errorMessageSizeBuffer.readUint32BE();
    // Now extract the entire `CircuitError` struct:
    const errorBuf = Buffer.from(
      wasm.getMemorySlice(circuitFailureBufPtr, circuitFailureBufPtr + 2 + 4 + errorMessageSize),
    );
    const err = CircuitError.fromBuffer(errorBuf);

    // Free memory
    wasm.call('bbfree', circuitFailureBufPtr);
    wasm.call('bbfree', outputBufPtrPtr);

    throw err;
  }
}
