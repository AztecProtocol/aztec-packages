import { type KeyStore, type PublicKey } from '@aztec/circuit-types';
import {
  AztecAddress,
  Fr,
  GeneratorIndex,
  type GrumpkinPrivateKey,
  GrumpkinScalar,
  type PartialAddress,
  Point,
  computeAppNullifierSecretKey,
  deriveKeys,
} from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

/**
 * TestKeyStore is an implementation of the KeyStore interface, used for managing key pairs in a testing environment.
 * It should be utilized in testing scenarios where secure key management is not required, and ease-of-use is prioritized.
 */
export class TestKeyStore implements KeyStore {
  #keys: AztecMap<string, Buffer>;

  constructor(database: AztecKVStore) {
    this.#keys = database.openMap('key_store');
  }

  /**
   * Creates a new account from a randomly generated secret key.
   * @returns A promise that resolves to the newly created account's AztecAddress.
   */
  public createAccount(): Promise<AztecAddress> {
    const sk = Fr.random();
    const partialAddress = Fr.random();
    return this.addAccount(sk, partialAddress);
  }

  /**
   * Adds an account to the key store from the provided secret key.
   * @param sk - The secret key of the account.
   * @param partialAddress - The partial address of the account.
   * @returns The account's address.
   */
  public async addAccount(sk: Fr, partialAddress: PartialAddress): Promise<AztecAddress> {
    const {
      publicKeysHash,
      masterNullifierSecretKey,
      masterIncomingViewingSecretKey,
      masterOutgoingViewingSecretKey,
      masterTaggingSecretKey,
      masterNullifierPublicKey,
      masterIncomingViewingPublicKey,
      masterOutgoingViewingPublicKey,
      masterTaggingPublicKey,
    } = deriveKeys(sk);

    // We hash the partial address and the public keys hash to get the account address
    // TODO(#5726): Move the following line to AztecAddress class?
    const accountAddressFr = poseidon2Hash([publicKeysHash, partialAddress, GeneratorIndex.CONTRACT_ADDRESS_V1]);
    const accountAddress = AztecAddress.fromField(accountAddressFr);

    // We save the keys to db associated with the account address
    await this.#keys.set(`${accountAddress.toString()}-public_keys_hash`, publicKeysHash.toBuffer());

    // Naming of keys is as follows ${from}-${to}_${any modifiers (m = master, h = hash)}
    await this.#keys.set(`${accountAddress.toString()}-nsk_m`, masterNullifierSecretKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-ivsk_m`, masterIncomingViewingSecretKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-ovsk_m`, masterOutgoingViewingSecretKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-tsk_m`, masterTaggingSecretKey.toBuffer());

    await this.#keys.set(`${accountAddress.toString()}-npk_m`, masterNullifierPublicKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-ivpk_m`, masterIncomingViewingPublicKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-ovpk_m`, masterOutgoingViewingPublicKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-tpk_m`, masterTaggingPublicKey.toBuffer());

    // At last, we return the newly derived account address
    return Promise.resolve(accountAddress);
  }

  /**
   * Retrieves addresses of accounts stored in the key store.
   * @returns A Promise that resolves to an array of account addresses.
   */
  public getAccounts(): Promise<AztecAddress[]> {
    const allMapKeys = Array.from(this.#keys.keys());
    // We return account addresses based on the map keys that end with '-nsk_m'
    const accounts = allMapKeys.filter(key => key.endsWith('-nsk_m')).map(key => key.split('-')[0]);
    return Promise.resolve(accounts.map(account => AztecAddress.fromString(account)));
  }

  /**
   * Gets the master nullifier public key for a given account or master nullifier public key hash.
   * @throws If the account does not exist in the key store.
   * @param account or master nullifier public key hash - The account address or master nullifier public key hash for which to retrieve the master nullifier public key.
   * @returns The master nullifier public key for the account.
   */
  public async getMasterNullifierPublicKey(accountOrMasterNullifierPublicKeyHash: AztecAddress | Fr): Promise<PublicKey> {
    const masterNullifierPublicKeyBuffer = this.#keys.get(`${accountOrMasterNullifierPublicKeyHash.toString()}-npk_m`) ?? 
      this.#keys.get(`${this.getAccountAddressForMasterNullifierPublicKeyHashInternal(accountOrMasterNullifierPublicKeyHash)?.toString()}-npk_m`);
    if (!masterNullifierPublicKeyBuffer) {
        throw new Error(
          `Account or master nullifier public key hash ${accountOrMasterNullifierPublicKeyHash.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
        );
    }
    return Promise.resolve(Point.fromBuffer(masterNullifierPublicKeyBuffer));
  }

  /**
   * Gets the master incoming viewing public key for a given account.
   * @throws If the account does not exist in the key store.
   * @param account - The account address for which to retrieve the master incoming viewing public key.
   * @returns The master incoming viewing public key for the account.
   */
  public async getMasterIncomingViewingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterIncomingViewingPublicKeyBuffer = this.#keys.get(`${account.toString()}-ivpk_m`);
    if (!masterIncomingViewingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Promise.resolve(Point.fromBuffer(masterIncomingViewingPublicKeyBuffer));
  }

  /**
   * Retrieves the master outgoing viewing public key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the master outgoing viewing key for.
   * @returns A Promise that resolves to the master outgoing viewing key.
   */
  public async getMasterOutgoingViewingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterOutgoingViewingPublicKeyBuffer = this.#keys.get(`${account.toString()}-ovpk_m`);
    if (!masterOutgoingViewingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Promise.resolve(Point.fromBuffer(masterOutgoingViewingPublicKeyBuffer));
  }

  /**
   * Retrieves the master tagging public key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the master tagging key for.
   * @returns A Promise that resolves to the master tagging key.
   */
  public async getMasterTaggingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterTaggingPublicKeyBuffer = this.#keys.get(`${account.toString()}-tpk_m`);
    if (!masterTaggingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Promise.resolve(Point.fromBuffer(masterTaggingPublicKeyBuffer));
  }

  /**
   * Derives and returns the application nullifier secret key for a given account or master nullifier public key hash.
   * @throws If the account does not exist in the key store.
   * @param account or master nullifier public key hash - The account address or master nullifier public key hash for which to retrieve the application nullifier secret key.
   * @param app - The application address to retrieve the nullifier secret key for.
   * @returns A Promise that resolves to the application nullifier secret key.
   */
  public async getAppNullifierSecretKey(
    accountOrMasterNullifierPublicKeyHash: AztecAddress | Fr,
    app: AztecAddress,
  ): Promise<Fr> {
    const masterNullifierSecretKeyBuffer = this.#keys.get(`${accountOrMasterNullifierPublicKeyHash.toString()}-nsk_m`) ?? 
      this.#keys.get(`${this.getAccountAddressForMasterNullifierPublicKeyHashInternal(accountOrMasterNullifierPublicKeyHash)?.toString()}-nsk_m`);
    if (!masterNullifierSecretKeyBuffer) {
      throw new Error(
        `Account or master nullifier public key hash ${accountOrMasterNullifierPublicKeyHash.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    const masterNullifierSecretKey = GrumpkinScalar.fromBuffer(masterNullifierSecretKeyBuffer);
    const appNullifierSecretKey = computeAppNullifierSecretKey(masterNullifierSecretKey, app);
    return Promise.resolve(appNullifierSecretKey);
  }

  /**
   * Retrieves application incoming viewing secret key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the application incoming viewing secret key for.
   * @param app - The application address to retrieve the incoming viewing secret key for.
   * @returns A Promise that resolves to the application incoming viewing secret key.
   */
  public async getAppIncomingViewingSecretKey(account: AztecAddress, app: AztecAddress): Promise<Fr> {
    const masterIncomingViewingSecretKeyBuffer = this.#keys.get(`${account.toString()}-ivsk_m`);
    if (!masterIncomingViewingSecretKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    const masterIncomingViewingSecretKey = GrumpkinScalar.fromBuffer(masterIncomingViewingSecretKeyBuffer);

    return Promise.resolve(
      poseidon2Hash([
        masterIncomingViewingSecretKey.high,
        masterIncomingViewingSecretKey.low,
        app,
        GeneratorIndex.IVSK_M,
      ]),
    );
  }

  /**
   * Retrieves application outgoing viewing secret key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the application outgoing viewing secret key for.
   * @param app - The application address to retrieve the outgoing viewing secret key for.
   * @returns A Promise that resolves to the application outgoing viewing secret key.
   */
  public async getAppOutgoingViewingSecretKey(account: AztecAddress, app: AztecAddress): Promise<Fr> {
    const masterOutgoingViewingSecretKeyBuffer = this.#keys.get(`${account.toString()}-ovsk_m`);
    if (!masterOutgoingViewingSecretKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    const masterOutgoingViewingSecretKey = GrumpkinScalar.fromBuffer(masterOutgoingViewingSecretKeyBuffer);

    return Promise.resolve(
      poseidon2Hash([
        masterOutgoingViewingSecretKey.high,
        masterOutgoingViewingSecretKey.low,
        app,
        GeneratorIndex.OVSK_M,
      ]),
    );
  }

  /**
   * Retrieves the master nullifier secret key (nsk_m) corresponding to the specified master nullifier public key
   * (Npk_m).
   * @throws If the provided public key is not associated with any of the registered accounts.
   * @param masterNullifierPublicKey - The master nullifier public key to get secret key for.
   * @returns A Promise that resolves to the master nullifier secret key.
   * @dev Used when feeding the master nullifier secret key to the kernel circuit for nullifier keys verification.
   */
  public getMasterNullifierSecretKeyForPublicKey(masterNullifierPublicKey: PublicKey): Promise<GrumpkinPrivateKey> {
    // We iterate over the map keys to find the account address that corresponds to the provided public key
    for (const [key, value] of this.#keys.entries()) {
      if (value.equals(masterNullifierPublicKey.toBuffer()) && key.endsWith('-npk_m')) {
        // We extract the account address from the map key
        const accountAddress = key.split('-')[0];
        // We fetch the secret key and return it
        const masterNullifierSecretKeyBuffer = this.#keys.get(`${accountAddress.toString()}-nsk_m`);
        if (!masterNullifierSecretKeyBuffer) {
          throw new Error(`Could not find master nullifier secret key for account ${accountAddress.toString()}`);
        }
        return Promise.resolve(GrumpkinScalar.fromBuffer(masterNullifierSecretKeyBuffer));
      }
    }

    throw new Error(`Could not find master nullifier secret key for public key ${masterNullifierPublicKey.toString()}`);
  }

  /**
   * Retrieves the master incoming viewing secret key (ivsk_m) corresponding to the specified master incoming viewing
   * public key (Ivpk_m).
   * @throws If the provided public key is not associated with any of the registered accounts.
   * @param masterIncomingViewingPublicKey - The master nullifier public key to get secret key for.
   * @returns A Promise that resolves to the master nullifier secret key.
   * @dev Used when feeding the master nullifier secret key to the kernel circuit for nullifier keys verification.
   */
  public getMasterIncomingViewingSecretKeyForPublicKey(
    masterIncomingViewingPublicKey: PublicKey,
  ): Promise<GrumpkinPrivateKey> {
    // We iterate over the map keys to find the account address that corresponds to the provided public key
    for (const [key, value] of this.#keys.entries()) {
      if (value.equals(masterIncomingViewingPublicKey.toBuffer())) {
        // We extract the account address from the map key
        const accountAddress = key.split('-')[0];
        // We fetch the secret key and return it
        const masterIncomingViewingSecretKeyBuffer = this.#keys.get(`${accountAddress.toString()}-ivsk_m`);
        if (!masterIncomingViewingSecretKeyBuffer) {
          throw new Error(`Could not find master incoming viewing secret key for account ${accountAddress.toString()}`);
        }
        return Promise.resolve(GrumpkinScalar.fromBuffer(masterIncomingViewingSecretKeyBuffer));
      }
    }

    throw new Error(
      `Could not find master incoming viewing secret key for public key ${masterIncomingViewingPublicKey.toString()}`,
    );
  }

  /**
   * Retrieves public keys hash of the account
   * @throws If the provided account address is not associated with any of the registered accounts.
   * @param account - The account address to get public keys hash for.
   * @returns A Promise that resolves to the public keys hash.
   */
  public async getPublicKeysHash(account: AztecAddress): Promise<Fr> {
    const publicKeysHashBuffer = this.#keys.get(`${account.toString()}-public_keys_hash`);
    if (!publicKeysHashBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Promise.resolve(Fr.fromBuffer(publicKeysHashBuffer));
  }

  /**
   * Gets the account address for a given master nullifier public key hash.
   * @throws If the master nullifier public key hash does not exist in the key store.
   * @param masterNullifierPublicKeyHash - The master nullifier public key hash for which to retrieve the address.
   * @returns The address for the account.
   */
  // TODO(#5834): Re-add separation between recipients and accounts in keystore. Refactor this utilizing getAccounts.
  public getAccountAddressForMasterNullifierPublicKeyHash(masterNullifierPublicKeyHash: Fr) {
    const account = this.getAccountAddressForMasterNullifierPublicKeyHashInternal(masterNullifierPublicKeyHash);
    if (!account) {
      throw new Error(
        `Master nullifier public key hash ${masterNullifierPublicKeyHash.toString()} does not exist.`,
      );
    }
    return account;
  }

  /**
   * This is used to register a recipient / for storing public keys of an address
   * @param accountAddress - The account address to store keys for.
   * @param masterNullifierPublicKey - The stored master nullifier public key
   * @param masterIncomingViewingPublicKey - The stored incoming viewing public key
   * @param masterOutgoingViewingPublicKey - The stored outgoing viewing public key
   * @param masterTaggingPublicKey - The stored master tagging public key
   * @remarks This also adds the master nullifier public key hash to the store for the recipient
   */
  // TODO(#5834): Re-add separation between recipients and accounts in keystore.
  public async addPublicKeysForAccount(
    accountAddress: AztecAddress,
    masterNullifierPublicKey: Point,
    masterIncomingViewingPublicKey: Point,
    masterOutgoingViewingPublicKey: Point,
    masterTaggingPublicKey: Point,
  ): Promise<void> {
    await this.#keys.set(`${accountAddress.toString()}-npk_m`, masterNullifierPublicKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-ivpk_m`, masterIncomingViewingPublicKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-ovpk_m`, masterOutgoingViewingPublicKey.toBuffer());
    await this.#keys.set(`${accountAddress.toString()}-tpk_m`, masterTaggingPublicKey.toBuffer());
  }

  getAccountAddressForMasterNullifierPublicKeyHashInternal(masterNullifierPublicKeyHash: Fr): AztecAddress | undefined {
    for (const [key, value] of this.#keys.entries()) {
      if (key.endsWith('-npk_m')) {
        const computedMasterNullifierPublicKeyHash = poseidon2Hash(Point.fromBuffer(value).toFields());
        if (computedMasterNullifierPublicKeyHash.equals(masterNullifierPublicKeyHash)) {
          // We extract the account address from the map key
          const accountAddress = key.split('-')[0];
          return AztecAddress.fromString(accountAddress);
        }
      }
    }

    return undefined;
  }
}
