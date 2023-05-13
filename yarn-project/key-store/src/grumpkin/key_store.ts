import { TxRequest } from '@aztec/circuits.js';
import { EcdsaSignature } from '@aztec/barretenberg.js/crypto';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Point } from '@aztec/foundation/fields';

/**
 * Represents a secure storage for managing keys.
 * Provides functionality to create and retrieve accounts, private and public keys,
 * signing public keys, as well as signing transaction requests using ECDSA signatures.
 */
export interface KeyStore {
  addAccount(): Promise<AztecAddress>;
  getAccounts(): Promise<AztecAddress[]>;
  getAccountPrivateKey(address: AztecAddress): Promise<Buffer>;
  getAccountPublicKey(address: AztecAddress): Promise<Point>;
  getSigningPublicKeys(): Promise<Point[]>;
  signTxRequest(txRequest: TxRequest): Promise<EcdsaSignature>;
}
