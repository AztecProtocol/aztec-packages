import { AztecAddress, EthPublicKey } from '@aztec/foundation';
import { EcdsaSignature, TxRequest } from '@aztec/circuits.js';

export interface KeyStore {
  addAccount(): Promise<AztecAddress>;
  getAccounts(): Promise<AztecAddress[]>;
  getAccountPrivateKey(address: AztecAddress): Promise<Buffer>;
  getAccountPublicKey(address: AztecAddress): Promise<EthPublicKey>;
  getSigningPublicKeys(): Promise<EthPublicKey[]>;
  signTxRequest(txRequest: TxRequest): Promise<EcdsaSignature>;
}
