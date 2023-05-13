import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthPublicKey } from '@aztec/foundation/eth-public-key';
import { TxRequest } from '@aztec/circuits.js';
import { EcdsaSignature } from '@aztec/barretenberg.js/crypto';

/**
 * Represents a secure storage for managing keys on the secp256k1 curve.
 * Provides functionality to create and retrieve accounts, private and public keys,
 * signing public keys, as well as signing transaction requests using ECDSA signatures.
 */
export interface Secp256k1KeyStore {
  addAccount(): Promise<AztecAddress>;
  getAccounts(): Promise<AztecAddress[]>;
  getAccountPrivateKey(address: AztecAddress): Promise<Buffer>;
  getAccountPublicKey(address: AztecAddress): Promise<EthPublicKey>;
  getSigningPublicKeys(): Promise<EthPublicKey[]>;
  signTxRequest(txRequest: TxRequest): Promise<EcdsaSignature>;
  recoverSigningPublicKey(txRequest: TxRequest, signature: EcdsaSignature): Promise<EthPublicKey>;
}
