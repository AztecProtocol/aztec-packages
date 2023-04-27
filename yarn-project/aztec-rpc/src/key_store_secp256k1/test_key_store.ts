import { Secp256k1 } from '@aztec/barretenberg.js/crypto';
import { TxRequest } from '@aztec/circuits.js';
import { ConstantSecp256k1KeyPair, Secp256k1KeyPair } from './key_pair.js';
import { KeyStore } from './key_store.js';
import { EthPublicKey } from '@aztec/foundation';
import { Ecdsa } from '@aztec/barretenberg.js/crypto';
import { EthAddress } from '@aztec/foundation';
import { hashTxRequest } from '@aztec/circuits.js/abis';
import { CircuitsWasm } from '@aztec/circuits.js';

export class TestKeyStore implements KeyStore {
  private accounts: Secp256k1KeyPair[] = [];

  constructor(private secp256k1: Secp256k1, private ecdsa: Ecdsa) {}

  public addAccount() {
    const keyPair = ConstantSecp256k1KeyPair.random(this.secp256k1, this.ecdsa);
    this.accounts.push(keyPair);
    return Promise.resolve(keyPair.getPublicKey().toAddress());
  }

  public getAccounts() {
    return Promise.resolve(this.accounts.map(a => a.getPublicKey().toAddress()));
  }

  public getAccountPrivateKey(address: EthAddress): Promise<Buffer> {
    const account = this.getAccount(address);
    return account.getPrivateKey();
  }

  public getAccountPublicKey(address: EthAddress): Promise<EthPublicKey> {
    const account = this.getAccount(address);
    return Promise.resolve(account.getPublicKey());
  }

  public getSigningPublicKeys() {
    return Promise.resolve(this.accounts.map(a => a.getPublicKey()));
  }

  public async signTxRequest(wasm: CircuitsWasm, txRequest: TxRequest) {
    const account = this.getAccount(EthAddress.fromBuffer(txRequest.from.toBuffer()));
    const message = await hashTxRequest(wasm, txRequest);
    return account.signMessage(message);
  }

  private getAccount(address: EthAddress) {
    const account = this.accounts.find(a => a.getPublicKey().toAddress().equals(address));
    if (!account) {
      throw new Error('Unknown ethereum account.');
    }
    return account;
  }
}
