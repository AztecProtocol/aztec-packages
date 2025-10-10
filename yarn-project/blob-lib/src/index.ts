export * from './blob.js';
export * from './blob_batching.js';
export * from './deserialize.js';
export * from './encoding.js';
export * from './interface.js';
export * from './errors.js';
export * from './blob_batching_public_inputs.js';
export * from './sponge_blob.js';

// KZG constants
export const BYTES_PER_BLOB = 131072; // 4096 * 32
export const FIELD_ELEMENTS_PER_BLOB = 4096;

// KZG types
export type BlobBuffer = Uint8Array;
export type Bytes48 = Uint8Array;
export type KZGProof = Uint8Array;
