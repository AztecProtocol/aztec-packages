import { Secp256k1 } from '@aztec/barretenberg.js/crypto';
import { TxRequest } from '@aztec/circuits.js';
import { ConstantKeyPair, KeyPair } from './key_pair.js';
import { KeyStore } from './key_store.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthPublicKey } from '@aztec/foundation/eth-public-key';
import { Ecdsa } from '@aztec/barretenberg.js/crypto';
import { hashTxRequest } from '@aztec/circuits.js/abis';
import { CircuitsWasm } from '@aztec/circuits.js';

export class TestKeyStore implements KeyStore {
  private accounts: KeyPair[] = [];

  // TODO(Suyash): Ideally, the following key-store functions must return EthAddress.
  // But the inputs to our circuits use AztecAddress, so for now, we will just use AztecAddress
  // as a placeholder for an Ethereum address. Longer term, we want to replace AztecAddress with EthAddress
  // in classes like TxRequest/CallContext/etc.

  constructor(private secp256k1: Secp256k1, private ecdsa: Ecdsa) {}

  public addAccount() {
    const keyPair = ConstantKeyPair.random(this.secp256k1, this.ecdsa);
    this.accounts.push(keyPair);
    return Promise.resolve(keyPair.getPublicKey().toAztecAddress());
  }

  public getAccounts() {
    return Promise.resolve(this.accounts.map(a => a.getPublicKey().toAztecAddress()));
  }

  public getAccountPrivateKey(address: AztecAddress): Promise<Buffer> {
    const account = this.getAccount(address);
    return account.getPrivateKey();
  }

  public getAccountPublicKey(address: AztecAddress): Promise<EthPublicKey> {
    const account = this.getAccount(address);
    return Promise.resolve(account.getPublicKey());
  }

  public getSigningPublicKeys() {
    return Promise.resolve(this.accounts.map(a => a.getPublicKey()));
  }

  public async signTxRequest(txRequest: TxRequest) {
    const account = this.getAccount(txRequest.from);
    const message = await hashTxRequest(await CircuitsWasm.get(), txRequest);
    return account.signMessage(message);
  }

  private getAccount(address: AztecAddress) {
    const account = this.accounts.find(a => a.getPublicKey().toAztecAddress().equals(address));
    if (!account) {
      throw new Error('Unknown ethereum account.');
    }
    return account;
  }
}
