import { Secp256k1 } from '@aztec/barretenberg.js/crypto';
import { TxRequest } from '@aztec/circuits.js';
import { ConstantSecp256k1KeyPair, Secp256k1KeyPair } from './key_pair.js';
import { Secp256k1KeyStore } from './key_store.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthPublicKey } from '@aztec/foundation/eth-public-key';
import { Ecdsa } from '@aztec/barretenberg.js/crypto';
import { hashTxRequest } from '@aztec/circuits.js/abis';
import { CircuitsWasm } from '@aztec/circuits.js';

/**
 * TestSecp256k1KeyStore is an implementation of the KeyStore interface, used for managing key pairs in a testing environment.
 * It should be utilized in testing scenarios where secure key management is not required, and ease-of-use is prioritized.
 */
export class TestSecp256k1KeyStore implements Secp256k1KeyStore {
  private accounts: Secp256k1KeyPair[] = [];

  // TODO(Suyash): Ideally, the following key-store functions must return EthAddress.
  // But the inputs to our circuits use AztecAddress, so for now, we will just use AztecAddress
  // as a placeholder for an Ethereum address. Longer term, we want to replace AztecAddress with EthAddress
  // in classes like TxRequest/CallContext/etc.

  constructor(private secp256k1: Secp256k1, private ecdsa: Ecdsa) {}

  /**
   * Adds a new account to the TestSecp256k1KeyStore with a randomly generated ConstantSecp256k1KeyPair.
   * The account will have its own private and public key pair, which can be used for signing transactions.
   *
   * @returns A promise that resolves to the newly created account's AztecAddress.
   */
  public addAccount() {
    const keyPair = ConstantSecp256k1KeyPair.random(this.secp256k1, this.ecdsa);
    this.accounts.push(keyPair);
    return Promise.resolve(keyPair.getPublicKey().toAztecAddress());
  }

  /**
   * Retrieves the public addresses of all accounts stored in the TestSecp256k1KeyStore.
   * The returned addresses are instances of `AztecAddress` and can be used for subsequent operations
   * such as signing transactions or fetching public/private keys.
   *
   * @returns A Promise that resolves to an array of AztecAddress instances.
   */
  public getAccounts() {
    return Promise.resolve(this.accounts.map(a => a.getPublicKey().toAztecAddress()));
  }

  /**
   * Retrieves the private key of the account associated with the specified AztecAddress.
   * Throws an error if the provided address is not found in the list of registered accounts.
   *
   * @param address - The AztecAddress instance representing the account for which the private key is requested.
   * @returns A Promise that resolves to a Buffer containing the private key.
   */
  public getAccountPrivateKey(address: AztecAddress): Promise<Buffer> {
    const account = this.getAccount(address);
    return account.getPrivateKey();
  }

  /**
   * Retrieve the public key of an account with a given address.
   * Searches for the corresponding account in the accounts array, and returns its public key.
   * If the account is not found, an error is thrown.
   *
   * @param address - The AztecAddress of the account whose public key is to be retrieved.
   * @returns A Promise that resolves with the Point instance representing the public key of the account.
   */
  public getAccountPublicKey(address: AztecAddress): Promise<EthPublicKey> {
    const account = this.getAccount(address);
    return Promise.resolve(account.getPublicKey());
  }

  /**
   * Retrieves an array of public keys for all accounts stored in the TestSecp256k1KeyStore.
   * These public keys can be used for verifying signatures on transactions and messages.
   *
   * @returns A promise that resolves to an array of public keys associated with the accounts in the TestSecp256k1KeyStore.
   */
  public getSigningPublicKeys() {
    return Promise.resolve(this.accounts.map(a => a.getPublicKey()));
  }

  /**
   * Sign a transaction request using the private key of the sender account.
   * The 'signMessage' method of the account private key is called internally to generate the signature.
   * Throws an error if the sender account is not found in the TestSecp256k1KeyStore.
   *
   * @param txRequest - The transaction request to be signed. It includes the sender, receiver, and other details.
   * @returns A Promise which resolves to the generated signature as a Buffer.
   */
  public async signTxRequest(txRequest: TxRequest) {
    const account = this.getAccount(txRequest.from);
    const message = await hashTxRequest(await CircuitsWasm.get(), txRequest);
    return account.signMessage(message);
  }

  /**
   * Retrieve the Secp256k1KeyPair object associated with a given address.
   * Searches through the 'accounts' array for a matching public key and returns the corresponding account (Secp256k1KeyPair).
   * Throws an error if no matching account is found in the 'accounts'.
   *
   * @param address - The address of the account to retrieve.
   * @returns The Secp256k1 object associated with the provided address.
   */
  private getAccount(address: AztecAddress) {
    const account = this.accounts.find(a => a.getPublicKey().toAztecAddress().equals(address));
    if (!account) {
      throw new Error('Unknown ethereum account.');
    }
    return account;
  }
}
