import { compressSync, uncompressSync } from 'snappy';

/**
 * Snappy decompress the blob buffer
 *
 * @param data - The blob buffer
 * @returns The decompressed blob buffer
 */
export function inboundTransform(data: Buffer): Buffer {
  return Buffer.from(uncompressSync(data, { asBuffer: true }));
}

/**
 * Snappy compress the blob buffer
 *
 * @param data - The blob buffer
 * @returns The compressed blob buffer
 */
export function outboundTransform(data: Buffer): Buffer {
  return Buffer.from(compressSync(data));
}
