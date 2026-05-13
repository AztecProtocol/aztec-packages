export type BigIntPoint = {
  x: bigint;
  y: bigint;
  t?: bigint;
  z: bigint;
};

export type U32ArrayPoint = {
  x: Uint32Array;
  y: Uint32Array;
  t?: Uint32Array;
  z: Uint32Array;
};

// Lifted from tal-webgpu's reference/webgpu/utils.ts. Reads a little-endian
// byte buffer as a sequence of big integers of the given bit length. Used
// by the MSM pipeline's debug-verification paths to decode caller-supplied
// raw point/scalar byte buffers.
export const readBigIntsFromBufferLE = (
  buffer: Buffer,
  bigIntSize = 256,
): bigint[] => {
  const bytesPerBigInt = bigIntSize / 8;
  if (buffer.length % bytesPerBigInt !== 0) {
    throw new Error(
      `Buffer length ${buffer.length} not a multiple of ${bytesPerBigInt}`,
    );
  }
  const out: bigint[] = [];
  for (let i = 0; i < buffer.length; i += bytesPerBigInt) {
    let v = 0n;
    for (let j = bytesPerBigInt - 1; j >= 0; j--) {
      v = (v << 8n) | BigInt(buffer[i + j]);
    }
    out.push(v);
  }
  return out;
};
