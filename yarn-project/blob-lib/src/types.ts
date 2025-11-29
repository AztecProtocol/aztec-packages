export * from './batched_blob.js';
export * from './circuit_types/index.js';
export * from './interface.js';
export * from './sponge_blob.js';

/**
 * Type definition for the KZG instance returned by Blob.getViemKzgInstance().
 * Contains the cryptographic functions needed for blob commitment and proof generation.
 */
export interface BlobKzgInstance {
  /** Function to compute KZG commitment from blob data */
  blobToKzgCommitment(blob: Uint8Array): Uint8Array;
  /** Function to compute KZG proof for blob data */
  computeBlobKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array;
  /** Function to compute both blob data cells and their corresponding KZG proofs for EIP7594 */
  computeCellsAndKzgProofs(blob: Uint8Array): [Uint8Array[], Uint8Array[]];
}
