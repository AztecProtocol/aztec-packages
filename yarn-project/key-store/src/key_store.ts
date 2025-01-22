import { type PublicKey } from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  Fr,
  GeneratorIndex,
  GrumpkinScalar,
  KEY_PREFIXES,
  type KeyPrefix,
  KeyValidationRequest,
  type PartialAddress,
  Point,
  computeAppSecretKey,
  deriveKeys,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { toArray } from '@aztec/foundation/iterable';
import { type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';
import { type AztecAsyncKVStore, type AztecAsyncMap } from '@aztec/kv-store';

/**
 * Used for managing keys. Can hold keys of multiple accounts.
 */
export class KeyStore {
  #keys: AztecAsyncMap<string, Buffer>;

  constructor(database: AztecAsyncKVStore) {
    this.#keys = database.openMap('key_store');
  }

  /**
   * Creates a new account from a randomly generated secret key.
   * @returns A promise that resolves to the newly created account's CompleteAddress.
   */
  public createAccount(): Promise<CompleteAddress> {
    const sk = Fr.random();
    const partialAddress = Fr.random();
    return this.addAccount(sk, partialAddress);
  }

  /**
   * Adds an account to the key store from the provided secret key.
   * @param sk - The secret key of the account.
   * @param partialAddress - The partial address of the account.
   * @returns The account's complete address.
   */
  public async addAccount(sk: Fr, partialAddress: PartialAddress): Promise<CompleteAddress> {
    const {
      masterNullifierSecretKey,
      masterIncomingViewingSecretKey,
      masterOutgoingViewingSecretKey,
      masterTaggingSecretKey,
      publicKeys,
    } = deriveKeys(sk);

    const completeAddress = CompleteAddress.fromSecretKeyAndPartialAddress(sk, partialAddress);
    const { address: account } = completeAddress;

    // Naming of keys is as follows ${account}-${n/iv/ov/t}${sk/pk}_m
    await this.#keys.set(`${account.toString()}-ivsk_m`, masterIncomingViewingSecretKey.toBuffer());
    await this.#keys.set(`${account.toString()}-ovsk_m`, masterOutgoingViewingSecretKey.toBuffer());
    await this.#keys.set(`${account.toString()}-tsk_m`, masterTaggingSecretKey.toBuffer());
    await this.#keys.set(`${account.toString()}-nsk_m`, masterNullifierSecretKey.toBuffer());

    await this.#keys.set(`${account.toString()}-npk_m`, publicKeys.masterNullifierPublicKey.toBuffer());
    await this.#keys.set(`${account.toString()}-ivpk_m`, publicKeys.masterIncomingViewingPublicKey.toBuffer());
    await this.#keys.set(`${account.toString()}-ovpk_m`, publicKeys.masterOutgoingViewingPublicKey.toBuffer());
    await this.#keys.set(`${account.toString()}-tpk_m`, publicKeys.masterTaggingPublicKey.toBuffer());

    // We store pk_m_hash under `account-{n/iv/ov/t}pk_m_hash` key to be able to obtain address and key prefix
    // using the #getKeyPrefixAndAccount function later on
    await this.#keys.set(`${account.toString()}-npk_m_hash`, publicKeys.masterNullifierPublicKey.hash().toBuffer());
    await this.#keys.set(
      `${account.toString()}-ivpk_m_hash`,
      publicKeys.masterIncomingViewingPublicKey.hash().toBuffer(),
    );
    await this.#keys.set(
      `${account.toString()}-ovpk_m_hash`,
      publicKeys.masterOutgoingViewingPublicKey.hash().toBuffer(),
    );
    await this.#keys.set(`${account.toString()}-tpk_m_hash`, publicKeys.masterTaggingPublicKey.hash().toBuffer());

    // At last, we return the newly derived account address
    return completeAddress;
  }

  /**
   * Retrieves addresses of accounts stored in the key store.
   * @returns A Promise that resolves to an array of account addresses.
   */
  public async getAccounts(): Promise<AztecAddress[]> {
    const allMapKeys = await toArray(this.#keys.keysAsync());
    // We return account addresses based on the map keys that end with '-ivsk_m'
    const accounts = allMapKeys.filter(key => key.endsWith('-ivsk_m')).map(key => key.split('-')[0]);
    return accounts.map(account => AztecAddress.fromString(account));
  }

  /**
   * Gets the key validation request for a given master public key hash and contract address.
   * @throws If the account corresponding to the master public key hash does not exist in the key store.
   * @param pkMHash - The master public key hash.
   * @param contractAddress - The contract address to silo the secret key in the key validation request with.
   * @returns The key validation request.
   */
  public async getKeyValidationRequest(pkMHash: Fr, contractAddress: AztecAddress): Promise<KeyValidationRequest> {
    const [keyPrefix, account] = await this.getKeyPrefixAndAccount(pkMHash);

    // Now we find the master public key for the account
    const pkMBuffer = await this.#keys.getAsync(`${account.toString()}-${keyPrefix}pk_m`);
    if (!pkMBuffer) {
      throw new Error(
        `Could not find ${keyPrefix}pk_m for account ${account.toString()} whose address was successfully obtained with ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`,
      );
    }

    const pkM = Point.fromBuffer(pkMBuffer);

    if (!pkM.hash().equals(pkMHash)) {
      throw new Error(`Could not find ${keyPrefix}pkM for ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`);
    }

    // Now we find the secret key for the public key
    const skMBuffer = await this.#keys.getAsync(`${account.toString()}-${keyPrefix}sk_m`);
    if (!skMBuffer) {
      throw new Error(
        `Could not find ${keyPrefix}sk_m for account ${account.toString()} whose address was successfully obtained with ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`,
      );
    }

    const skM = GrumpkinScalar.fromBuffer(skMBuffer);

    // We sanity check that it's possible to derive the public key from the secret key
    if (!derivePublicKeyFromSecretKey(skM).equals(pkM)) {
      throw new Error(`Could not derive ${keyPrefix}pkM from ${keyPrefix}skM.`);
    }

    // At last we silo the secret key and return the key validation request
    const skApp = computeAppSecretKey(skM, contractAddress, keyPrefix!);

    return new KeyValidationRequest(pkM, skApp);
  }

  /**
   * Gets the master nullifier public key for a given account.
   * @throws If the account does not exist in the key store.
   * @param account - The account address for which to retrieve the master nullifier public key.
   * @returns The master nullifier public key for the account.
   */
  public async getMasterNullifierPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterNullifierPublicKeyBuffer = await this.#keys.getAsync(`${account.toString()}-npk_m`);
    if (!masterNullifierPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Point.fromBuffer(masterNullifierPublicKeyBuffer);
  }

  /**
   * Gets the master incoming viewing public key for a given account.
   * @throws If the account does not exist in the key store.
   * @param account - The account address for which to retrieve the master incoming viewing public key.
   * @returns The master incoming viewing public key for the account.
   */
  public async getMasterIncomingViewingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterIncomingViewingPublicKeyBuffer = await this.#keys.getAsync(`${account.toString()}-ivpk_m`);
    if (!masterIncomingViewingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Point.fromBuffer(masterIncomingViewingPublicKeyBuffer);
  }

  /**
   * Retrieves the master outgoing viewing public key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the master outgoing viewing key for.
   * @returns A Promise that resolves to the master outgoing viewing key.
   */
  public async getMasterOutgoingViewingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterOutgoingViewingPublicKeyBuffer = await this.#keys.getAsync(`${account.toString()}-ovpk_m`);
    if (!masterOutgoingViewingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Point.fromBuffer(masterOutgoingViewingPublicKeyBuffer);
  }

  /**
   * Retrieves the master tagging public key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the master tagging key for.
   * @returns A Promise that resolves to the master tagging key.
   */
  public async getMasterTaggingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterTaggingPublicKeyBuffer = await this.#keys.getAsync(`${account.toString()}-tpk_m`);
    if (!masterTaggingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Point.fromBuffer(masterTaggingPublicKeyBuffer);
  }

  /**
   * Retrieves master incoming viewing secret key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the master incoming viewing secret key for.
   * @returns A Promise that resolves to the master incoming viewing secret key.
   */
  public async getMasterIncomingViewingSecretKey(account: AztecAddress): Promise<GrumpkinScalar> {
    const masterIncomingViewingSecretKeyBuffer = await this.#keys.getAsync(`${account.toString()}-ivsk_m`);
    if (!masterIncomingViewingSecretKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return GrumpkinScalar.fromBuffer(masterIncomingViewingSecretKeyBuffer);
  }

  /**
   * Retrieves application outgoing viewing secret key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the application outgoing viewing secret key for.
   * @param app - The application address to retrieve the outgoing viewing secret key for.
   * @returns A Promise that resolves to the application outgoing viewing secret key.
   */
  public async getAppOutgoingViewingSecretKey(account: AztecAddress, app: AztecAddress): Promise<Fr> {
    const masterOutgoingViewingSecretKeyBuffer = await this.#keys.getAsync(`${account.toString()}-ovsk_m`);
    if (!masterOutgoingViewingSecretKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    const masterOutgoingViewingSecretKey = GrumpkinScalar.fromBuffer(masterOutgoingViewingSecretKeyBuffer);

    return poseidon2HashWithSeparator(
      [masterOutgoingViewingSecretKey.hi, masterOutgoingViewingSecretKey.lo, app],
      GeneratorIndex.OVSK_M,
    );
  }

  /**
   * Retrieves the sk_m corresponding to the pk_m.
   * @throws If the provided public key is not associated with any of the registered accounts.
   * @param pkM - The master public key to get secret key for.
   * @returns A Promise that resolves to sk_m.
   * @dev Used when feeding the sk_m to the kernel circuit for keys verification.
   */
  public async getMasterSecretKey(pkM: PublicKey): Promise<GrumpkinScalar> {
    const [keyPrefix, account] = await this.getKeyPrefixAndAccount(pkM);

    const secretKeyBuffer = await this.#keys.getAsync(`${account.toString()}-${keyPrefix}sk_m`);
    if (!secretKeyBuffer) {
      throw new Error(
        `Could not find ${keyPrefix}sk_m for ${keyPrefix}pk_m ${pkM.toString()}. This should not happen.`,
      );
    }

    const skM = GrumpkinScalar.fromBuffer(secretKeyBuffer);
    if (!derivePublicKeyFromSecretKey(skM).equals(pkM)) {
      throw new Error(`Could not find ${keyPrefix}skM for ${keyPrefix}pkM ${pkM.toString()} in secret keys buffer.`);
    }

    return Promise.resolve(skM);
  }

  /**
   * Gets the key prefix and account address for a given value.
   * @returns A tuple containing the key prefix and account address.
   * @dev Note that this is quite inefficient but it should not matter because there should never be too many keys
   * in the key store.
   */
  public async getKeyPrefixAndAccount(value: Bufferable): Promise<[KeyPrefix, AztecAddress]> {
    const valueBuffer = serializeToBuffer(value);
    for await (const [key, val] of this.#keys.entriesAsync()) {
      // Browser returns Uint8Array, Node.js returns Buffer
      if (Buffer.from(val).equals(valueBuffer)) {
        for (const prefix of KEY_PREFIXES) {
          if (key.includes(`-${prefix}`)) {
            const account = AztecAddress.fromString(key.split('-')[0]);
            return [prefix, account];
          }
        }
      }
    }
    throw new Error(`Could not find key prefix.`);
  }
}
