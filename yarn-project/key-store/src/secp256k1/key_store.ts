import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthPublicKey } from '@aztec/foundation/eth-public-key';
import { EcdsaSignature, TxRequest } from '@aztec/circuits.js';

export interface KeyStore {
  addAccount(): Promise<AztecAddress>;
  getAccounts(): Promise<AztecAddress[]>;
  getAccountPrivateKey(address: AztecAddress): Promise<Buffer>;
  getAccountPublicKey(address: AztecAddress): Promise<EthPublicKey>;
  getSigningPublicKeys(): Promise<EthPublicKey[]>;
  signTxRequest(txRequest: TxRequest): Promise<EcdsaSignature>;
}
