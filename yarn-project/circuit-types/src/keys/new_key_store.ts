import { AztecAddress, Fr, PartialAddress, type PublicKey } from '@aztec/circuits.js';

/**
 * Represents a secure storage for managing keys.
 */
export interface NewKeyStore {
  /**
   * Retrieves the master nullifier public key.
   * @returns A Promise that resolves to the master nullifier public key.
   */
  getMasterNullifierPublicKey(): Promise<PublicKey>;

  /**
   * Retrieves the master incoming viewing key.
   * @returns A Promise that resolves to the master incoming viewing key.
   */
  getMasterIncomingViewingPublicKey(): Promise<PublicKey>;

  /**
   * Retrieves the master outgoing viewing key.
   * @returns A Promise that resolves to the master outgoing viewing key.
   */
  getMasterOutgoingViewingPublicKey(): Promise<PublicKey>;

  /**
   * Retrieves the master tagging key.
   * @returns A Promise that resolves to the master tagging key.
   */
  getMasterTaggingPublicKey(): Promise<PublicKey>;

  /**
   * Retrieves the hash of the public keys.
   * @returns A Promise that resolves to the hash of the public keys.
   */
  getPublicKeysHash(): Promise<PublicKey>;
}
