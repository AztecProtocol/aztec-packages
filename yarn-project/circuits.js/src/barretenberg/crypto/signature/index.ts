
/**
 * Interface to represent a signature.
 */
export interface Signature {
  toBuffer(): Buffer;
}

/**
 * Interface to represent a signer.
 */
export interface Signer {
  constructSignature(message: Uint8Array, privateKey: Uint8Array): Signature;
}