import { EthAddress, EthPublicKey } from '@aztec/foundation';
import { EcdsaSignature, TxRequest } from '@aztec/circuits.js';
import { CircuitsWasm } from '@aztec/circuits.js';

export interface KeyStore {
  addAccount(): Promise<EthAddress>;
  getAccounts(): Promise<EthAddress[]>;
  getAccountPrivateKey(address: EthAddress): Promise<Buffer>;
  getAccountPublicKey(address: EthAddress): Promise<EthPublicKey>;
  getSigningPublicKeys(): Promise<EthPublicKey[]>;
  signTxRequest(wasm: CircuitsWasm, txRequest: TxRequest): Promise<EcdsaSignature>;
}
