import { bufferFrom } from '@aztec/foundation/buffer';

import { compressSync, uncompressSync } from 'snappy';

/**
 * Snappy decompress the blob buffer
 *
 * @param data - The blob buffer
 * @returns The decompressed blob buffer
 */
export function inboundTransform(data: Buffer): Buffer {
  return bufferFrom(uncompressSync(data, { asBuffer: true }));
}

/**
 * Snappy compress the blob buffer
 *
 * @param data - The blob buffer
 * @returns The compressed blob buffer
 */
export function outboundTransform(data: Buffer): Buffer {
  return bufferFrom(compressSync(data));
}
