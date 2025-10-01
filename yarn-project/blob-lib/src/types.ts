export * from './sponge_blob.js';

// TODO: Separate functions that use c-kzg from classes and export those classes here.

/**
 * Type definition for the KZG instance returned by Blob.getViemKzgInstance().
 * Contains the cryptographic functions needed for blob commitment and proof generation.
 */
export interface BlobKzgInstance {
  /** Function to compute KZG commitment from blob data */
  blobToKzgCommitment(blob: Uint8Array): Uint8Array;
  /** Function to compute KZG proof for blob data */
  computeBlobKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array;
}
