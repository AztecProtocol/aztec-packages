import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';
import { toArray } from '@aztec/foundation/iterable';
import { type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress, type PartialAddress } from '@aztec/stdlib/contract';
import { KeyValidationRequest } from '@aztec/stdlib/kernel';
import {
  KEY_PREFIXES,
  type KeyPrefix,
  type PublicKey,
  computeAppSecretKey,
  deriveKeys,
  derivePublicKeyFromSecretKey,
  hashPublicKey,
} from '@aztec/stdlib/keys';

/** Maps a key prefix to the storage suffix for the corresponding master secret key. */
function secretKeyStorageSuffix(prefix: KeyPrefix): string {
  return prefix === 'n' ? 'nhk_m' : `${prefix}sk_m`;
}

/**
 * Used for managing keys. Can hold keys of multiple accounts.
 */
export class KeyStore {
  public static readonly SCHEMA_VERSION = 1;
  #db: AztecAsyncKVStore;
  #keys: AztecAsyncMap<string, Buffer>;
  #cachedAccounts: AztecAddress[] | undefined;

  constructor(database: AztecAsyncKVStore) {
    this.#db = database;
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
      masterNullifierHidingKey,
      masterIncomingViewingSecretKey,
      masterOutgoingViewingSecretKey,
      masterTaggingSecretKey,
      masterNullifierPublicKey,
      masterOutgoingViewingPublicKey,
      masterTaggingPublicKey,
      publicKeys,
    } = await deriveKeys(sk);

    const completeAddress = await CompleteAddress.fromPublicKeysAndPartialAddress(publicKeys, partialAddress);
    const { address: account } = completeAddress;

    // The kernel cannot check that nhpk/ovpk/tpk are on-curve or non-infinity, so the PXE/key-store
    // must guarantee it before persistence. By design, the above derivation produces points that are on
    // the curve and not at infinity.

    // The npk/ovpk/tpk hashes are already in publicKeys; ivpk_m_hash is computed for indexing.
    const masterIncomingViewingPublicKeyHash = await hashPublicKey(publicKeys.ivpkM);

    // The Message Signing and Fallback Keys don't have a derivation path yet, so we just use the default values for their hashes.
    // So we avoid storing them persistently. The default hash is still required for address derivation

    await this.#db.transactionAsync(async () => {
      // Naming of keys is as follows ${account}-${n/iv/ov/t}${sk/pk}_m
      await this.#keys.set(`${account.toString()}-ivsk_m`, masterIncomingViewingSecretKey.toBuffer());
      await this.#keys.set(`${account.toString()}-ovsk_m`, masterOutgoingViewingSecretKey.toBuffer());
      await this.#keys.set(`${account.toString()}-tsk_m`, masterTaggingSecretKey.toBuffer());
      await this.#keys.set(`${account.toString()}-nhk_m`, masterNullifierHidingKey.toBuffer());

      await this.#keys.set(`${account.toString()}-npk_m`, masterNullifierPublicKey.toBuffer());
      await this.#keys.set(`${account.toString()}-ivpk_m`, publicKeys.ivpkM.toBuffer());
      await this.#keys.set(`${account.toString()}-ovpk_m`, masterOutgoingViewingPublicKey.toBuffer());
      await this.#keys.set(`${account.toString()}-tpk_m`, masterTaggingPublicKey.toBuffer());

      // We store pk_m_hash under `account-{n/iv/ov/t}pk_m_hash` key to be able to obtain address and key prefix
      // using the #getKeyPrefixAndAccount function later on
      await this.#keys.set(`${account.toString()}-npk_m_hash`, publicKeys.npkMHash.toBuffer());
      await this.#keys.set(`${account.toString()}-ivpk_m_hash`, masterIncomingViewingPublicKeyHash.toBuffer());
      await this.#keys.set(`${account.toString()}-ovpk_m_hash`, publicKeys.ovpkMHash.toBuffer());
      await this.#keys.set(`${account.toString()}-tpk_m_hash`, publicKeys.tpkMHash.toBuffer());
    });

    this.#cachedAccounts = undefined;

    // At last, we return the newly derived account address
    return completeAddress;
  }

  /**
   * Retrieves addresses of accounts stored in the key store.
   * @returns A Promise that resolves to an array of account addresses.
   */
  public async getAccounts(): Promise<AztecAddress[]> {
    if (this.#cachedAccounts) {
      return this.#cachedAccounts;
    }
    const allMapKeys = await toArray(this.#keys.keysAsync());
    // We return account addresses based on the map keys that end with '-ivsk_m'
    const accounts = allMapKeys.filter(key => key.endsWith('-ivsk_m')).map(key => key.split('-')[0]);
    this.#cachedAccounts = accounts.map(account => AztecAddress.fromString(account));
    return this.#cachedAccounts;
  }

  /** Checks whether an account is registered in the key store. */
  public async hasAccount(account: AztecAddress): Promise<boolean> {
    return !!(await this.#keys.getAsync(`${account.toString()}-ivsk_m`));
  }

  /**
   * Gets the key validation request for a given master public key hash and contract address.
   * @throws If the account corresponding to the master public key hash does not exist in the key store.
   * @param pkMHash - The master public key hash.
   * @param contractAddress - The contract address to silo the secret key in the key validation request with.
   * @returns The key validation request.
   */
  public getKeyValidationRequest(pkMHash: Fr, contractAddress: AztecAddress): Promise<KeyValidationRequest> {
    return this.#db.transactionAsync(async () => {
      const [keyPrefix, account] = await this.getKeyPrefixAndAccount(pkMHash);

      // Load the stored master public key point. The returned KVR carries only the hash, but we
      // use the point here as a witness for two integrity checks below: (1) it matches the supplied
      // hash, and (2) it matches the value derived from the stored secret key.
      const pkMBuffer = await this.#keys.getAsync(`${account.toString()}-${keyPrefix}pk_m`);
      if (!pkMBuffer) {
        throw new Error(
          `Could not find ${keyPrefix}pk_m for account ${account.toString()} whose address was successfully obtained with ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`,
        );
      }

      const pkM = Point.fromBuffer(pkMBuffer);

      // Now we find the secret key for the public key
      const skStorageSuffix = secretKeyStorageSuffix(keyPrefix);
      const skMBuffer = await this.#keys.getAsync(`${account.toString()}-${skStorageSuffix}`);
      if (!skMBuffer) {
        throw new Error(
          `Could not find ${skStorageSuffix} for account ${account.toString()} whose address was successfully obtained with ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`,
        );
      }

      const skM = GrumpkinScalar.fromBuffer(skMBuffer);

      // The remaining awaits are non-DB computations. They are safe because no further IDB operations follow them.
      const computedPkMHash = await hashPublicKey(pkM);
      if (!computedPkMHash.equals(pkMHash)) {
        throw new Error(`Could not find ${keyPrefix}pkM for ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`);
      }

      const derivedPkM = await derivePublicKeyFromSecretKey(skM);
      if (!derivedPkM.equals(pkM)) {
        throw new Error(`Could not derive ${keyPrefix}pkM from ${keyPrefix}skM.`);
      }

      const skApp = await computeAppSecretKey(skM, contractAddress, keyPrefix!);

      return new KeyValidationRequest(pkMHash, skApp);
    });
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
      DomainSeparator.OVSK_M,
    );
  }

  /**
   * Retrieves the sk_m corresponding to the given pk_m hash.
   * @throws If the provided hash is not associated with any of the registered accounts.
   * @param pkMHash - The master public key hash to get secret key for.
   * @returns A Promise that resolves to sk_m.
   * @dev Used when feeding the sk_m to the kernel circuit for keys verification.
   */
  public getMasterSecretKey(pkMHash: Fr): Promise<GrumpkinScalar> {
    return this.#db.transactionAsync(async () => {
      const [keyPrefix, account] = await this.getKeyPrefixAndAccount(pkMHash);

      const skStorageSuffix = secretKeyStorageSuffix(keyPrefix);
      const secretKeyBuffer = await this.#keys.getAsync(`${account.toString()}-${skStorageSuffix}`);
      if (!secretKeyBuffer) {
        throw new Error(
          `Could not find ${skStorageSuffix} for ${keyPrefix}pk_m_hash ${pkMHash.toString()}. This should not happen.`,
        );
      }

      const skM = GrumpkinScalar.fromBuffer(secretKeyBuffer);

      // Non-DB computation — safe because no further IDB operations follow.
      // Integrity check: confirm the stored secret key still derives the requested hash. The check
      // is hash-based rather than point-equal because the on-disk identifier is `pk_m_hash`;
      // cryptographic collision resistance of `hashPublicKey` makes this equivalent to a
      // direct point comparison in practice.
      const derivedPkM = await derivePublicKeyFromSecretKey(skM);
      const derivedPkMHash = await hashPublicKey(derivedPkM);
      if (!derivedPkMHash.equals(pkMHash)) {
        throw new Error(
          `Could not find ${skStorageSuffix} for ${keyPrefix}pk_m_hash ${pkMHash.toString()} in secret keys buffer.`,
        );
      }

      return skM;
    });
  }

  /**
   * Checks whether a given account has a key matching the provided master public key hash.
   * @param account - The account address to check.
   * @param pkMHash - The master public key hash to look for.
   * @returns True if the account has a key with the given hash.
   */
  public accountHasKey(account: AztecAddress, pkMHash: Fr): Promise<boolean> {
    return this.#db.transactionAsync(async () => {
      const pkMHashBuffer = serializeToBuffer(pkMHash);
      for (const prefix of KEY_PREFIXES) {
        const stored = await this.#keys.getAsync(`${account.toString()}-${prefix}pk_m_hash`);
        if (stored && Buffer.from(stored).equals(pkMHashBuffer)) {
          return true;
        }
      }
      return false;
    });
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
